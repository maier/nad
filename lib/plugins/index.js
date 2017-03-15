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

const default_plugin = {
    name: null, // name of the plugin
    generation: -1, // current generation
    command: null, // plugin file
    is_native: false, // is plugin native (javascript)
    native_obj: null, // native plugin object
    running: false, // is plugin [currently] running
    last_start: null, // last time plugin started to run
    last_finish: null, // last time plugin finished a run
    sb: null, // fs.Stat from last scan
    config: null, // plugin config, if applicable
    config_file: null, // plugin config file, if applicable
    last_result: {} // last results
};

// cache of previous results of running scripts
// this is responded with if a script is still running when
// a request for a new value comes in (which is common with long
// running scripts that periodically output values)
// const past_results = {};

// a data structure representing all scripts (aka plugins/native
// plugins.)  Each value in the object contains an object that
// has properties relating to the script.
const plugin_list = {};

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

        this.push_receiver = options.push_receiver || null;

        this.plugin_dir = options.plugin_dir;
        this.is_windows = options.is_windows;
        this.err_prefix = options.prefixError;
        this.send_nad_stats = options.sendNADStats;
        this.file_watch = options.file_watch;

        this.debug_dir = options.debug_dir || null;
        this.wipe_debug_dir = options.wipe_debug_dir || null;

        instance = this; // eslint-disable-line consistent-this

        if (options.debug_dir !== null && dutil === null) {
            try {
                dutil = require('debug_util');
            } catch (err) {
                const msg = 'unable to load debug_util module';

                console.error(options.err_prefix, msg, err);
                this.log.fatal({ err }, msg);
                process.exit(1);
            }
        }

        return instance;
    }

    // inventory returns a list of loaded plugins (in json)
    inventory() {
        return JSON.stringify(plugin_list);
    }

    scan(cb) {
        this.log.info({ dir: this.plugin_dir }, 'scanning for plugins');
        const self = this;

        generation++;

        this._scanner(this.plugin_dir).
            then((files) => {
                self.log.debug('filtering scanned files');
                return self._scan_filter(files);
            }).
            then((files) => {
                self.log.debug('verify filtered files');
                return self._scan_verify(files);
            }).
            then((list) => {
                self.log.debug('adding valid plugins');
                return self._scan_add_plugins(list);
            }).
            then(() => {
                self.log.debug('purging expired plugins');
                return self._scan_purge();
            }).
            then(() => {
                if (typeof cb === 'function') {
                    cb();
                    return;
                }
            }).
            catch((err) => {
                console.dir(err);
                self.log.fatal({ err: err.message, dir: self.plugin_dir }, 'scanning plugin directory');
                process.exit(1);
            });
    }

    // // look on disk for updates to the config dir where
    // // we keep all our modules (aka plugins / aka scripts)
    // scan(cb) {
    //     this.log.info({ dir: this.plugin_dir }, 'scanning for plugins');
    //     const self = this;
    //
    //     // this keeps track of how many filesystem stats we have
    //     // "in progress" and are still waiting for callbacks on
    //     let progress = 0;
    //
    //     // generation is the global number of times rescan_modules has been
    //     // called.  Each time we rescan our modules we increase it
    //     // by one.
    //     generation++;
    //
    //     // this is a handy private function that goes through
    //     // all the scripts in our scripts object and removes
    //     // any that haven't had their generation number updated
    //     // to our current generation number once we've done
    //     // scanning
    //     function sweep() {
    //         self.log.debug({ progress }, 'sweep');
    //
    //         // don't do this while we're still waiting for
    //         // stat requests that are in progress
    //         if (progress !== 0) {
    //             return;
    //         }
    //
    //         // clear out any out of date scripts
    //         for (const plugin_id in plugin_list) {
    //             if ({}.hasOwnProperty.call(plugin_list, plugin_id)) {
    //                 if (plugin_list[plugin_id].generation < generation) {
    //                     self.log.debug({ id: plugin_id }, 'removing expired plugin');
    //                     if (self.file_watch) {
    //                         fs.unwatchFile(plugin_list[plugin_id].command);
    //                         if (plugin_list[plugin_id].config_file !== null) {
    //                             fs.unwatchFile(plugin_list[plugin_id].config_file);
    //                         }
    //                     }
    //                     delete plugin_list[plugin_id];
    //                 }
    //             }
    //         }
    //
    //         if (typeof cb === 'function') {
    //             cb();
    //             return;
    //         }
    //     }
    //
    //     function genStatCallback(plugin_id, file, _cb) {
    //         return (err, sb) => {
    //             if (err !== null) {
    //                 self.log.warn({ err, file }, 'unable to stat file');
    //                 _cb();
    //                 return;
    //             }
    //
    //             if (!sb) {
    //                 self.log.warn({ sb, file }, 'bad stat object for file');
    //                 _cb();
    //                 return;
    //             }
    //
    //             if (!sb.isFile()) {
    //                 self.log.debug({ dir_entry: file }, 'ignoring, not a file');
    //                 _cb();
    //                 return;
    //             }
    //
    //             const is_native = (/\.js$/).test(file);
    //             const is_executable = sb.mode & parseInt('0111', 8);
    //
    //             if (!(self.is_windows || is_native || is_executable)) {
    //                 self.log.debug({ dir_entry: file }, 'ignoring, not a valid file');
    //                 _cb();
    //                 return;
    //             }
    //
    //             // if the file is something we should deal with
    //             // (is a file, and either ends in .js or is executable, or we're running on
    //             // windows where everything is considered executable)
    //
    //             self.log.debug({ id: plugin_id }, 'found potential plugin');
    //
    //             if (self.file_watch) {
    //                 // watch the file for future updates.  i.e. if the file changes
    //                 // again later then retrigger this rescan_modules routine
    //                 fs.watchFile(file, self.onchange(() => {
    //                     self.log.debug({ file }, 'changed, triggering scan');
    //                     self.scan();
    //                 }));
    //             }
    //
    //             // setup the details in the scripts object for this file
    //             if (!(plugin_id in plugin_list)) {
    //                 plugin_list[plugin_id] = Object.assign({}, default_plugin);
    //             }
    //
    //             const def = plugin_list[plugin_id];
    //
    //             def.name = plugin_id;
    //             def.generation = generation;
    //             def.command = file;
    //             def.is_native = is_native;
    //             def.running = false;
    //             def.sb = sb;
    //             def.config = null;
    //             def.config_file = path.join(self.plugin_dir, `${plugin_id}.json`);
    //
    //             // if this is a "native plugin", i.e. a plugin written in
    //             // javascript with a ".js" extension then simply load
    //             // the code directly into node and then create
    //             // an instance 'obj' to shove in the scripts data structure
    //             if (def.is_native) {
    //                 let Plugin = null;
    //
    //                 try {
    //                     // NOTE: delete require cache entry to force reload
    //                     if (def.command in require.cache) {
    //                         delete require.cache[def.command];
    //                     }
    //                     Plugin = require(def.command);
    //                 } catch (perr) {
    //                     const msg = 'unable to load native plugin';
    //
    //                     console.error(self.err_prefix, msg, def.command, perr);
    //                     self.log.fatal({ err: perr, file: def.command }, msg);
    //                     def.generation = -1;
    //                     _cb();
    //                     return;
    //                 }
    //
    //                 def.native_obj = new Plugin();
    //             }
    //
    //             if (generation === 1 && self.debug_dir !== null) {
    //                 // initialize on first scan
    //                 dutil.init_debug(plugin_id, self.debug_dir);
    //             }
    //
    //             try {
    //                 if (def.config_file in require.cache) {
    //                     delete require.cache[def.config_file];
    //                 }
    //                 def.config = require(def.config_file);
    //             } catch (cfgErr) {
    //                 if (cfgErr.code !== 'MODULE_NOT_FOUND') {
    //                     self.log.error({ err: cfgErr, cfg_file: def.config_file }, 'error accessing config file, removing plugin');
    //                     def.generation = -1;
    //                     _cb();
    //                     return;
    //                 }
    //             }
    //             if (def.config !== null) {
    //                 if (self.file_watch) {
    //                     fs.watchFile(def.config_file, self.onchange(() => {
    //                         self.log.debug({ file: def.config_file }, 'changed, triggering scan');
    //                         self.scan();
    //                     }));
    //                 }
    //                 self.log.trace({ id: def.name, cfg_file: def.config_file, cfg: def.config }, 'loaded plugin config');
    //             }
    //
    //             _cb();
    //             return;
    //         };
    //     }
    //
    //     // look in the config directory
    //     fs.readdir(self.plugin_dir, (err, files) => {
    //
    //         // bomb out if there's any error (we don't do any fancy
    //         // error handling or attempt any form of recovery)
    //         if (err) {
    //             const msg = 'unable to read config directory';
    //
    //             console.error(self.err_prefix, msg, err);
    //             self.log.fatal({ err, dir: self.plugin_dir }, msg);
    //             process.exit(-1);
    //         }
    //
    //         function scb() {
    //             progress--;
    //             sweep();
    //         }
    //
    //         // for each file in the config directory
    //         for (const file of files) {
    //             const fileParts = path.parse(path.join(self.plugin_dir, file));
    //
    //             // if file is not in form name.extension, ignore
    //             if (fileParts.name === '' || fileParts.ext === '') {
    //                 self.log.debug({ dir_entry: file }, 'ignoring, invalid name');
    //                 continue;
    //             }
    //
    //             // if a configuration file, ignore
    //             if (fileParts.ext === '.conf' || fileParts.ext === '.json') {
    //                 self.log.debug({ dir_entry: file }, 'ignoring, config file');
    //                 continue;
    //             }
    //
    //             const filename = path.join(fileParts.dir, fileParts.base);
    //
    //             if (self.file_watch) {
    //                 // stop watching the file for updates
    //                 fs.unwatchFile(filename);
    //             }
    //
    //             // note we need to wait for stat callback to be
    //             // called before we're done
    //             progress++;
    //
    //             // stat the file
    //             fs.stat(filename, genStatCallback(fileParts.name, filename, scb));
    //         }
    //
    //         sweep();
    //     });
    // }

    // runs a single script / native plugin and then fires a callback
    //   plugin is the object for the script that's stored in 'scripts'
    //   cb is what we call back when done
    //   req is the request object (passed to native plugins)
    //   args is any arguments that came from the per script config file
    //   instance is the specific instance of plugin to run
    _exec_plugin(plugin, cb, req, args, plugin_instance) {
        this.log.info({ id: plugin_instance }, 'executing plugin');

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

        // if this is a native plugin - call plugin's run() method
        if (plugin.is_native) {
            plugin.native_obj.run(plugin,
                (_plugin, _metrics, _plugin_instance) => {
                    _plugin.last_result[_plugin_instance] = _metrics;
                    // past_results[_plugin_instance] = _metrics;
                    cb(_plugin, _metrics, _plugin_instance);
                }, req, args, plugin_instance);
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
        function handle_output(_plugin, _cb, _plugin_instance) {
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
            _plugin.last_result[_plugin_instance] = results;
            // past_results[_plugin_instance] = results;

            // execute the callback
            _cb(_plugin, results, _plugin_instance);
        }

        // hook up the process so whenever we complete reading data
        // from the process we call "handle_output" and process
        // any remaining data (i.e. any partial line still in
        // our between callback buffer)
        cmd.stdout.on('end', () => {
            handle_output(plugin, cb, plugin_instance);
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
                    handle_output(plugin, cb, plugin_instance);
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
                self.log.warn({ id: plugin_instance, cmd: plugin.command, code, signal }, 'plugin exit code non-zero');
            }
            plugin.running = false;
        });

      // if there's any error running the command, log it and remove it from the list
        cmd.on('error', (err) => {
            self.log.warn({ id: plugin_instance, err, cmd: plugin.command }, `command error, removing from plugin list`);
            proc_data.data = '';
            plugin.running = false;
            delete plugin_list[plugin.name];
        });
    }

    // run_plugin will exec a specific plugin. if the plugin is already running
    // the previous results are returned.
    _run_plugin(plugin, req, cb) {
        if (plugin.running) {
            this.log.debug({ id: plugin.name }, 'plugin already running');

            cb(plugin, plugin.last_result, plugin.name);
            return;

            // if (plugin.name in past_results) {
            //     log.debug({ name: plugin.name }, 'plugin already running, returning previous result');
            //     cb(plugin, past_results[plugin.name], plugin.name);
            //     return;
            // }
            //
            // cb(plugin, {}, plugin.name);
            // return;
        }

        // short-circuit if the plugin doesn't have a config
        if (!plugin.config) {
            this._exec_plugin(plugin, cb, req, [], plugin.name);
            return;
        }

        this.log.debug({ id: plugin.name, config: plugin.config }, 'applying plugin config');

        const instance_count = Object.keys(plugin.config).length;

        // Add the number of time we will run this script to our
        // total run_count so we don't finish early.
        if (req && instance_count > 1) {
            req.nad_run_count += instance_count - 1;
        }

        for (const plugin_instance in plugin.config) {
            if ({}.hasOwnProperty.call(plugin.config, plugin_instance)) {
                this._exec_plugin(plugin, cb, req, plugin.config[plugin_instance], `${plugin.name}\`${plugin_instance}`);
            }
        }
    }

    // run will run all plugins or a specifc plugin identified 'which'
    run(req, res, which) {
        this.log.info({ plugin: which === null ? 'all' : which }, 'running plugin(s)');

        // request for specific plugin which doesn't exist
        if (which !== null && !(which in plugin_list)) {
            this.log.warn({ plugin: which }, 'unknown/not found');
            res.writeHead(404, `Unknown plugin ${which}`);
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
            this._run_plugin(plugin_list[which], req, (def, results, plugin_instance) => {
                req.nad_run_count--;
                metrics[plugin_instance] = results;
                send_complete();
            });
            return;
        }

        //
        // run all plugins
        //

        // how many plugins to run
        req.nad_run_count = Object.keys(plugin_list).length;

        // add another if push receiver enabled - so send_complete will wait
        // for push_script data to be added
        if (this.push_receiver !== null) {
            req.nad_run_count++;
        }

        if (req.nad_run_count === 0) {
            this.log.warn('no plugins initialzed, nothing to run');
            res.writeHead(204, 'no plugins initialized'); // http 1.1 no-content
            res.end();
            return;
        }

        // add nad process metrics, if enabled
        if (this.send_nad_stats) {
            metrics.nad = {
                memory: process.memoryUsage(),
                uptime: process.uptime()
            };
            if (process.cpuUsage) {
                metrics.nad.cpu = process.cpuUsage();
            }
        }

        // run all plugins
        for (const plugin_id in plugin_list) {
            if ({}.hasOwnProperty.call(plugin_list, plugin_id)) {
                this._run_plugin(plugin_list[plugin_id], req, (_plugin, _metrics, _plugin_instance) => {
                    req.nad_run_count--;
                    metrics[_plugin_instance] = _metrics;
                    send_complete();
                });
            }
        }

        // run push receiver if enabled
        if (this.push_receiver !== null) {
            const self = this;

            this._run_plugin(this.push_receiver, req, (_plugin, _metrics, _plugin_instance) => {
                req.nad_run_count--;
                if (_metrics !== null) {
                    for (const metric_group in _metrics) {
                        if ({}.hasOwnProperty.call(_metrics, metric_group)) {
                            metrics[metric_group] = _metrics[metric_group];
                        }
                    }
                    if (self.debug_dir !== null) {
                        dutil.write_debug_output(_plugin_instance, [ 'Returning push_receiver data', JSON.stringify(_metrics) ], self.debug_dir, self.wipe_debug_dir);
                    }
                }
                send_complete();
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

    _scanner() {
        const self = this;

        return new Promise((resolve, reject) => {
            fs.readdir(self.plugin_dir, (err, files) => {
                if (err !== null) {
                    reject(err);
                    return;
                }
                resolve(files.map((file) => {
                    return path.resolve(path.join(self.plugin_dir, file));
                }));
            });
        });
    }

    _scan_verifier(plugin_id, file_name) {
        const self = this;

        return new Promise((resolve) => {
            fs.stat(file_name, (err, stat) => {
                const plugin_status = {
                    valid: false,
                    id: plugin_id,
                    file_name,
                    is_native: false,
                    is_executable: false
                };

                if (err !== null) {
                    self.log.warn({ err, file: file_name }, 'ignoring, unable to stat');
                    resolve(plugin_status);
                    return;
                }

                if (!stat) {
                    self.log.warn({ stat, file: file_name }, 'bad stat object for file');
                    resolve(plugin_status);
                    return;
                }

                if (!stat.isFile()) {
                    self.log.debug({ dir_entry: file_name }, 'ignoring, not a file');
                    resolve(plugin_status);
                    return;
                }

                plugin_status.is_native = (/\.js$/).test(file_name);
                plugin_status.is_executable = (stat.mode & parseInt('0111', 8)) > 0;

                if (!(self.is_windows || plugin_status.is_native || plugin_status.is_executable)) {
                    self.log.debug({ file: file_name }, 'ignoring, not a valid file');
                    resolve(plugin_status);
                    return;
                }

                self.log.debug({ id: plugin_id }, 'found potential plugin');
                plugin_status.valid = true;
                resolve(plugin_status);
            });
        });
    }

    _scan_filter(files) {
        const self = this;

        function reducer(new_list, file_name) {
            const file_parts = path.parse(file_name);

            if (file_parts.name === '' || file_parts.ext === '') {
                self.log.warn({ file: file_parts.name }, 'ignoring, invalid name');
                return new_list;
            }

            if (file_parts.ext === '.conf' || file_parts.ext === '.json') {
                self.log.warn({ file: file_parts.name }, 'ignoring, config file');
                return new_list;
            }

            return new_list.concat([ self._scan_verifier(file_parts.name, file_name) ]);
        }

        return new Promise((resolve) => {
            resolve(files.reduce(reducer, []));
        });
    }

    _scan_verify(list) {
        return Promise.all(list);
    }

    _scan_purge() {
        const self = this;

        return new Promise((resolve) => {
            for (const plugin_id in plugin_list) {
                if ({}.hasOwnProperty.call(plugin_list, plugin_id)) {
                    if (plugin_list[plugin_id].generation < generation) {
                        self.log.debug({ id: plugin_id }, 'removing expired plugin');
                        if (this.file_watch) {
                            fs.unwatchFile(plugin_list[plugin_id].command);
                            if (plugin_list[plugin_id].config_file !== null) {
                                fs.unwatchFile(plugin_list[plugin_id].config_file);
                            }
                        }
                        delete plugin_list[plugin_id];
                    }
                }
            }
            resolve();
        });
    }

    _scan_add_plugins(list) {
        const self = this;

        return new Promise((resolve) => {
            for (const plugin_status of list) {
                if (!plugin_status.valid) {
                    continue;
                }

                if (self.file_watch) {
                    fs.watchFile(plugin_status.file_name, self.onchange(() => { // eslint-disable-line no-loop-func
                        self.log.debug({ file: plugin_status.file_name }, 'changed, triggering scan');
                        self.scan();
                    }));
                }

                if (plugin_status.id in plugin_list) {
                    self.log.debug({ id: plugin_status.id }, 'updating plugin');
                } else {
                    self.log.debug({ id: plugin_status.id }, 'adding new plugin');
                    plugin_list[plugin_status.id] = Object.assign({}, default_plugin);
                }


                const def = plugin_list[plugin_status.id];

                def.name = plugin_status.id;
                def.generation = generation;
                def.command = plugin_status.file_name;
                def.is_native = plugin_status.is_native;
                def.running = false;
                def.sb = plugin_status.stat;
                def.config = null;
                def.config_file = path.resolve(path.join(self.plugin_dir, `${def.name}.json`));

                // if this is a "native plugin", i.e. a plugin written in
                // javascript with a ".js" extension then simply load
                // the code directly into node and then create
                // an instance 'obj' to shove in the scripts data structure
                if (def.is_native) {
                    let Plugin = null;

                    try {
                        // NOTE: delete require cache entry to force reload
                        if (def.command in require.cache) {
                            delete require.cache[def.command];
                        }
                        Plugin = require(def.command);
                    } catch (perr) {
                        const msg = 'unable to load native plugin code, removing plugin';

                        console.error(self.err_prefix, msg, def.command, perr);
                        self.log.fatal({ err: perr, file: def.command }, msg);
                        def.generation = -1;
                        resolve();
                        return;
                    }

                    def.native_obj = new Plugin();
                }

                if (generation === 1 && self.debug_dir !== null) {
                    // initialize on first scan only
                    dutil.init_debug(def.name, self.debug_dir);
                }

                // try to load the config file
                try {
                    if (def.config_file in require.cache) {
                        delete require.cache[def.config_file];
                    }
                    def.config = require(def.config_file);
                } catch (cfgErr) {
                    if (cfgErr.code !== 'MODULE_NOT_FOUND') {
                        self.log.error({ err: cfgErr, cfg_file: def.config_file }, 'error accessing config file, removing plugin');
                        def.generation = -1;
                        resolve();
                        return;
                    }
                }
                if (def.config !== null) {
                    if (self.file_watch) {
                        fs.watchFile(def.config_file, self.onchange(() => { // eslint-disable-line no-loop-func
                            self.log.debug({ file: def.config_file }, 'changed, triggering scan');
                            self.scan();
                        }));
                    }
                    self.log.trace({ id: def.name, cfg_file: def.config_file, cfg: def.config }, 'loaded plugin config');
                }
            }

            resolve();
        });
    }
}

module.exports = Plugins;
