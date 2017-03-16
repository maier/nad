/* eslint-env node, es6 */

'use strict';

// load core modules
const path = require('path');

// load local modules
const bunyan = require('bunyan');

// load app modules
const settings = require(path.normalize(path.join('..', 'settings')));

let instance = null;

function init_logger() {

    if (instance !== null) {
        return instance;
    }

    if (settings.log.console) {
        instance = bunyan.createLogger({
            name: settings.app_name,
            level: settings.log.level
        });

        return instance;
    }

    // note, two streams because file streams do NOT get
    // sync'd on process.exit(). result, messages since
    // last sync are lost...
    instance = bunyan.createLogger({
        name: settings.app_name,
        streams: [
            {
                level: 'fatal',
                stream: process.stderr
            },
            {
                level: settings.log.level,
                type: 'rotating-file',
                path: path.join(settings.log.dir, `${settings.app_name}.log`),
                period: settings.log.rotation,
                count: settings.log.keep_max
            }
        ]
    });
    process.on('SIGHUP', () => {
        instance.reopenFileStreams();
    });

    return instance;
}

module.exports = init_logger();

// END
