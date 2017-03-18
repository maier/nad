/* eslint-env node */
/* eslint-disable guard-for-in */
/* eslint-disable no-magic-numbers */
/* eslint-disable new-cap */
/* eslint-disable multiline-ternary */
/* eslint-disable max-len */
/* eslint-disable complexity */
/* eslint-disable max-statements */

/* eslint max-statements: ["error", 30, { "ignoreTopLevelFunctions": true }]*/

'use strict';

const path = require('path');

const nad = require('nad');
const settings = require(path.join(nad.lib_dir, 'settings'));
const log = settings.statsd.logger.child({ submodule: 'circonus-backend' });
const Trap = require(path.join(__dirname, 'trap'));

let instance = null;

class Circonus {

    constructor(events, cb) {
        this.eventManager = events;

        this.checks = {
            group: null,
            host: null
        };

        this.stats = {
            group: {
                flush_length: 0,
                flush_time: 0,
                last_exception: settings.statsd.start_time,
                last_flush: settings.statsd.start_time
            },
            host: {
                flush_length: 0,
                flush_time: 0,
                last_exception: settings.statsd.start_time,
                last_flush: settings.statsd.start_time
            }
        };

        this._initializeChecks(cb);

        return this;
    }

    _initCheck(checkType) {
        const self = this;

        return new Promise((resolve) => {
            self.checks[checkType] = new Trap(checkType, settings.statsd.forceMetricActivation);
            self.checks[checkType].initialize((err) => {
                resolve(err);
            });
        });
    }

    // _initializeChecks sets up the check instances in the Circonus class
    _initializeChecks(cb) {
        const self = this;
        let numErrors = 0;

        this._initCheck('group').
            then((err) => {
                if (err !== null) {
                    log.error({ err: err.message }, 'Unable to load group check');
                    numErrors += 1;
                }
                return self._initCheck('host');
            }).
            then((err) => {
                if (err !== null) {
                    log.error({ err: err.message }, 'Unable to load host check');
                    numErrors += 1;
                }
            }).
            then(() => {
                if (numErrors < 2) {
                    self.eventManager.on('flush', self.flushMetrics.bind(self));
                    log.info(`${settings.statsd.app_name} v${settings.statsd.app_version} loaded`);
                    cb(null);
                    return;
                }
                log.warn(`No 'host' or 'group' checks found, ${settings.statsd.app_name} disabled`);
                // cb(new Error('no host or group checks found'));
                // return;
            }).
            catch((err) => {
                log.error(err);
                cb(err);
            });
    }


    // submitMetrics sends metrics to circonus
    submitMetrics(groupMetrics, hostMetrics) {
        const startTime = Date.now();
        const self = this;

        if (this.checks.group.enabled) {
            if (Object.keys(groupMetrics).length > 0) {
                log.debug('submit group metrics');
                this.checks.group.submit(groupMetrics, (err) => {
                    if (err !== null) {
                        self.stats.group.lastException = Date.now();
                        log.error({ err }, 'submitting group metrics');
                        return;
                    }

                    self.stats.group.flushTime = Date.now() - startTime;
                    self.stats.group.flushLength = JSON.stringify(groupMetrics).length;
                    self.stats.group.lastFlush = Date.now();
                });
            } else {
                log.debug('0 group metrics, skipping submission');
            }
        } else {
            log.debug('group check disabled, skipping submission');
        }

        if (this.checks.host.enabled) {
            if (Object.keys(hostMetrics).length > 0) {
                log.debug('submit host metrics');
                this.checks.host.submit(hostMetrics, (err) => {
                    if (err !== null) {
                        self.stats.host.lastException = Date.now();
                        log.error({ err }, 'submitting host metrics');
                        return;
                    }

                    self.stats.host.flushTime = Date.now() - startTime;
                    self.stats.host.flushLength = JSON.stringify(hostMetrics).length;
                    self.stats.host.lastFlush = Date.now();
                });
            } else {
                log.debug('0 host metrics, skipping submission');
            }
        } else {
            log.debug('host check disabled, skipping submission');
        }
    }


