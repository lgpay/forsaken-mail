$(function() {
  $('.ui.modal').modal();

  var clipboard = new Clipboard('.copyable');
  var currentInbox = null;
  var currentMailId = null;
  var currentSelectedRow = null;

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
  var $placeholderOld = '请等待分配临时邮箱';
  var $placeholderNew = '请输入不带后缀邮箱账号';

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
    $.getJSON('/api/mails/' + id, function(mail) {
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

    var targetId = currentSelectedRow || mails[0].id;
    loadMailDetail(targetId);
  }

  function loadInboxHistory(inbox) {
    currentInbox = inbox;
    $.getJSON('/api/inboxes/' + inbox + '/mails', function(result) {
      renderList(result.mails || []);
      $mailTip.text('当前收件箱历史已加载');
    }).fail(function(xhr) {
      $mailTip.text((xhr.responseJSON && xhr.responseJSON.error) || '加载失败');
      setMailCount(0);
      setEmptyView();
      $maillist.empty();
      $emptyState.show();
    });
  }

  function setMailAddress(id) {
    currentInbox = id;
    localStorage.setItem('shortid', id);
    var mailaddress = id + '@' + location.hostname;
    $shortId.val(mailaddress);
    $('#copyAddressBtn .copyable').attr('data-clipboard-text', mailaddress);
    $mailTip.text('把这个邮箱填到目标网站里即可收信');
    loadInboxHistory(id);
  }

  function requestNewInbox() {
    socket.emit('request shortid', true);
  }

  $customShortId.on('click', function() {
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

  clipboard.on('success', function() {
    $mailTip.text('邮箱地址已复制');
  });

  clipboard.on('error', function() {
    $mailTip.text('复制失败，请手动复制');
  });

  var socket = io();

  socket.on('connect', function() {
    setConnectionStatus('已连接');
    if ('localStorage' in window) {
      var shortid = localStorage.getItem('shortid');
      if (!shortid) {
        requestNewInbox();
      } else {
        socket.emit('set shortid', shortid);
      }
    }
  });

  socket.on('disconnect', function() {
    setConnectionStatus('连接断开');
  });

  socket.on('shortid', function(id) {
    setMailAddress(id);
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

    $mailTip.text('收到一封新邮件');
    currentSelectedRow = mail.id;
    loadInboxHistory(currentInbox);
  });

  setEmptyView();
  setConnectionStatus('连接中');
});
