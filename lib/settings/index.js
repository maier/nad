// centralized settings
// common defaults and command line processing

'use strict';

/* eslint-disable no-process-exit */
/* eslint-disable global-require */
/* eslint-disable complexity */

const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const net = require('net');

const chalk = require('chalk');
const pino = require('pino');
const nad = require('nad');

const COSI_DIR = path.resolve(path.join(nad.base_dir, 'cosi'));

let log = null;
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
    process.exit(1);
}

// //////////////////////////////////////////////////////////////////////
// self-configure nad with circonus DEPRECATED
// //////////////////////////////////////////////////////////////////////
function configure_circonus() {
    let nsc = null;
    let error = false;

    console.error(instance.pfx_warn, 'DEPRECATED', 'use of cosi is preferred');
    console.error('see https://github.com/circonus-labs/circonus-one-step-install');

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
        nsc = require(path.join(nad.lib_dir, 'nad_self_configure'));
    } catch (err) {
        console.error(chalk.red('ERROR:'), 'unable to load nad_circapi module', err);
        process.exit(1);
    }

    nsc.configure(
        instance.api,
        instance.target,
        instance.hostname,
        instance.broker_id,
        instance.configfile
    );

    process.exit(0);
}

function setLogLevel(options) {
    if (options.loglevel) {
        if (/^(trace|debug|info|warn|error|fatal)$/.test(options.loglevel)) {
            instance.logger.level = options.loglevel;
            log.level = options.loglevel;
            log.info({ level: log.level }, 'set log level');
        } else {
            const msg = 'invalid log level';

            log.fatal({ level: options.loglevel }, msg);
            configError(`${msg} '${options.loglevel}'`);
        }
    }
    if (options.debug) {
        instance.logger.level = 'debug';
        log.level = 'debug';
        log.info({ level: log.level }, 'set log level');
    }
    if (options.trace) {
        instance.logger.level = 'trace';
        log.level = 'trace';
        log.info({ level: log.level }, 'set log level');
    }
}

function setPluginDirectory(options) {
    if (options.c) {
        try {
            instance.plugin_dir = fs.realpathSync(options.c);
        } catch (err) {
            const msg = 'invalid plugin dir';

            log.fatal({ dir: options.c, err }, msg);
            configError(`${msg} '${options.c}' - ${err}`);
        }
    }
    if (options.plugin_dir) {
        try {
            instance.plugin_dir = fs.realpathSync(options.plugin_dir);
        } catch (err) {
            const msg = 'invalid plugin dir';

            log.fatal({ dir: options.plugin_dir, err }, msg);
            configError(`${msg} '${options.plugin_dir}' - ${err}`);
        }
    }
}

function setUID(options) {
    const is_posix = process.setuid && process.setgid && process.initgroups;

    if (!is_posix) {
        log.debug('not a POSIX system, disabling UID/GID support');
        if (options.uid) {
            log.warn({ uid: options.uid, gid: options.gid }, 'unable to find POSIX functions required for uid/gid support, disabling');
        }
        return;
    }

    if (!options.uid || options.uid === '') {
        instance.drop_uid = 'nobody';
        instance.drop_gid = 'nobody';
        log.debug({ uid: instance.drop_uid, gid: instance.drop_gid }, 'setting default uid/gid');
        return;
    }

    if (options.uid) {
        if (!(/^[a-z_][0-9a-z_]{0,30}$/).test(options.uid)) {
            const msg = 'invalid uid specified';

            log.fatal({ uid: options.uid }, msg);
            configError(`${msg} '${options.uid}'`);
        }
        instance.drop_uid = options.uid;
        instance.drop_gid = options.uid;

        if (options.gid) {
            if (!(/^[a-z_][0-9a-z_]{0,30}$/).test(options.gid)) {
                const msg = 'invalid gid specified';

                log.fatal({ gid: options.gid }, msg);
                configError(`${msg} '${options.gid}'`);
            }
            instance.drop_gid = options.gid;
        }
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

        log.fatal({ arg: spec }, msg);
        configError(`${msg} '${spec}'`);
    }

    if (port <= 0) {
        const msg = `invalid ${name} port`;

        log.fatal({ arg: spec }, msg);
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

        log.fatal({ ssl_key }, msg);
        configError(`${msg} '${ssl_key}'`);
    }

    // load cert
    const ssl_cert = options.ssl_cert || options.sslcert || path.join(instance.plugin_dir, 'na.crt');

    try {
        instance.ssl.creds.cert = fs.readFileSync(fs.realpathSync(ssl_cert));
    } catch (err) {
        const msg = 'invalid SSL cert file';

        log.fatal({ ssl_cert }, msg);
        configError(`${msg} '${options.ssl_cert}'`);
    }


    // load ca (if applicable)
    if (instance.ssl.verify) {
        const ssl_ca = options.ssl_ca || options.sslca || path.join(instance.plugin_dir, 'na.ca');

        try {
            instance.ssl.creds.ca = fs.readFileSync(fs.realpathSync(ssl_ca));
        } catch (err) {
            const msg = 'invalid SSL CA file';

            log.fatal({ ssl_ca }, msg);
            configError(`${msg} '${ssl_ca}'`);
        }
    }
}

