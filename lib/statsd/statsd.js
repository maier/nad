/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-process-exit */
/* eslint-disable no-extra-parens */
/* eslint max-statements: ["error", 45, { "ignoreTopLevelFunctions": true }]*/


'use strict';

const events = require('events');
const path = require('path');

const settings = require(path.resolve(path.join(__dirname, 'lib', 'settings')));
const log = require(path.resolve(path.join(settings.lib_dir, 'log')));
const circonus = require(path.resolve(path.join(settings.lib_dir, 'circonus')));
const helpers = require(path.resolve(path.join(settings.lib_dir, 'helpers')));

log.debug('initializing circonus-statsd');

const backendEvents = new events.EventEmitter();
const stats = {
    bad_lines_seen: 0,
    packets_received: 0,
    metrics_received: 0,
    last_packet_seen: settings.start_time
};

let counters = {};
let gauges = {};
let sets = {};
let text = {};
let timers = {};
let histograms = {};
let old_timestamp = 0;


// getHistogramBucketID transforms a value into its correct
// bucket and returns the bucket id as a string
function getHistogramBucketID(origVal) {
    let val = origVal;
    let vString = '';
    let exp = 0;

    if (val === 0) {
        return 'H[0]';
    }

    if (val < 0) {
        vString = '-';
        val *= -1;
    }

    while (val < 10) {
        val *= 10;
        exp -= 1;
    }

    while (val >= 100) {
        val /= 10;
        exp += 1;
    }

    val = Math.floor(val);
    val /= 10;
    exp += 1;

    return `H[${vString}${val.toString()}e${exp.toString()}]`;
}


// makeHistogram takes a list of raw values and returns a list of bucket
// strings parseable by the broker
function makeHistogram(values) {
    const temp = {};
    const ret = [];

    for (const value of values) {
        const bucket = getHistogramBucketID(value);

        if (!temp[bucket]) {
            temp[bucket] = 0;
        }
        temp[bucket] += 1;
    }

    for (const bkt in temp) { // eslint-disable-line guard-for-in
        ret.push(`${bkt}=${temp[bkt]}`);
    }

    return ret;
}


// getFlushTimeout returns time remaining in flushInterval period
function getFlushTimeout(interval) {
    let timer_interval = interval - ((Date.now() - settings.start_time) % settings.flushInterval);

    if (timer_interval < 0) {
        log.warn(`calculated negative flush timer_interval (${timer_interval}), resetting to ${settings.flushInterval}...`);
        timer_interval = settings.flushInterval;
    }

    log.debug(`next flush in ${timer_interval}ms`);

    return timer_interval;
}


// startServer loads and starts a protocol server (udp|tcp)
function startServer(cfg, callback) {
    const servermod = require(path.resolve(path.join(settings.lib_dir, 'servers', cfg.server))); // eslint-disable-line global-require

    log.debug(`Loading server ${cfg.server}`);
    if (!servermod.start(cfg, callback)) {
        log.fatal(`Failed to load server: ${cfg.server}`);
        process.exit(1);
    }
}


// resetMetrics deletes/resets metrics based on configuration
function resetMetrics() {
    stats.packets_received = 0;
    stats.metrics_received = 0;
    stats.bad_lines_seen = 0;

    counters = {};
    gauges = {};
    sets = {};
    text = {};
    timers = {};
    histograms = {};
}


// flushMetrics prepares metrics and emits a 'flush' event to backends.
function flushMetrics() {
    const calc_start = process.hrtime();
    const time_stamp = Date.now();

    if (old_timestamp > 0) {
        stats.timestamp_lag_ms = (time_stamp - old_timestamp) - settings.flushInterval;
    }

    old_timestamp = time_stamp;

    const metrics = {
        counters,
        gauges,
        sets: {},
        text,
        stats,
        histograms: {},
        timers: {}
    };


    for (const key in timers) { // eslint-disable-line guard-for-in
        metrics.timers[key] = makeHistogram(timers[key]);
    }

    for (const key in histograms) { // eslint-disable-line guard-for-in
        metrics.histograms[key] = makeHistogram(histograms[key]);
    }

    for (const key in sets) { // eslint-disable-line guard-for-in
        metrics.sets[key] = sets[key].size;
    }

    // After all listeners, reset the metrics
    backendEvents.once('flush', resetMetrics);

    backendEvents.emit('flush', calc_start, metrics);

    // Performing this setTimeout at the end of this method rather than the beginning
    // helps ensure we adapt to negative clock skew by letting the method's latency
    // introduce a short delay that should more than compensate.
    setTimeout(flushMetrics, getFlushTimeout(settings.flushInterval));
}

// sanitizeKeyName returns clean metric name
function sanitizeKeyName(key) {
    return key.
        replace(/\s+/g, '_').
        replace(/\//g, '-').
        replace(/[^a-zA-Z0-9_`\-\.]/g, '');
}

function handlePacket(msg) { // eslint-disable-line complexity
    stats.packets_received += 1;

    let metrics = null;
    const packet_data = msg.toString();

    if (packet_data.indexOf('\n') > -1) {
        metrics = packet_data.split('\n');
    }
    else {
        metrics = [ packet_data ];
    }

    for (const midx in metrics) {
        if (metrics[midx].length === 0) {
            continue;
        }

        stats.metrics_received += 1;

        if (settings.dumpMessages) {
            log.info(metrics[midx].toString());
        }

        const bits = metrics[midx].toString().split(':');
        const key = sanitizeKeyName(bits.shift());

        if (bits.length === 0) {
            bits.push('1');
        }

        for (let i = 0; i < bits.length; i++) {
            let sampleRate = 1;
            const fields = bits[i].split('|');

            if (!helpers.is_valid_packet(fields)) {
                log.warn(`Bad line: ${fields} in msg "${metrics[midx]}"`);
                stats.bad_lines_seen += 1;
                continue;
            }

            if (fields[2]) {
                sampleRate = Number(fields[2].match(/^@([\d\.]+)/)[1]);
            }

            const metric_type = fields[1].trim();

            if (metric_type === 'ms') {
                if (!timers[key]) {
                    timers[key] = [];
                }
                timers[key].push(Number(fields[0] || 0));
            }
            else if (metric_type === 'h') {
                if (!histograms[key]) {
                    histograms[key] = [];
                }
                histograms[key].push(Number(fields[0] || 0));
            }
            else if (metric_type === 'g') {
                if (gauges[key] && (/^[-+]/).test(fields[0])) {
                    gauges[key] += Number(fields[0] || 0);
                }
                else {
                    gauges[key] = Number(fields[0] || 0);
                }
            }
            else if (metric_type === 's') {
                if (!sets[key]) {
                    sets[key] = new Set();
                }
                sets[key].add(fields[0] || '0');
            }
            else if (metric_type === 't') {
                text[key] = fields[0];
            }
            else if (metric_type === 'c') {
                if (!counters[key]) {
                    counters[key] = 0;
                }
                counters[key] += Number(fields[0] || 1) * (1 / sampleRate);
            }
            else {
                log.warn(`Unrecognized metric type '${metric_type}' in '${metrics[midx].toString()}'`);
            }
        }
    }

    stats.last_packet_seen = Date.now();
}

// /////////// main

// Setup the flush timer
setTimeout(flushMetrics, settings.flushInterval);

// load circonus metrics transmitter
circonus.init(backendEvents);

// start the listener(s)
for (let i = 0; i < settings.servers.length; i++) {
    startServer(settings.servers[i], handlePacket);
}

log.info(`${settings.app_name} listener up`);

process.on('exit', () => {
    flushMetrics();
});