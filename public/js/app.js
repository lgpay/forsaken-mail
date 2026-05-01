$(function() {
  $('.ui.modal').modal();

  var clipboard = new Clipboard('.copyable');
  var currentInbox = null;
  var currentMailId = null;
  var currentSelectedRow = null;
  var currentMode = 'anonymous';
  var isOwner = false;
  var authInfo = null;
  var inboxSessionId = ensureInboxSessionId();

  var $customShortId = $('#customShortid');
  var $shortId = $('#shortid');
  var $maillist = $('#maillist');
  var $emptyState = $('#emptyState');
  var $mailSubject = $('#mailSubject');
  var $mailBody = $('#mailBody');
  var $mailFrom = $('#mailFrom');
  var $mailTo = $('#mailTo');
  var $mailTime = $('#mailTime');
  var $mailCount = $('#mailCount');
  var $mailTip = $('#mailTip');
  var $connectionStatus = $('#connectionStatus');
  var $viewRawBtn = $('#viewRawBtn');
  var $inboxMode = $('#inboxMode');
  var $ownerStatusText = $('#ownerStatusText');
  var $ownerGeneratedBox = $('#ownerGeneratedBox');
  var $ownerLoginForm = $('#ownerLoginForm');
  var $ownerLogoutBox = $('#ownerLogoutBox');
  var $ownerPassword = $('#ownerPassword');
  var $ownerLoginBtn = $('#ownerLoginBtn');
  var $ownerCurrentPassword = $('#ownerCurrentPassword');
  var $ownerNewPassword = $('#ownerNewPassword');
  var $ownerChangePasswordBtn = $('#ownerChangePasswordBtn');
  var $ownerLogoutBtn = $('#ownerLogoutBtn');
  var $placeholderOld = '请等待分配临时邮箱';
  var $placeholderNew = '请输入不带后缀邮箱账号';

  function ensureInboxSessionId() {
    var key = 'fm_inbox_session';
    var current = localStorage.getItem(key);
    if (!current) {
      current = 'sess-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
      localStorage.setItem(key, current);
    }
    return current;
  }

  function apiGet(url) {
    return $.ajax({
      url: url,
      method: 'GET',
      headers: {
        'X-Inbox-Session': inboxSessionId
      }
    });
  }

  function apiPost(url, data) {
    return $.ajax({
      url: url,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(data || {}),
      headers: {
        'X-Inbox-Session': inboxSessionId
      }
    });
  }

  function escapeHtml(value) {
    return $('<div>').text(value || '').html();
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function setConnectionStatus(text) {
    $connectionStatus.text(text || '未知');
  }

  function setMailCount(count) {
    $mailCount.text(Number(count || 0));
  }

  function setMode(mode) {
    currentMode = mode || 'anonymous';
    $inboxMode.text(currentMode === 'persistent' ? '持久保存' : '匿名临时');
  }

  function refreshOwnerUi() {
    $customShortId.prop('disabled', !isOwner);

    if (authInfo && authInfo.generatedPassword) {
      $ownerGeneratedBox
        .html('首次启动已生成随机 owner 密码：<code>' + escapeHtml(authInfo.generatedPassword) + '</code>，请尽快登录后修改。')
        .show();
    } else {
      $ownerGeneratedBox.hide().empty();
    }

    if (isOwner) {
      $ownerStatusText.text('已登录：你现在可以设置自定义前缀，并保留历史邮件。');
      $ownerLoginForm.hide();
      $ownerLogoutBox.show();
    } else {
      $ownerStatusText.text('未登录：只能使用随机前缀，邮件不会持久保存。');
      $ownerLoginForm.show();
      $ownerLogoutBox.hide();
      $customShortId.data('editing', false).html('<i class="edit icon"></i>自定义前缀');
    }
  }

  function setEmptyView() {
    currentMailId = null;
    currentSelectedRow = null;
    $mailSubject.text('我的邮件在哪里？');
    $mailFrom.text('—');
    $mailTo.text('—');
    $mailTime.text('—');
    $mailBody.html(
      '<div class="mail-placeholder">' +
        '<div class="mail-placeholder__emoji">👀</div>' +
        '<h3>先收一封试试</h3>' +
        '<p>新邮件来了以后，这里会展示 HTML 正文或纯文本内容。</p>' +
      '</div>'
    );
    $viewRawBtn.prop('disabled', true);
  }

  function selectMailRow(id) {
    currentSelectedRow = id;
    $maillist.find('.mail-item').removeClass('is-active');
    $maillist.find('.mail-item[data-id="' + id + '"]').addClass('is-active');
  }

  function renderMailDetail(mail) {
    currentMailId = mail.id;
    $mailSubject.text(mail.subject || '无主题');
    $mailFrom.text(mail.from || '未知');
    $mailTo.text(mail.to || '未知');
    $mailTime.text(formatDate(mail.receivedAt));
    $viewRawBtn.prop('disabled', false);

    if (mail.html) {
      $mailBody.html(mail.html);
    } else {
      $mailBody.html($('<pre>').text(mail.text || ''));
    }

    $('#raw .header').text('邮件原始数据');
    $('#raw .content').html(
      $('<pre>').html(
        $('<code>').addClass('language-json').html(escapeHtml(JSON.stringify(mail, null, 2)))
      )
    );
    Prism.highlightAll();
  }

  function renderMailRow(mail) {
    var $item = $('<div>').addClass('mail-item').attr('data-id', mail.id).data('mail', mail);
    $item.append(
      $('<div>').addClass('mail-item__top')
        .append($('<div>').addClass('mail-item__from').text(mail.from || '未知发件人'))
        .append($('<div>').addClass('mail-item__time').text(formatDate(mail.receivedAt)))
    );
    $item.append($('<div>').addClass('mail-item__subject').text(mail.subject || '无主题'));

    if (mail.id === currentSelectedRow) {
      $item.addClass('is-active');
    }

    return $item;
  }

  function loadMailDetail(id) {
    apiGet('/api/mails/' + id).done(function(mail) {
      selectMailRow(id);
      renderMailDetail(mail);
    });
  }

  function renderList(mails) {
    $maillist.empty();
    setMailCount(mails.length);

    if (!mails.length) {
      $emptyState.show();
      setEmptyView();
      return;
    }

    $emptyState.hide();
    mails.forEach(function(mail) {
      $maillist.append(renderMailRow(mail));
    });

    var exists = mails.some(function(mail) { return mail.id === currentSelectedRow; });
    var targetId = exists ? currentSelectedRow : mails[0].id;
    loadMailDetail(targetId);
  }

  function loadInboxHistory(inbox) {
    currentInbox = inbox;
    apiGet('/api/inboxes/' + inbox + '/mails').done(function(result) {
      setMode(result.mode || 'anonymous');
      renderList(result.mails || []);
      $mailTip.text(currentMode === 'persistent' ? '持久收件箱历史已加载' : '匿名收件箱仅当前会话可见');
    }).fail(function(xhr) {
      $mailTip.text((xhr.responseJSON && xhr.responseJSON.error) || '加载失败');
      setMailCount(0);
      setEmptyView();
      $maillist.empty();
      $emptyState.show();
    });
  }

  function setMailAddress(payload) {
    if (typeof payload === 'string') {
      payload = {
        inbox: payload,
        mode: 'anonymous',
        address: payload + '@' + location.hostname
      };
    }

    currentInbox = payload.inbox;
    setMode(payload.mode || 'anonymous');
    $shortId.val(payload.address || (payload.inbox + '@' + location.hostname));
    $('#copyAddressBtn .copyable').attr('data-clipboard-text', $shortId.val());
    $mailTip.text(currentMode === 'persistent' ? '已进入持久模式邮箱' : '匿名模式下邮件不会持久保存');
    loadInboxHistory(payload.inbox);
  }

  function requestNewInbox() {
    currentSelectedRow = null;
    socket.emit('request shortid', true);
  }

  function fetchAuthStatus() {
    return apiGet('/api/auth/status').done(function(result) {
      isOwner = !!result.isOwner;
      authInfo = result.auth || null;
      refreshOwnerUi();
    });
  }

  function restoreSessionInbox() {
    return apiGet('/api/session/inbox').done(function(result) {
      if (result && result.inbox && result.inbox.inbox) {
        setMailAddress(result.inbox);
      } else {
        requestNewInbox();
      }
    });
  }

  $customShortId.on('click', function() {
    if (!isOwner) {
      $mailTip.text('请先登录持久模式');
      return;
    }

    var isEditing = $(this).data('editing') === true;
    if (!isEditing) {
      $(this).data('editing', true).html('<i class="check icon"></i>确认前缀');
      $shortId.prop('disabled', false).val('').prop('placeholder', $placeholderNew).focus();
      return;
    }

    var mailUser = ($shortId.val() || '').trim().toLowerCase();
    $shortId.prop('disabled', true).prop('placeholder', $placeholderOld);
    $(this).data('editing', false).html('<i class="edit icon"></i>自定义前缀');
    socket.emit('set shortid', mailUser);
  });

  $('#refreshShortid, #refreshShortidTop').on('click', function() {
    requestNewInbox();
  });

  $maillist.on('click', '.mail-item', function() {
    var id = $(this).attr('data-id');
    loadMailDetail(id);
  });

  $viewRawBtn.on('click', function() {
    if (currentMailId) {
      $('#raw').modal('show');
    }
  });

  $ownerLoginBtn.on('click', function() {
    var password = ($ownerPassword.val() || '').trim();
    if (!password) {
      $mailTip.text('请输入密码');
      return;
    }

    apiPost('/api/auth/login', { password: password }).done(function(result) {
      isOwner = true;
      authInfo = result.auth || authInfo;
      $ownerPassword.val('');
      refreshOwnerUi();
      $mailTip.text('已登录持久模式');
    }).fail(function(xhr) {
      $mailTip.text((xhr.responseJSON && xhr.responseJSON.error) || '登录失败');
    });
  });

  $ownerChangePasswordBtn.on('click', function() {
    var currentPassword = ($ownerCurrentPassword.val() || '').trim();
    var newPassword = ($ownerNewPassword.val() || '').trim();
    if (!currentPassword || !newPassword) {
      $mailTip.text('请填写当前密码和新密码');
      return;
    }

    apiPost('/api/auth/change-password', {
      currentPassword: currentPassword,
      newPassword: newPassword
    }).done(function(result) {
      authInfo = result.auth || null;
      $ownerCurrentPassword.val('');
      $ownerNewPassword.val('');
      refreshOwnerUi();
      $mailTip.text('密码修改成功');
    }).fail(function(xhr) {
      $mailTip.text((xhr.responseJSON && xhr.responseJSON.error) || '密码修改失败');
    });
  });

  $ownerLogoutBtn.on('click', function() {
    apiPost('/api/auth/logout', {}).done(function() {
      isOwner = false;
      refreshOwnerUi();
      $mailTip.text('已退出登录，回到匿名模式');
      requestNewInbox();
    });
  });

  clipboard.on('success', function() {
    $mailTip.text('邮箱地址已复制');
  });

  clipboard.on('error', function() {
    $mailTip.text('复制失败，请手动复制');
  });

  var socket = io();

  socket.on('connect', function() {
    setConnectionStatus('已连接');
    fetchAuthStatus().always(function() {
      restoreSessionInbox();
    });
  });

  socket.on('disconnect', function() {
    setConnectionStatus('连接断开');
  });

  socket.on('shortid', function(payload) {
    setMailAddress(payload);
  });

  socket.on('shortid error', function(message) {
    $mailTip.text(message || '邮箱前缀不可用');
    alert(message || '邮箱前缀不可用');
  });

  socket.on('mail', function(mail) {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('收到新邮件：' + (mail.subject || '无主题'));
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission(function(permission) {
          if (permission === 'granted') {
            new Notification('收到新邮件：' + (mail.subject || '无主题'));
          }
        });
      }
    }

    $mailTip.text(currentMode === 'persistent' ? '收到一封新邮件，已保存' : '收到一封新邮件，仅当前会话可见');
    currentSelectedRow = mail.id;
    loadInboxHistory(currentInbox);
  });

  setEmptyView();
  refreshOwnerUi();
  setConnectionStatus('连接中');
  setMode('anonymous');
});
