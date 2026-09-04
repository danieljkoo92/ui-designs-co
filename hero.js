// Home-page hero: the act loop, the transitions and the scroll film.
// Lifted out of index.html so it can carry defer alongside GSAP — inline it
// forced GSAP to load render-blocking, which cost the first paint on phones.
// Deferred scripts run in document order, so GSAP and ScrollTrigger are
// always defined by the time this executes.
gsap.registerPlugin(ScrollTrigger);
const mq = matchMedia('(prefers-reduced-motion: reduce)');

/* ---- the film: fast self-paced act loop over the ambient video ---- */
const vid = document.getElementById('filmVid');
const actIds = ['a1','ac','a2','a3','a4','a5'];
const acts = actIds.map(id => document.getElementById(id));
let current = 0;

/* ============================================================
   TRANSITION ENGINE
   Per-act headlines pre-split into character spans. Each act picks
   from three signature moves for entrance/exit:
     shatterOut  — every char blasts off in a random 3D vector
     assembleIn  — chars fly in from scattered 3D positions
     decodeIn    — chars scramble through random glyphs then lock
                   (that "terminal decode" look)
   Cut slides run an SVG feDisplacementMap warp animated in JS —
   the image liquefies as it fades out and settles as it fades in.
   ============================================================ */

/* Wrap every animatable headline's text nodes in .ch spans. Spaces
   become NBSP so word gaps survive layout. */
function wrapChars(el){
  const walk = (node) => {
    [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split('').forEach(ch => {
          const sp = document.createElement('span');
          sp.className = 'ch';
          sp.textContent = ch === ' ' ? '\u00a0' : ch;
          if (ch === ' ') sp.classList.add('sp');
          frag.appendChild(sp);
        });
        node.replaceChild(frag, c);
      } else if (c.nodeType === 1 && c.tagName !== 'BR') {
        walk(c);
      }
    });
  };
  walk(el);
}

const chr = {};
document.querySelectorAll('#a1 .line, #a2 .line, #a4 .tagline, #a5 .line').forEach(el => {
  wrapChars(el);
  const actId = el.closest('.act').id;
  const spans = [...el.querySelectorAll('.ch')];
  chr[actId] = { root: el, chars: spans, origs: spans.map(sp => sp.textContent) };
});
Object.values(chr).forEach(({chars}) => {
  gsap.set(chars, {opacity: 1, transform: 'none'});
});

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* per-character 3D shatter (exit) */
function shatterOut(actId, done){
  const rec = chr[actId];
  if (!rec) { done && done(); return; }
  gsap.killTweensOf(rec.chars);
  gsap.to(rec.chars, {
    duration: 0.55,
    x: () => rand(-380, 380),
    y: () => rand(-220, 220),
    z: () => rand(-600, 400),
    rotationX: () => rand(-540, 540),
    rotationY: () => rand(-540, 540),
    scale: () => rand(0.15, 0.5),
    filter: 'blur(10px) brightness(1.4)',
    color: () => (Math.random() > 0.6 ? '#D9A441' : ''),
    opacity: 0,
    ease: 'power3.in',
    stagger: { each: 0.008, from: 'random' },
    onComplete: done
  });
}

/* per-character assemble from 3D scatter (entry) */
function assembleIn(actId){
  const rec = chr[actId];
  if (!rec) return;
  gsap.killTweensOf(rec.chars);
  rec.chars.forEach((sp, i) => { sp.textContent = rec.origs[i]; sp.style.color = ''; sp.style.textShadow = ''; });
  gsap.set(rec.chars, {
    x: () => rand(-260, 260),
    y: () => rand(-180, 180),
    z: () => rand(-800, -300),
    rotationX: () => rand(-180, 180),
    rotationY: () => rand(-180, 180),
    scale: () => rand(0.4, 0.9),
    filter: 'blur(8px)',
    opacity: 0
  });
  gsap.to(rec.chars, {
    duration: 0.85,
    x: 0, y: 0, z: 0,
    rotationX: 0, rotationY: 0,
    scale: 1,
    filter: 'blur(0px)',
    opacity: 1,
    ease: 'back.out(1.6)',
    stagger: { each: 0.022, from: 'random' }
  });
}

