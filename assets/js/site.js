/* Ceylonways site behaviour: the dock, the scene that answers the page, the budget slider, add to trip, package filters. */
(function () {
  'use strict';
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const hoverable = matchMedia('(hover: hover) and (min-width: 1001px)').matches;
  const beside = matchMedia('(min-width: 1001px)').matches; // on a phone the sheet covers the scene, so a new picture there would be a download nobody sees

  /* ---------- The dock ---------- */
  const veil = document.querySelector('.dock-veil');
  const openers = $$('.dock [aria-controls]');
  const close = back => {
    openers.forEach(b => { if (b.getAttribute('aria-expanded') === 'true') { b.setAttribute('aria-expanded', 'false'); document.getElementById(b.getAttribute('aria-controls')).classList.remove('is-open'); if (back) b.focus(); } });
    veil.classList.remove('is-on'); document.documentElement.classList.remove('has-panel');
  };
  openers.forEach(b => b.addEventListener('click', () => {
    const was = b.getAttribute('aria-expanded') === 'true';
    close();
    if (was) return;
    const panel = document.getElementById(b.getAttribute('aria-controls'));
    b.setAttribute('aria-expanded', 'true'); panel.classList.add('is-open'); veil.classList.add('is-on'); document.documentElement.classList.add('has-panel');
    const first = panel.querySelector('li a'); if (first) first.focus({ preventScroll: true });
  }));
  veil.addEventListener('click', () => close());
  $$('.dock-close').forEach(b => b.addEventListener('click', () => close(true)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(true); });
  $$('.dock-panel a').forEach(a => a.addEventListener('click', () => close()));

  /* ---------- My trip: the count follows you from page to page ---------- */
  const KEY = 'ceylonways-map-trip-v1';
  const loadTrip = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const paintCount = () => {
    const n = (loadTrip().stops || []).length, a = document.querySelector('[data-my-trip]');
    a.querySelector('[data-trip-count]').textContent = n;
    a.href = a.dataset.root + (n ? 'index.html#map/trip' : 'plan.html');
  };
  paintCount();
  addEventListener('storage', paintCount);
  addEventListener('cw-trip', paintCount);

  /* ---------- The scene answers the page ---------- */
  const scene = document.querySelector('.scene');
  const sheet = document.getElementById('sheet');
  if (scene && sheet) {
    let media = scene.querySelector('.scene-media');
    const note = scene.querySelector('.scene-note');
    const firstNote = note ? note.innerHTML : '';
    const first = media && media.querySelector('img');
    let shown = first ? first.currentSrc || first.src : '';
    // Two pictures take turns, so one can fade over the other.
    const swap = (src, alt, noteHtml) => {
      if (!media || !src || shown.endsWith(src.replace(/^(\.\.\/)+/, ''))) return;
      shown = src;
      const img = new Image(); img.alt = ''; img.className = 'is-out'; img.src = src;
      img.decode().catch(() => {}).then(() => {
        if (shown !== src) return;
        media.appendChild(img);
        requestAnimationFrame(() => requestAnimationFrame(() => { img.classList.remove('is-out'); }));
        setTimeout(() => { while (media.children.length > 1 && media.firstElementChild !== img) media.firstElementChild.remove(); }, 650);
      });
      if (note) note.innerHTML = noteHtml || '';
    };
    const fromEl = el => {
      const fig = el.dataset.fig && document.getElementById(el.dataset.fig);
      swap(el.dataset.scene, el.dataset.sceneAlt, fig ? fig.querySelector('figcaption').innerHTML : '');
    };
    const targets = beside ? $$('[data-scene]', sheet) : [];
    // Reading: the picture changes when a section reaches the middle of the screen.
    const reading = targets.filter(el => !el.classList.contains('row'));
    if (reading.length) {
      const seen = new IntersectionObserver(list => list.forEach(e => { if (e.isIntersecting) fromEl(e.target); }), { rootMargin: '-40% 0px -50% 0px' });
      reading.forEach(el => seen.observe(el));
    }
    // Lists: the picture follows what you point at, or what crosses the middle of a phone screen.
    const rows = targets.filter(el => el.classList.contains('row'));
    if (rows.length) {
      if (hoverable) ['pointerover', 'focusin'].forEach(n => sheet.addEventListener(n, e => { const a = e.target.closest('.row[data-scene]'); if (a) fromEl(a); }));
      else { const seen = new IntersectionObserver(list => list.forEach(e => { if (e.isIntersecting) fromEl(e.target); }), { rootMargin: '-52% 0px -40% 0px' }); rows.forEach(el => seen.observe(el)); }
    }
    // Route maps on the trips pages
    const routes = scene.querySelector('[data-routes]');
    if (routes) {
      const show = slug => $$('[data-route]', routes).forEach(d => { d.hidden = d.dataset.route !== slug; });
      ['pointerover', 'focusin'].forEach(n => sheet.addEventListener(n, e => { const a = e.target.closest('[data-trip]'); if (a) show(a.dataset.trip); }));
    }
    // Districts: the list and the map answer each other
    if (scene.classList.contains('scene-atlas')) {
      const mark = (slug, on) => $$(`[data-d="${slug}"]`).forEach(e => e.classList.toggle('is-on', on));
      ['pointerover', 'focusin'].forEach(n => document.addEventListener(n, e => { const a = e.target.closest('[data-d]'); if (a) mark(a.dataset.d, true); }));
      ['pointerout', 'focusout'].forEach(n => document.addEventListener(n, e => { const a = e.target.closest('[data-d]'); if (a) mark(a.dataset.d, false); }));
    }
    // Places: pointing at a row lights its dot on the island
    const name = scene.querySelector('[data-hub-name]');
    if (name) {
      const mark = (a, on) => { const c = scene.querySelector(`circle[data-p="${a.dataset.p}"]`); if (c) c.classList.toggle('is-on', on); name.textContent = on ? a.dataset.n : ''; };
      ['pointerover', 'focusin'].forEach(n => sheet.addEventListener(n, e => { const a = e.target.closest('a[data-p]'); if (a) mark(a, true); }));
      ['pointerout', 'focusout'].forEach(n => sheet.addEventListener(n, e => { const a = e.target.closest('a[data-p]'); if (a) mark(a, false); }));
    }
    void firstNote;
  }

  /* ---------- Within your budget ---------- */
  const budget = document.querySelector('.budget');
  if (budget) {
    const data = JSON.parse(budget.dataset.budget), root = budget.dataset.root;
    const range = budget.querySelector('input'), out = budget.querySelector('output'), list = budget.querySelector('ul');
    const money = n => 'US$' + n.toLocaleString('en-US');
    const LEVELS = [['luxury', 'luxury stays'], ['boutique', 'boutique stays'], ['simple', 'simple stays']];
    const paint = () => {
      const v = Number(range.value);
      out.textContent = money(v);
      list.innerHTML = data.map(t => {
        const fit = LEVELS.find(([k]) => t.t[k] <= v);
        return fit ? { t, html: `<li><a href="${root}plan.html?package=${t.s}">${t.n}</a><span>${t.d} days with ${fit[1]}, about ${money(t.t[fit[0]])}</span></li>`, ok: 1, c: t.t[fit[0]] }
          : { t, html: `<li class="is-over"><a href="${root}plan.html?package=${t.s}">${t.n}</a><span>Needs about ${money(t.t.simple)}</span></li>`, ok: 0, c: t.t.simple };
      }).sort((a, b) => b.ok - a.ok || a.c - b.c).map(x => x.html).join('');
    };
    range.addEventListener('input', paint);
    paint();
  }

  /* ---------- Add to My Trip from a place page ---------- */
  const tripBtn = document.querySelector('[data-trip-add]');
  if (tripBtn) {
    const note = document.querySelector('[data-trip-status]');
    const paintTrip = () => { const on = (loadTrip().stops || []).includes(tripBtn.dataset.tripAdd); tripBtn.textContent = on ? 'Added. Undo' : 'Add to my trip'; };
    tripBtn.hidden = false; paintTrip();
    tripBtn.addEventListener('click', () => {
      const t = loadTrip(), id = tripBtn.dataset.tripAdd, d = tripBtn.dataset.tripDistrict;
      t.stops = t.stops || []; t.districts = t.districts || [];
      const i = t.stops.indexOf(id);
      if (i < 0) { t.stops.push(id); if (!t.districts.includes(d)) t.districts.push(d); } else t.stops.splice(i, 1);
      try { localStorage.setItem(KEY, JSON.stringify(t)); note.textContent = i < 0 ? `Added. ${t.stops.length} stop${t.stops.length > 1 ? 's' : ''} in My trip on the map.` : 'Removed from My trip.'; } catch (e) { note.textContent = 'This browser blocked saving.'; }
      paintTrip(); paintCount();
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
