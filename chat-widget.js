/* UI Designs Co chat widget. Embed with: <script src="chat-widget.js" defer></script> */
(function () {
  'use strict';

  var API_URL = '/api/chat';
  var SMS_NUMBER = '9172458685';
  var SMS_DISPLAY = '917-245-8685';

  var opened = false;       // panel currently open
  var autoOpened = false;   // auto-open already used this session
  var closedByUser = false; // user closed it — stay closed
  var history = [];         // {role, content} pairs sent to the API
  var busy = false;

  /* ---------- styles ---------- */
  var css = [
    '#uidc-bubble{position:fixed;bottom:84px;right:16px;z-index:9999;width:56px;height:56px;border-radius:50%;background:#0A0C10;border:2px solid #D9A441;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(217,164,65,.35);transition:transform .15s;font-size:24px;line-height:1}',
    '@media(min-width:720px){#uidc-bubble{bottom:20px;right:20px}}',
    '#uidc-bubble:hover{transform:scale(1.06)}',
    '#uidc-panel{position:fixed;bottom:0;right:0;z-index:10000;width:100%;height:100%;background:#FFFFFF;display:none;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 12px 40px rgba(11,15,20,.3)}',
    '@media(min-width:720px){#uidc-panel{width:360px;height:520px;bottom:20px;right:20px;border-radius:14px;overflow:hidden}}',
    '#uidc-head{background:#0A0C10;color:#F2F5F9;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-bottom:2px solid #D9A441}',
    '#uidc-head strong{font-size:17px;display:block;font-family:"Playfair Display",Georgia,serif}',
    '#uidc-head small{display:block;font-size:12px;color:#8C97A6;font-weight:400}',
    '#uidc-close{background:none;border:none;color:#F2F5F9;font-size:26px;line-height:1;cursor:pointer;padding:6px 10px;min-height:44px}',
    '#uidc-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F2F5F9}',
    '.uidc-m{max-width:85%;padding:10px 14px;border-radius:14px;font-size:15px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
    '.uidc-bot{background:#FFFFFF;color:#0A0C10;border:1px solid #8C97A6;border-bottom-left-radius:4px;align-self:flex-start}',
    '.uidc-user{background:#D9A441;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}',
    '.uidc-sms{display:inline-flex;align-items:center;justify-content:center;min-height:48px;background:#D9A441;color:#fff;font-weight:700;font-size:15px;text-decoration:none;border-radius:8px;padding:12px 18px;align-self:flex-start;margin-top:2px}',
    '#uidc-typing{display:none;align-self:flex-start;padding:12px 16px;background:#FFFFFF;border:1px solid #8C97A6;border-radius:14px;border-bottom-left-radius:4px}',
    '#uidc-typing span{display:inline-block;width:7px;height:7px;border-radius:50%;background:#D9A441;margin:0 2px;animation:uidcB 1.2s infinite}',
    '#uidc-typing span:nth-child(2){animation-delay:.2s}',
    '#uidc-typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes uidcB{0%,60%,100%{opacity:.25}30%{opacity:1}}',
    '#uidc-form{display:flex;gap:8px;padding:12px;background:#FFFFFF;border-top:1px solid #8C97A6;flex-shrink:0}',
    '#uidc-input{flex:1;padding:12px 14px;border:1px solid #8C97A6;border-radius:8px;font-size:16px;font-family:inherit;background:#fff;color:#0A0C10}',
    '#uidc-send{min-height:48px;min-width:48px;background:#D9A441;color:#fff;border:none;border-radius:8px;font-size:18px;cursor:pointer;padding:0 16px}'
  ].join('\n');

  /* Small helper: create an element with attributes and text (no innerHTML). */
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    }
    if (text) node.textContent = text;
    return node;
  }

  /* ---------- DOM ---------- */
  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var bubble = el('button', { id: 'uidc-bubble', 'aria-label': 'Chat with us' }, '💬');

    var panel = el('div', { id: 'uidc-panel' });

    var head = el('div', { id: 'uidc-head' });
    var headText = el('div');
    headText.appendChild(el('strong', null, 'UI Designs Co'));
    headText.appendChild(el('small', null, 'Ask anything — a real answer, fast'));
    var closeBtn = el('button', { id: 'uidc-close', 'aria-label': 'Close chat' }, '×');
    head.appendChild(headText);
    head.appendChild(closeBtn);

    var msgs = el('div', { id: 'uidc-msgs' });
    var typing = el('div', { id: 'uidc-typing' });
    typing.appendChild(el('span'));
    typing.appendChild(el('span'));
    typing.appendChild(el('span'));
    msgs.appendChild(typing);

    var form = el('form', { id: 'uidc-form' });
    var input = el('input', { id: 'uidc-input', type: 'text', placeholder: 'Type a message', autocomplete: 'off' });
    var send = el('button', { id: 'uidc-send', type: 'submit', 'aria-label': 'Send' }, '➤');
    form.appendChild(input);
    form.appendChild(send);

    panel.appendChild(head);
    panel.appendChild(msgs);
    panel.appendChild(form);

    document.body.appendChild(bubble);
    document.body.appendChild(panel);

    bubble.addEventListener('click', function () { openPanel(true); });
    closeBtn.addEventListener('click', closePanel);
    form.addEventListener('submit', onSubmit);
  }

  function openPanel(byUser) {
    if (opened) return;
    if (!byUser && (closedByUser || autoOpened)) return;
    opened = true;
    if (!byUser) autoOpened = true;
    document.getElementById('uidc-panel').style.display = 'flex';
    document.getElementById('uidc-bubble').style.display = 'none';
    if (history.length === 0) {
      addBot("Hey — I'm the assistant for UI Designs Co. Daniel builds websites for Queens service businesses, and the first look is free. What kind of business do you run?");
    }
  }

  function closePanel() {
    opened = false;
    closedByUser = true;
    document.getElementById('uidc-panel').style.display = 'none';
    document.getElementById('uidc-bubble').style.display = 'flex';
  }

  /* ---------- messages ---------- */
  function msgsEl() { return document.getElementById('uidc-msgs'); }
  function typingEl() { return document.getElementById('uidc-typing'); }

  function scrollDown() {
    var m = msgsEl();
    m.scrollTop = m.scrollHeight;
  }

  function addBot(text) {
    var d = el('div', { 'class': 'uidc-m uidc-bot' }, text);
    msgsEl().insertBefore(d, typingEl());
    maybeAddSmsButton(text);
    scrollDown();
  }

  function addUser(text) {
    var d = el('div', { 'class': 'uidc-m uidc-user' }, text);
    msgsEl().insertBefore(d, typingEl());
    scrollDown();
  }

  /* If the model emits [SMS_BUTTON]body text[/SMS_BUTTON], render a tappable
     sms: link prefilled with that body. */
  function maybeAddSmsButton(text) {
    var m = text.match(/\[SMS_BUTTON\]([\s\S]*?)\[\/SMS_BUTTON\]/);
    var a;
    if (m) {
      a = el('a', {
        'class': 'uidc-sms',
        href: 'sms:' + SMS_NUMBER + '?&body=' + encodeURIComponent(m[1].trim())
      }, 'Text Daniel — message is pre-filled');
    } else if (/text (him|daniel)|917/i.test(text)) {
      a = el('a', { 'class': 'uidc-sms', href: 'sms:' + SMS_NUMBER }, 'Text ' + SMS_DISPLAY);
    } else {
      return;
    }
    msgsEl().insertBefore(a, typingEl());
  }

  function setTyping(on) {
    typingEl().style.display = on ? 'block' : 'none';
    scrollDown();
  }

  function failSafe() {
    addBot('Text Daniel at ' + SMS_DISPLAY + " and he'll answer directly.");
  }

  /* ---------- send ---------- */
  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    var input = document.getElementById('uidc-input');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    addUser(text);
    history.push({ role: 'user', content: text });
    busy = true;
    setTyping(true);

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then(function (data) {
        setTyping(false);
        busy = false;
        if (data && data.reply) {
          history.push({ role: 'assistant', content: data.reply });
          // Strip the button markers from the visible bubble text
          var visible = data.reply.replace(/\[SMS_BUTTON\][\s\S]*?\[\/SMS_BUTTON\]/g, '').trim();
          if (visible) {
            var d = el('div', { 'class': 'uidc-m uidc-bot' }, visible);
            msgsEl().insertBefore(d, typingEl());
          }
          maybeAddSmsButton(data.reply);
          scrollDown();
        } else {
          failSafe();
        }
      })
      .catch(function () {
        setTyping(false);
        busy = false;
        failSafe();
      });
  }

  /* ---------- auto-open triggers ---------- */
  function armTriggers() {
    // 30 seconds on page
    setTimeout(function () { openPanel(false); }, 30000);

    // scrolled past the pricing section
    var plans = document.getElementById('plans');
    if (plans && 'IntersectionObserver' in window) {
      var seen = false;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) seen = true;
          // fires once the pricing section has been seen and then scrolled past
          if (seen && !en.isIntersecting && en.boundingClientRect.top < 0) {
            openPanel(false);
            io.disconnect();
          }
        });
      }, { threshold: 0.1 });
      io.observe(plans);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { build(); armTriggers(); });
  } else {
    build();
    armTriggers();
  }
})();
