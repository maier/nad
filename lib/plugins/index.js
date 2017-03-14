'use strict';

/* eslint-disable global-require */
/* eslint-disable no-process-exit */
/* eslint-disable max-params */
/* eslint-disable no-param-reassign */
/* eslint-disable no-plusplus */
/* eslint-disable no-bitwise */
/* eslint-disable no-sync */

const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;

// only load if it's going to be used. (if metric debugging is activated)
let dutil = null;

// private module variables

// cache of previous results of running scripts
// this is responded with if a script is still running when
// a request for a new value comes in (which is common with long
// running scripts that periodically output values)
const past_results = {};

// a data structure representing all scripts (aka plugins/native
// plugins.)  Each value in the object contains an object that
// has properties relating to the script.
const scripts = {};

let generation = 0;

let instance = null;

// private module methods

// merge_types takes two char type descriptors and returns the
// smallest type that could non-erroneously represent them
function merge_types(typeA, typeB) {
    if (typeA === typeB) {
        return typeA;
    }
    // There are four source cases where we can upgrade to int64_t
    if (typeA === 'i' && (typeB === 'I' || typeB === 'l')) {
        return 'l';
    }
    if (typeA === 'I' && (typeB === 'i' || typeB === 'l')) {
        return 'l';
    }
    if (typeA === 'l' && (typeB === 'i' || typeB === 'I')) {
        return 'l';
    }
    if (typeA === 'L' && typeB === 'I') {
        return 'l';
    }
    // otherwise we have to just jump to a double
    return 'n';
}

class Plugins {
    constructor(options) {
        if (!options) {
            console.error('invalid options passed to constructor');
            process.exit(1);
        }

        if (instance !== null) {
            return instance;
        }

        this.log = options.log.child({ module: 'plugins' });
        this.log.level = 'debug';

        this.pushReceiver = options.push_receiver || null;

        this.plugin_dir = options.plugin_dir;
        this.is_windows = options.is_windows;
        this.prefixError = options.prefixError;
        this.sendNADStats = options.sendNADStats;
        this.file_watch = options.file_watch;

        this.debug_dir = options.debug_dir || null;
        this.wipe_debug_dir = options.wipe_debug_dir || null;

        instance = this; // eslint-disable-line consistent-this

        if (options.debug_dir !== null && dutil === null) {
            try {
                dutil = require('debug_util');
            } catch (err) {
                const msg = 'unable to load debug_util module';

                console.error(options.prefixError, msg, err);
                this.log.fatal({ err }, msg);
                process.exit(1);
            }
        }

        return instance;
    }

    inventory() {
        return JSON.stringify(scripts);
    }