/* terminal-style scramble decode (entry) */
const GLYPHS = '0123456789!@#$%&*<>[]{}/\\|=+-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function decodeIn(actId){
  const rec = chr[actId];
  if (!rec) return;
  gsap.killTweensOf(rec.chars);
  gsap.set(rec.chars, {
    x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0,
    scale: 1, filter: 'none', opacity: 1
  });
  rec.chars.forEach((sp, i) => {
    const orig = rec.origs[i];
    if (orig === '\u00a0' || /\s/.test(orig)) { sp.textContent = orig; sp.style.color = ''; return; }
    let ticks = 6 + Math.floor(Math.random() * 10);
    const startDelay = 40 + i * 22;
    sp.style.color = 'var(--gold)';
    sp.style.textShadow = '0 0 14px var(--gold)';
    const step = () => {
      if (ticks <= 0) {
        sp.textContent = orig;
        sp.style.color = '';
        sp.style.textShadow = '';
        return;
      }
      sp.textContent = pick(GLYPHS);
      ticks--;
      setTimeout(step, 42);
    };
    setTimeout(step, startDelay);
  });
}

/* SVG turbulence: liquefy the cut slide as it dissolves */
const warpMap = document.getElementById('warpMap');
const warpNoise = document.getElementById('warpNoise');
function warpTo(targetScale, dur){
  if (!warpMap) return;
  const obj = { s: parseFloat(warpMap.getAttribute('scale')) || 0 };
  gsap.killTweensOf(obj);
  gsap.to(obj, {
    duration: dur, s: targetScale, ease: 'power2.inOut',
    onUpdate: () => warpMap.setAttribute('scale', obj.s.toFixed(1))
  });
}
function warpSlideOut(){ if (!mq.matches) warpTo(80, 0.5); }
function warpSlideIn(){
  if (mq.matches) return;
  if (warpNoise) warpNoise.setAttribute('seed', String(Math.floor(Math.random() * 999)));
  warpTo(0, 0.6);
}

/* which entrance style each act uses when it comes on-screen */
const ENTRANCE = { a1: 'assemble', a2: 'decode', a4: 'decode', a5: 'assemble' };
function runEntrance(actId){
  const style = ENTRANCE[actId];
  if (style === 'assemble') assembleIn(actId);
  else if (style === 'decode') decodeIn(actId);
}

/* setAct — master switch, with per-act exit/entrance choreography */
function setAct(n){
  if (n === current) return;
  const outgoing = acts[current];
  const outId = actIds[current];
  const inId = actIds[n];

  if (mq.matches) {
    outgoing.classList.remove('on');
  } else if (chr[outId]) {
    shatterOut(outId);
    setTimeout(() => outgoing.classList.remove('on'), 480);
  } else if (outId === 'ac') {
    warpSlideOut();
    setTimeout(() => outgoing.classList.remove('on'), 500);
  } else if (outId === 'a3') {
    gsap.to('.shot-desktop', {duration: .55, scale: 0.3, rotationY: -60, opacity: 0, ease: 'power3.in'});
    gsap.to('.shot-phone',   {duration: .55, scale: 0.3, rotationY:  60, opacity: 0, ease: 'power3.in'});
    setTimeout(() => outgoing.classList.remove('on'), 500);
  } else {
    outgoing.classList.remove('on');
  }

  const enterDelay = mq.matches ? 0 : 220;
  setTimeout(() => {
    acts[n].classList.add('on');

    if (inId === 'a4') { scatterCloud(); flyCloud(); }
    if (inId === 'a3') {
      gsap.fromTo('.shot-desktop',
        {scale: 0.3, rotationY: -60, opacity: 0, z: -400},
        {scale: 1, rotationY: -8, z: 0, opacity: 1, duration: .8, ease: 'power3.out'});
      gsap.fromTo('.shot-phone',
        {scale: 0.3, rotationY: 60, opacity: 0, z: -400},
        {scale: 1, rotationY: 10, z: 0, opacity: 1, duration: .8, delay: .1, ease: 'power3.out'});
    }
    if (inId === 'ac') warpSlideIn();
    else runEntrance(inId);
    if (inId === 'a4' && chr.a4) setTimeout(() => runEntrance('a4'), 300);

    if (n === 0 && !mq.matches) {
      const f = document.getElementById('flash');
      f.classList.remove('hit'); void f.offsetWidth; f.classList.add('hit');
    }
  }, enterDelay);

  current = n;
}

