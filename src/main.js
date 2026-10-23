import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createScene } from './scene.js';
import { en, arAlt, branches, day, formMsg } from './i18n.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- language
const ar = {};
$$('[data-i18n]').forEach((el) => { ar[el.dataset.i18n] = el.innerHTML; });
Object.assign(ar, arAlt);

let lang = 'ar';
try {
  const q = new URLSearchParams(location.search).get('lang');
  lang = q === 'en' || q === 'ar' ? q : (localStorage.getItem('omni-lang') || 'ar');
} catch { /* storage unavailable */ }

let scene3d = null;

function applyLang(next) {
  lang = next;
  const dict = lang === 'en' ? en : ar;
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'en' ? 'ltr' : 'rtl';
  $$('[data-i18n]').forEach((el) => {
    const v = dict[el.dataset.i18n];
    if (v !== undefined) el.innerHTML = v;
  });
  $$('[data-i18n-alt]').forEach((el) => { el.alt = dict[el.dataset.i18nAlt] || ''; });
  $('#langBtn').textContent = lang === 'en' ? 'عربي' : 'EN';
  $('#formLang').value = lang;
  document.title = lang === 'en' ? 'Omni Build | General Contracting, Facility Management, Smart Homes' : 'أومني بيلد | مقاولات وصيانة ومنازل ذكية وحدائق';
  try { localStorage.setItem('omni-lang', lang); } catch { /* ignore */ }
  if (scene3d) scene3d.setSide(lang === 'en' ? -1 : 1);
  renderBranch(currentBranch);
  renderDay(currentDay);
  ScrollTrigger.refresh();
}

$('#langBtn').addEventListener('click', () => applyLang(lang === 'en' ? 'ar' : 'en'));

// ---------- nav
const nav = $('#nav');
const menuBtn = $('#menuBtn');
menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
});
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => {
  nav.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', false);
}));
ScrollTrigger.create({
  start: 80,
  onUpdate: (self) => nav.classList.toggle('scrolled', self.scroll() > 80),
});

// ---------- facility management branches
let currentBranch = 'el';
function renderBranch(key) {
  currentBranch = key;
  const b = branches[key];
  const t = b[lang];
  $$('.branch').forEach((el) => el.classList.toggle('active', el.dataset.branch === key));
  const img = $('#bpImg');
  const fig = img.parentElement;
  if (b.img) {
    img.src = b.img;
    img.alt = t.t;
    fig.classList.remove('icon-only');
    fig.querySelector('svg')?.remove();
  } else {
    fig.classList.add('icon-only');
    img.removeAttribute('src');
    img.alt = '';
    let svg = fig.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'use'));
      fig.appendChild(svg);
    }
    svg.firstChild.setAttribute('href', '#' + b.icon);
  }
  $('#bpTitle').textContent = t.t;
  $('#bpText').textContent = t.p;
  $('#bpList').innerHTML = t.l.map((x) => `<li>${x}</li>`).join('');
}
$$('.branch').forEach((el) => el.addEventListener('click', () => {
  renderBranch(el.dataset.branch);
  if (!reduced) gsap.fromTo('#branchPanel', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
}));

// ---------- a day in a smart home
let currentDay = 0;
let dayTimer = null;
function renderDay(i) {
  currentDay = i;
  const d = day[lang][i];
  $$('.dt').forEach((b) => {
    const on = +b.dataset.t === i;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $('#house').dataset.scene = i;
  $('#dayK').textContent = d.k;
  $('#dayH').textContent = d.h;
  $('#dayP').textContent = d.p;
  $('#phoneMsg').textContent = d.m;
}
function startDayAuto() {
  clearInterval(dayTimer);
  if (reduced) return;
  dayTimer = setInterval(() => renderDay((currentDay + 1) % 5), 4200);
}
$$('.dt').forEach((b) => b.addEventListener('click', () => { renderDay(+b.dataset.t); clearInterval(dayTimer); }));
ScrollTrigger.create({
  trigger: '#day', start: 'top 80%', end: 'bottom 20%',
  onEnter: startDayAuto, onEnterBack: startDayAuto,
  onLeave: () => clearInterval(dayTimer), onLeaveBack: () => clearInterval(dayTimer),
});

// ---------- 3D scene
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

if (webglOK()) {
  scene3d = createScene($('#scene'));
  scene3d.setSide(lang === 'en' ? -1 : 1);
  const st = scene3d.state;

  // intro: the building rises floor by floor
  gsap.to(st, { intro: 1, duration: reduced ? 0.01 : 3.2, ease: 'power2.inOut', delay: 0.3 });

  // scroll through the journey drives the camera and the service layers
  gsap.to(st, {
    focus: 4,
    ease: 'none',
    scrollTrigger: { trigger: '#journey', start: 'top bottom', end: 'bottom bottom', scrub: 0.8 },
  });
  ScrollTrigger.create({
    trigger: '#journey', start: 'top bottom', end: 'bottom bottom',
    onUpdate: (self) => { $('#jbar').style.transform = `scaleY(${self.progress})`; },
  });

  // stop rendering while the canvas is covered by solid sections
  ScrollTrigger.create({
    trigger: '#journey', start: 'top top', end: 'bottom top',
    onLeave: () => { st.active = false; },
    onEnterBack: () => { st.active = true; },
  });
} else {
  document.body.classList.add('no-webgl');
}

// highlight the active stage card
$$('.stage').forEach((s) => {
  ScrollTrigger.create({
    trigger: s, start: 'top 60%', end: 'bottom 40%',
    toggleClass: { targets: s, className: 'is-on' },
  });
});

// ---------- hero entrance + reveals
if (!reduced) {
  gsap.from('.hero-copy > *', { y: 28, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.09, delay: 0.2 });
  gsap.from('.nav-inner', { y: -20, opacity: 0, duration: 0.8, ease: 'power2.out' });
  $$('.reveal').forEach((el) => {
    gsap.from(el, {
      y: 36, opacity: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
  $$('.st-line').forEach((el, i) => {
    gsap.from(el, {
      xPercent: (i % 2 ? -1 : 1) * 12, opacity: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

// ---------- contact form (Netlify Forms)
const form = $('#contactForm');
const status = $('#formStatus');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = formMsg[lang];
  const required = ['name', 'phone', 'service', 'message'];
  const bad = required.filter((n) => !String(form.elements[n].value).trim());
  $$('.f', form).forEach((l) => l.classList.remove('err'));
  bad.forEach((n) => form.elements[n].closest('.f').classList.add('err'));
  if (bad.length) { status.textContent = msg.invalid; status.className = 'f-status bad'; return; }

  const btn = $('#sendBtn');
  btn.disabled = true;
  status.textContent = msg.sending;
  status.className = 'f-status';
  try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString(),
    });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    status.textContent = msg.ok;
    status.className = 'f-status good';
  } catch {
    status.textContent = msg.err;
    status.className = 'f-status bad';
  } finally {
    btn.disabled = false;
  }
});

$('#year').textContent = new Date().getFullYear();

applyLang(lang);
