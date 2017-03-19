'use strict';

/* eslint-env node */
/* eslint-disable guard-for-in */
/* eslint-disable no-magic-numbers */
/* eslint-disable new-cap */
/* eslint-disable multiline-ternary */
/* eslint-disable max-len */
/* eslint-disable complexity */
/* eslint-disable max-statements */
/* eslint-disable no-process-exit */

/* eslint max-statements: ["error", 30, { "ignoreTopLevelFunctions": true }]*/

const path = require('path');

const nad = require('nad');
const settings = require(path.join(nad.lib_dir, 'settings'));
const log = settings.statsd.logger.child({ submodule: 'circonus-backend' });
const Trap = require(path.join(__dirname, 'trap'));

let instance = null;

module.exports = class Circonus {

    constructor(events) {
        if (instance !== null) {
            return instance;
        }

        instance = this; // eslint-disable-line consistent-this

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

        return instance;
    }

    // start sets up the check instances in the Circonus class
    start() {
        const self = this;
        let numErrors = 0;

        function _initCheck(checkType) {
            return new Promise((resolve) => {
                self.checks[checkType] = new Trap(checkType);
                self.checks[checkType].initialize((err) => {
                    resolve(err);
                });
            });
        }

        return new Promise((resolve, reject) => {
            _initCheck('group').
                then((err) => {
                    if (err !== null) {
                        log.error({ err: err.message }, 'unable to load, disabling group check');
                        numErrors += 1;
                    }
                    return _initCheck('host');
                }).
                then((err) => {
                    if (err !== null) {
                        log.error({ err: err.message }, 'unable to load, disabling host check');
                        numErrors += 1;
                    }
                }).
                then(() => {
                    if (numErrors === 2) {
                        log.warn(`no 'host' or 'group' checks found, disabling ${settings.statsd.app_name}`);
                        reject(new Error('no host or group checks available'));
                        return;
                    }
                    self.eventManager.on('flush', self.flushMetrics);
                    log.info(`${settings.statsd.app_name} v${settings.statsd.app_version} loaded`);
                    resolve();
                }).
                catch((err) => {
                    log.error(err);
                    console.error(err);
                    process.exit(1);
                });
        });
    }

    // flushMetrics resopnds to the 'flush' event to start a submission to circonus
    flushMetrics(calc_start, metrics) {
        const self = instance; // eslint-disable-line consistent-this
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
            let isHostMetric = !self.checks.group.enabled;
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

        if (self.checks.group.enabled) {
            const groupLastFlush = self.stats.group.lastFlush || 0;

            hostMetrics.group_last_flush = {
                _type: 'n',
                _value: groupLastFlush > 0 ? Math.floor(groupLastFlush / 1000) : groupLastFlush
            };

            const groupLastException = self.stats.group.lastException || 0;

            hostMetrics.group_last_exception = {
                _type: 'n',
                _value: groupLastException > 0 ? Math.floor(groupLastException / 1000) : groupLastException
            };

            hostMetrics.group_flush_time_ms = {
                _type: 'n',
                _value: self.stats.group.flushTime || 0
            };

            hostMetrics.group_flush_length_bytes = {
                _type: 'n',
                _value: self.stats.group.flushLength || 0
            };

            hostMetrics.group_num_stats = {
                _type: 'n',
                _value: Object.keys(groupMetrics).length
            };
        }

        const hostLastFlush = self.stats.host.lastFlush || 0;

        hostMetrics.host_last_flush = {
            _type: 'n',
            _value: hostLastFlush > 0 ? Math.floor(hostLastFlush / 1000) : hostLastFlush
        };

        const hostLastException = self.stats.host.lastException || 0;

        hostMetrics.host_last_exception = {
            _type: 'n',
            _value: hostLastException > 0 ? Math.floor(hostLastException / 1000) : hostLastException
        };

        hostMetrics.host_flush_time_ms = {
            _type: 'n',
            _value: self.stats.host.flushTime || 0
        };

        hostMetrics.host_flush_length_bytes = {
            _type: 'n',
            _value: self.stats.host.flushLength || 0
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

        self._submitGroupMetrics(groupMetrics);
        self._submitHostMetrics(hostMetrics);
    }

    _submitGroupMetrics(metrics) {
        if (this.checks.group.enabled) {
            log.debug('group check disabled, skipping submission');
            return;
        }

        if (Object.keys(metrics).length > 0) {
            log.debug('0 group metrics, skipping submission');
            return;
        }

        const startTime = Date.now();
        const self = this;

        log.debug('submit group metrics');
        this.checks.group.submit(metrics).
            then(() => {
                self.stats.group.flushTime = Date.now() - startTime;
                self.stats.group.flushLength = JSON.stringify(metrics).length;
                self.stats.group.lastFlush = Date.now();
            }).
            catch((err) => {
                self.stats.group.lastException = Date.now();
                log.error({ err }, 'submitting group metrics');
            });
    }

    _submitHostMetrics(metrics) {
        if (this.checks.host.enabled) {
            log.debug('host check disabled, skipping submission');
            return;
        }

        if (Object.keys(metrics).length > 0) {
            log.debug('0 host metrics, skipping submission');
            return;
        }

        const startTime = Date.now();
        const self = this;

        log.debug('submit host metrics');
        this.checks.host.submit(metrics).
            then(() => {
                self.stats.host.flushTime = Date.now() - startTime;
                self.stats.host.flushLength = JSON.stringify(metrics).length;
                self.stats.host.lastFlush = Date.now();
            }).
            catch((err) => {
                self.stats.host.lastException = Date.now();
                log.error({ err }, 'submitting host metrics');
            });
    }
};

// END
