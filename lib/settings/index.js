'use strict';

// handle command line options and environment variables

/* eslint-disable no-process-exit */
/* eslint-disable global-require */
/* eslint-disable complexity */
/* eslint-disable no-sync */
/* eslint-disable no-param-reassign */

const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');

const chalk = require('chalk');
const pino = require('pino');

let instance = null;

function helpDetails() {
    const help = [
        chalk.bold('Target'),
        '',
        '\tIs used by both Reverse and Self-configure.',
        `\t\tReverse will use it to search for a check if a cid is not provided.`,
        `\t\tSelf-configure will use it to configure the check on the broker - it is`,
        `\t\tthe host the broker will connect to in order to pull metrics.`,
        '',
        chalk.bold('Reverse mode'),
        `\tRequired:`,
        `\t\t${chalk.bold('--reverse')} flag signals nad to setup a reverse connection to the broker.`,
        `\tOptional:`,
        `\t\t${chalk.bold('--api_key')} - will pull from cosi if available or fail if not provided.`,
        `\t\t${chalk.bold('--target')} - to enable searching for a check (e.g. on a host not registered by cosi).`,
        `\t\tor`,
        `\t\t${chalk.bold('--cid')} - will pull from cosi if available (and --target not specified).`,
        '',
        `${chalk.bold('StatsD')}`,
        `\tSee https://github.com/circonus-labs/nad/lib/statsd/README.md`,
        `\tfor details on configuring the statsd interface.`,
        '',
        `${chalk.bold('Self-configure')}`,
        `\t${chalk.yellow('DEPRECATED')} -- use cosi instead (https://github.com/circonus-labs/circonus-one-step-install)`,
        '',
        `\tProviding an API token key ${chalk.bold('without')} the reverse flag will initiate a self-configuration attempt.`,
        '',
        '\tRequired:',
        `\t\t${chalk.bold('--api_key')}`,
        `\t\t${chalk.bold('--target')}`,
        `\t\t${chalk.bold('--brokerid')}`,
        `\t\t${chalk.bold('--configfile')}`,
        '\tOptional:',
        `\t\t${chalk.bold('--hostname')}`
    ];

    console.log(help.join('\n'));
}

function configError(msg) {
    console.error(chalk.red('CONFIGURATION ERROR:'), msg);
    process.exit(1); // eslint-disable-line no-process-exit
}

// //////////////////////////////////////////////////////////////////////
// autoconfig with circonus
// //////////////////////////////////////////////////////////////////////
function configure_circonus() {
    let nadapi = null;
    let error = false;

    if (instance.target === null) {
        console.error('--target is required.');
        error = true;
    }

    if (instance.broker_id === null || !(/^\d+$/).test(instance.broker_id)) {
        console.error('--brokerid is required and should be an integer.');
        error = true;
    }

    if (instance.configfile === null) {
        console.error('--configfile is required.');
        error = true;
    }

    if (error) {
        process.exit(1);
    }

    try {
        nadapi = require('nad_circapi');
    } catch (err) {
        const msg = 'unable to load nad_circapi module';

        instance.logger.fatal({ err }, msg);
        console.error(chalk.red('ERROR:'), msg, err);
        process.exit(1);
    }

    let api_options = null;

    if (instance.api.use_apiurl) {
        api_options = url.parse(instance.api.url);
    } else {
        api_options = instance.api.old_options;
    }

    nadapi.configure(
        instance.api.key,
        instance.target,
        instance.hostname,
        instance.broker_id,
        instance.configfile,
        api_options);

    process.exit(0);
}

function setLogLevel(options) {
    if (options.loglevel) {
        if (/^(trace|debug|info|warn|error|fatal)$/.test(options.loglevel)) {
            instance.logger.level = options.loglevel;
            instance.logger.info({ level: instance.logger.level }, 'set log level');
        } else {
            const msg = 'invalid log level';

            instance.logger.fatal({ level: options.loglevel }, msg);
            configError(`${msg} '${options.loglevel}'`);
        }
    }
    if (options.debug) {
        instance.logger.level = 'debug';
        instance.logger.info({ level: instance.logger.level }, 'set log level');
    }
    if (options.trace) {
        instance.logger.level = 'trace';
        instance.logger.info({ level: instance.logger.level }, 'set log level');
    }
}

