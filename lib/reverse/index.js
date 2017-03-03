'use strict';

/* eslint-disable global-require */
/* eslint-disable no-process-exit */
/* eslint-disable no-mixed-operators */

const crypto = require('crypto');
const tls = require('tls');

const noit = require('noit-connection');
const circapi = require('circonusapi2');

// //////////////////////////////////////////////////////////////////////
// setup optional reverse sockets
// //////////////////////////////////////////////////////////////////////


// this is a module local dict to hold the reverse connections we make
// in setup_reverse.  it exists merely to keep the connections alive which
// act as proxies and all incoming calls to this nad instance will be "pull"
// style HTTP GET requests handled by the normal "handler" function.
const revs = {};

let revSetupAttempts = 0;
const maxRevSetupAttempts = 5;

function getRetryInterval() {
    const minRetryInterval = 5 * 1000; // 5 seconds
    const maxRetryInterval = 30 * 1000; // 30 seconds

    return Math.floor(Math.random() * (maxRetryInterval - minRetryInterval + 1)) + minRetryInterval;
}

function setup_reverse(options, logger) {
    const cafile = options.cafile;
    const creds = options.creds;
    const hostname = options.hostname;
    const srvPort = options.port;
    const auth_token = options.auth_token;
    const api_options = options.api_options;
    const check_bundle_id = options.check_bundle_id;

    logger.debug('setting up reverse connection');

    function getNoitCreds() {
        let noitCreds = null;
        let credFunc = null;

        if (cafile) {
            noitCreds = noit.hashToCreds({ ca: cafile });
        } else {
            // crypto.createCredentials is deprecated in v4+
            if (typeof tls.createSecureContext === 'function') {
                credFunc = tls.createSecureContext;
            } else if (typeof crypto.createCredentials === 'function') {
                credFunc = crypto.createCredentials;
            } else {
                logger.fatal('unable to determine correct method to create secure context for reverse connection');
                process.exit(1);
            }

            noitCreds = credFunc({
                ca: [
                    '-----BEGIN CERTIFICATE-----',
                    'MIID4zCCA0ygAwIBAgIJAMelf8skwVWPMA0GCSqGSIb3DQEBBQUAMIGoMQswCQYD',
                    'VQQGEwJVUzERMA8GA1UECBMITWFyeWxhbmQxETAPBgNVBAcTCENvbHVtYmlhMRcw',
                    'FQYDVQQKEw5DaXJjb251cywgSW5jLjERMA8GA1UECxMIQ2lyY29udXMxJzAlBgNV',
                    'BAMTHkNpcmNvbnVzIENlcnRpZmljYXRlIEF1dGhvcml0eTEeMBwGCSqGSIb3DQEJ',
                    'ARYPY2FAY2lyY29udXMubmV0MB4XDTA5MTIyMzE5MTcwNloXDTE5MTIyMTE5MTcw',
                    'NlowgagxCzAJBgNVBAYTAlVTMREwDwYDVQQIEwhNYXJ5bGFuZDERMA8GA1UEBxMI',
                    'Q29sdW1iaWExFzAVBgNVBAoTDkNpcmNvbnVzLCBJbmMuMREwDwYDVQQLEwhDaXJj',
                    'b251czEnMCUGA1UEAxMeQ2lyY29udXMgQ2VydGlmaWNhdGUgQXV0aG9yaXR5MR4w',
                    'HAYJKoZIhvcNAQkBFg9jYUBjaXJjb251cy5uZXQwgZ8wDQYJKoZIhvcNAQEBBQAD',
                    'gY0AMIGJAoGBAKz2X0/0vJJ4ad1roehFyxUXHdkjJA9msEKwT2ojummdUB3kK5z6',
                    'PDzDL9/c65eFYWqrQWVWZSLQK1D+v9xJThCe93v6QkSJa7GZkCq9dxClXVtBmZH3',
                    'hNIZZKVC6JMA9dpRjBmlFgNuIdN7q5aJsv8VZHH+QrAyr9aQmhDJAmk1AgMBAAGj',
                    'ggERMIIBDTAdBgNVHQ4EFgQUyNTsgZHSkhhDJ5i+6IFlPzKYxsUwgd0GA1UdIwSB',
                    '1TCB0oAUyNTsgZHSkhhDJ5i+6IFlPzKYxsWhga6kgaswgagxCzAJBgNVBAYTAlVT',
                    'MREwDwYDVQQIEwhNYXJ5bGFuZDERMA8GA1UEBxMIQ29sdW1iaWExFzAVBgNVBAoT',
                    'DkNpcmNvbnVzLCBJbmMuMREwDwYDVQQLEwhDaXJjb251czEnMCUGA1UEAxMeQ2ly',
                    'Y29udXMgQ2VydGlmaWNhdGUgQXV0aG9yaXR5MR4wHAYJKoZIhvcNAQkBFg9jYUBj',
                    'aXJjb251cy5uZXSCCQDHpX/LJMFVjzAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEB',
                    'BQUAA4GBAAHBtl15BwbSyq0dMEBpEdQYhHianU/rvOMe57digBmox7ZkPEbB/baE',
                    'sYJysziA2raOtRxVRtcxuZSMij2RiJDsLxzIp1H60Xhr8lmf7qF6Y+sZl7V36KZb',
                    'n2ezaOoRtsQl9dhqEMe8zgL76p9YZ5E69Al0mgiifTteyNjjMuIW',
                    '-----END CERTIFICATE-----'
                ].join('\n')
            });
        }

        creds.rejectUnauthorized = false;

        return noitCreds;
    }

    function circapi_cb(code, err, data) {
        if (err) {
            revSetupAttempts += 1;
            const retryInterval = getRetryInterval();

            logger.warn({
                error: err,
                code,
                data,
                attempt: revSetupAttempts,
                wait: Math.round(retryInterval / 1000)
            }, 'reverse connection setup error, trying again');

            if (revSetupAttempts >= maxRevSetupAttempts) {
                logger.fatal({ max_attempts: maxRevSetupAttempts }, 'failed to setup reverse connection after max attempts');
                // explicit request to use reverse connections but, unable to establish the connection
                // exit intentionally so there is a record in logging and service management can handle
                // a persistently failing service in its usual manner.
                process.exit(1);
            }
            setTimeout(setup_reverse, retryInterval);
            return;
        }

        if (data === null || typeof data !== 'object' || Array.isArray(data) && data.length === 0) {
            if (check_bundle_id === null) {
                logger.fatal({ hostname }, 'configuration for reverse - searching yielded no applicable json:nad check');
            } else {
                logger.fatal({ check_bundle_id }, 'configuration for reverse - unable to retrieve check object with API.');
            }
            // explicit request to use reverse connections but, incorrect configuration prevents
            // correct functionality. exit intentionally so there is a record in logging and
            // service management can handle a persistently failing service in its usual manner.
            process.exit(1);
        }

        let check = {};

        if (Array.isArray(data)) {
            check = data[0];
        } else {
            check = data;
        }

        if (!{}.hasOwnProperty.call(check, '_reverse_connection_urls')) {
            logger.fatal({ check_cid: check._cid }, 'invalid check, does not contain a reverse connection URL');
            process.exit(1);
        }

        if (!Array.isArray(check._reverse_connection_urls) || check._reverse_connection_urls.length === 0) {
            logger.fatal({ check_cid: check._cid }, 'invalid check, reverse connection URL attribute is invalid');
            process.exit(1);
        }

        check._reverse_connection_urls.forEach((rcURL) => {
            const parts = (/^mtev_reverse:\/\/(.+):(\d+)\/([^.]+)$/).exec(rcURL);

            if (parts) {
                revs[rcURL] = new noit.connection(parts[2], parts[1], getNoitCreds()); // eslint-disable-line new-cap
                revs[rcURL].reverse(parts[3], '127.0.0.1', srvPort);
            } else if (check._reverse_connection_urls.length === 1) {
                logger.fatal({ url: rcURL }, 'invalid reverse connection URL');
                process.exit(1);
            } else {
                logger.warn({ url: rcURL }, 'invalid reverse connection URL, skipping');
            }
        });
    }

    circapi.setup(auth_token, 'nad', api_options);

    if (check_bundle_id === null) {
        circapi.get(`/check_bundle?f_type=json:nad&f_target=${hostname}`, null, circapi_cb);
    } else {
        circapi.get(`/check_bundle/${check_bundle_id}`, null, circapi_cb);
    }
}

module.exports = setup_reverse;
