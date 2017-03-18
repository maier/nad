// Circonus StatsD backend trap
'use strict';

/* eslint-disable no-magic-numbers */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-process-env */
/* eslint-disable global-require */
/* eslint-disable no-process-exit */

/* eslint max-statements: ["error", 30, { "ignoreTopLevelFunctions": true }]*/

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const url = require('url');

const ProxyAgent = require('https-proxy-agent');

const nad = require('nad');
const client = require(path.join(nad.lib_dir, 'apiclient'));
const settings = require(path.join(nad.lib_dir, 'settings'));
const broker = require(path.join(nad.lib_dir, 'broker'));
const log = settings.statsd.logger.child({ submodule: 'circonus-backend-trap' });

const validBundleCID = /^\/check_bundle\/[0-9]+$/;

// fetchBrokerCACert retrieves the correct CA cert to use when sending metrics to the broker
function fetchBrokerCACert() {
    return new Promise((resolve, reject) => {
        broker.loadCA((err, cert) => {
            if (err !== null) {
                reject(err);
                return;
            }
            resolve(cert);
        });
    });
}

// fetchCheckBundle calls Circonus API to retrieve check bundle identified by cid parameter.
function fetchCheckBundle(cid) {
    if (typeof cid !== 'string' || !validBundleCID.test(cid)) {
        throw new Error(`Invalid check bundle cid ${cid}`);
    }

    return new Promise((resolve, reject) => {
        const errPrefix = `Error fetching check bundle (${cid}):`;

        client.get(cid, null, (err, body, code) => {
            if (err !== null) {
                reject(new Error(`${errPrefix} ${err}`));
                return;
            }

            if (code === null) {
                reject(new Error(`${errPrefix} unknown, no details`));
                return;
            }

            if (code < 200 || code >= 300) {
                reject(new Error(`${errPrefix} API returned code ${code}, ${body}`));
                return;
            }

            resolve(body);
        });
    });
}


// fetchBroker calls Circonus API to retrieve a broker object identified by cid
function fetchBroker(cid) {
    if (typeof cid !== 'string' || !(/^\/broker\/[0-9]+$/).test(cid)) {
        throw new Error(`Invalid broker cid ${cid}`);
    }

    return new Promise((resolve, reject) => {
        const errPrefix = `Error fetching broker (${cid}):`;

        client.get(cid, null, (err, body, code) => {
            if (err !== null) {
                reject(new Error(`${errPrefix} ${err}`));
                return;
            }

            if (code === null) {
                reject(new Error(`${errPrefix} unknown, no details`));
                return;
            }

            if (code < 200 || code >= 300) {
                reject(new Error(`${errPrefix} API returned code ${code}, ${body}`));
                return;
            }

            resolve(body);
        });
    });
}


function updateCheckBundle(bundle) {
    const cid = bundle._cid;

    if (typeof cid !== 'string' || !validBundleCID.test(cid)) {
        throw new Error(`Invalid check bundle cid ${cid}`);
    }

    return new Promise((resolve, reject) => {
        const errPrefix = `Error updating check bundle (${cid}):`;

        client.put(cid, bundle, (err, body, code) => {
            if (err !== null) {
                reject(new Error(`${errPrefix} ${err}`));
                return;
            }

            if (code === null) {
                reject(new Error(`${errPrefix} unknown, no details`));
                return;
            }

            if (code < 200 || code >= 300) {
                reject(new Error(`${errPrefix} API returned code ${code}, ${body}`));
                return;
            }

            resolve(body);
        });
    });
}


