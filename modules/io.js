/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

const shortid = require('shortid');
const mailin = require('./mailin');
const config = require('./config');
const storage = require('./storage');
const { isValidInboxName, toMailSummary } = require('./utils');

let onlines = new Map();

module.exports = function(io) {
  mailin.on('message', function(connection, data) {
    let to = String(data.headers.to || '').toLowerCase();
    let exp = /[\w\._\-\+]+@[\w\._\-\+]+/i;
    if(exp.test(to)) {
      let matches = to.match(exp);
      let inbox = matches[0].substring(0, matches[0].indexOf('@')).toLowerCase();
      let savedMail = storage.saveMail(inbox, data);
      if(onlines.has(inbox)) {
        onlines.get(inbox).emit('mail', toMailSummary(savedMail));
      }
    }
  });

  io.on('connection', socket => {
    socket.on('request shortid', function() {
      onlines.delete(socket.shortid);
      socket.shortid = shortid.generate().toLowerCase();
      onlines.set(socket.shortid, socket);
      socket.emit('shortid', socket.shortid);
    });

    socket.on('set shortid', function(id) {
      let normalized = String(id || '').trim().toLowerCase();
      if (!isValidInboxName(normalized, config.keywordBlackList)) {
        socket.emit('shortid error', '邮箱前缀不合法或命中保留词');
        return;
      }
      onlines.delete(socket.shortid);
      socket.shortid = normalized;
      onlines.set(socket.shortid, socket);
      socket.emit('shortid', socket.shortid);
    });
    
    socket.on('disconnect', function() {
      onlines.delete(socket.shortid);
    });
  });
};

