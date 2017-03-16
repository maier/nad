/* eslint-env node, es6 */
/* eslint-disable no-process-exit */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-sync */

'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');

function config_error(msg) {
    throw new Error(msg);
}

let instance = null;

class Settings {
    constructor() { // eslint-disable-line complexity
        if (instance !== null) {
            return instance;
        }

        let logDir = null;
        let cfg = {};

        instance = this; // eslint-disable-line consistent-this

        this.start_time = Date.now();
        this.app_name = 'circonus-agent-statsd';
        this.app_version = '0.1.0';

        // e.g. __dirname = /opt/circonus/lib/statsd/lib/settings
        this.base_dir = path.resolve(path.join(__dirname, '..', '..', '..', '..'));    // /opt/circonus
        this.lib_dir = path.resolve(path.join(__dirname, '..'));                       // /opt/circonus/lib/statsd/lib
        this.cosi_dir = path.resolve(path.join(this.base_dir, 'cosi'));                // /opt/circonus/cosi
        this.config_file = path.resolve(path.join(this.base_dir, 'etc', `${this.app_name}.json`));

        try {
            cfg = require(this.config_file); // eslint-disable-line global-require
        }
        catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                config_error(`Config file ${this.config_file} not found.`);
            }
            else {
                config_error(`Loading configuration file ${this.config_file}: ${err}`);
            }
        }

        //
        // merge into settings
        //
        this.servers = [];

        if ({}.hasOwnProperty.call(cfg, 'servers') && Array.isArray(cfg.servers)) {
            for (let i = 0; i < cfg.servers.length; i++) {
                if ({}.hasOwnProperty.call(cfg.servers[i], 'server') &&
                    {}.hasOwnProperty.call(cfg.servers[i], 'address') &&
                    {}.hasOwnProperty.call(cfg.servers[i], 'port')) {
                    if (cfg.servers[i].server.match(/^(udp|tcp)$/) &&
                        (net.isIPv4(cfg.servers[i].address) || net.isIPv6(cfg.servers[i].address)) &&
                        `${cfg.servers[i].port}`.match(/^\d+$/)) {
                        this.servers.push({
                            server: cfg.servers[i].server,
                            address: cfg.servers[i].address,
                            address_ipv6: net.isIPv6(cfg.servers[i].address),
                            port: cfg.servers[i].port
                        });
                    }
                    else {
                        console.error(`Invalid server config, ignoring - ${cfg.servers[i]}`);
                    }
                }
                else {
                    console.error(`Invalid server config, ignoring - ${cfg.servers[i]}`);
                }
            }
        }

        if (this.servers.length === 0) {
            // default server configuration
            this.servers.push({
                server: 'udp',
                address: '127.0.0.1',
                address_ipv6: false,
                port: 8125
            });
        }

        //
        // setup logging
        //
        this.log = {
            console: false,
            dir: path.join('.', 'log'),
            level: 'info',
            rotation: '1d',
            keep_max: 8
        };

        // override with custom settings, if any
        if ({}.hasOwnProperty.call(cfg, 'log')) {
            for (const option in this.log) {
                if ({}.hasOwnProperty.call(cfg.log, option)) {
                    this.log[option] = cfg.log[option];
                }
            }
        }

        logDir = this.log.dir;
        if (logDir === 'stdout') {
            this.log.console = true;
        }
        else {
            if (logDir.substr(0, 1) === '/') { // eslint-disable-line no-magic-numbers
                this.log.dir = path.resolve(logDir);
            }
            else {
                this.log.dir = path.resolve(this.base_dir, logDir);
            }

            try {
                fs.accessSync(this.log.dir, fs.W_OK);
            }
            catch (err) {
                config_error(`Log directory '${this.log.dir}' ${err}`);
            }

            if (!this.log.level.match(/^(trace|debug|info|warn|error|fatal)$/)) {
                config_error(`Invalid log_level '${this.log.level}'`);
            }

            if (!this.log.rotation.match(/^\d+(h|d|w|m|y)$/)) {
                config_error(`Invalid log_rotation '${this.log.rotation}'`);
            }

            if (this.log.keep_max <= 0) { // eslint-disable-line no-magic-numbers
                config_error(`Invalid log_keep_max '${this.log.keep_max}'`);
            }
        }

        const options = [
            {
                name: 'flushInterval',
                default: 60000
            },
            {
                name: 'forceMetricActivation',
                default: false
            },
            {
                name: 'prefix',
                default: {
                    global: '',
                    counter: '',
                    gauge: '',
                    histogram: '',
                    timer: '',
                    set: '',
                    text: '',
                    internal: 'statsd'
                }
            },
            {
                name: 'suffix',
                default: {
                    global: '',
                    counter: 'counter',
                    gauge: 'gauge',
                    histogram: 'histogram',
                    timer: 'timer',
                    set: 'set',
                    text: 'text',
                    internal: ''
                }
            },
            {
                name: 'forceGC',
                default: false
            },
            {
                name: 'sendProcessStats',
                default: true
            }
        ];

        for (let i = 0; i < options.length; i++) {
            const option = options[i];

            if ({}.hasOwnProperty.call(cfg, option.name)) {
                this[option.name] = cfg[option.name];
            }
            else {
                this[option.name] = option.default;
            }

            if (option.name === 'prefix' || option.name === 'postfix') {
                const keys = Object.keys(option.default);

                for (let j = 0; j < keys.length; j++) {
                    if (!{}.hasOwnProperty.call(this[option.name], keys[j])) {
                        this[option.name][keys[j]] = option.default[keys[j]];
                    }
                }
            }
        }

        // using http as the transmitting agent, flushing more frequently than
        // every 10s is asking for issues.
        if (this.flushInterval < 10000) {
            console.error(`[WARN] Invalid flush interval ${this.flushInterval}, using 60000.`);
            this.flushInterval = 60000;
        }

        return instance;
    }
}

module.exports = new Settings();

// END
