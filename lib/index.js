'use strict';

const fs = require('fs');

let instance = null;

class NAD {
    constructor() {
        if (instance !== null) {
            return instance;
        }

        this.lib_dir = fs.realpathSync(__dirname);

        instance = this; // eslint-disable-line consistent-this

        return instance;
    }
}

module.exports = new NAD();