function setReverseOptions(options) {
    if (!options.reverse) {
        return;
    }

    instance.reverse.enabled = true;

    if (options.cid && (/^[0-9]+$/).test(options.cid)) {
        instance.reverse.check_bundle_id = options.cid;
    } else {
        const msg = 'reverse - invalid check bundle id';

        log.fatal({ cid: options.cid }, msg);
        configError(`${msg} '${options.cid}'`);
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

            log.error({ err }, msg);
            configError(`${msg} ${err}`);
        }
    }
}

function setAPIOptions(options) {
    let ignore_deprecated_options = false;

    instance.api.key = options.api_key || options.authtoken || null;

    if (!instance.api.key || instance.api.key === '') {
        // no api token supplied, the rest of the api
        // options are not relevant...
        return;
    }

    if (!(/^[0-9a-fA-F]{4}(?:[0-9a-fA-F]{4}-){4}[0-9a-fA-F]{12}$/).test(instance.api.key)) {
        const msg = 'invalid API Token key';

        log.fatal({ key: instance.api.key }, msg);
        configError(`${msg} ${instance.api.key}`);
    }

    if (options.api_app) {
        instance.api.app = options.api_app;
    }

    if (options.api_url) {
        // NOTE: using this will override all other --api(host,port,path,protocol) options set
        ignore_deprecated_options = true;
        instance.api.url = options.api_url;
    }

    if (options.apiverbose) {
        instance.api.debug = true;
    }

    // DEPRECATED options
    if (ignore_deprecated_options) {
        let rebuild_api_url = false;
        const api_url_options = url.parse(instance.api.url);

        if (options.apihost && options.apihost.length > 0) {
            const msg = '--apihost is deprecated use --api_url';

            log.warn(msg);
            console.warn(msg);
            rebuild_api_url = true;
            api_url_options.host = null;
            api_url_options.hostname = options.apihost;
        }

        if (options.apiport && (/^[0-9]+$/).test(options.apiport)) {
            const msg = '--apiport is deprecated use --api_url';

            log.warn(msg);
            console.warn(msg);
            rebuild_api_url = true;
            api_url_options.port = options.apiport;
            api_url_options.host = null;
        }

        if (options.apipath && options.apipath.length > 0) {
            const msg = '--apipath is deprecated use --api_url';

            log.warn(msg);
            console.warn(msg);
            rebuild_api_url = true;
            api_url_options.pathname = options.apipath;
            api_url_options.path = null;
        }

        if (options.apiprotocol && (/^https?$/).test(options.apiprotocol)) {
            const msg = '--apiprotocol is deprecated use --api_url';

            log.warn(msg);
            console.warn(msg);
            rebuild_api_url = true;
            api_url_options.protocol = options.protocol;
        }

        if (rebuild_api_url) {
            instance.api.url = url.format(api_url_options);
        }
    }

    if (instance.api.url.substr(-1) !== '/') {
        instance.api.url += '/';
    }
}

