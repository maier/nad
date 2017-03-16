/* eslint-env node, es6 */
/* eslint-disable no-magic-numbers */
/* eslint max-statements: ["error", 15, { "ignoreTopLevelFunctions": true }]*/


'use strict';

/**
 * Public: test function to filter out malformed packets
 *
 * Parameters:
 *
 *   fields - Array of packet data (e.g. [ '100', 'ms', '@0.1' ])
 *
 * Returns true for a valid packet and false otherwise
 */

function isNumber(str) {
    return Boolean(str && !isNaN(str));
}

function isValidSampleRate(str) {
    let validSampleRate = false;

    if (str.length > 1 && str[0] === '@') {
        const numberStr = str.substring(1);

        validSampleRate = isNumber(numberStr) && numberStr[0] !== '-';
    }

    return validSampleRate;
}

function is_valid_packet(fields) {

    // test for existing metrics type
    if (typeof fields[1] === 'undefined') {
        return false;
    }

    // filter out malformed sample rates
    if (typeof fields[2] !== 'undefined') {
        if (!isValidSampleRate(fields[2])) {
            return false;
        }
    }

    // filter out invalid metrics values
    switch (fields[1]) {
        case 't':
            return true;
        case 's':
            return true;
        case 'g':
            return isNumber(fields[0]);
        case 'ms':
            return isNumber(fields[0]) && Number(fields[0]) >= 0;
        default:
            if (!isNumber(fields[0])) {
                return false;
            }

            return true;
    }

}

module.exports.is_valid_packet = is_valid_packet;

module.exports.writeConfig = (config, stream) => {
    stream.write('\n');
    for (const prop in config) {
        if (!{}.hasOwnProperty.call(config, prop)) {
            continue;
        }
        if (typeof config[prop] !== 'object') {
            stream.write(`${prop}: ${config[prop]}\n`);
            continue;
        }
        const subconfig = config[prop];

        for (const subprop in subconfig) {
            if (!{}.hasOwnProperty.call(subconfig, subprop)) {
                continue;
            }
            stream.write(`${prop} > ${subprop}: ${subconfig[subprop]}\n`);
        }
    }
};

// END
