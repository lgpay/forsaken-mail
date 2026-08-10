/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const defaultConfigJsonPath = path.join(__dirname, '..', 'config-default.json')
const defaultConfigPath = path.join(__dirname, '..', 'config-default.js')

let config = {};

if (fs.existsSync(defaultConfigJsonPath)) {
    config = JSON.parse(JSON.stringify(require(defaultConfigJsonPath)));
} else {
    config = JSON.parse(JSON.stringify(require(defaultConfigPath)));
}

const auth = config.auth || {};
if (process.env.OWNER_PASSWORD_FILE !== undefined) {
    const passwordFile = String(process.env.OWNER_PASSWORD_FILE).trim();
    if (!passwordFile) {
        throw new Error('OWNER_PASSWORD_FILE must not be empty.');
    }
    auth.ownerPassword = fs.readFileSync(passwordFile, 'utf8').trim();
} else if (process.env.OWNER_PASSWORD !== undefined) {
    auth.ownerPassword = String(process.env.OWNER_PASSWORD).trim();
}
config.auth = auth;

module.exports = config;