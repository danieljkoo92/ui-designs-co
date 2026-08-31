// Shared behaviour for the marketing pages: mobile nav + scroll reveals.
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sticky call button — mobile only. Desktop already has "Text Daniel" in
  // the header; on a phone that header scrolls away and thumb-tap-to-call is
  // the highest-converting affordance a trade site can offer, so it stays
  // fixed to the viewport the whole time. Skipped on demo-*.html (fictional
  // portfolio pages with their own chrome), book.html (already has a call
  // button in its hero) and index.html (already has its own sticky Call/Text
  // bar, inline in the page — see .sticky-cta there).
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var isHome = path === '' || path === '/' || /\/index\.html$/.test(path);
  var skip = /\/demo-[^/]*\.html$/.test(path) || /\/book\.html$/.test(path) || isHome;
  if (!skip) {
    var call = document.createElement('a');
    call.className = 'sticky-call';
    call.href = 'tel:+19172458685';
    call.setAttribute('aria-label', 'Call 917-245-8685');
    call.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>Call now</span>';
    document.body.appendChild(call);
  }

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // a tap on any link closes the sheet
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var items = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.style.transition = 'opacity .6s ease, transform .6s ease';
      el.style.opacity = 1;
      el.style.transform = 'none';
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  items.forEach(function (el) { io.observe(el); });
})();
