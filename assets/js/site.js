/* Ceylonways site behaviour: navigation, add to trip, package filters. */
(function () {
  'use strict';
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

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
      document.body.style.overflow = open ? 'hidden' : '';
      toggle.querySelector('.menu-label').textContent = open ? 'Close' : 'Menu';
      header.classList.toggle('is-menu', open); paint();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && siteNav.classList.contains('open')) { toggle.click(); toggle.focus(); } });
    siteNav.addEventListener('click', e => { if (e.target.closest('a') && siteNav.classList.contains('open')) toggle.click(); });
  }

  /* ---------- The header turns solid once the map plate has scrolled past ---------- */
  const header = document.querySelector('.site-header');
  const journey = document.getElementById('journey');
  let lastY = scrollY;
  const paint = () => {
    const menu = header.classList.contains('is-menu');
    header.classList.toggle('is-scrolled', scrollY > 40 || menu);
    if (journey) {
      const inside = scrollY > 80 && scrollY < journey.offsetHeight - innerHeight;
      if (Math.abs(scrollY - lastY) > 6) { header.classList.toggle('is-away', inside && scrollY > lastY && !menu); lastY = scrollY; }
      if (!inside) header.classList.remove('is-away');
    }
  };
  addEventListener('scroll', paint, { passive: true });
  paint();

  /* ---------- Districts: the list and the map answer each other ---------- */
  const atlas = document.querySelector('.atlas');
  if (atlas) {
    const mark = (slug, on) => $$(`[data-d="${slug}"]`, atlas).forEach(e => e.classList.toggle('is-on', on));
    ['pointerover', 'focusin'].forEach(n => atlas.addEventListener(n, e => { const a = e.target.closest('[data-d]'); if (a) mark(a.dataset.d, true); }));
    ['pointerout', 'focusout'].forEach(n => atlas.addEventListener(n, e => { const a = e.target.closest('[data-d]'); if (a) mark(a.dataset.d, false); }));
  }

  /* ---------- Places hub: pointing at a card lights its dot on the island ---------- */
  const hub = document.querySelector('.hub');
  if (hub) {
    const name = hub.querySelector('[data-hub-name]'), first = name.textContent;
    const mark = (a, on) => { const c = hub.querySelector(`circle[data-p="${a.dataset.p}"]`); if (c) c.classList.toggle('is-on', on); name.textContent = on ? a.dataset.n : first; };
    ['pointerover', 'focusin'].forEach(n => hub.addEventListener(n, e => { const a = e.target.closest('a[data-p]'); if (a) mark(a, true); }));
    ['pointerout', 'focusout'].forEach(n => hub.addEventListener(n, e => { const a = e.target.closest('a[data-p]'); if (a) mark(a, false); }));
  }

  /* ---------- Place index: the photo follows what you point at ---------- */
  const gaz = document.querySelector('.gaz-wrap');
  if (gaz && matchMedia('(hover: hover)').matches) {
    const img = gaz.querySelector('.gaz-photo img');
    const show = a => { if (img.getAttribute('src') !== a.dataset.preview) { img.classList.remove('is-in'); img.onload = () => img.classList.add('is-in'); img.src = a.dataset.preview; img.alt = ''; } img.hidden = false; };
    ['pointerover', 'focusin'].forEach(n => gaz.addEventListener(n, e => { const a = e.target.closest('a[data-preview]'); if (a) show(a); }));
  }

  /* ---------- Add to My Trip from a place page ---------- */
  const tripBtn = document.querySelector('[data-trip-add]');
  if (tripBtn) {
    const KEY = 'ceylonways-map-trip-v1', note = document.querySelector('[data-trip-status]');
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const paintTrip = () => { const on = (load().stops || []).includes(tripBtn.dataset.tripAdd); tripBtn.textContent = on ? 'Added. Undo' : 'Add to my trip'; };
    tripBtn.hidden = false; paintTrip();
    tripBtn.addEventListener('click', () => {
      const t = load(), id = tripBtn.dataset.tripAdd, d = tripBtn.dataset.tripDistrict;
      t.stops = t.stops || []; t.districts = t.districts || [];
      const i = t.stops.indexOf(id);
      if (i < 0) { t.stops.push(id); if (!t.districts.includes(d)) t.districts.push(d); } else t.stops.splice(i, 1);
      try { localStorage.setItem(KEY, JSON.stringify(t)); note.textContent = i < 0 ? `Added. ${t.stops.length} stop${t.stops.length > 1 ? 's' : ''} in My trip on the map.` : 'Removed from My trip.'; } catch (e) { note.textContent = 'This browser blocked saving.'; }
      paintTrip();
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