    // runs a single script / native plugin and then fires a callback
    //   plugin is the object for the script that's stored in 'scripts'
    //   cb is what we call back when done
    //   req is the request object (passed to native plugins)
    //   args is any arguments that came from the per script config file
    //   instance is the specific instance of plugin to run
    run_script(plugin, cb, req, args, pluginInstance) {
        this.log.info({ name: pluginInstance }, 'running plugin');

        const self = this;

        // (we don't re-run scripts that are already running)
        plugin.running = true;
        plugin.last_start = Date.now();

        // per process data
        const proc_data = {
            // incomplete line of data buffered between callbacks.
            data: '',

            // complete lines of data that have yet to
            // be handled (parsed for JSON and/or tab
            // file format.)  We only parse the output
            // when we reach the end of the output or a
            // blank line
            lines: [],

            options: {}
        };

        // if this is a native plugin then all we need to do
        // is call the run method on the instance stored within d.obj
        // and we're done, so return
        if (plugin.native_plugin) {
            plugin.obj.run(plugin,
                (_plugin, _metrics, _instance) => {
                    past_results[_instance] = _metrics;
                    cb(_plugin, _metrics, _instance);
                }, req, args, instance);
            return;
        }

        // execute the command
        const cmd = spawn(plugin.command, args);

        function kill_func() {
            cmd.stdin.destroy();
            cmd.stdout.destroy();
            cmd.stderr.destroy();
            cmd.kill();
        }

        // create a function that can handle output from the process we
        // just created.  This will be called from the code below whenever
        // we reach the end of the process output, or a blank line is found in
        // the output
        function handle_output(_plugin, _cb, _instance) {
            if (proc_data.timeout) {
                clearTimeout(proc_data.timeout);
            }
            _plugin.last_finish = Date.now();
            let results = {};

            // if someone has specified a debug dir, then log out
            // the record we collected to that
            if (self.debug_dir !== null) {
                dutil.write_debug_output(_plugin.name, proc_data.lines, self.debug_dir, self.wipe_debug_dir);
            }

            // attempt to process the lines as json...
            try {
                results = JSON.parse(proc_data.lines.join(' '));
            } catch (err) {
                // ... but if that doesn't work, try the tab delim format
                for (const line of proc_data.lines) {
                    const parts = (/^\s*(metric\s+)?(\S+)\s+(string|int|float|[iIlLns])(\s*)(.*)$/).exec(line);

                    if (parts) {
                        const name = parts[2];
                        let type = parts[3];
                        const space = parts[4];
                        const val = parts[5];
                        const isnull = space.length === 0 || val === '[[null]]';

                        type = type.length > 1 ? type === 'float' ? 'n' : type.substr(0, 1) : type; // eslint-disable-line no-nested-ternary

                        if (type !== 's' &&  // this is numeric
                            {}.hasOwnProperty.call(results, name) && results[name]._type !== 's' && // preexists as numeric
                            {}.hasOwnProperty.call(results[name], '_value')) {
                            if (!Array.isArray(results[name]._value)) { // upgrade to array
                                results[name]._value = [ results[name]._value ];
                            }
                            // we're in a position to append the result instead of set it.
                            results[name]._value.push(isnull ? null : val);
                            // we also might need to "upgrade the type"
                            results[name]._type = merge_types(type, results[name]._type);
                        } else {
                            results[name] = {
                                _type: type,
                                _value: isnull ? null : val
                            };
                        }
                    }
                }
            }

            // remember the past results
            past_results[_instance] = results;

            // execute the callback
            _cb(_plugin, results, _instance);
        }

        // hook up the process so whenever we complete reading data
        // from the process we call "handle_output" and process
        // any remaining data (i.e. any partial line still in
        // our between callback buffer)
        cmd.stdout.on('end', () => {
            handle_output(plugin, cb, pluginInstance);
        });

        // hook up an anonymous function to the process to be called
        // whenever we get output.  The way this works is basically
        // there's two buffers used between calls: proc_data.lines
        // representing all lines of data we haven't processed yet
        // and proc_data.data representing an incomplete line
        cmd.stdout.on('data', (buff) => {
            let offset = null;

            // append output we collected to the incomplete line buffer
            // we're using to cache data between "data" callbacks
            proc_data.data += buff;

            // extract each complete line of data that's in the
            // between callback buffer and leave only the remaining
            // incomplete line in that buffer
            while ((offset = proc_data.data.indexOf('\n')) >= 0) {
                // extract a single line of data from the start of the string
                // pay attention to windows line endings if there are any!
                const line = proc_data.data.substring(0,
                         offset > 0 &&
                          proc_data.data.charAt(offset - 1) === '\r' ?
                             offset - 1 : offset);

                // is this a "comment" that contains meta information in a JSON blob?
                if (line.charAt(0) === '#') {
                    try {
                        proc_data.options = JSON.parse(line.substring(1));
                    } catch (err) {
                        self.log.error({ err }, 'processing proc options');
                    }

                    // set a timeout to stop this run if requested in meta block
                    if (proc_data.options.timeout) {
                        proc_data.timeout = setTimeout(kill_func,
                                             proc_data.options.timeout * 1000);
                    }
                } else if (line.length > 0) {
                    // if line has data, addd to collected lines
                    proc_data.lines.push(line);
                } else {
                    // if a blank line, process collected lines
                    handle_output(plugin, cb, pluginInstance);
                }

                // discard this line from the buffer we're using between
                // "data" callbacks and move onto processing the next one
                // if there is (or keep it for next callback if there isn't)
                proc_data.data = proc_data.data.substring(offset + 1);
            }
        });

        // when the command is done, mark it as no longer running.
        cmd.on('exit', (code, signal) => {
            if (code !== 0) {
                self.log.warn({ name: pluginInstance, cmd: plugin.command, code, signal }, 'plugin exit code non-zero');
            }
            plugin.running = false;
        });

      // if there's any error running the command, log it and remove it from the list
        cmd.on('error', (err) => {
            self.log.error({ name: pluginInstance, err, cmd: plugin.command }, `command error, removing from plugin list`);
            proc_data.data = '';
            plugin.running = false;
            delete scripts[plugin.name];
        });
    }