    // flushMetrics resopnds to the 'flush' event to start a submission to circonus
    flushMetrics(calc_start, metrics) {
        const counters = metrics.counters;
        const gauges = metrics.gauges;
        const histograms = metrics.histograms;
        const sets = metrics.sets;
        const text = metrics.text;
        const timers = metrics.timers;
        const statsd_stats = metrics.stats;
        const groupMetrics = {};
        const hostMetrics = {};

        log.debug('flush metrics');

        for (const key in counters) {
            let isHostMetric = !this.checks.group.enabled;
            let metricName = key;

            if (metricName.substr(0, settings.statsd.hostKey.length) === settings.statsd.hostKey) {
                metricName = metricName.substr(settings.statsd.hostKey.length);
                isHostMetric = true;
            }

            const metric = {
                _type: 'n',
                _value: counters[key]
            };

            if (isHostMetric) {
                hostMetrics[metricName] = metric;
            } else {
                metric._fl = '+'; // aggregate
                groupMetrics[metricName] = metric;
            }
        }

        for (const key in gauges) {
            let isHostMetric = !this.checks.group.enabled;
            let metricName = key;

            if (metricName.substr(0, settings.statsd.hostKey.length) === settings.statsd.hostKey) {
                metricName = metricName.substr(settings.statsd.hostKey.length);
                isHostMetric = true;
            }

            const metric = {
                _type: 'n',
                _value: gauges[key]
            };

            if (isHostMetric) {
                hostMetrics[metricName] = metric;
            } else {
                metric._fl = '~'; // average
                groupMetrics[metricName] = metric;
            }
        }

        for (const key in histograms) {
            let isHostMetric = !this.checks.group.enabled;
            let metricName = key;

            if (metricName.substr(0, settings.statsd.hostKey.length) === settings.statsd.hostKey) {
                metricName = metricName.substr(settings.statsd.hostKey.length);
                isHostMetric = true;
            }

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
            let metricName = key;

            if (metricName.substr(0, settings.statsd.hostKey.length) === settings.statsd.hostKey) {
                metricName = metricName.substr(settings.statsd.hostKey.length);
                isHostMetric = true;
            }

            const metric = {
                _type: 'n',
                _value: sets[key]
            };

            if (isHostMetric) {
                hostMetrics[metricName] = metric;
            } else {
                metric._fl = '~'; // average
                groupMetrics[metricName] = metric;
            }
        }

        for (const key in text) {
            let isHostMetric = !this.checks.group.enabled;
            let metricName = key;

            if (metricName.substr(0, settings.statsd.hostKey.length) === settings.statsd.hostKey) {
                metricName = metricName.substr(settings.statsd.hostKey.length);
                isHostMetric = true;
            }

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
            let metricName = key;

            if (metricName.substr(0, settings.statsd.hostKey.length) === settings.statsd.hostKey) {
                metricName = metricName.substr(settings.statsd.hostKey.length);
                isHostMetric = true;
            }

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

        if (settings.statsd.sendProcessStats) {
            // short-term async tasks (socket.write, console.log, etc.)
            hostMetrics.open_req_count = {
                _type: 'n',
                _value: process._getActiveRequests().length
            };

            // long-term async tasks (open sockets, timers, etc.)
            hostMetrics.open_handle_count = {
                _type: 'n',
                _value:process._getActiveHandles().length
            };

            // run time, seconds
            hostMetrics.uptime_seconds = {
                _type: 'n',
                _value:process.uptime()
            };
        }

        for (const key in statsd_stats) {
            hostMetrics[key] = {
                _type: 'n',
                _value: key === 'last_packet_seen' ? Math.floor(statsd_stats[key]) / 1000 : statsd_stats[key]
            };
        }

        if (this.checks.group.enabled) {
            const groupLastFlush = this.stats.group.lastFlush || 0;

            hostMetrics.group_last_flush = {
                _type: 'n',
                _value: groupLastFlush > 0 ? Math.floor(groupLastFlush / 1000) : groupLastFlush
            };

            const groupLastException = this.stats.group.lastException || 0;

            hostMetrics.group_last_exception = {
                _type: 'n',
                _value: groupLastException > 0 ? Math.floor(groupLastException / 1000) : groupLastException
            };

            hostMetrics.group_flush_time_ms = {
                _type: 'n',
                _value: this.stats.group.flushTime || 0
            };

            hostMetrics.group_flush_length_bytes = {
                _type: 'n',
                _value: this.stats.group.flushLength || 0
            };

            hostMetrics.group_num_stats = {
                _type: 'n',
                _value: Object.keys(groupMetrics).length
            };
        }

        const hostLastFlush = this.stats.host.lastFlush || 0;

        hostMetrics.host_last_flush = {
            _type: 'n',
            _value: hostLastFlush > 0 ? Math.floor(hostLastFlush / 1000) : hostLastFlush
        };

        const hostLastException = this.stats.host.lastException || 0;

        hostMetrics.host_last_exception = {
            _type: 'n',
            _value: hostLastException > 0 ? Math.floor(hostLastException / 1000) : hostLastException
        };

        hostMetrics.host_flush_time_ms = {
            _type: 'n',
            _value: this.stats.host.flushTime || 0
        };

        hostMetrics.host_flush_length_bytes = {
            _type: 'n',
            _value: this.stats.host.flushLength || 0
        };

        const calc_end = process.hrtime(calc_start);

        hostMetrics.calculation_time_ms = {
            _type: 'n',
            _value: calc_end[1] / 1000000
        };

        hostMetrics.host_num_stats = {
            _type: 'n',
            _value:Object.keys(hostMetrics).length + 1 // note: add 1 for this metric as well.
        };

        this.submitMetrics(groupMetrics, hostMetrics);
    }
}

// circonus_init is the exported function to initialize the circonus backend
function circonus_init(events, cb) {
    if (instance === null) {
        instance = new Circonus(events, cb);
    }
}

module.exports.init = circonus_init;

// END
