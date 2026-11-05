/* Ceylonways site behaviour: navigation, scroll stories, package list, filters.
   Native scrolling only. Every effect reads scroll position and has a still fallback. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Navigation ---------- */
  const toggle = document.querySelector('.menu-toggle');
  const siteNav = document.getElementById('site-nav');
  const groups = $$('.nav-group');
  const closeGroups = except => groups.forEach(g => { if (g !== except) { g.classList.remove('open'); g.querySelector('.nav-trigger').setAttribute('aria-expanded', 'false'); } });
  groups.forEach(g => {
    const btn = g.querySelector('.nav-trigger');
    btn.addEventListener('click', () => {
      const open = !g.classList.contains('open');
      closeGroups(g); g.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open));
    });
    g.addEventListener('keydown', e => { if (e.key === 'Escape' && g.classList.contains('open')) { closeGroups(); btn.focus(); } });
    if (matchMedia('(hover: hover) and (min-width: 1081px)').matches) {
      let t;
      g.addEventListener('mouseenter', () => { clearTimeout(t); closeGroups(g); g.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); });
      g.addEventListener('mouseleave', () => { t = setTimeout(() => { g.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }, 180); });
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.nav-group')) closeGroups(); });
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open)); siteNav.classList.toggle('open', open);
      toggle.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && siteNav.classList.contains('open')) { toggle.click(); toggle.focus(); } });
    siteNav.addEventListener('click', e => { if (e.target.closest('a') && siteNav.classList.contains('open')) toggle.click(); });
  }

  /* ---------- Reveal on scroll ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(items => items.forEach(it => { if (it.isIntersecting) { it.target.classList.add('is-visible'); io.unobserve(it.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('is-visible'));

  /* ---------- Hero route draws once ---------- */
  const heroRoute = document.querySelector('.hero-map .map-route');
  if (heroRoute && !reduce) {
    heroRoute.style.strokeDasharray = '1'; heroRoute.style.strokeDashoffset = '1'; heroRoute.style.transition = 'stroke-dashoffset 2.4s cubic-bezier(.2,.7,.1,1) .5s';
    requestAnimationFrame(() => requestAnimationFrame(() => { heroRoute.style.strokeDashoffset = '0'; }));
  }

  /* ---------- Scroll driven scenes ---------- */
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('[data-hero]');
  const finale = document.querySelector('[data-finale]');
  const progressOf = el => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1); };

  // Pinned island story: one image per chapter, text switches sides, route inks itself.
  const stage = document.querySelector('[data-stage]');
  let stageUpdate = () => {};
  if (stage) {
    const imgs = $$('.stage-media img', stage); const chs = $$('.stage-ch', stage);
    const dots = $$('.stage-index li', stage); const stops = $$('.map-stop', stage);
    const route = stage.querySelector('.map-route'); const kmOut = stage.querySelector('[data-km-out]');
    const rail = stage.querySelector('.stage-rail');
    const n = chs.length; let current = -1;
    const maxKm = Number(chs[n - 1].dataset.km);
    stageUpdate = () => {
      const p = progressOf(stage);
      const pos = clamp(p * n * 1.0, 0, n - 0.0001);
      const i = Math.floor(pos); const t = pos - i;
      stage.style.setProperty('--p', p.toFixed(4));
      if (!reduce) imgs[i].style.setProperty('--t', t.toFixed(4));
      if (i !== current) {
        current = i;
        imgs.forEach((im, k) => im.classList.toggle('is-on', k === i));
        chs.forEach((c, k) => c.classList.toggle('is-on', k === i));
        dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
        stops.forEach(s => s.classList.toggle('is-active', s.dataset.base === chs[i].dataset.base));
        rail.classList.toggle('at-right', i % 2 === 0); rail.classList.toggle('at-left', i % 2 === 1);
      }
      // The route and the kilometre counter follow overall progress.
      const draw = reduce ? 0 : 1 - clamp(p * 1.15, 0, 1);
      route.style.setProperty('--draw', draw.toFixed(4));
      kmOut.textContent = Math.round(maxKm * (1 - draw)).toLocaleString('en-US');
    };
  }

  // Destinations rail: vertical scroll moves the cards sideways on wide screens.
  const railSec = document.querySelector('[data-rail]');
  let railUpdate = () => {}; let railSize = () => {};
  if (railSec) {
    const track = railSec.querySelector('.rail-track');
    let distance = 0;
    const wide = () => innerWidth > 720 && !reduce;
    railSize = () => {
      if (!wide()) { railSec.style.height = ''; distance = 0; track.style.setProperty('--x', 0); return; }
      distance = Math.max(0, track.scrollWidth - innerWidth);
      railSec.style.height = `${innerHeight + distance}px`;
    };
    railUpdate = () => { if (wide() && distance) track.style.setProperty('--x', (progressOf(railSec) * distance).toFixed(1)); };
    railSize(); addEventListener('resize', () => { railSize(); railUpdate(); });
    addEventListener('load', () => { railSize(); railUpdate(); });
  }

  // One sentence that lights up word by word.
  const light = document.querySelector('[data-lightup]');
  const words = light ? $$('.w', light) : [];

  let ticking = false;
  const onScroll = () => {
    ticking = false;
    if (header) header.classList.toggle('is-scrolled', scrollY > 40);
    if (hero && !reduce && scrollY < innerHeight * 1.2) hero.style.setProperty('--hp', clamp(scrollY / innerHeight, 0, 1).toFixed(4));
    stageUpdate(); railUpdate();
    if (light) {
      const r = light.getBoundingClientRect();
      const p = clamp((innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35), 0, 1);
      const lit = Math.round(p * words.length);
      words.forEach((w, k) => w.classList.toggle('lit', reduce || k < lit));
    }
    if (finale && !reduce) { const r = finale.getBoundingClientRect(); finale.style.setProperty('--fp', clamp(1 - r.top / innerHeight, 0, 1).toFixed(4)); }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Package list: a photo follows the cursor ---------- */
  const float = document.querySelector('.pk-float');
  if (float && fine && !reduce) {
    const fimg = float.querySelector('img');
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0;
    const loop = () => { x += (tx - x) * 0.18; y += (ty - y) * 0.18; float.style.setProperty('--fx', `${x}px`); float.style.setProperty('--fy', `${y}px`); raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0; };
    const aim = e => { tx = e.clientX + 28; ty = e.clientY - 120; if (tx + 350 > innerWidth) tx = e.clientX - 370; };
    let shown = false;
    $$('.pk-row').forEach(row => {
      row.addEventListener('mouseenter', e => {
        if (fimg.getAttribute('src') !== row.dataset.img) fimg.src = row.dataset.img;
        aim(e); if (!shown) { x = tx; y = ty; float.style.setProperty('--fx', `${x}px`); float.style.setProperty('--fy', `${y}px`); }
        shown = true; float.classList.add('on');
      });
      row.addEventListener('mouseleave', () => { shown = false; float.classList.remove('on'); });
      row.addEventListener('mousemove', e => {
        aim(e);
        if (!shown) { if (fimg.getAttribute('src') !== row.dataset.img) fimg.src = row.dataset.img; shown = true; float.classList.add('on'); }
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
    addEventListener('scroll', () => { if (shown) { shown = false; float.classList.remove('on'); } }, { passive: true });
  }

  /* ---------- Numbers count up once ---------- */
  const stats = document.querySelector('[data-stats]');
  if (stats && 'IntersectionObserver' in window && !reduce) {
    const nums = $$('[data-count]', stats);
    nums.forEach(b => { b.textContent = '0'; });
    const io = new IntersectionObserver(items => {
      if (!items.some(i => i.isIntersecting)) return; io.disconnect();
      const t0 = performance.now();
      const step = t => { const k = clamp((t - t0) / 1400, 0, 1); const e = 1 - Math.pow(1 - k, 3); nums.forEach(b => { b.textContent = Math.round(Number(b.dataset.count) * e); }); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(stats);
  }

  /* ---------- Add to My Trip from a place page ---------- */
  const tripBtn = document.querySelector('[data-trip-add]');
  if (tripBtn) {
    const KEY = 'ceylonways-map-trip-v1', note = document.querySelector('[data-trip-status]');
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const paint = () => { const on = (load().stops || []).includes(tripBtn.dataset.tripAdd); tripBtn.textContent = on ? 'Added. Undo' : 'Add to My Trip'; };
    tripBtn.hidden = false; paint();
    tripBtn.addEventListener('click', () => {
      const t = load(), id = tripBtn.dataset.tripAdd, d = tripBtn.dataset.tripDistrict;
      t.stops = t.stops || []; t.districts = t.districts || [];
      const i = t.stops.indexOf(id);
      if (i < 0) { t.stops.push(id); if (!t.districts.includes(d)) t.districts.push(d); } else t.stops.splice(i, 1);
      try { localStorage.setItem(KEY, JSON.stringify(t)); note.textContent = i < 0 ? `Added. ${t.stops.length} stop${t.stops.length > 1 ? 's' : ''} in My Trip on the map.` : 'Removed from My Trip.'; } catch (e) { note.textContent = 'This browser blocked saving.'; }
      paint();
    });
  }

  /* ---------- Package filters ---------- */
  const list = document.getElementById('package-list');
  if (list) {
    const buttons = $$('[data-filter]');
    const status = document.querySelector('.filter-status');
    const apply = g => {
      if (!buttons.some(b => b.dataset.filter === g)) g = 'all';
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === g)));
      let shown = 0;
      $$('.package-card', list).forEach(c => { const ok = g === 'all' || c.dataset.groups.split(' ').includes(g); c.hidden = !ok; if (ok) shown++; });
      status.textContent = g === 'all' ? `Showing all ${shown} packages.` : `Showing ${shown} package${shown === 1 ? '' : 's'}: ${buttons.find(b => b.dataset.filter === g).textContent}.`;
    };
    buttons.forEach(b => b.addEventListener('click', () => { history.replaceState(null, '', b.dataset.filter === 'all' ? location.pathname : '#' + b.dataset.filter); apply(b.dataset.filter); }));
    addEventListener('hashchange', () => apply(location.hash.slice(1) || 'all'));
    apply(location.hash.slice(1) || 'all');
  }
})();