// getProxySettings checks environment for http[s] proxy settings
// returns proxy url if found, otherwise null.
function getProxySettings(urlProtocol) {
    let proxyServer = null;

    if (urlProtocol === 'http:') {
        if (process.env.http_proxy) {
            proxyServer = process.env.http_proxy;
        } else if (process.env.HTTP_PROXY) {
            proxyServer = process.env.HTTP_PROXY;
        }
    } else if (urlProtocol === 'https:') {
        if (process.env.https_proxy) {
            proxyServer = process.env.https_proxy;
        } else if (process.env.HTTPS_PROXY) {
            proxyServer = process.env.HTTPS_PROXY;
        }
    }
    if (proxyServer !== null && proxyServer !== '') {
        if (!(/^http[s]?:\/\//).test(proxyServer)) {
            proxyServer = `http://${proxyServer}`;
        }
    }

    return proxyServer;
}


// inventoryMetrics returns an object with metric names as keys and values of true|false
// indicating if the metric is currently active or disabled.
function inventoryMetrics(metrics) {
    const inventory = {};

    for (let i = 0; i < metrics.length; i++) {
        inventory[metrics[i].name] = metrics[i].status === 'active';
    }

    return inventory;
}


module.exports = class Trap {

    // constructor creates a new Trap instance
    constructor(checkType, forceMetricActivation) {
        if (checkType === null || checkType === '') {
            throw new Error('[ERROR] invalid check type id passed to Trap constructor');
        }

        this.checkType = checkType;

        if (checkType === 'group') {
            this.checkID = 'statsd';
            this.check_id = settings.statsd.group_check_id;
        } else if (checkType === 'host') {
            this.checkID = 'system';
            this.check_id = settings.statsd.host_check_id;
            this.submission_url = settings.statsd.push_receiver_url;
        }

        this.checkCID = null;
        if (this.check_id) {
            this.checkCID = `/check_bundle/${this.check_id}`;
        }

        this.manageMetrics = false;

        this.forceMetricActivation = forceMetricActivation && this.regFile !== null ? forceMetricActivation : false;
        this.enabled = false;
        this.log = log.child({ module: `trap.${this.checkType}` });

        this.brokerCACert = null;
        this.brokerCID = null;
        this.brokerCN = null;
        this.check = null;
        this.checkSecret = null;
        this.metrics = {};

        this.log.debug(`initialize '${this.checkType}' trap`);

        return this;
    }


    // initialize will setup the object to be used for submissions
    // cb - callback - called with error object or null
    initialize(cb) {
        if (this.check_id === null) {
            cb(new Error(`no ${this.checkType} check available`));
            return;
        }

        if (!this.manageMetrics) {
            this.enabled = true;
            cb(null);
            return;
        }

        const self = this;

        fetchBrokerCACert().
            then((cert) => {
                self.brokerCACert = cert;
                return self._loadCheck();
            }).
            then(() => {
                return self._loadBrokerCN();
            }).
            then(() => {
                self.enabled = true;
                return cb(null);
            }).
            catch((err) => {
                log.error(err);
                return cb(err);
            });
    }


    // submit sends metrics (PUT) to the Circonus broker identified in the check
    // cb - callback - called with number of mertrics received and error object or null
    submit(metrics, cb) { // eslint-disable-line consistent-return
        const self = this;
        const timer = process.hrtime();

        if (!this.enabled) {
            return cb(new Error(`Circonus trap submitter '${this.checkID}' is not enabled.`));
        }

        this._enableMetrics(metrics).
            then(() => {
                return self._sendMetrics(metrics);
            }).
            then((numMetrics) => {
                if (numMetrics !== -1) {
                    const diff = process.hrtime(timer);

                    log.debug(`sent ${numMetrics} metric(s) in ${diff[0]}s ${(diff[1] / 1000000).toFixed(2)}ms`);
                }
                cb(null);
            }).
            catch((err) => {
                log.error(err);
                cb(err);
            });
    }


    // _activateMetric determines if a metric should be activated for a specific check.
    _activateMetric(metric) {
        // metric does not exist, activate
        // note: boolean value so, explicitly check *existence* of metric key/property
        if (!{}.hasOwnProperty.call(this.metrics, metric)) {
            return true;
        }

        // metric exists and is not active, return forceMetricActivation setting
        if (!this.metrics[metric]) {
            return this.forceMetricActivation;
        }

        // metric exists and is active, leave it alone
        return false;
    }


    // _enableMetrics update check with any new metrics and submit to circonus
    // before sending the metrics...
    // callback(error, number of new metrics)
    _enableMetrics(metrics) {
        if (this.checkType === 'host') {
            return Promise.resolve();
        }

        const self = this;

        return new Promise((resolve, reject) => {
            let haveNewMetrics = false;

            log.trace('checking for new metrics');

            for (const metric in metrics) { // eslint-disable-line guard-for-in
                if (self._activateMetric(metric)) {
                    haveNewMetrics = true;
                    break;
                }
            }

            if (!haveNewMetrics) {
                resolve();
                return;
            }

            log.trace('found new metrics');
            self._loadCheck().
                then(() => {
                    const check = JSON.parse(JSON.stringify(self.check));
                    const newMetrics = [];

                    for (const metric in metrics) { // eslint-disable-line guard-for-in
                        if (self._activateMetric(metric)) {
                            const isHistogram = metrics[metric]._type === 'i' && Array.isArray(metrics[metric]._value);

                            newMetrics.push({
                                name: metric,
                                status: 'active',
                                type: isHistogram ? 'histogram' : 'numeric', // eslint-disable-line multiline-ternary
                                units: null,
                                tags: []
                            });
                        }
                    }

                    check.metrics = check.metrics.concat(newMetrics);
                    log.trace('activating metrics with API');
                    return updateCheckBundle(check);
                }).
                then((bundle) => {
                    log.trace('new metrics activated, saving updated check definition');
                    return self._saveCheckBundle(bundle);
                }).
                then((bundle) => {
                    self.check = JSON.parse(JSON.stringify(bundle));
                    log.trace('update metric inventory');
                    self.metrics = inventoryMetrics(self.check.metrics);
                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }


    // _sendMetrics sends metrics to Circonus
    _sendMetrics(metrics) {
        const self = this;
        const errPrefix = 'submitting metrics:';

        return new Promise((resolve, reject) => {

            if (Object.keys(metrics).length === 0) {
                log.debug('0 metrics to send, skipping');
                resolve(-1);
                return;
            }

            const metricsToSend = {};

            log.trace({ metrics }, 'incoming metrics');

            // filter any disabled metrics (don't waste bandwidth)
            for (const metric in metrics) { // eslint-disable-line guard-for-in
                if (self.manageMetrics && self.metrics[metric]) {
                    metricsToSend[metric] = metrics[metric];
                } else {
                    metricsToSend[metric] = metrics[metric];
                }
            }

            log.trace({ metricsToSend }, 'metrics send');

            let metricJson = null;

            try {
                metricJson = JSON.stringify(metricsToSend);
            } catch (err) {
                reject(new Error(`${errPrefix} ${err}`));
                return;
            }

            const submitOptions = self._getSubmitOptions();

            submitOptions.headers['Content-Length'] = metricJson.length;

            const trap_client = submitOptions.protocol === 'https:' ?
                https :
                http;

            log.debug(`sending metrics to ${submitOptions.href}`);

            const req = trap_client.request(submitOptions);
            const timeout_ms = 15 * 1000; // abort requests taking longer
            const timeout = setTimeout(() => {
                log.warn('request timeout, calling req abort');
                req.abort();
            }, timeout_ms);

            req.setTimeout(timeout_ms);

            req.on('response', (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    clearTimeout(timeout);
                    if (res.statusCode < 200 || res.statusCode > 299) {
                        reject(new Error(`${errPrefix} ${res.statusCode} (${data}) ${submitOptions.href}`));
                        return;
                    }

                    if (res.headers['content-type'] !== 'application/json') {
                        resolve(Object.keys(metricsToSend).length);
                        return;
                    }

                    let resData = null;

                    try {
                        resData = JSON.parse(data);
                    } catch (err) {
                        reject(new Error(`${errPrefix} ${err}`));
                        return;
                    }

                    resolve(resData.stats);
                });
            });

            req.once('timeout', () => {
                clearTimeout(timeout);
                log.warn('request timeout, abort');
                req.abort();
            });

            req.once('error', (err) => {
                clearTimeout(timeout);
                log.warn({ err: err.message }, 'sending metrics');
                reject(err);
            });

            log.trace({ metrics: metricJson }, 'submitting');
            req.write(metricJson);
            req.end();
        });
    }


    // _getSubmitOptions creates a URL URL object suitable for use with http/https request methods
    // returns url object or null on error, and error or null if no error
    _getSubmitOptions() {
        const submissionURL = this._getSubmissionURL();
        const options = url.parse(submissionURL);

        options.method = 'PUT';
        options.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'identity'
        };

        if (this.checkType === 'host') {
            return options;
        }

        const proxyServer = getProxySettings(options.protocol);

        options.agent = false;

        if (proxyServer !== null) {
            options.agent = new ProxyAgent(proxyServer);
            options.timeout = 15 * 1000;
        }

        if (this.brokerCACert !== null) {
            options.secureContext = this.brokerCACert;
        }

        if (this.brokerCN !== null && this.brokerCN !== '') {
            options.servername = this.brokerCN;
        }

        return options;
    }

    _getSubmissionURL() {
        if (this.submission_url !== null) {
            return this.submission_url;
        }

        if (this.check === null) {
            log.fatal({ check_type: this.checkType }, 'check is null');
            process.exit(1);
        }

        if (this.check.type === 'httptrap') {
            return this.check.config.submission_url;
        }

        const noitURL = this.check._reverse_connection_urls[0].
            replace('mtev_reverse', 'https').
            replace('check', 'module/httptrap');

        return `${noitURL}/${this.check.config['reverse:secret_key']}`;
    }

    _getCheckCID() {
        if (this.checkCID !== null) {
            return this.checkCID;
        }
        if (this.check_id === null) {
            return null;
        }

        log.trace(`getting check id from ${this.regFile}`);

        let check = null;

        try {
            check = require(this.regFile);
        } catch (err) {
            throw err;
        }

        this.checkCID = check._cid;

        return this.checkCID;
    }

    _saveCheckBundle(bundle) {
        const self = this;

        return new Promise((resolve, reject) => {
            // don't do anything if not a cosi install
            if (self.regFile === null) {
                resolve(bundle);
                return;
            }

            // no need to re-write if the check hasn't changed
            if (self.check !== null && bundle._last_modified === self.check._last_modified) {
                log.trace(`check un-modified, skipping write`);
                resolve(bundle);
                return;
            }

            if (!bundle.metric_limit) {
                bundle.metric_limit = 0; // eslint-disable-line no-param-reassign
            }

            const options = {
                encoding: 'utf8',
                mode: 0o640,
                flag: 'w'
            };

            log.trace(`saving up-to-date check definition ${self.regFile}`);
            fs.writeFile(self.regFile, JSON.stringify(bundle, null, 4), options, (err) => {
                if (err !== null) {
                    reject(err);
                    return;
                }

                resolve(bundle);
            });
        });
    }

    // _loadCheck reads a check defintion from disk and fetches a fresh copy from the Circonus API
    _loadCheck() {
        const self = this;

        return new Promise((resolve, reject) => {
            const cid = self._getCheckCID();

            if (cid === null) {
                reject(new Error(`no ${self.checkType} check found (no id, no cosi reg)`));
                return;
            }

            log.trace(`fetching up-to-date check definition from API`);
            fetchCheckBundle(cid).
                then((bundle) => {
                    return self._saveCheckBundle(bundle);
                }).
                then((bundle) => {
                    self.check = JSON.parse(JSON.stringify(bundle));
                    log.trace('update metric inventory');
                    self.metrics = inventoryMetrics(self.check.metrics);
                    resolve();
                }).
                catch((err) => {
                    log.error(err);
                    reject(err);
                });

        });
    }


    // _loadBrokerCN determines the broker common name to use when authenicating the broker
    // against the CA cert. (for submission urls with an ip address)
    _loadBrokerCN() { // eslint-disable-line consistent-return
        const self = this;

        return new Promise((resolve, reject) => {
            if (self.brokerCID === self.check.brokers[0]) {
                resolve();
                return;
            }

            log.trace('setting broker cn');

            const submissionURL = self._getSubmissionURL();

            // set broker cn to "" if the submission url does not contain an IP
            // e.g. trap.noit.circonus.net - will not throw an IPSANS error
            if (!(/^https?:\/\/\d+(\.\d+){3}:\d+/).test(submissionURL)) {
                self.brokerCN = '';
                resolve();
                return;
            }

            log.trace('fetching broker definition with API');
            self.brokerCN = null;
            fetchBroker(self.check.brokers[0]).
                then((_broker) => {
                    self.brokerCID = _broker._cid;

                    for (const detail of _broker._details) {
                        if (submissionURL.indexOf(detail.ipaddress) !== -1) {
                            log.trace(`setting broker cn to '${detail.cn}'`);
                            self.brokerCN = detail.cn;
                            break;
                        }
                    }

                    if (self.brokerCN === null) {
                        log.warn(`submissions *may* not work - no broker IP matched ${submissionURL}`);
                        self.brokerCN = '';
                    }

                    resolve();
                }).
                catch((err) => {
                    reject(err);
                });
        });
    }
};
