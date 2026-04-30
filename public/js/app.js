$(function(){
  $('.ui.modal').modal();

  var clipboard = new Clipboard('.copyable');
  var currentInbox = null;
  var currentMailId = null;

  var $customShortId = $('#customShortid');
  var $shortId = $('#shortid');
  var $maillist = $('#maillist');
  var $mailcardHeader = $('#mailcard .header');
  var $mailcardContent = $('#mailcard .content:last');
  var $mailcardCode = $('#mailcard i');
  var $customTheme = 'check';
  var $placeholder_old = '请等待分配临时邮箱';
  var $placeholder_new = '请输入不带后缀邮箱账号';

  function escapeHtml(value) {
    return $('<div>').text(value || '').html();
  }

  function renderMailDetail(mail) {
    currentMailId = mail.id;
    $mailcardHeader.text(mail.subject || '无主题');

    if (mail.html) {
      $mailcardContent.html(mail.html);
    } else {
      $mailcardContent.html($('<pre>').text(mail.text || '')); 
    }

    $('#raw .header').text('邮件详情');
    $('#raw .content').html(
      $('<pre>').html(
        $('<code>').addClass('language-json').html(escapeHtml(JSON.stringify(mail, null, 2)))
      )
    );
    Prism.highlightAll();
  }

  function renderMailRow(mail) {
    var $tr = $('<tr>').attr('data-id', mail.id).data('mail', mail);
    $tr
      .append($('<td>').text(mail.from))
      .append($('<td>').text(mail.subject || '无主题'))
      .append($('<td>').text((new Date(mail.receivedAt)).toLocaleString()));
    return $tr;
  }

  function loadMailDetail(id) {
    $.getJSON('/api/mails/' + id, function(mail) {
      renderMailDetail(mail);
    });
  }

  function loadInboxHistory(inbox) {
    currentInbox = inbox;
    $.getJSON('/api/inboxes/' + inbox + '/mails', function(result) {
      $maillist.empty();
      result.mails.forEach(function(mail) {
        $maillist.append(renderMailRow(mail));
      });
      if (result.mails.length > 0) {
        loadMailDetail(result.mails[0].id);
      } else {
        currentMailId = null;
        $mailcardHeader.text('我的邮件在哪里？');
        $mailcardContent.html('<p>等等就来( ͡° ͜ʖ ͡°)</p>');
      }
    });
  }

  $customShortId.on('click', function() {
    var self = $(this);
    $shortId.prop('disabled', false);
    if(self.hasClass('edit')) {
      $shortId.val('');
      self.removeClass('edit');
      self.toggleClass($customTheme);
      $shortId.prop('placeholder', $placeholder_new);
    } else {
      var mailUser = ($shortId.val() || '').trim().toLowerCase();
      $shortId.prop('disabled', true);
      self.removeClass('check');
      self.toggleClass('edit');
      $shortId.prop('placeholder', $placeholder_old);
      socket.emit('set shortid', mailUser);
    }
  });

  $maillist.on('click', 'tr', function() {
    var id = $(this).attr('data-id');
    loadMailDetail(id);
  });

  $mailcardCode.on('click', function() {
    if (currentMailId) {
      $('#raw').modal('show');
    }
  });

  var socket = io();

  function setMailAddress(id) {
    currentInbox = id;
    localStorage.setItem('shortid', id);
    var mailaddress = id + '@' + location.hostname;
    $('#shortid').val(mailaddress).parent().siblings('button').find('.mail').attr('data-clipboard-text', mailaddress);
    loadInboxHistory(id);
  }

  $('#refreshShortid').click(function() {
    socket.emit('request shortid', true);
  });

  socket.on('connect', function() {
    if(('localStorage' in window)) {
      var shortid = localStorage.getItem('shortid');
      if(!shortid) {
        socket.emit('request shortid', true);
      }
      else {
        socket.emit('set shortid', shortid);
      }
    }
  });

  socket.on('shortid', function(id) {
    setMailAddress(id);
  });

  socket.on('shortid error', function(message) {
    alert(message || '邮箱前缀不可用');
  });

  socket.on('mail', function(mail) {
    if(('Notification' in window)) {
      if(Notification.permission === 'granted') {
        new Notification('New mail from ' + mail.from);
      }
      else if(Notification.permission !== 'denied') {
        Notification.requestPermission(function(permission) {
          if(permission === 'granted') {
            new Notification('New mail from ' + mail.from);
          }
        });
      }
    }
    $maillist.prepend(renderMailRow(mail));
    loadMailDetail(mail.id);
  });
});
