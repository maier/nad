'use strict';

/* eslint-disable no-sync */

const fs = require('fs');
// const path = require('path');

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