    // per script config
    get_config(req, plugin, cb) {
        // short-circuit if the plugin doesn't have a config
        if (!plugin.config) {
            this.run_script(plugin, cb, req, [], plugin.name);
            return;
        }

        this.log.debug({ name: plugin.name, config: plugin.config }, 'applying plugin config');

        const instance_count = Object.keys(plugin.config).length;

        // Add the number of time we will run this script to our
        // total run_count so we don't finish early.
        if (req && instance_count > 1) {
            req.nad_run_count += instance_count - 1;
        }

        for (const pluginInstance in plugin.config) {
            if ({}.hasOwnProperty.call(plugin.config, pluginInstance)) {
                this.run_script(plugin, cb, req, plugin.config[pluginInstance], `${plugin.name}\`${pluginInstance}`);
            }
        }
    }

    init_script(plugin, req, cb) {
        this.log.debug({ name: plugin.name }, 'initializing plugin');
        if (plugin.running) {
            this.log.debug({ name: plugin.name }, 'plugin already running, returning previous result');
            cb(plugin, past_results[plugin.name], plugin.name);
            return;
        }
        this.get_config(req, plugin, cb);
    }

    // look on disk for updates to the config dir where
    // we keep all our modules (aka plugins / aka scripts)
    scan(cb) {
        this.log.debug({ dir: this.plugin_dir }, 'scanning for plugins');
        const self = this;

        // this keeps track of how many filesystem stats we have
        // "in progress" and are still waiting for callbacks on
        let progress = 0;

        // generation is the global number of times rescan_modules has been
        // called.  Each time we rescan our modules we increase it
        // by one.
        generation++;

        // this is a handy private function that goes through
        // all the scripts in our scripts object and removes
        // any that haven't had their generation number updated
        // to our current generation number once we've done
        // scanning
        function sweep() {
            // don't do this while we're still waiting for
            // stat requests that are in progress
            if (progress !== 0) {
                return;
            }

            self.log.debug('sweep');

            // clear out any out of date scripts
            for (const plugin in scripts) {
                if ({}.hasOwnProperty.call(scripts, plugin)) {
                    if (scripts[plugin].generation < generation) {
                        self.log.debug({ name: plugin }, 'removing expired plugin');
                        if (self.file_watch) {
                            fs.unwatchFile(scripts[plugin].command);
                            if (scripts[plugin].config_file !== null) {
                                fs.unwatchFile(scripts[plugin].config_file);
                            }
                        }
                        delete scripts[plugin];
                    }
                }
            }

            self.scanning = false;

            if (typeof cb === 'function') {
                cb();
                return;
            }
        }

        function genStatCallback(name, file) {
            return (err, sb) => {
                if (err !== null) {
                    self.log.warn({ err, file }, 'unable to stat file');
                    return;
                }

                if (!sb) {
                    self.log.warn({ sb, file }, 'bad stat object for file');
                    return;
                }

                if (!sb.isFile()) {
                    self.log.debug({ dir_entry: name }, 'ignoring, not a file');
                    return;
                }

                const is_native = (/\.js$/).test(file);
                const is_executable = sb.mode & parseInt('0111', 8);

                if (!(self.is_windows || is_native || is_executable)) {
                    self.log.debug({ dir_entry: name }, 'ignoring, not a valid file');
                    return;
                }

                // if the file is something we should deal with
                // (is a file, and either ends in .js or is executable, or we're running on
                // windows where everything is considered executable)

                self.log.debug({ name }, 'found plugin');

                if (self.file_watch) {
                    // watch the file for future updates.  i.e. if the file changes
                    // again later then retrigger this rescan_modules routine
                    fs.watchFile(file, self.onchange(() => {
                        self.log.debug({ file }, 'changed, triggering scan');
                        self.scan();
                    }));
                }

                // setup the details in the scripts object for this file
                if (!(name in scripts)) {
                    scripts[name] = {};
                }

                const def = scripts[name];

                def.name = name;
                def.generation = generation;
                def.command = file;
                def.native_plugin = is_native;
                def.running = false;
                def.sb = sb;
                def.config = null;
                def.config_file = null;

                // if this is a "native plugin", i.e. a plugin written in
                // javascript with a ".js" extension then simply load
                // the code directly into node and then create
                // an instance 'obj' to shove in the scripts data structure
                if (def.native_plugin) {
                    let Plugin = null;

                    try {
                        Plugin = require(def.command);
                    } catch (perr) {
                        const msg = 'unable to load native plugin';

                        console.error(self.prefixError, msg, def.command, perr);
                        self.log.fatal({ err: perr, file: def.command }, msg);
                    }

                    def.obj = new Plugin();
                }

                if (generation === 1 && self.debug_dir !== null) {
                    // initialize on first scan
                    dutil.init_debug(name, self.debug_dir);
                }

                const cfgFile = path.join(self.plugin_dir, `${name}.json`);

                fs.access(cfgFile, fs.R_OK, (accessErr) => {
                    if (accessErr) {
                        // there isn't a config file to load
                        if (accessErr.code === 'ENOENT') {
                            progress--;
                            sweep();

                            return;
                        }
                        const msg = 'error accessing config file';

                        console.error(self.prefixError, msg, accessErr);
                        self.log.fatal({ err: accessErr, file: cfgFile }, msg);
                        process.exit(1);
                    }
                    self.log.debug({ name, cfg_file: cfgFile }, 'found plugin config');
                    fs.readFile(cfgFile, (readErr, data) => {
                        if (readErr === null) {
                            try {
                                def.config = JSON.parse(data);
                                def.config_file = cfgFile;
                                if (self.file_watch) {
                                    fs.watchFile(def.config_file, self.onchange(() => {
                                        self.log.debug({ file: def.config_file }, 'changed, triggering scan');
                                        self.scan();
                                    }));
                                }
                                self.log.trace({ name, cfg_file: cfgFile, cfg: def.config }, 'loaded plugin config');
                            } catch (parseErr) {
                                self.log.error({ err: parseErr.message, file: cfgFile, data: data.toString() }, 'error parsing config file, removing plugin');
                                def.generation = -1;
                            }
                        } else {
                            self.log.error({ err: readErr, file: cfgFile }, 'error reading config file, removing plugin');
                            def.generation = -1;
                        }
                        progress--;
                        sweep();
                    });
                });
            };
        }

        // look in the config directory
        fs.readdir(self.plugin_dir, (err, files) => {

            // bomb out if there's any error (we don't do any fancy
            // error handling or attempt any form of recovery)
            if (err) {
                const msg = 'unable to read config directory';

                console.error(self.prefixError, msg, err);
                self.log.fatal({ err, dir: self.plugin_dir }, msg);
                process.exit(-1);
            }

            // inc our reference count
            progress++;

            // for each file in the config directory
            for (const file of files) {
                const fileParts = path.parse(path.join(self.plugin_dir, file));

                // if file is not in form name.extension, ignore
                if (fileParts.name === '' || fileParts.ext === '') {
                    self.log.debug({ dir_entry: file }, 'ignoring, invalid name');
                    continue;
                }

                // if a configuration file, ignore
                if (fileParts.ext === '.conf' || fileParts.ext === '.json') {
                    self.log.debug({ dir_entry: file }, 'ignoring, config file');
                    continue;
                }

                const filename = path.join(fileParts.dir, fileParts.base);

                if (self.file_watch) {
                    // stop watching the file for updates
                    fs.unwatchFile(filename);
                }

                // note we need to wait for stat callback to be
                // called before we're done
                progress++;

                // stat the file
                fs.stat(filename, genStatCallback(fileParts.name, filename));
            }
            progress--;
            sweep();
        });
    }

