'use strict';

/* eslint-env node */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-undefined */

const dgram = require('dgram');

class UDPServer {
    start(config, callback) {
        const udp_version = config.address_ipv6 ?
            'udp6' :
            'udp4';
        const server = dgram.createSocket(udp_version, callback);

        server.bind(config.port || 8125, config.address || undefined);

        this.server = server;

        return true;
    }
}

module.exports = new UDPServer();

// END
