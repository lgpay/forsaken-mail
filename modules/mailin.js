/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

let mailin = require('mailin');

mailin.on('error', function(err) {
  console.error(err && err.stack ? err.stack : err);
});

module.exports = mailin;
