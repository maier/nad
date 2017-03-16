/* eslint-env node */
/* eslint-disable guard-for-in */
/* eslint-disable no-magic-numbers */
/* eslint-disable new-cap */
/* eslint-disable multiline-ternary */
/* eslint-disable max-len */
/* eslint max-statements: ["error", 30, { "ignoreTopLevelFunctions": true }]*/

'use strict';

const path = require('path');

const settings = require(path.resolve(path.join(__dirname, '..', 'settings')));
const log = require(path.resolve(path.join(settings.lib_dir, 'log')));
const Trap = require(path.resolve(path.join(__dirname, 'trap')));

// default circonus metric delimeter, this will be used to delimit *full* metric namespace.
// e.g. x`y`z, the actual "metric name" may be delimited differently. e.g.
// x`my.metric.name`z where x and z are namespace prefix/suffix.
const METRIC_DELIM = '`';

let instance = null;

class Circonus {

    // constructor builds a new Circonus backend instance
    constructor(events) {
        this.log = log.child({ module: 'circonus' });

        this.eventManager = events;

        this.checks = {
            group: null,
            host: null
        };

        // metric names prefixed with this string will be sent to the 'host' (aka system)
        // check rather than the default 'group' check (unless there is no group check)
        // in which case, all metrics go to the system check.
        this.hostMetricPrefix = 'host.';

        this.stats = {
            group: {
                flush_length: 0,
                flush_time: 0,
                last_exception: settings.start_time,
                last_flush: settings.start_time
            },
            host: {
                flush_length: 0,
                flush_time: 0,
                last_exception: settings.start_time,
                last_flush: settings.start_time
            }
        };

        this.prefix = {};

        if (settings.prefix.global !== '') {
            for (const key in settings.prefix) {
                if (key !== 'global') {
                    this.prefix[key] = [ settings.prefix.global ];
                }
            }
        }

        for (const key in settings.prefix) {
            if (key !== 'global') {
                if (!this.prefix[key]) {
                    this.prefix[key] = [];
                }
                if (settings.prefix[key] !== '') {
                    this.prefix[key].push(settings.prefix[key]);
                }
            }
        }

        this.suffix = {};

        if (settings.suffix.global !== '') {
            for (const key in settings.suffix) {
                if (key !== 'global') {
                    this.suffix[key] = [ settings.suffix.global ];
                }
            }
        }

        for (const key in settings.suffix) {
            if (key !== 'global') {
                if (!this.suffix[key]) {
                    this.suffix[key] = [];
                }
                if (settings.suffix[key] !== '') {
                    this.suffix[key].push(settings.suffix[key]);
                }
            }
        }

        this._initializeChecks();

        return this;
    }

    _initCheck(checkType) {
        const self = this;

        return new Promise((resolve) => {
            self.checks[checkType] = new Trap(checkType, settings.forceMetricActivation);
            self.checks[checkType].initialize((err) => {
                resolve(err);
            });
        });
    }

    // _initializeChecks sets up the check instances in the Circonus class
    _initializeChecks() {
        const self = this;
        let numErrors = 0;

        this._initCheck('group').
            then((err) => {
                if (err !== null) {
                    self.log.error({ err }, 'Unable to load group check');
                    numErrors += 1;
                }
                return self._initCheck('host'); // eslint-disable-line no-underscore-dangle
            }).
            then((err) => {
                if (err !== null) {
                    self.log.error({ err }, 'Unable to load host check');
                    numErrors += 1;
                }
            }).
            then(() => {
                if (numErrors === 2) {
                    self.log.warn(`No 'host' or 'group' checks found, ${settings.app_name} disabled`);
                    return;
                }

                self.eventManager.on('flush', self.flushMetrics.bind(self));
                self.log.info(`${settings.app_name} v${settings.app_version} loaded`);
            }).
            catch((err) => {
                self.log.error(err);
            });
    }


    // submitMetrics sends metrics to circonus
    submitMetrics(groupMetrics, hostMetrics) {
        const startTime = Date.now();
        const self = this;

        if (this.checks.group.enabled) {
            if (Object.keys(groupMetrics).length > 0) {
                this.log.debug('submit group metrics');
                this.checks.group.submit(groupMetrics, (err) => {
                    if (err !== null) {
                        self.stats.group.lastException = Date.now();
                        self.log.error({ err }, 'submitting group metrics');
                        return;
                    }

                    self.stats.group.flushTime = Date.now() - startTime;
                    self.stats.group.flushLength = JSON.stringify(groupMetrics).length;
                    self.stats.group.lastFlush = Date.now();
                });
            } else {
                this.log.info('0 group metrics, skipping submission');
            }
        } else {
            this.log.info('group check disabled, skipping submission');
        }

        if (this.checks.host.enabled) {
            if (Object.keys(hostMetrics).length > 0) {
                this.log.debug('submit host metrics');
                this.checks.host.submit(hostMetrics, (err) => {
                    if (err !== null) {
                        self.stats.host.lastException = Date.now();
                        self.log.error({ err }, 'submitting host metrics');
                        return;
                    }

                    self.stats.host.flushTime = Date.now() - startTime;
                    self.stats.host.flushLength = JSON.stringify(hostMetrics).length;
                    self.stats.host.lastFlush = Date.now();
                });
            } else {
                this.log.info('0 host metrics, skipping submission');
            }
        } else {
            this.log.info('host check disabled, skipping submission');
        }
    }