function setPluginDirectory(options) {
    if (options.c) {
        try {
            instance.plugin_dir = fs.realpathSync(options.c);
        } catch (err) {
            const msg = 'invalid plugin dir';

            instance.logger.fatal({ dir: options.c, err }, msg);
            configError(`${msg} '${options.c}' - ${err}`);
        }
    }
    if (options.plugin_dir) {
        try {
            instance.plugin_dir = fs.realpathSync(options.plugin_dir);
        } catch (err) {
            const msg = 'invalid plugin dir';

            instance.logger.fatal({ dir: options.plugin_dir, err }, msg);
            configError(`${msg} '${options.plugin_dir}' - ${err}`);
        }
    }
}

function setUID(options) {
    if (options.uid) {

        if (!(/^[0-9]+$/).test(options.uid)) {
            const msg = 'invalid uid specified';

            instance.logger.fatal({ uid: options.uid }, msg);
            configError(`${msg} '${options.uid}'`);
        }

        const uid = parseInt(options.uid, 10);

        if (uid <= 0) {
            const msg = 'invalid uid specified';

            instance.logger.fatal({ uid: options.uid }, msg);
            configError(`${msg} '${options.uid}'`);
        }

        if (!process.setuid) {
            const msg = 'dropping privileges not supported';

            instance.logger.fatal({ uid: options.uid }, msg);
            configError(`${msg} '${options.uid}'`);
        }

        instance.drop_uid = uid;
    }
}

function parseListen(name, spec) {
    let ip = null;
    let port = null;

    if ((/^[0-9]+$/).test(spec)) { // just a port
        port = parseInt(spec, 10);
    } else if ((/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/).test(spec)) { // just an IP
        ip = spec;
    } else if (spec.indexOf(':') === 1) { // combo ip:port
        const listen = spec.split(/:/);

        if (listen.length === 2) {
            if (listen[0] !== '') {
                ip = listen[0];
            }
            port = parseInt(listen[1], 10);
        }
    }

    if (ip === null && port === null) {
        const msg = `invalid ${name} specification`;

        instance.logger.fatal({ arg: spec }, msg);
        configError(`${msg} '${spec}'`);
    }

    if (port <= 0) {
        const msg = `invalid ${name} port`;

        instance.logger.fatal({ arg: spec }, msg);
        configError(`${msg} '${spec}'`);
    }

    return { port, address: ip };
}

function setListen(options, defaultIP, defaultPort) {
    if (!options.listen || options.listen === '') {
        instance.listen.push({ port: defaultPort, address: defaultIP });
        return;
    }

    instance.listen.push(parseListen('listen', options.listen));
}

function setSSLOptions(options) {
    if (!options.ssl_listen || options.ssl_listen === '') {
        return;
    }

    instance.ssl.listen.push(parseListen('SSL listen', options.ssl_listen));

    if (options.ssl_verify) {
        instance.ssl.verify = true;
    }

    // load key
    const ssl_key = options.ssl_key || options.sslkey || path.join(instance.plugin_dir, 'na.key');

    try {
        instance.ssl.creds.key = fs.readFileSync(fs.realpathSync(ssl_key));
    } catch (err) {
        const msg = 'invalid SSL key file';

        instance.logger.fatal({ ssl_key }, msg);
        configError(`${msg} '${ssl_key}'`);
    }

    // load cert
    const ssl_cert = options.ssl_cert || options.sslcert || path.join(instance.plugin_dir, 'na.crt');

    try {
        instance.ssl.creds.cert = fs.readFileSync(fs.realpathSync(ssl_cert));
    } catch (err) {
        const msg = 'invalid SSL cert file';

        instance.logger.fatal({ ssl_cert: options.ssl_cert }, msg);
        configError(`${msg} '${options.ssl_cert}'`);
    }


    // load ca (if applicable)
    if (instance.ssl.verify) {
        const ssl_ca = options.sslca || options.sslca || path.join(instance.plugin_dir, 'na.ca');

        try {
            instance.ssl.creds.ca = fs.readFileSync(fs.realpathSync(ssl_ca));
        } catch (err) {
            const msg = 'invalid SSL CA file';

            instance.logger.fatal({ ssl_ca: options.ssl_ca }, msg);
            configError(`${msg} '${options.ssl_ca}'`);
        }
    }
}

