// Site-check widget. Renders itself into any [data-site-check] container.
// Results show immediately; the fixes come from Daniel by text.
(function () {
  var PHONE = '9172458685';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function verdict(score, caps) {
    var why = caps && caps.length
      ? ' Held back most by one thing: ' + caps[0] + '.'
      : '';
    if (score >= 90) return ['Genuinely strong.', 'Rare. Your site does nearly everything that matters — the gaps below are polish.' + why];
    if (score >= 75) return ['Good, with real gaps.', 'The bones are solid. What is missing below is quietly costing you calls.' + why];
    if (score >= 55) return ['Half a website.', 'It exists and it loads, but it is not doing the job a site is supposed to do.' + why];
    if (score >= 35) return ['Losing you work.', 'Enough is missing that people are finding you and leaving, or never finding you.' + why];
    return ['This needs rebuilding.', 'Most of what makes a site get found and get called is absent. Patching costs more than starting again.' + why];
  }

  function render(out, data) {
    out.innerHTML = '';
    var v = verdict(data.score, data.caps);

    var head = el('div', 'sc-head');
    var ring = el('div', 'sc-ring');
    var R = 48, C = 2 * Math.PI * R;
    ring.innerHTML =
      '<svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">' +
      '<circle class="bg" cx="54" cy="54" r="' + R + '" fill="none" stroke-width="9"/>' +
      '<circle class="fg" cx="54" cy="54" r="' + R + '" fill="none" stroke-width="9" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>';
    var num = el('b', null, '0');
    ring.appendChild(num);
    head.appendChild(ring);

    var verdictBox = el('div', 'sc-verdict');
    verdictBox.appendChild(el('h3', null, v[0]));
    verdictBox.appendChild(el('p', null, v[1]));
    verdictBox.appendChild(el('p', 'sc-url', data.url));
    head.appendChild(verdictBox);
    out.appendChild(head);

    var groups = el('div', 'sc-groups');
    data.groups.forEach(function (g) {
      var box = el('div');
      var gh = el('div', 'sc-g-head');
      gh.appendChild(el('h4', null, g.label));
      gh.appendChild(el('span', null, g.score + '%'));
      box.appendChild(gh);
      var bar = el('div', 'sc-bar');
      var fill = el('i');
      bar.appendChild(fill);
      box.appendChild(bar);
      // Show the top 3 checks per category, blur the rest. Order fails-first
      // (weight desc) so the customer sees the actual problems, and the
      // locked ones are the tension that makes them text.
      var ordered = g.checks.slice().sort(function (a, b) {
        if (a.pass !== b.pass) return a.pass ? 1 : -1;
        return (b.weight || 0) - (a.weight || 0);
      });
      var TOP = 3;
      var ul = el('ul', 'sc-checks');
      ordered.forEach(function (c, i) {
        var locked = i >= TOP;
        var li = el('li', locked ? 'sc-locked' : null);
        var mark = el('span', 'sc-mark ' + (c.pass ? 'ok' : 'no'), c.pass ? '✓' : '✕');
        li.appendChild(mark);
        var body = el('span');
        body.appendChild(el('b', null, c.label + ' — '));
        body.appendChild(document.createTextNode(c.detail));
        li.appendChild(body);
        ul.appendChild(li);
      });
      if (ordered.length > TOP) {
        var note = el('li', 'sc-locked-note');
        var msg = 'Hi Daniel - unlock the full check for ' + data.url + '.';
        var a = el('a', null, '+ ' + (ordered.length - TOP) + ' more — text me for the full report');
        a.href = 'sms:' + PHONE + '?&body=' + encodeURIComponent(msg);
        note.appendChild(a);
        ul.appendChild(note);
      }
      box.appendChild(ul);
      groups.appendChild(box);
      requestAnimationFrame(function () { fill.style.width = g.score + '%'; });
    });
    out.appendChild(groups);

    var cta = el('div', 'sc-cta');
    var line = data.failed > 0
      ? 'That is ' + data.failed + ' thing' + (data.failed === 1 ? '' : 's') + ' working against you. Send me the list and I will tell you which ones actually matter for your trade — and what a fixed version would look like. The preview is free.'
      : 'Your site is in good shape. If you want a second opinion on how it converts visitors into calls, text me.';
    cta.appendChild(el('p', null, line));
    var link = el('a', null, 'Text me my results');
    var msg = 'Hi Daniel - I ran the site check on ' + data.url + ' and scored ' + data.score + '/100. What would you fix?';
    link.href = 'sms:' + PHONE + '?&body=' + encodeURIComponent(msg);
    cta.appendChild(link);
    out.appendChild(cta);

    // animate the ring + number
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fg = ring.querySelector('.fg');
    if (reduce) {
      fg.style.strokeDashoffset = C * (1 - data.score / 100);
      num.textContent = data.score;
    } else {
      requestAnimationFrame(function () {
        fg.style.strokeDashoffset = C * (1 - data.score / 100);
      });
      // Write the real score first. If rAF is throttled — a background tab, a
      // slow phone — the visitor reads their actual score instead of a 0 that
      // never climbs.
      num.textContent = data.score;
      var t0 = null;
      (function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 1100);
        num.textContent = Math.round(data.score * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    }

    out.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }

  function mount(host) {
    var box = el('div', 'sc');
    var heading = host.dataset.heading || 'Is your current site costing you work?';
    var intro = host.dataset.intro || 'Paste your address. You get a straight answer in about ten seconds — what a search engine sees, what a phone visitor gets, and whether an AI assistant could recommend you.';

    var h = el('h2', null, heading);
    if (host.dataset.level === 'h3') { h = el('h3', null, heading); h.style.cssText = 'font-size:clamp(20px,3vw,26px);font-weight:800;margin-bottom:8px'; }
    box.appendChild(h);
    box.appendChild(el('p', 'sc-intro', intro));

    var form = el('form', 'sc-form');
    var id = 'sc-url-' + Math.random().toString(36).slice(2, 8);
    var label = el('label', null, 'Your website address');
    label.setAttribute('for', id);
    var input = el('input');
    input.type = 'text';
    input.id = id;
    input.name = 'url';
    input.placeholder = 'yourbusiness.com';
    input.autocomplete = 'url';
    input.spellcheck = false;
    var btn = el('button', null, 'Check my site');
    btn.type = 'submit';
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(btn);
    box.appendChild(form);
    box.appendChild(el('p', 'sc-note', 'Nothing is stored and nothing is sent to you — the results just appear below.'));

    var out = el('div', 'sc-out');
    out.setAttribute('aria-live', 'polite');
    box.appendChild(out);
    host.appendChild(box);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = input.value.trim();
      if (!value) { input.focus(); return; }
      btn.disabled = true;
      btn.textContent = 'Checking…';
      out.innerHTML = '';
      out.appendChild(el('div', 'sc-msg', 'Reading the site — this takes a few seconds.'));

      fetch('/api/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: value })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (r) {
          if (!r.ok || r.body.error) {
            out.innerHTML = '';
            out.appendChild(el('div', 'sc-msg err', r.body.error || "Couldn't check that address."));
            return;
          }
          render(out, r.body);
        })
        .catch(function () {
          out.innerHTML = '';
          out.appendChild(el('div', 'sc-msg err', "Couldn't reach the checker just now. Try again in a moment, or text me the address."));
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Check my site';
        });
    });
  }

  document.querySelectorAll('[data-site-check]').forEach(mount);
})();
