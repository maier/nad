'use strict';

/* eslint-disable no-sync */

const fs = require('fs');
const path = require('path');

function init_debug(script_name, debug_dir) {
    const debug_file = path.resolve(path.join(debug_dir, `${script_name}.nad_debug`));

    try {
        if (fs.existsSync(debug_file)) {
            fs.unlinkSync(debug_file);
        }
    } catch (err) {
        console.log(`Error checking for debug file ${debug_file}`);
        console.log(err);
    }
}

function write_debug_output(script_name, debug_lines, debug_dir, wipe_debug_dir) {
    const debug_file = path.resolve(path.join(debug_dir, `${script_name}.nad_debug`));

    try {
        if (wipe_debug_dir) {
            init_debug(script_name, debug_dir);
        }
        fs.appendFile(debug_file, `-----START RECORD-----\n${debug_lines.join('\n')}\n-----END RECORD-----\n`);
    } catch (err) {
        console.log(`Error writing to debug file ${debug_file}`);
        console.log(err);
    }
}

exports.init_debug = init_debug;
exports.write_debug_output = write_debug_output;
