'use strict';

// provide single interface for obtaining broker CA certificate
//
// use:
//
// const broker = require('broker');
//
// broker.publicCA() - returns public broker CA certificate
// broker.fileCA() - returns CA certificate from --cafile provided on command line
// broker.apiCA(cb) - fetches CA certificate from API - call to callback is cb(err, cert)
// broker.loadCA(cb) - attempt all three in sequence (file, api, public) - call to callback is cb(err, cert)
//
// whichever call is made first will cache the cert and it will be returned from that point forward.
//

/* eslint-disable no-process-exit */

const tls = require('tls');
const path = require('path');
const fs = require('fs');

const nad = require('nad');
const settings = require(path.join(nad.lib_dir, 'settings'));
const client = require(path.join(nad.lib_dir, 'apiclient'));
const log = settings.logger.child({ module: 'broker' });

class Broker {
    constructor() {
        this.broker_ca_file = settings.broker_ca_file;
        this.ca = null;
    }

    publicCA() {
        if (this.ca !== null) {
            return this.ca;
        }

        this.ca = tls.createSecureContext({
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

        return this.ca;
    }

    fileCA() {
        if (this.ca !== null) {
            return this.ca;
        }

        let cert = null;

        if (this.broker_ca_file !== null) {
            log.debug({ file: this.broker_ca_file }, 'trying to load broker ca file');
            try {
                cert = fs.readFileSync(this.broker_ca_file);
                this.ca = tls.createSecureContext({ cert });
                return this.ca;
            } catch (err) {
                log.fatal({ err, file: this.broker_ca_file }, 'unable to load broker CA file');
                process.exit(1);
            }
        }

        return cert;
    }

    apiCA(cb) {
        if (this.ca !== null) {
            cb(null, this.ca);
            return;
        }

        const self = this;

        client.get('/pki/ca.crt', null, (err, body, code) => {
            if (err !== null) {
                cb(err, null);
                return;
            }
            if (code !== 200) {
                cb(new Error(`API result code ${code} - ${body.toString()}`), null);
                return;
            }
            self.ca = tls.createSecureContext(body.contents);
            cb(null, self.ca);
            return;
        });
    }

    loadCA(cb) {
        if (this.ca !== null) {
            cb(null, this.ca);
            return;
        }

        const self = this;
        const cert = this.fileCA();

        if (cert !== null) {
            cb(null, cert);
            return;
        }

        this.apiCA((err, crt) => {
            if (err) {
                log.error({ err: err.message }, 'unable to retrieve broker CA cert from API, falling back to public CA');
                cb(null, self.publicCA());
                return;
            }
            cb(null, crt);
            return;
        });
    }
}

module.exports = new Broker();
