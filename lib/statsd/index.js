/* eslint-env node, es6 */

'use strict';

const path = require('path');

// simply a wrapper which instantiates the statsd server
// only if the configuration file is found. (which is
// created by cosi)

let statsd = null;

module.exports.start = () => {
    if (statsd !== null) {
        return statsd;
    }

    statsd = require(path.join(__dirname, 'statsd')); // eslint-disable-line global-require

    return statsd;
};

// END