function setReverseOptions(options) {
    if (!options.reverse) {
        return;
    }

    const COSI_DIR = path.resolve(path.join(path.sep, 'opt', 'circonus', 'cosi'));

    instance.reverse.enabled = true;

    if (options.cid && (/^[0-9]+$/).test(options.cid)) {
        instance.reverse.check_bundle_id = options.cid;
    } else {
        const msg = 'reverse - invalid check bundle id';

        instance.logger.fatal({ cid: options.cid }, msg);
        configError(`${msg} '${options.cid}'`);
    }

    if (options.cafile) {
        instance.reverse.broker_ca = options.cafile;
    }

    // NOTE: only use cosi information for reverse - contradictory to use for self-configure

    if (instance.api.key === null) {
        try {
            const cosiCfg = path.resolve(path.join(COSI_DIR, 'etc', 'cosi.json'));
            const cosi = require(cosiCfg);

            instance.api.key = cosi.apikey;
            if (instance.api.app === null) {
                instance.api.app = cosi.apiApp;
            }
        } catch (err) {
            const msg = 'reverse - API key';

            console.error(instance.pfx_error, msg, err);
            instance.log.fatal({ err }, msg);
            process.exit(1);
        }
    }

    if (instance.reverse.check_bundle_id === null) {
        try {
            const cosiCfg = path.resolve(path.join(COSI_DIR, 'registration', 'registration-check-system.json'));
            const cosi = require(cosiCfg);

            instance.reverse.check_bundle_id = cosi._cid.replace('/check_bundle/', '');
        } catch (err) {
            const msg = 'reverse - check bundle id';

            instance.logger.error({ err }, msg);
            configError(`${msg} ${err}`);
        }
    }
}

function setAPIOptions(options) {
    if (options.authtoken) {
        instance.api.key = options.authtoken;
    }
    if (options.api_key) {
        instance.api.key = options.api_key;
    }

    if (!(/^[0-9a-fA-F]{4}(?:[0-9a-fA-F]{4}-){4}[0-9a-fA-F]{12}$/).test(instance.api.key)) {
        const msg = 'invalid API Token key';

        instance.logger.fatal({ key: instance.api.key }, msg);
        configError(`${msg} ${instance.api.key}`);
    }

    if (options.api_app) {
        instance.api.app = options.api_app;
    }

    if (options.api_url) {
        // NOTE: using this will override all other --api(host,port,path,protocol) options set
        instance.api.url = options.api_url;
        if (instance.api.url.substr(-1) !== '/') {
            instance.api.url += '/';
        }
    }

    if (options.apiverbose) {
        instance.api.verbose = true;
    }

    // DEPRECATED options

    if (options.apihost) {
        const msg = '--apihost is deprecated use --api_url';

        instance.logger.warn(msg);
        console.warn(msg);
        instance.api.use_apiurl = false;
        instance.api.old_options.host = options.apihost;
    }

    if (options.apiport) {
        const msg = '--apiport is deprecated use --api_url';

        instance.logger.warn(msg);
        console.warn(msg);
        instance.api.use_apiurl = false;
        instance.api.old_options.port = options.apiport;
    }

    if (options.apipath) {
        const msg = '--apipath is deprecated use --api_url';

        instance.logger.warn(msg);
        console.warn(msg);
        instance.api.use_apiurl = false;
        instance.api.old_options.path = options.apipath;
    }

    if (options.apiprotocol) {
        const msg = '--apiprotocol is deprecated use --api_url';

        instance.logger.warn(msg);
        console.warn(msg);
        instance.api.use_apiurl = false;
        instance.api.old_options.protocol = options.apiprotocol;
    }

}

class Settings {
    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this; // eslint-disable-line consistent-this

        const options = require('commander');

        const DEFAULT_PLUGIN_DIR = path.resolve(path.join(path.sep, 'opt', 'circonus', 'etc', 'node-agent.d'));
        const DEFAULT_LOG_LEVEL = 'info';
        const DEFAULT_IP = null;
        const DEFAULT_PORT = 2609;
        const DEFAULT_API_URL = 'https://api.circonus.com/v2/';
        const DEFAULT_SSL_CERT = path.join('<plugin_dir>', 'na.crt');
        const DEFAULT_SSL_KEY = path.join('<plugin_dir>', 'na.key');
        const DEFAULT_SSL_CA = path.join('<plugin_dir>', 'na.ca');

        this.app_name = 'nad'; // pkg.name;
        this.app_version = '1.0.0'; // pkg.version;

        this.logger = pino({
            name: this.app_name,
            level: DEFAULT_LOG_LEVEL,
            enabled: true
        });

        this.pfx_error = chalk.red('ERROR:');
        this.pfx_warn = chalk.yellow('WARN:');