/* portfolio cloud */
const cloud = document.getElementById('cloud');
const SHOTS = ['pest','hvac','tree','moving','driving','auto'];
const flyers = SHOTS.map(s => {
  const d = document.createElement('div');
  d.className = 'fly';
  d.innerHTML = `<img src="img/shots/${s}.jpg" alt="">`;
  cloud.appendChild(d);
  return d;
});
function scatterCloud(){
  flyers.forEach(d => gsap.set(d, {left:'50%', top:'50%', xPercent:-50, yPercent:-50, x:0, y:0, z:-600, opacity:0, rotateY:0}));
}
function flyCloud(){
  flyers.forEach((d,i) => {
    const a = (i / flyers.length) * Math.PI * 2 + .4;
    gsap.to(d, {
      x: Math.cos(a) * (innerWidth * .34),
      y: Math.sin(a) * (innerHeight * .27),
      z: (i % 2 ? 120 : -160),
      rotateY: (i % 2 ? -18 : 14),
      opacity: 1, duration: .8, ease: 'power3.out', delay: i * .04
    });
  });
}
scatterCloud();

/* industry hard cuts */
const slides = [...document.querySelectorAll('.cutslide')];
const cutLabel = document.getElementById('cutLabel');
/* showSlide — SVG turbulence liquid warp between industry cuts.
   Outgoing slide MELTS out (scale up to 80, then fade), incoming slide
   SETTLES in (fade in while scale unwinds to 0). Label is decoded matrix-style. */
