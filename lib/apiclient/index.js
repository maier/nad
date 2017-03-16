/**
 * Tiny library for interacting with Circonus' API v2
 *
 * Exported methods
 *  setup:  inital setup function to give the API your auth token an app name
 *  get, post, put, delete: docs for each method below, are proxies for the
 *                          various methods for REST calls
 *
 * Notes:
 *  callback functions take 3 args (code, error, body)
 *    code:   HTTP Response code, if null a non HTTP error occurred
 *    error:  Error message from API, null on 200 responses
 *    body:   Response body, i.e. the thing you probably want
 */

'use strict';

/* eslint-disable no-process-env */
/* eslint-disable global-require */
/* eslint-disable no-sync */
/* eslint-disable no-param-reassign */


const qs = require('querystring');
const url = require('url');
const zlib = require('zlib');

const ProxyAgent = require('https-proxy-agent');

let instance = null;

// extract proxy setting from environment for a specific protocol
function getProtocolProxyURL(protocol) {
    let proxyServer = null;

    if (protocol === 'http:') {
        if ({}.hasOwnProperty.call(process.env, 'http_proxy')) {
            proxyServer = process.env.http_proxy;
        } else if ({}.hasOwnProperty.call(process.env, 'HTTP_PROXY')) {
            proxyServer = process.env.HTTP_PROXY;
        }
    } else if (protocol === 'https:') {
        if ({}.hasOwnProperty.call(process.env, 'https_proxy')) {
            proxyServer = process.env.https_proxy;
        } else if ({}.hasOwnProperty.call(process.env, 'HTTPS_PROXY')) {
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

module.exports = class APIClient {
    constructor(options) {
        if (instance !== null) {
            return instance;
        }

        this.log = options.log.child({ module: 'circonusapi3' });

        this.api_key = options.api_key;
        this.api_app = options.api_app;
        this.api_url = options.api_url || 'https://api.circonus.com/v2/';

        const url_options = url.parse(this.api_url);

        if (url_options.protocol === 'https:') {
            this.client = require('https');
        } else {
            this.client = require('http');
        }

        this.proxyServer = getProtocolProxyURL(this.client.globalAgent.protocol);

        instance = this; // eslint-disable-line consistent-this
    }

    /*
     * GET:
     *
     *  endpoint: (/check_bundle, /check/1, etc.)
     *  data:     object which will be converted to a query string
     *  callback: what do we call when the response from the server is complete,
     *            arguments are callback(code, error, body)
     */
    get(endpoint, data, callback) {
        const options = this.get_request_options('GET', endpoint, data);

        this.do_request(options, callback);
    }

    /*
     * POST:
     *
     *  endpoint: specify an object collection (/check_bundle, /graph, etc.)
     *  data:     object which will be stringified to JSON and written to the server
     *  callback: what do we call when the response from the server is complete,
     *            arguments are callback(code, error, body)
     */
    post(endpoint, data, callback) {
        const options = this.get_request_options('POST', endpoint, data);

        this.do_request(options, callback);
    }

    /*
     * PUT:
     *
     *  endpoint: specify an exact object (/check_bundle/1, /template/2, etc.)
     *  data:     object which will be stringified to JSON and written to the server
     *  callback: what do we call when the response from the server is complete,
     *            arguments are callback(code, error, body)
     */
    put(endpoint, data, callback) {
        const options = this.get_request_options('PUT', endpoint, data);

        this.do_request(options, callback);
    }

    /*
     * DELETE:
     *
     *  endpoint: specify an exact object (/check_bundle/1, /rule_set/1_foo, etc.)
     *  callback: what do we call when the response from the server is complete,
     *            arguments are callback(code, error, body)
     */
    delete(endpoint, callback) {
        const options = this.get_request_options('DELETE', endpoint);

        this.do_request(options, callback);
    }

    /*
     * This is called from the various exported functions to actually perform
     * the request.  Will retry up to 5 times in the event we get a connection
     * reset error.
     */
    do_request(options, callback) {
        const self = this;

        this.log.debug({ method: options.method }, 'request');

        const req = this.protocol.request(options, (res) => {
            const data = [];

            res.on('data', (chunk) => {
                data.push(chunk);
            });

            res.on('end', () => {
                // try again... on rate limit or internal (server-side, hopefully recoverable) error
                if (res.statusCode === 429 || res.statusCode === 500) {
                    if (options.circapi.retry < options.circapi.retry_backoff.length) {
                        setTimeout(() => {
                            self.do_request(options, callback);
                        }, options.circapi.retry_backoff[options.circapi.retry]);
                        options.circapi.retry += 1;
                    } else {
                        callback(res.statusCode, new Error(`Giving up after ${options.circapi.retry} attempts`), null, null);
                        return;
                    }
                }

                // success, no content
                if (res.statusCode === 204) {
                    callback(res.statusCode, null, null, null);
                    return;
                }

                const buffer = Buffer.concat(data);
                const encoding = res.headers['content-encoding'];
                let err_msg = null;
                let body = null;

                if (data.length === 0) {
                    err_msg = new Error('No data returned, 0 length body.');
                } else if (encoding === 'gzip') {
                    try {
                        body = zlib.gunzipSync(buffer).toString();
                    } catch (gzipErr) {
                        err_msg = gzipErr;
                    }
                } else if (encoding === 'deflate') {
                    try {
                        body = zlib.deflateSync(buffer).toString();
                    } catch (deflateErr) {
                        err_msg = deflateErr;
                    }
                } else {
                    body = buffer.toString();
                }

                self.log.debug({ status_code: res.statusCode, body }, 'response');

                if (err_msg !== null) {
                    callback(res.statusCode, err_msg, null, body);
                    return;
                }

                // If this isn't a 200 level, extract the message from the body
                if (res.statusCode < 200 || res.statusCode > 299) {
                    try {
                        err_msg = JSON.parse(body).message;
                    } catch (err) {
                        err_msg = `An error occurred, but the body could not be parsed: ${err}`;
                    }
                    callback(res.statusCode, err_msg, null, body);
                    return;
                }

                let parsed = null;

                try {
                    if (body) {
                        parsed = JSON.parse(body);
                    }
                } catch (parseErr) {
                    err_msg = new Error('Error parsing body');
                    err_msg.detail = parseErr;
                    err_msg.body = body;
                }

                callback(res.statusCode, err_msg, parsed, body);
            });
        });

        req.on('error', (err) => {
            if (err.code === 'ECONNRESET' && options.circapi.retry < options.circapi.retry_backoff.length) {
                // sleep and try again, hopefully a recoverable error
                setTimeout(() => {
                    self.do_request(options, callback);
                }, options.circapi.retry_backoff[options.circapi.retry]);
                options.circapi.retry += 1;
                return;
            }
            callback(null, err.message, null);
            return;
        });

        if (options.method.toUpperCase() === 'POST' || options.method.toUpperCase() === 'PUT') {
            const stringified = JSON.stringify(options.circapi.data);

            req.write(stringified);
            self.log.debug({ data: stringified }, 'sending data');

        }
        req.end();
    }

    /*
     * Hands back an options object suitable to use with the HTTPS class
     */
    get_request_options(method, endpoint, data) {
        const options = url.parse(this.api_url);

        options.method = method.toUpperCase();

        options.agent = false;

        options.headers = {
            'X-Circonus-Auth-Token': this.authtoken,
            'X-Circonus-App-Name': this.appname,
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip,deflate'
        };

        options.circapi = {
            retry: 0,
            retry_backoff: [
                null,       // 0 first attempt
                1 * 1000,   // 1, wait 1 second and try again
                2 * 1000,   // 2, wait 2 seconds and try again
                4 * 1000,   // 3, wait 4 seconds and try again
                8 * 1000,   // 4, wait 8 seconds and try again
                16 * 1000,  // 5, wait 16 seconds and try again
                32 * 1000   // 6, wait 32 seconds and retry again then give up if it fails
            ],
            data: null
        };

        if (this.proxyServer !== null) {
            options.agent = new ProxyAgent(this.proxyServer);
        }

        if ((/^v[46]/).test(process.version)) {

            // currently 2016-10-27T16:01:42Z, these settings seem to be
            // necessary to prevent http/https requests from intermittently
            // emitting an end event prior to all content being received
            // when communicating with the Circonus API.

            if (!{}.hasOwnProperty.call(options, 'agent') || options.agent === false) {
                options.agent = new this.protocol.Agent();
            }

            options.agent.keepAlive = false;
            options.agent.keepAliveMsecs = 0;
            options.agent.maxSockets = 1;
            options.agent.maxFreeSockets = 1;
            options.agent.maxCachedSessions = 0;
        }

        options.circapi.data = data;

        if (data !== null) {
            if (options.method === 'GET') {
                if (Object.keys(data).length !== 0) {
                    options.path += `?${qs.stringify(data)}`;
                }
            } else if (options.method === 'POST' || options.method === 'PUT') {
                options.headers['Content-Length'] = JSON.stringify(data).length;
            }
        }

        if (endpoint.match(/^\//)) {
            endpoint = endpoint.substring(1);
        }

        options.path += endpoint;

        return options;
    }
};