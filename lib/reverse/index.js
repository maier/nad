'use strict';

/* eslint-disable global-require */
/* eslint-disable no-process-exit */
/* eslint-disable no-mixed-operators */
/* eslint-disable no-sync */

const fs = require('fs');
const path = require('path');
const tls = require('tls');

const circapi = require('circonusapi2');
const noit = require(path.resolve(path.join(__dirname, 'noit')));

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

function getNoitCreds(cafile, logger) {
    if (cafile) {
        try {
            const ca = fs.readFileSync(cafile);

            return tls.createSecureContext({ ca });
        } catch (err) {
            logger.fatal({ err, cafile }, 'unable to load cafile');
            process.exit(1);
        }
    }

    return tls.createSecureContext({
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

function setup_reverse(options, logger) {
    logger.debug('setting up circonus api');

    circapi.setup(options.apiKey, options.apiApp, options.api_options);

    let reqPath = `/check_bundle?f_type=json:nad&f_target=${options.hostname}`;

    if (options.check_bundle_id !== null) {
        reqPath = `/check_bundle/${options.check_bundle_id}`;
    }

    const noitCreds = getNoitCreds(options.cafile, logger);

    logger.debug({ url_path: reqPath }, 'calling circonus api');
    circapi.get(reqPath, null, (code, err, data) => {
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
                process.exit(1);
            }
            setTimeout(setup_reverse, retryInterval);
            return;
        }

        if (data === null || typeof data !== 'object' || Array.isArray(data) && data.length === 0) {
            if (options.check_bundle_id === null) {
                logger.fatal({ host: options.hostname }, 'configuration for reverse - searching yielded no applicable json:nad check');
            } else {
                logger.fatal({ check_bundle_id: options.check_bundle_id }, 'configuration for reverse - unable to retrieve check object with API.');
            }
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

        for (const rcURL of check._reverse_connection_urls) {
            const parts = (/^mtev_reverse:\/\/(.+):(\d+)\/([^.]+)$/).exec(rcURL);

            if (!parts) {
                if (check._reverse_connection_urls.length === 1) {
                    logger.fatal({ url: rcURL }, 'invalid reverse connection URL');
                    process.exit(1);
                }

                logger.warn({ url: rcURL }, 'invalid reverse connection URL, skipping');
                continue;
            }
            revs[rcURL] = new noit.Connection(parts[2], parts[1], noitCreds, null, logger); // eslint-disable-line new-cap
            revs[rcURL].reverse(parts[3], '127.0.0.1', options.server_port);
        }
    });
}

module.exports = setup_reverse;