let prevSlide = -1;
function showSlide(i){
  const incoming = slides[i];
  const outgoing = prevSlide >= 0 ? slides[prevSlide] : null;
  slides.forEach((sl,j) => { if (j !== i && j !== prevSlide) sl.classList.remove('show'); });

  if (mq.matches) {
    if (outgoing && outgoing !== incoming) outgoing.classList.remove('show');
    incoming.classList.add('show');
    cutLabel.textContent = incoming.dataset.label;
  } else {
    if (outgoing && outgoing !== incoming) {
      warpSlideOut();
      setTimeout(() => {
        outgoing.classList.remove('show');
        incoming.classList.add('show');
        warpSlideIn();
      }, 380);
    } else {
      incoming.classList.add('show');
      warpSlideIn();
    }
    const target = incoming.dataset.label;
    let ticks = 8;
    const step = () => {
      if (ticks <= 0) { cutLabel.textContent = target; return; }
      let out = '';
      const settled = target.length - Math.ceil(ticks * target.length / 8);
      for (let k = 0; k < target.length; k++) {
        out += (k < settled) ? target[k] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      cutLabel.textContent = out;
      ticks--;
      setTimeout(step, 45);
    };
    setTimeout(step, 260);
  }
  prevSlide = i;
}

/* master loop — snappy */
let film;
function buildFilm(){
  if (film) film.kill();
  film = gsap.timeline({ repeat: -1 });
  // Paced so each act can actually be read: ~3.5s a card, 1.4s a cut slide.
  // The closing CTA holds longest because it is the one that has to land.
  film.call(() => { setAct(0); runEntrance('a1'); }, null, 0);
  film.call(() => { setAct(1); showSlide(0); }, null, 3.8);
  film.call(() => showSlide(1), null, 5.2);
  film.call(() => showSlide(2), null, 6.6);
  film.call(() => showSlide(3), null, 8.0);
  film.call(() => setAct(2), null, 9.6);   // YOUR BUSINESS. REBUILT ONLINE.
  film.call(() => setAct(3), null, 13.0);  // site shots
  film.call(() => setAct(4), null, 16.4);  // portfolio explosion
  film.call(() => setAct(5), null, 19.8);  // closing CTA
  film.call(() => {}, null, 24.4);         // loop point
}
function applyMotion(){
  if (mq.matches) {
    if (film) film.kill();
    vid.pause(); vid.style.display = 'none';
    if (typeof filmToggle !== 'undefined' && filmToggle) filmToggle.style.display = 'none';
    acts[current].classList.remove('on'); current = 5;
    acts[5].classList.add('on');
  } else {
    vid.style.display = ''; vid.play().catch(()=>{});
    buildFilm();
  }
}
mq.addEventListener('change', applyMotion);
applyMotion();
vid.addEventListener('error', () => { vid.style.display = 'none'; }, { once: true });

/* pause/play the hero film — WCAG 2.2.2 Pause, Stop, Hide */
const filmToggle = document.getElementById('filmToggle');
let filmPaused = false;
function setFilmPaused(p){
  filmPaused = p;
  if (p) { if (film) film.pause(); vid.pause(); filmToggle.textContent = '\u25b6';
           filmToggle.setAttribute('aria-label','Play the background animation'); }
  else   { if (film) film.resume(); vid.play().catch(()=>{}); filmToggle.textContent = '\u275a\u275a';
           filmToggle.setAttribute('aria-label','Pause the background animation'); }
}
filmToggle.addEventListener('click', () => setFilmPaused(!filmPaused));

/* ---- scroll reveals ---- */
if (!mq.matches) {
  gsap.utils.toArray('.reveal').forEach(el => {
    ScrollTrigger.create({
      trigger: el, start: 'top 85%',
      animation: gsap.fromTo(el, {opacity:0, y:24}, {opacity:1, y:0, duration:.5, ease:'power2.out'})
    });
  });
}

/* ---- before/after wipe ---- */
const afterSite = document.getElementById('afterSite');
const baSeam = document.getElementById('baSeam');
if (mq.matches) {
  afterSite.style.clipPath = 'inset(0 0 0 50%)';
  baSeam.style.left = '50%'; baSeam.style.opacity = 1;
} else {
  const ba = { p: 0 };
  ScrollTrigger.create({
    trigger: '.ba', start: 'top 45%', end: '+=110%', scrub: 1,
    animation: gsap.to(ba, { p: 1, ease: 'none', onUpdate: () => {
      const pct = ba.p * 100;
      afterSite.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      baSeam.style.left = pct + '%';
      baSeam.style.opacity = ba.p > .02 && ba.p < .98 ? 1 : 0;
    }})
  });
}

/* ---- stat count-up ---- */
document.querySelectorAll('.stat .num').forEach(el => {
  const target = +el.dataset.count, pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
  if (mq.matches) { el.textContent = pre + target.toLocaleString() + suf; return; }
  // The true figure ships in the HTML so crawlers and answer engines read it.
  // Do NOT blank it here — the tween's first onUpdate writes 0 when the trigger
  // fires, so if the trigger never fires the real number stays on screen.
  const obj = { v: 0 };
  ScrollTrigger.create({
    trigger: el, start: 'top 85%', once: true,
    animation: gsap.to(obj, { v: target, duration: 1.4, ease: 'power2.out',
      onUpdate: () => { el.textContent = pre + Math.round(obj.v).toLocaleString() + suf; } })
  });
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
