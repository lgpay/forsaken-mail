/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

let express = require('express');
let path = require('path');
let debug = require('debug')('app');
let bodyParser = require('body-parser');

let api = require(path.join(__dirname, 'routes/api'));
let app = express();

app.set('x-powered-by', false);
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 3600000}));

app.use('/api', api);

app.use(function(req, res, next) {
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  if (req && req.path && req.path.indexOf('/api/') === 0) {
    return res.status(err.status || 500).json({ error: err.message || 'internal error' });
  }
  debug(err);
  res.status(err.status || 500).send(err.message || 'Error');
});

module.exports = app;