    // this is called from the "webserver" part, it's job is:
    //   1. Run all scripts
    //   2. Put the output as JSON into the passed result
    run_scripts(req, res, which) {
        this.log.info({ plugin: which === null ? 'all' : which }, 'running plugin(s)');

        // request for specific plugin which doesn't exist
        if (which !== null && !(which in scripts)) {
            this.log.warn({ plugin: which }, 'unknown/not found');
            res.writeHead(404);
            res.end();
            return;
        }

        // this is a per-request counter of plugins to run
        // when it gets to 0, metrics are returned
        req.nad_run_count = 0;

        // metrics to be returned, each plugin will add
        // an attribute with its data
        const metrics = {};

        // called when each plugin completes.
        // send all metrics when all plugins have completed.
        function send_complete() {
            if (req.nad_run_count !== 0) {
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.write(JSON.stringify(metrics));
            res.end();
        }

        // run specific plugin and return
        if (which !== null) {
            req.nad_run_count = 1;
            this.init_script(scripts[which], req, (def, results, name) => {
                req.nad_run_count--;
                metrics[name] = results;
                send_complete();
            });
            return;
        }

        //
        // run all plugins
        //

        // how many scripts to run
        req.nad_run_count = Object.keys(scripts).length;

        // add another if push receiver enabled - so send_complete will wait
        // for push_script data to be added
        if (this.pushReceiver !== null) {
            req.nad_run_count++;
        }

        if (req.nad_run_count === 0) {
            this.log.warn('no plugins initialzed, nothing to run');
            res.writeHead(204); // http 1.1 no-content
            res.end();
            return;
        }

        // add nad process metrics, if enabled
        if (this.sendNADStats) {
            metrics.nad = {
                memory: process.memoryUsage(),
                uptime: process.uptime()
            };
            if (process.cpuUsage) {
                metrics.nad.cpu = process.cpuUsage();
            }
        }

        // run all plugins
        for (const plugin in scripts) {
            if ({}.hasOwnProperty.call(scripts, plugin)) {
                this.init_script(scripts[plugin], req, (def, results, name) => {
                    req.nad_run_count--;
                    metrics[name] = results;
                    send_complete();
                });
            }
        }

        // run push receiver if enabled
        if (this.pushReceiver !== null) {
            const self = this;

            this.init_script(this.pushReceiver, req, (def, results, name) => {
                req.nad_run_count--;
                if (results !== null) {
                    for (const group in results) {
                        if ({}.hasOwnProperty.call(results, group)) {
                            metrics[group] = results[group];
                        }
                    }
                    if (self.debug_dir !== null) {
                        dutil.write_debug_output(name, [ 'Returning push_receiver data', JSON.stringify(results) ], self.debug_dir, self.wipe_debug_dir);
                    }
                }
                send_complete();  // only sends if all scripts are done
            });
        }
    }

    // used by fs watchers
    onchange(cb) {
        return (curr, prev) => {
            if (curr.ino !== prev.ino ||
                curr.size !== prev.size ||
                curr.mtime.valueOf() !== prev.mtime.valueOf() ||
                curr.mode !== prev.mode) {
                cb();
                return;
            }
        };
    }

}

module.exports = Plugins;