        this.plugin_dir = DEFAULT_PLUGIN_DIR; // directory where plugins are located
        this.is_windows = process.platform === 'win32'; // is running system windows
        this.is_booted = false; // has bootstrap completed
        this.drop_uid = 0; // drop privileges to UID, if supported and specified on command line
        this.reverse = {
            enabled: false,
            broker_ca: null,
            check_bundle_id: null
        };
        this.target = os.hostname(); // used by self-configure
        this.hostname = os.hostname(); // used by self-configure and reverse connection
        this.broker_id = null; // used by self-configure
        this.configfile = null; // used by self-configure
        this.api = { // used by self-configure and reverse connection
            key: null,
            app: this.app_name,
            url: DEFAULT_API_URL,
            verbose: false,
            use_apiurl: true, // toggles using the new settings.api.url vs deprecated 'api_options'
            api_options: {
                host: null, // deprecated
                port: null, // deprecated
                path: null, // deprecated
                protocol: null // deprecated
            }
        };
        this.debug_dir = null; // if set, a dir to write debug logs to
        this.wipe_debug_dir = false; // if true, wipe debug logs clean before each write
        this.ssl = {// ssl server options
            verify: false, // use ca certificate for verifications
            listen: [], // server listening address(es)/port(s)
            creds: {} // ssl credentials
        };
        this.listen = []; // server listening address(es)/port(s)
        this.send_nad_stats = true; // send nad stats (cpu, memory, uptime)

        this.file_watch = true; // watch plugin dir, plugin scripts and plugin configs. (if false, user can send SIGHUP to trigger rescan)

        //
        // command line options (parsed by commander)
        //
        options.
            version(this.version).
            //
            // basic
            option('--plugin_dir <dir>', `Plugin directory [${DEFAULT_PLUGIN_DIR}]`, null).
            option('-p, --listen <ip|port|ip:port>', `Listening IP address and port [${DEFAULT_IP ? `${DEFAULT_IP}:` : ''}${DEFAULT_PORT}]`, null).
            //
            // reverse
            option('-r, --reverse', `Use reverse connection to broker [false]`, null).
            option('--cid <cid>', `Check bundle id for reverse connection []`, null).
            option('--broker_ca <file>', `CA file for broker reverse connection []`, null).
            //
            // api - used by reverse AND self-configure (until self-config is removed)
            option('--api_key <key>', `Circonus API Token key []`, null).
            option('--api_app <app>', `Circonus API Token app [${this.app_name}]`, null).
            option('--api_url <url>', `Circonus API URL [${DEFAULT_API_URL}]`, null).
            option('--api_ca <file>', `CA file for API URL []`, null).
            option('--apiverbose', `Output information on API communications to STDERR [false]`, null).
            //
            // self-configure
            option('--hostname <host>', `Hostname self-configure to use in check and graph names [${this.hostname}]`, null).
            option('--brokerid <id>', `Broker ID for self-configure to use for creating check []`, null).
            option('--configfile <file>', `File in plugin_dir for self-configure []`, null).
            //
            // self-configure AND reverse
            option('--target <target>', `Target host [${this.target}] -- see Target below`, null).
            //
            // SSL
            option('-s, --ssl_listen <ip|port|ip:port>', `SSL listening IP address and port []`, null).
            option('--ssl_cert <file>', `SSL certificate PEM file, requried for SSL [${DEFAULT_SSL_CERT}]`, null).
            option('--ssl_key <file>', `SSL certificate key PEM file, required for SSL [${DEFAULT_SSL_KEY}]`, null).
            option('--ssl_ca <file>', `SSL CA certificate PEM file, required for SSL w/verify [${DEFAULT_SSL_CA}]`, null).
            option('-v, --ssl_verify', `Verify SSL traffic [false]`, null).
            //
            // statsd
            // option('--statsd <file>', `Config file for builtin StatsD interface (disabled if none supplied) []`, null).
            //
            // miscellaneous
            option('-u, --uid <id>', `User id to drop privileges to on start []`, null).
            option('--loglevel <level>', `Log level (trace|debug|info|warn|error|fatal) [${DEFAULT_LOG_LEVEL}]`, null).
            option('-d, --debug', `Enable debug logging (verbose) [false]`, null).
            option('-t, --trace', `Enable trace logging (very verbose) [false]`, null).
            option('--no_watch', `Disable automatic watches of plugin directory, script files, config files. Send SIGHUP to rescan plugins. [${this.file_watch}]`, null).
            //
            // not entirely sure of the value these provide.
            // - returns from plugins could be put into the log at the --trace level rather than a separate directory (the log is machine parseable)
            // - no idea what -i 'inventory' actually accomplishes or its intended purpose
            option('--debugdir', `Create debug files for each plugin and write to this directory []`, null).
            option('--wipedebugdir', `Wipe debug directory clean before each write [false]`, null).
            option('-i, --inventory', `Offline inventory`, null).
            //
            // backwards compatibility DEPRECATED arguments
            option('-c <dir>', `${chalk.yellow('DEPRECATED')} Plugin directory - ${chalk.bold('use --plugin_dir')}`, null).
            option('--authtoken <token>', `${chalk.yellow('DEPRECATED')} Circonus API Token Key - ${chalk.bold('use --api_key')}`, null).
            option('--apihost <host>', `${chalk.yellow('DEPRECATED')} Override the host for the Circonus API server [api.circonus.com] - ${chalk.bold('use --api_url')}`, null).
            option('--apiport <port>', `${chalk.yellow('DEPRECATED')} Override the port for the Circonus API server [443] - ${chalk.bold('use --api_url')}`, null).
            option('--apipath <path>', `${chalk.yellow('DEPRECATED')} Override the path for the Circonus API server [/v2] - ${chalk.bold('use --api_url')}`, null).
            option('--apiprotocol <proto>', `${chalk.yellow('DEPRECATED')} Override the protocol for the Circonus API server [https] - ${chalk.bold('use --api_url')}`, null).
            option('--sslcert <file>', `${chalk.yellow('DEPRECATED')} SSL certificate PEM file, requried for SSL - ${chalk.bold('use --ssl_cert')}`, null).
            option('--sslkey <file>', `${chalk.yellow('DEPRECATED')} SSL certificate key PEM file, required for SSL - ${chalk.bold('use --ssl_key')}`, null).
            option('--sslca <file>', `${chalk.yellow('DEPRECATED')} SSL CA certificate PEM file, required for SSL w/verify - ${chalk.bold('use --ssl_ca')}`, null).
            option('--cafile <file>', `${chalk.yellow('DEPRECATED')} Path to CA certificate file to use for the broker during reverse connections [] - ${chalk.bold('use --broker_ca')}`, null).
            on('--help', helpDetails).
            parse(process.argv);