function setStatsdOptions(options) {
    if (!options.statsd) {
        return;
    }

    const default_flush_interval = 10 * 1000; // 10 seconds

    instance.statsd = {
        enabled: true,
        start_time: Date.now(),
        app_name: `${instance.app_name}-statsd`,
        app_version: `${instance.app_version}`,
        servers: [],
        host_check_id: null,
        group_check_id: null
    };

    instance.statsd.logger = instance.logger.child({ module: `${instance.statsd.app_name}` });

    if (instance.reverse.enabled) {
        // add the reverse check bundle id, if provided
        // if it wasn't provided, the reverse module will add it if it finds a check
        if (instance.reverse.check_bundle_id) {
            instance.statsd.host_check_id = `${instance.reverse.check_bundle_id}`;
        }
    }

    try {
        // add cosi group check information, if it is available
        const cfgFile = fs.realpathSync(path.join(COSI_DIR, 'registration', 'registration-check-statsd.json'));
        const cfg = require(cfgFile);

        instance.statsd.group_check_id = cfg._cid.replace('/check_bundle/', '');
    } catch (err) {
        log.debug({ err: err.message, host: 'metrics to NAD.push_receiver', group: 'disabled' }, 'no cosi installation found for statsd');
    }

    // process user supplied config, if any
    let cfg = {};

    if (options.statsd_config && options.statsd_config !== null) {
        try {
            const cfgFile = fs.realpathSync(options.statsd_config);

            cfg = require(cfgFile);
        } catch (err) {
            if (err.code !== 'MODULE_NOT_FOUND') {
                log.fatal({ err: err.message, config_file: options.statsd }, 'unable to load statsd config');
                console.error(instance.pfx_error, 'unable to load statsd config', err);
                process.exit(1);
            }
        }
    }

    if (cfg.servers && Array.isArray(cfg.servers)) {
        for (const server of cfg.servers) {
            if (!server.server || !(/^(udp|tcp)$/i).test(server.server)) {
                log.warn({ server }, `invalid server config [protocol], ignoring`);
                continue;
            }
            if (!server.address || !(net.isIPv4(server.address) || net.isIPv6(server.address))) {
                log.warn({ server }, `invalid server config [address], ignoring`);
                continue;
            }
            if (!server.port || !(/^\d+$/).test(`${server.port}`)) {
                log.warn({ server }, `invalid server config [port], ignoring`);
                continue;
            }

            instance.statsd.servers.push({
                server: `${server.server}`,
                address: `${server.address}`,
                address_ipv6: net.isIPv6(server.address),
                port: `${server.port}`
            });
        }
    }

    // add default server if needed
    if (instance.statsd.servers.length === 0) {
        instance.statsd.servers.push({
            server: 'udp',
            address: '127.0.0.1',
            address_ipv6: false,
            port: 8125
        });
    }


    // backfill config with defaults
    const defaults = [
        {
            name: 'flushInterval',
            active: true, // is this option active
            default: default_flush_interval
        },
        {
            name: 'manageCheckMetrics',
            active: false, // is this option active
            default: false
        },
        {
            name: 'forceMetricActivation',
            active: false, // is this option active
            default: false
        },
        {
            name: 'hostKey', // **FIRST** part of the metric name that indicates this is a 'host' metric (the hostKey is removed from the metric name)
            active: true, // is this option active
            default: 'host.'
        },
        {
            name: 'hostCategory', // category metrics should be sent to nad as. (e.g. statsd, all metrics will start with "statsd`" in UI)
            active: true, // is this option active
            default: 'statsd'
        },
        {
            name: 'sendProcessStats',
            active: true, // is this option active
            default: true
        }
    ];

    for (const defaultSetting of defaults) {
        if (!defaultSetting.active) {
            instance.statsd[defaultSetting.name] = defaultSetting.default;
            continue;
        }

        if ({}.hasOwnProperty.call(cfg, defaultSetting.name)) {
            instance.statsd[defaultSetting.name] = cfg[defaultSetting.name];
        } else {
            instance.statsd[defaultSetting.name] = defaultSetting.default;
        }
    }

    // the local push_receiver will be used for:
    //      all metrics prefixed with hostKey
    //      all metrics if no statsd_config supplied
    // push_receiver metric category name
    const pr_mc = instance.statsd.hostCategory;

    instance.statsd.push_receiver_url = `http://${instance.listen[0].address || '127.0.0.1'}:${instance.listen[0].port}/write/${pr_mc}`;

    if (instance.statsd.flushInterval < default_flush_interval) {
        log.warn({ flushInterval: instance.statsd.flushInterval }, `invalid flush interval, using ${default_flush_interval}`);
        instance.statsd.flushInterval = default_flush_interval;
    }
}