    // flushMetrics resopnds to the 'flush' event to start a submission to circonus
    flushMetrics(calc_start, metrics) { // eslint-disable-line complexity, max-statements
        const counters = metrics.counters;
        const gauges = metrics.gauges;
        const histograms = metrics.histograms;
        const sets = metrics.sets;
        const text = metrics.text;
        const timers = metrics.timers;
        const statsd_stats = metrics.stats;
        const groupMetrics = {};
        const hostMetrics = {};

        this.log.debug('flush metrics');

        if (settings.forceGC && global.gc) {
            this.log.debug('force gc');
            global.gc();
        }

        for (const key in counters) {
            let isHostMetric = !this.checks.group.enabled;
            let cleanKey = key;

            if (cleanKey.substr(0, 5) === 'host.') {
                cleanKey = cleanKey.substr(5);
                isHostMetric = true;
            }

            const metricName = this.prefix.counter.concat(cleanKey, this.suffix.counter).join(METRIC_DELIM);

            if (isHostMetric) {
                hostMetrics[metricName] = counters[key];
            } else {
                groupMetrics[metricName] = {
                    _type: 'n',
                    _fl: '+',
                    _value: counters[key]
                };
            }
        }

        for (const key in gauges) {
            let isHostMetric = !this.checks.group.enabled;
            let cleanKey = key;

            if (cleanKey.substr(0, 5) === 'host.') {
                cleanKey = cleanKey.substr(5);
                isHostMetric = true;
            }

            const metricName = this.prefix.gauge.concat(cleanKey, this.suffix.gauge).join(METRIC_DELIM);

            if (isHostMetric) {
                hostMetrics[metricName] = gauges[key];
            } else {
                groupMetrics[metricName] = {
                    _type: 'n',
                    _fl: '~',
                    _value: gauges[key]
                };
            }
        }

        for (const key in histograms) {
            let isHostMetric = !this.checks.group.enabled;
            let cleanKey = key;

            if (cleanKey.substr(0, 5) === 'host.') {
                cleanKey = cleanKey.substr(5);
                isHostMetric = true;
            }

            const metricName = this.prefix.histogram.concat(cleanKey, this.suffix.histogram).join(METRIC_DELIM);
            const metric = {
                _type: 'i',
                _value: histograms[key]
            };

            if (isHostMetric) {
                hostMetrics[metricName] = metric;
            } else {
                groupMetrics[metricName] = metric;
            }
        }

        for (const key in sets) {
            let isHostMetric = !this.checks.group.enabled;
            let cleanKey = key;

            if (cleanKey.substr(0, 5) === 'host.') {
                cleanKey = cleanKey.substr(5);
                isHostMetric = true;
            }

            const metricName = this.prefix.set.concat(cleanKey, this.suffix.set).join(METRIC_DELIM);

            if (isHostMetric) {
                hostMetrics[metricName] = sets[key];
            } else {
                groupMetrics[metricName] = {
                    _type: 'n',
                    _fl: '~',
                    _value: sets[key]
                };
            }
        }

        for (const key in text) {
            let isHostMetric = !this.checks.group.enabled;
            let cleanKey = key;

            if (cleanKey.substr(0, 5) === 'host.') {
                cleanKey = cleanKey.substr(5);
                isHostMetric = true;
            }

            const metricName = this.prefix.text.concat(cleanKey, this.suffix.text).join(METRIC_DELIM);
            const metric = {
                _type: 's',
                _value: text[key]
            };

            if (isHostMetric) {
                hostMetrics[metricName] = metric;
            } else {
                groupMetrics[metricName] = metric;
            }
        }

        for (const key in timers) {
            let isHostMetric = !this.checks.group.enabled;
            let cleanKey = key;

            if (cleanKey.substr(0, 5) === 'host.') {
                cleanKey = cleanKey.substr(5);
                isHostMetric = true;
            }

            const metricName = this.prefix.timer.concat(cleanKey, this.suffix.timer).join(METRIC_DELIM);
            const metric = {
                _type: 'i',
                _value: timers[key]
            };

            if (isHostMetric) {
                hostMetrics[metricName] = metric;
            } else {
                groupMetrics[metricName] = metric;
            }
        }

        if (settings.sendProcessStats) {
            const memStats = process.memoryUsage();
            let metricName = '';

            // memory (rss, heaptotal, heapused)
            for (const key in memStats) {
                metricName = this.prefix.gauge.concat(
                    this.prefix.internal,
                    `mem_${key}_bytes`.toLowerCase(),
                    this.suffix.internal,
                    this.suffix.gauge
                ).join(METRIC_DELIM);

                hostMetrics[metricName] = memStats[key];
            }

            // short-term async tasks (socket.write, console.log, etc.)
            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'open_req_count',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);

            hostMetrics[metricName] = process._getActiveRequests().length;  // eslint-disable-line no-underscore-dangle

            // long-term async tasks (open sockets, timers, etc.)
            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'open_handle_count',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);