        // call private functions to configure settings
        // NOTE: these are in a specific order - leave them that way!!
        setLogLevel(options); // all the others depend on a valid log config
        setPluginDirectory(options);
        setListen(options, DEFAULT_IP, DEFAULT_PORT);
        setSSLOptions(options);
        setAPIOptions(options);
        setReverseOptions(options); // depends on api options being set first
        setUID(options);

        if (options.target && options.target !== '') {
            this.target = options.target;
        }
        if (options.hostname && options.hostname !== '') {
            this.hostname = options.hostname;
        }
        if (options.brokerid && (/^[0-9]+$/).test(options.brokerid)) {
            this.broker_id = options.brokerid;
        }
        if (options.configfile && options.configfile !== '') {
            this.configfile = fs.realpathSync(options.configfile);
        }
        if (options.no_watch) {
            this.file_watch = false;
        }

        // debug plugin output
        if (options.debugdir) {
            this.debug_dir = fs.realpathSync(options.debugdir);
            if (options.wipedebugdir) {
                this.wipe_debug_dir = true;
            }
        }

        // validate listening config
        if (this.listen.length === 0 && this.ssl.listen.length === 0) {
            const msg = 'must specify at least one of --listen or --ssl_listen';

            this.logger.fatal(msg);
            configError(msg);
        }

        //
        // set process name
        //
        const cmdline = process.argv.slice(2);

        cmdline.unshift(this.app_name);
        process.title = cmdline.join(' ');

        //
        // perform any options which will result in exiting (inventory and self-configure)
        //

        if (options.inventory) {
            let inventory = null;

            try {
                inventory = require('inventory');
            } catch (err) {
                const msg = 'unable to load inventory module';

                console.error(this.pfx_error, msg, err);
                this.logger.fatal({ err }, msg);
                process.exit(1);
            }

            inventory(this.plugin_dir);
            process.exit(0);
        }

        // there are only two purposes for specifying an api auth token key
        // 1. reverse connections
        // 2. an attempt to self-configure
        // if an auth token is supplied but there is no '-r'everse option specified
        // it is implied to be #2. so, attempt a self-configuration.
        if (this.api.key !== null && !this.reverse.enabled) {
            configure_circonus();
            process.exit(0);
        }

        return instance;

    }
}

module.exports = new Settings();