class Settings {
    constructor() {
        if (instance !== null) {
            return instance;
        }

        instance = this; // eslint-disable-line consistent-this

        const options = require('commander');

        const DEFAULT_PLUGIN_DIR = path.resolve(path.join(nad.base_dir, 'etc', 'node-agent.d'));
        const DEFAULT_LOG_LEVEL = 'info';
        const DEFAULT_IP = null;
        const DEFAULT_PORT = 2609;
        const DEFAULT_API_URL = 'https://api.circonus.com/v2/';
        const DEFAULT_SSL_CERT = path.join('<plugin_dir>', 'na.crt');
        const DEFAULT_SSL_KEY = path.join('<plugin_dir>', 'na.key');
        const DEFAULT_SSL_CA = path.join('<plugin_dir>', 'na.ca');

        // would normally use package.json but nad is oddly installed
        this.app_name = 'nad'; // pkg.name;
        this.app_version = '1.0.0'; // pkg.version;
        this.start_time = Date.now();

        this.logger = pino({
            name: this.app_name,
            level: DEFAULT_LOG_LEVEL,
            enabled: true
        });
        log = this.logger.child({ module: 'settings' });

        this.pfx_error = chalk.red('ERROR:');
        this.pfx_warn = chalk.yellow('WARN:');

        this.plugin_dir = DEFAULT_PLUGIN_DIR; // directory where plugins are located
        this.is_windows = process.platform === 'win32'; // is running system windows
        this.drop_uid = 0; // drop privileges to UID, if supported and specified on command line
        this.reverse = {
            enabled: false,
            check_bundle_id: null
        };
        this.target = os.hostname(); // used by self-configure
        this.hostname = os.hostname(); // used by self-configure and reverse connection
        this.broker_id = null; // used by self-configure
        this.configfile = null; // used by self-configure
        this.api = { // used by self-configure and reverse connection
            key: null,
            app: this.app_name,
            url: DEFAULT_API_URL
        };
        this.debug_dir = null; // if set, a dir to write debug logs to
        this.wipe_debug_dir = false; // if true, wipe debug logs clean before each write
        this.ssl = {// ssl server options
            verify: false, // use ca certificate for verifications
            listen: [], // server listening address(es)/port(s)
            creds: {} // ssl credentials
        };
        this.statsd = {
            app_name: `${this.app_name}-statsd`,
            enabled: false,
            config: null
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
            option('--plugin_dir <dir>', `Plugin directory [${DEFAULT_PLUGIN_DIR}]`).
            option('-p, --listen <ip|port|ip:port>', `Listening IP address and port [${DEFAULT_IP ? `${DEFAULT_IP}:` : ''}${DEFAULT_PORT}]`).
            //
            // reverse
            option('-r, --reverse', `Use reverse connection to broker [false]`).
            option('--cid <cid>', `Check bundle id for reverse connection []`).
            // broker (reverse and statsd)
            option('--broker_ca <file>', `CA file for broker reverse connection and statsd []`).
            //
            // api - used by reverse AND self-configure (until self-config is removed)
            option('--api_key <key>', `Circonus API Token key []`).
            option('--api_app <app>', `Circonus API Token app [${this.app_name}]`).
            option('--api_url <url>', `Circonus API URL [${DEFAULT_API_URL}]`).
            option('--api_ca <file>', `CA file for API URL []`).
            //
            // self-configure
            option('--hostname <host>', `Hostname self-configure to use in check and graph names [${this.hostname}]`).
            option('--brokerid <id>', `Broker ID for self-configure to use for creating check []`).
            option('--configfile <file>', `File in plugin_dir for self-configure []`).
            //
            // self-configure AND reverse
            option('--target <target>', `Target host [${this.target}] -- see Target below`).
            //
            // SSL
            option('-s, --ssl_listen <ip|port|ip:port>', `SSL listening IP address and port []`).
            option('--ssl_cert <file>', `SSL certificate PEM file, required for SSL [${DEFAULT_SSL_CERT}]`).
            option('--ssl_key <file>', `SSL certificate key PEM file, required for SSL [${DEFAULT_SSL_KEY}]`).
            option('--ssl_ca <file>', `SSL CA certificate PEM file, required for SSL w/verify [${DEFAULT_SSL_CA}]`).
            option('-v, --ssl_verify', `Verify SSL traffic [false]`).
            //
            // statsd
            option('--no-statsd', `Disable builtin StatsD interface`).
            option('--statsd_config <file>', `Config file for builtin StatsD interface []`).
            //
            // miscellaneous
            option('-u, --uid <id>', `User id to drop privileges to on start []`).
            option('--loglevel <level>', `Log level (trace|debug|info|warn|error|fatal) [${DEFAULT_LOG_LEVEL}]`).
            option('-d, --debug', `Enable debug logging (verbose) [false]`).
            option('-t, --trace', `Enable trace logging (very verbose) [false]`).
            option('--no_watch', `Disable automatic watches of plugin directory, script files, config files. Send SIGHUP to rescan plugins. [${this.file_watch}]`).
            //
            // not entirely sure of the value these provide.
            // - returns from plugins could be put into the log at the --trace level rather than a separate directory (the log is machine parseable)
            // - no idea what -i 'inventory' actually accomplishes or its intended purpose
            option('--debugdir', `Create debug files for each plugin and write to this directory []`).
            option('--wipedebugdir', `Wipe debug directory clean before each write [false]`).
            option('-i, --inventory', `Offline inventory`).
            //
            // backwards compatibility DEPRECATED arguments
            option('-c <dir>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--plugin_dir')}`).
            option('--authtoken <token>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--api_key')}`).
            option('--apihost <host>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--api_url')}`).
            option('--apiport <port>', `${chalk.yellow('DEPRECATED')} ${chalk.bold('--api_url')}`).
            option('--apipath <path>', `${chalk.yellow('DEPRECATED')} ${chalk.bold('--api_url')}`).
            option('--apiprotocol <proto>', `${chalk.yellow('DEPRECATED')} ${chalk.bold('--api_url')}`).
            option('--apiverbose', `${chalk.yellow('DEPRECATED')} NOP, see ${chalk.bold('--debug')}`).
            option('--sslcert <file>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--ssl_cert')}`).
            option('--sslkey <file>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--ssl_key')}`).
            option('--sslca <file>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--ssl_ca')}`).
            option('--cafile <file>', `${chalk.yellow('DEPRECATED')} use ${chalk.bold('--broker_ca')}`).
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
        setStatsdOptions(options);

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

        instance.broker_ca_file = options.broker_ca || options.cafile || null;

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
        // perform any options which will result in exiting (e.g. inventory and self-configure)
        //

        if (options.inventory) {
            let inventory = null;

            try {
                inventory = require(path.join(nad.lib_dir, 'inventory'));
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