            hostMetrics[metricName] = process._getActiveHandles().length;  // eslint-disable-line no-underscore-dangle

            // run time, seconds
            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'uptime_seconds',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);

            hostMetrics[metricName] = process.uptime();

        }

        for (const key in statsd_stats) {
            const metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                key,
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);
            let val = statsd_stats[key];

            // convert timestamp stat(s) to seconds
            if (key === 'last_packet_seen') {
                val = Math.floor(val / 1000);
            }

            hostMetrics[metricName] = val;
        }

        let metricName = null;
        let metricValue = null;

        if (this.checks.group.enabled) {
            const groupLastFlush = this.stats.group.lastFlush || 0;
            const groupLastException = this.stats.group.lastException || 0;
            const groupFlushTime = this.stats.group.flushTime || 0;
            const groupFlushLength = this.stats.group.flushLength || 0;

            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'group_last_flush',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);
            metricValue = groupLastFlush > 0 ? Math.floor(groupLastFlush / 1000) : groupLastFlush;
            hostMetrics[metricName] = metricValue; // eslint-disable-line no-param-reassign

            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'group_last_exception',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);
            metricValue = groupLastException > 0 ? Math.floor(groupLastException / 1000) : groupLastException;
            hostMetrics[metricName] = metricValue; // eslint-disable-line no-param-reassign

            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'group_flush_time_ms',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);
            hostMetrics[metricName] = groupFlushTime; // eslint-disable-line no-param-reassign

            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'group_flush_length_bytes',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);
            hostMetrics[metricName] = groupFlushLength; // eslint-disable-line no-param-reassign

            metricName = this.prefix.gauge.concat(
                this.prefix.internal,
                'group_num_stats',
                this.suffix.internal,
                this.suffix.gauge
            ).join(METRIC_DELIM);
            hostMetrics[metricName] = Object.keys(groupMetrics).length; // eslint-disable-line no-param-reassign
        }

        const hostLastFlush = this.stats.host.lastFlush || 0;
        const hostLastException = this.stats.host.lastException || 0;
        const hostFlushTime = this.stats.host.flushTime || 0;
        const hostFlushLength = this.stats.host.flushLength || 0;

        metricName = this.prefix.gauge.concat(
            this.prefix.internal,
            'host_last_flush',
            this.suffix.internal,
            this.suffix.gauge
        ).join(METRIC_DELIM);
        metricValue = hostLastFlush > 0 ? Math.floor(hostLastFlush / 1000) : hostLastFlush;
        hostMetrics[metricName] = metricValue; // eslint-disable-line no-param-reassign

        metricName = this.prefix.gauge.concat(
            this.prefix.internal,
            'host_last_exception',
            this.suffix.internal,
            this.suffix.gauge
        ).join(METRIC_DELIM);
        metricValue = hostLastException > 0 ? Math.floor(hostLastException / 1000) : hostLastException;
        hostMetrics[metricName] = metricValue; // eslint-disable-line no-param-reassign

        metricName = this.prefix.gauge.concat(
            this.prefix.internal,
            'host_flush_time_ms',
            this.suffix.internal,
            this.suffix.gauge
        ).join(METRIC_DELIM);
        hostMetrics[metricName] = hostFlushTime; // eslint-disable-line no-param-reassign

        metricName = this.prefix.gauge.concat(
            this.prefix.internal,
            'host_flush_length_bytes',
            this.suffix.internal,
            this.suffix.gauge
        ).join(METRIC_DELIM);
        hostMetrics[metricName] = hostFlushLength; // eslint-disable-line no-param-reassign

        const calc_end = process.hrtime(calc_start);

        hostMetrics[this.prefix.gauge.concat(
            this.prefix.internal,
            'calculation_time_ms',
            this.suffix.internal,
            this.suffix.gauge
        ).join(METRIC_DELIM)] = calc_end[1] / 1000000;

        // note: add 1 for this metric as well.
        metricName = this.prefix.gauge.concat(
            this.prefix.internal,
            'host_num_stats',
            this.suffix.internal,
            this.suffix.gauge
        ).join(METRIC_DELIM);
        hostMetrics[metricName] = Object.keys(hostMetrics).length + 1; // eslint-disable-line no-param-reassign

        this.submitMetrics(groupMetrics, hostMetrics);
    }
}

// circonus_init is the exported function to initialize the circonus backend
function circonus_init(events) {
    if (instance === null) {
        instance = new Circonus(events);
    }
}

module.exports.init = circonus_init;

// END
