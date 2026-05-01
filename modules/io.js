/**
 * Created by Hongcai Deng on 2015/12/28.
 */

'use strict';

const shortid = require('shortid');
const mailin = require('./mailin');
const config = require('./config');
const storage = require('./storage');
const auth = require('./auth');
const inboxes = require('./inboxes');
const { isValidInboxName, createAnonymousInboxId, toMailSummary } = require('./utils');

let onlines = new Map();

function getSocketOwner(socket) {
  const cookies = String((socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) || '');
  const match = cookies.match(/(?:^|;\s*)fm_session=([^;]+)/);
  if (!match) return false;
  const token = decodeURIComponent(match[1]);
  return !!auth.getSession(token);
}

function bindSocketInbox(socket, inbox, mode) {
  if (socket.shortid) {
    onlines.delete(socket.shortid);
  }
  socket.shortid = inbox;
  socket.inboxMode = mode;
  inboxes.bindSession(socket.id, inbox, mode);
  onlines.set(inbox, socket);
  socket.emit('shortid', {
    inbox,
    mode,
    address: inboxes.getAddress(inbox),
    isOwner: !!socket.isOwner
  });
}

module.exports = function(io) {
  mailin.on('message', function(connection, data) {
    let to = String(data.headers.to || '').toLowerCase();
    let exp = /[\w\._\-\+]+@[\w\._\-\+]+/i;
    if (exp.test(to)) {
      let matches = to.match(exp);
      let inbox = matches[0].substring(0, matches[0].indexOf('@')).toLowerCase();
      let mode = inboxes.getInboxMode(inbox);
      let savedMail = mode === 'anonymous'
        ? storage.createTransientMail(inbox, data)
        : storage.saveMail(inbox, data);

      if (mode === 'anonymous') {
        inboxes.saveAnonymousMail(inbox, savedMail);
      }

      if (onlines.has(inbox)) {
        onlines.get(inbox).emit('mail', toMailSummary(savedMail));
      }
    }
  });

  io.on('connection', socket => {
    socket.isOwner = getSocketOwner(socket);

    socket.on('request shortid', function() {
      let inbox = createAnonymousInboxId();
      bindSocketInbox(socket, inbox, 'anonymous');
    });

    socket.on('set shortid', function(id) {
      let normalized = String(id || '').trim().toLowerCase();
      if (!socket.isOwner) {
        socket.emit('shortid error', '只有登录后才能设置自定义前缀');
        return;
      }
      if (!isValidInboxName(normalized, config.keywordBlackList)) {
        socket.emit('shortid error', '邮箱前缀不合法或命中保留词');
        return;
      }
      bindSocketInbox(socket, normalized, 'persistent');
    });

    socket.on('owner status', function() {
      socket.emit('owner status', { isOwner: !!socket.isOwner });
    });

    socket.on('disconnect', function() {
      if (socket.shortid) {
        onlines.delete(socket.shortid);
      }
      inboxes.unbindSession(socket.id);
    });
  });
};
