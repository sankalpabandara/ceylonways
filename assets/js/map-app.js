/* Ceylonways map. Two stacked MapLibre maps: the island, and a transparent map that
   holds one district cut to its boundary. See spike/matale-lift for the test behind this.
   MapLibre stays pinned at 5.6.0 because of the terrain skirt override below. */
(function () {
  'use strict';
  const stage = document.getElementById('map-stage');
  if (!stage) return;
  const CW = window.CW, E = window.CWEngine;
  const ROOT = new URL(stage.dataset.root || './', location.href).href;
  const asset = p => ROOT + p;
  const tiles = p => ROOT + p; // kept as a plain string so {z}/{x}/{y} stay unescaped
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const isPhone = () => innerWidth <= 720;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const EXAG = 1.5, SKIRT = 80, BOUNDS = [79.4, 5.75, 82.1, 10];
  const IMAGERY = { 'raster-saturation': 0.28, 'raster-contrast': 0.16, 'raster-brightness-max': 1 };
  const TRIP_KEY = 'ceylonways-map-trip-v1';
  const TYPES = { culture: 'Culture and heritage', hiking: 'Hiking and viewpoints', nature: 'Nature', wildlife: 'Wildlife', beach: 'Beaches', food: 'Food and local', sight: 'Local sights', stay: 'Hotels' };
  const CLIMATES = { 'cool-highlands': 'Cool highlands', 'warm-coast': 'Warm coast', 'wet-zone': 'Wet zone nature', 'dry-zone': 'Dry zone landscapes' };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const PACE = { relaxed: 5, balanced: 7, active: 9 };

  let meta = [], districtsGeo = null, places = [], hubs = [], zone = null, routes = null, listed = [], listedReady = null;
  const listedIdx = {};
  let island = null, district = null, simple = null;
  const S = { open: false, mode: 'explore', slug: null, place: null, preview: null, view: 'districts', sheet: 'half', filters: { types: [], climate: [], month: '' }, query: '', lifted: false, busy: false, routeOn: false };
  const trip = Object.assign({ stops: [], districts: [], start: 'airport', days: 7, vehicle: 'car', pace: 'balanced', loop: true, manual: false }, read(TRIP_KEY) || {});
  const loc = { state: 'off', id: null, lat: 0, lon: 0, acc: 0, last: 0, timer: null };

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function saveTrip() { try { localStorage.setItem(TRIP_KEY, JSON.stringify(trip)); } catch (e) { /* private mode */ } }
  const byId = id => listedIdx[id] || places.find(p => p.id === id) || hubs.find(h => h.id === id);
  const stayOn = () => S.hotels || S.filters.types.includes('stay');
  const everything = () => places.concat(listed.filter(l => l.types[0] !== 'stay' || stayOn()));
  function needListings() {
    if (listedReady) return listedReady;
    listedReady = fetch(asset('assets/map/listings.json')).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(rows => {
      listed = rows.map(l => ({ id: l.id, name: l.n, district: l.d, types: [l.t], cat: l.c, lat: l.a, lon: l.o, src: l.s, star: l.star, region: l.region, climate: l.cl, listed: true, visit: 'Time not confirmed', road: l.r ? { anchor: l.r, km: l.k, min: l.m, g: l.g } : null }));
      listed.forEach(l => { listedIdx[l.id] = l; });
      counts();
      if (S.lifted && !simple) drawMarkers();
      if (['districts', 'district', 'filters', 'trip'].includes(S.view) && S.open && (!document.activeElement || document.activeElement.id !== 'm-search')) { const hold = $('m-body').scrollTop; setView(S.view); $('m-body').scrollTop = hold; }
    }).catch(e => { listedReady = null; console.warn(e); });
    return listedReady;
  }
  const dMeta = slug => meta.find(m => m.slug === slug);
  const inDistrict = (p, slug) => p.district === slug || (p.also || []).includes(slug);

  /* ---------- Loader: progress comes from real bytes and real tiles ---------- */
  const loader = $('mask-loader');
  const parts = { lib: 0, data: 0, tiles: 0 };
  let lastMove = Date.now(), watchdog = null, failed = false;
  function bump(k, v) {
    if (v > parts[k]) { parts[k] = v; lastMove = Date.now(); }
    const pct = Math.round((parts.lib * 0.5 + parts.data * 0.2 + parts.tiles * 0.3) * 100);
    const bar = $('mask-bar'); if (bar) { bar.style.width = pct + '%'; loader.setAttribute('aria-valuenow', pct); }
  }
  async function pull(url, key, share, base) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total || res.headers.get('content-encoding')) { const t = await res.text(); bump(key, base + share); return t; }
    const reader = res.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; bump(key, base + share * Math.min(1, got / total)); }
    return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
  }
  function loadScriptText(text) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); const s = document.createElement('script'); s.src = u; s.onload = () => { URL.revokeObjectURL(u); res(); }; s.onerror = rej; document.head.append(s); });
  }
  function status(t) { const e = $('mask-status'); if (e) e.textContent = t; }
  function fail() {
    if (failed) return; failed = true; clearInterval(watchdog);
    loader.classList.add('is-failed'); status("The map didn't load.");
    $('mask-actions').hidden = false;
  }
  function finishLoader() {
    clearInterval(watchdog); bump('tiles', 1);
    loader.classList.add('is-done'); document.body.classList.remove('is-loading');
    setTimeout(() => loader.remove(), reduce ? 200 : 520);
  }
  function startWatch() {
    lastMove = Date.now();
    watchdog = setInterval(() => { const idle = Date.now() - lastMove; if (idle > 20000) fail(); else if (idle > 8000) status('This is taking longer than usual'); }, 1000);
  }

  async function loadData() {
    if (!districtsGeo) {
      const [g, m, d, z] = await Promise.all([pull(asset('assets/map/districts.geojson'), 'data', 0.6, 0), fetch(asset('assets/map/districts-meta.json')).then(r => r.json()), fetch(asset('assets/map/destinations.json')).then(r => r.json()), fetch(asset('assets/map/zone.json')).then(r => r.json())]);
      districtsGeo = JSON.parse(g); meta = m; places = d.places; hubs = d.hubs; zone = z;
    }
    bump('data', 1);
  }

  function canRun3D() {
    if (new URLSearchParams(location.search).get('map') === 'simple') return false;
    try { if (read('ceylonways-simple-map')) return false; } catch (e) { /* ignore */ }
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2')) return false;
    if (navigator.connection && navigator.connection.saveData) return false;
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
    return true;
  }

  async function boot() {
    failed = false; loader.classList.remove('is-failed'); $('mask-actions').hidden = true; status('Loading the island');
    startWatch();
    try {
      if (location.protocol === 'file:') throw new Error('needs a web server');
      if (canRun3D()) {
        if (!window.maplibregl) { const t = await pull(asset('assets/js/vendor/maplibre-gl.js'), 'lib', 1, 0); await loadScriptText(t); }
        bump('lib', 1);
        await loadData();
        renderUI();
        await createMaps();
      } else {
        bump('lib', 1); await loadData(); renderUI(); startSimple();
      }
      finishLoader();
      afterReady();
    } catch (e) { console.error(e); fail(); }
  }
  $('mask-retry').onclick = boot;
  $('mask-simple').onclick = async () => {
    clearInterval(watchdog);
    try { await loadData(); renderUI(); startSimple(); finishLoader(); afterReady(); } catch (e) { status('Please check your connection and try again.'); }
  };

  /* ---------- Maps ---------- */
  const terrain = () => ({ type: 'raster-dem', tiles: [tiles('assets/map/terrain/{z}/{x}/{y}.png')], tileSize: 256, encoding: 'terrarium', minzoom: 6, maxzoom: 11, bounds: BOUNDS });
  const camPad = () => {
    if (!S.open) return isPhone() ? { top: Math.round(innerHeight * 0.56), bottom: 70, left: 10, right: 10 } : { top: 60, bottom: 60, left: Math.round(innerWidth * 0.46), right: 10 };
    return isPhone() ? { top: 70, bottom: 170, left: 10, right: 10 } : { top: 70, bottom: 40, left: 40, right: 460 };
  };
  const islandCam = () => { const c = island.cameraForBounds([[79.55, 5.85], [81.95, 9.9]], { padding: camPad(), pitch: S.open ? 45 : 30, bearing: 0 }); return { center: c.center, zoom: c.zoom, pitch: S.open ? 45 : 30, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } }; };

  function createMaps() {
    return new Promise((resolve, reject) => {
      const opts = { attributionControl: false, center: [80.7, 7.8], zoom: 6.6, pitch: 30, maxZoom: 12.5, minZoom: 5.5, maxPitch: 70, canvasContextAttributes: { antialias: true } };
      island = new maplibregl.Map(Object.assign({ container: 'm-island', style: {
        version: 8,
        sources: {
          sat: { type: 'raster', tiles: [tiles('assets/map/island/{z}/{x}/{y}.webp')], tileSize: 256, minzoom: 6, maxzoom: 10, bounds: BOUNDS },
          dem: terrain(), districts: { type: 'geojson', data: districtsGeo, promoteId: 'slug' },
          route: { type: 'geojson', lineMetrics: true, data: { type: 'FeatureCollection', features: [] } },
          pulse: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          loc: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
        },
        terrain: { source: 'dem', exaggeration: EXAG },
        layers: [
          { id: 'sat', type: 'raster', source: 'sat', paint: IMAGERY },
          { id: 'dim', type: 'fill', source: 'districts', paint: { 'fill-color': '#060C0A', 'fill-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.62, 0] } },
          { id: 'picked', type: 'fill', source: 'districts', paint: { 'fill-color': '#BED180', 'fill-opacity': ['case', ['boolean', ['feature-state', 'picked'], false], 0.3, 0] } },
          { id: 'lines', type: 'line', source: 'districts', paint: { 'line-color': 'rgba(243,245,233,.5)', 'line-width': 0.8 } },
          { id: 'hot', type: 'line', source: 'districts', filter: ['==', ['get', 'slug'], ''], paint: { 'line-color': '#BED180', 'line-width': 2.6 } },
          { id: 'gap', type: 'fill', source: 'districts', filter: ['==', ['get', 'slug'], ''], paint: { 'fill-color': '#050A08', 'fill-opacity': 0.92 } },
          { id: 'route-halo', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF2BD6', 'line-width': 18, 'line-blur': 13, 'line-opacity': 0.4 } },
          { id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF2BD6', 'line-width': 7, 'line-blur': 4, 'line-opacity': 0.8 } },
          { id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF6FE6', 'line-width': 2.6 } },
          { id: 'pulse-glow', type: 'line', source: 'pulse', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF9BEF', 'line-width': 10, 'line-blur': 6 } },
          { id: 'pulse', type: 'line', source: 'pulse', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFF1FC', 'line-width': 3 } },
          { id: 'loc-circle', type: 'fill', source: 'loc', paint: { 'fill-color': '#2F9BFF', 'fill-opacity': 0.16 } }
        ]
      } }, opts));
      district = new maplibregl.Map(Object.assign({ container: 'm-district', style: {
        version: 8,
        sources: { dem: terrain(), districts: { type: 'geojson', data: districtsGeo }, loc: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
        terrain: { source: 'dem', exaggeration: EXAG },
        layers: [
          { id: 'edge', type: 'line', source: 'districts', filter: ['==', ['get', 'slug'], ''], paint: { 'line-color': '#BED180', 'line-width': 2 } },
          { id: 'loc-circle', type: 'fill', source: 'loc', paint: { 'fill-color': '#2F9BFF', 'fill-opacity': 0.16 } }
        ]
      } }, Object.assign({}, opts, { maxZoom: 14 })));
      [island, district].forEach(m => { m.on('error', e => { if (e.error && /Failed to fetch|Load failed|NetworkError/.test(e.error.message)) console.warn(e.error.message); }); });
      let first = 0;
      const seen = new Set();
      island.on('dataloading', e => { if (e.tile) seen.add(e.tile.tileID.key); });
      island.on('data', () => { if (seen.size) { const done = [...seen].length ? island.areTilesLoaded() : false; bump('tiles', done ? 1 : Math.min(0.9, (parts.tiles || 0) + 0.05)); } });
      const go = () => { if (++first < 2) return;
        [island, district].forEach(m => { m.terrain.getMeshFrameDelta = () => SKIRT; }); // short skirts: see spike/matale-lift/README.md
        setCompactGestures(true);
        island.jumpTo(islandCam()); district.jumpTo(islandCam());
        island.once('idle', resolve);
        setTimeout(resolve, 15000);
      };
      island.once('load', go); district.once('load', go);
      island.on('mousemove', 'dim', e => { if (!S.open || S.lifted || isPhone()) return; const f = e.features[0]; hover(f.properties.slug, e.point); });
      island.on('mouseleave', 'dim', () => { if (!S.preview) hotLine(''); $('m-tip').hidden = true; });
      island.on('click', e => {
        if (!S.open) return expand();
        if (S.lifted) return;
        const f = island.queryRenderedFeatures(e.point, { layers: ['dim'] })[0];
        if (f) pickDistrict(f.properties.slug, e.point);
      });
      addEventListener('resize', () => { if (!island) return; island.resize(); district.resize(); if (!S.lifted && !S.routeOn) island.jumpTo(islandCam()); });
      window.__map = { island, district, S, trip, listedCount: () => listed.length, anyListedName: () => listed.find(l => l.types[0] !== 'stay' && /^[A-Za-z ]+$/.test(l.name)).name, nameOf: id => byId(id).name };
    });
  }

  function setCompactGestures(compact) {
    [island].forEach(m => {
      const h = ['dragPan', 'scrollZoom', 'touchZoomRotate', 'dragRotate', 'doubleClickZoom', 'keyboard'];
      h.forEach(k => (compact ? m[k].disable() : m[k].enable()));
    });
  }

  const hotLine = slug => { if (island) island.setFilter('hot', ['==', ['get', 'slug'], slug]); };
  function hover(slug, pt) {
    hotLine(slug);
    const m = dMeta(slug), n = places.filter(p => inDistrict(p, slug));
    const tip = $('m-tip'); tip.hidden = false;
    tip.innerHTML = `<strong>${esc(m.name)}</strong><span>${n.length ? esc(n.slice(0, 2).map(p => p.name).join(', ')) : 'Places coming soon'}</span>`;
    tip.style.transform = `translate(${Math.min(pt.x + 16, innerWidth - 260)}px, ${pt.y + 16}px)`;
  }

  function pickDistrict(slug, pt) {
    if (S.mode === 'plan') return toggleTripDistrict(slug);
    if (isPhone() && S.preview !== slug) { // first tap selects, so a stray tap cannot start the lift
      S.preview = slug; hotLine(slug); preload(slug);
      const m = dMeta(slug), n = places.filter(p => inDistrict(p, slug)).length;
      setView('preview'); announce(`${m.name} selected. ${n} places.`);
      return;
    }
    lift(slug);
  }

  /* District layer: imagery cut to the boundary, loaded when needed */
  let loaded = null;
  function preload(slug) {
    if (loaded === slug || !district) return;
    if (district.getLayer('cut')) district.removeLayer('cut');
    if (district.getSource('cut')) district.removeSource('cut');
    const m = dMeta(slug);
    district.addSource('cut', { type: 'raster', tiles: [tiles(`assets/map/d/${slug}/{z}/{x}/{y}.webp`)], tileSize: 256, minzoom: 6, maxzoom: 13, bounds: m.bbox });
    district.addLayer({ id: 'cut', type: 'raster', source: 'cut', paint: IMAGERY }, 'edge');
    loaded = slug;
  }
  const idle = (m, ms) => new Promise(r => { if (m.loaded() && m.areTilesLoaded()) return r(); const t = setTimeout(r, ms); m.once('idle', () => { clearTimeout(t); r(); }); });

  async function lift(slug, placeId) {
    if (S.busy) return;
    if (simple) { S.slug = slug; S.lifted = true; simple.district(slug); afterLift(placeId); return; }
    if (S.lifted && S.slug === slug) { if (placeId) openPlace(placeId); return; }
    S.busy = true;
    if (S.lifted) await unlift(true);
    clearRoute(false);
    S.slug = slug; S.preview = null;
    preload(slug);
    const c = island.getCenter(), cam = { center: c, zoom: island.getZoom(), pitch: island.getPitch(), bearing: island.getBearing() };
    S.cam = cam;
    district.jumpTo(cam);
    await idle(district, 1500);
    stage.classList.add('is-show-district');
    island.setFilter('gap', ['==', ['get', 'slug'], slug]);
    district.setFilter('edge', ['==', ['get', 'slug'], slug]);
    hotLine('');
    stage.classList.add('is-lifted');
    const m = dMeta(slug);
    const pad = isPhone() ? { top: 80, bottom: Math.round(innerHeight * 0.48), left: 24, right: 24 } : { top: 90, bottom: 60, left: 80, right: 480 };
    const fit = district.cameraForBounds([[m.bbox[0], m.bbox[1]], [m.bbox[2], m.bbox[3]]], { padding: pad, pitch: 50, bearing: -14 });
    const target = { center: fit.center, zoom: Math.min(fit.zoom, 12), pitch: 50, bearing: -14 };
    if (reduce) { district.jumpTo(target); }
    else await new Promise(r => { district.once('moveend', r); district.easeTo(Object.assign({}, target, { duration: 1200, easing: t => 1 - Math.pow(1 - t, 3) })); });
    stage.classList.add('is-interactive');
    S.lifted = true; S.busy = false;
    afterLift(placeId);
  }
  function afterLift(placeId) {
    drawMarkers();
    if (placeId) openPlace(placeId); else setView('district');
    syncUrl(); syncLoc();
    const n = everything().filter(p => inDistrict(p, S.slug)).length;
    announce(`${dMeta(S.slug).name} selected. ${n} places.`);
  }
  async function unlift(keepBusy) {
    if (simple) { S.lifted = false; S.slug = null; S.place = null; simple.island(); setView('districts'); syncUrl(); return; }
    if (!S.lifted) return;
    S.busy = true; clearMarkers();
    if (isPhone()) S.sheet = 'peek';
    stage.classList.remove('is-interactive', 'is-lifted');
    if (reduce) district.jumpTo(S.cam);
    else await new Promise(r => { district.once('moveend', r); district.easeTo(Object.assign({}, S.cam, { duration: 900, easing: t => 1 - Math.pow(1 - t, 3) })); });
    await wait(40);
    stage.classList.remove('is-show-district');
    island.setFilter('gap', ['==', ['get', 'slug'], '']);
    district.setFilter('edge', ['==', ['get', 'slug'], '']);
    S.lifted = false; S.place = null; S.slug = null;
    if (!keepBusy) { S.busy = false; setView('districts'); syncUrl(); syncLoc(); $('m-back').focus(); liveRoute(); }
  }

  function expand(view) {
    if (S.open) return;
    S.open = true; scrollTo(0, 0); needListings();
    document.body.classList.add('map-open'); stage.classList.remove('is-compact'); stage.classList.add('is-open');
    if (island) { setCompactGestures(false); stopDrift(); const c = islandCam(); reduce ? island.jumpTo(c) : island.easeTo(Object.assign({}, c, { duration: 900 })); }
    if (isPhone()) S.sheet = 'peek';
    setView(view || 'districts');
    syncUrl();
    $('m-close').focus();
  }
  async function collapse() {
    if (S.lifted) await unlift();
    S.open = false; clearRoute(false); drawn = [];
    document.body.classList.remove('map-open'); stage.classList.add('is-compact'); stage.classList.remove('is-open');
    if (island) { setCompactGestures(true); const c = islandCam(); reduce ? island.jumpTo(c) : island.easeTo(Object.assign({}, c, { duration: 700 })); startDrift(); }
    syncUrl();
    const b = $('m-explore'); if (b) b.focus();
  }

  /* Slow turn of the compact island */
  let drifting = false, driftDir = 1;
  function startDrift() {
    if (reduce || !island || drifting || S.open) return; drifting = true;
    const step = () => { if (!drifting || S.open) return; driftDir *= -1; island.easeTo({ bearing: 3 * driftDir, duration: 9000, easing: t => t }); };
    island.on('moveend', step); island._drift = step; step();
  }
  function stopDrift() { drifting = false; if (island && island._drift) { island.off('moveend', island._drift); island.stop(); } }

  /* ---------- Markers, grouped by screen distance ---------- */
  let markers = [];
  function clearMarkers() { markers.forEach(m => m.remove()); markers = []; if (district) district.off('moveend', drawMarkers); }
  const matches = p => {
    const f = S.filters;
    if (f.types.length && !p.types.some(t => f.types.includes(t)) && !(S.hotels && p.types[0] === 'stay')) return false;
    if (f.climate.length && !f.climate.includes(p.climate)) return false;
    if (f.month !== '' && p.region && CW.seasons[p.region][Number(f.month)] === 'wet') return false;
    return true;
  };
  function drawMarkers() {
    if (simple) return simple.markers();
    markers.forEach(m => m.remove()); markers = [];
    district.off('moveend', drawMarkers); district.on('moveend', drawMarkers);
    const list = places.filter(p => p.district === S.slug);
    const pts = list.map(p => ({ p, xy: district.project([p.lon, p.lat]) }));
    const groups = [];
    pts.forEach(o => { const g = groups.find(g => Math.hypot(g[0].xy.x - o.xy.x, g[0].xy.y - o.xy.y) < 48); g ? g.push(o) : groups.push([o]); });
    drawListed();
    groups.forEach(g => {
      const el = document.createElement('button'); el.type = 'button';
      if (g.length > 1) {
        el.className = 'm-pin m-cluster'; el.textContent = g.length; el.setAttribute('aria-label', `${g.length} places: ${g.map(o => o.p.name).join(', ')}`);
        el.onclick = () => { const b = new maplibregl.LngLatBounds(); g.forEach(o => b.extend([o.p.lon, o.p.lat])); const zoomed = district.getZoom() >= 12.8; if (zoomed) setView('district'); else district.fitBounds(b, { padding: 160, maxZoom: 13, pitch: 50, bearing: district.getBearing(), duration: reduce ? 0 : 800 }); };
      } else {
        const p = g[0].p; el.className = `m-pin m-t-${p.types[0]}${matches(p) ? '' : ' is-faded'}${S.place === p.id ? ' is-on' : ''}`;
        el.innerHTML = `<i aria-hidden="true"></i><span>${esc(p.name)}</span>`;
        el.setAttribute('aria-label', `${p.name}. ${TYPES[p.types[0]]}`);
        el.onclick = () => openPlace(p.id);
      }
      const lng = [g[0].p.lon, g[0].p.lat];
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lng).addTo(district));
    });
  }

  /* Listed places: small dots that group until you zoom in */
  function drawListed() {
    const box = district.getCanvas().getBoundingClientRect(), z = district.getZoom(), groups = [];
    listed.filter(l => l.district === S.slug && (l.types[0] !== 'stay' || stayOn()) && matches(l)).forEach(l => {
      const xy = district.project([l.lon, l.lat]);
      if (xy.x < -40 || xy.y < -40 || xy.x > box.width + 40 || xy.y > box.height + 40) return;
      const g = groups.find(g => Math.hypot(g[0].xy.x - xy.x, g[0].xy.y - xy.y) < 40);
      g ? g.push({ p: l, xy }) : groups.push([{ p: l, xy }]);
    });
    groups.forEach(g => {
      const el = document.createElement('button'); el.type = 'button';
      if (g.length > 1) {
        el.className = 'm-group'; el.textContent = g.length; el.setAttribute('aria-label', `${g.length} listed places`);
        el.onclick = () => {
          if (district.getZoom() >= 12.6) { S.cluster = g.map(o => o.p.id); return setView('cluster'); }
          const b = new maplibregl.LngLatBounds(); g.forEach(o => b.extend([o.p.lon, o.p.lat]));
          district.fitBounds(b, { padding: isPhone() ? { top: 90, bottom: 340, left: 50, right: 50 } : { top: 120, bottom: 120, left: 120, right: 520 }, maxZoom: 13, pitch: 50, bearing: district.getBearing(), duration: reduce ? 0 : 700 });
        };
      } else {
        const p = g[0].p; el.className = `m-dot m-t-${p.types[0]}${S.place === p.id ? ' is-on' : ''}${z >= 11.2 ? ' has-name' : ''}`;
        el.innerHTML = `<i aria-hidden="true"></i><span>${esc(p.name)}</span>`; el.setAttribute('aria-label', `${p.name}. ${p.cat}. Listed place`);
        el.onclick = () => openPlace(p.id);
      }
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([g[0].p.lon, g[0].p.lat]).addTo(district));
    });
  }

  /* ---------- UI shell ---------- */
  let uiDone = false;
  function renderUI() {
    if (uiDone) return; uiDone = true;
    $('map-ui').innerHTML = `
      <div class="m-top">
        <button type="button" class="m-btn" id="m-close">Close map</button>
        <button type="button" class="m-btn m-back" id="m-back" hidden>Back to Sri Lanka</button>
        <div class="m-mode" role="group" aria-label="Map mode"><button type="button" id="m-explore-mode" aria-pressed="true">Explore</button><button type="button" id="m-plan-mode" aria-pressed="false">Plan My Trip</button></div>
      </div>
      <div class="m-bar" role="toolbar" aria-label="Map tools">
        <button type="button" class="m-btn" data-view="districts">Districts</button>
        <button type="button" class="m-btn" data-view="filters">Filters<span id="m-fcount"></span></button>
        <button type="button" class="m-btn" data-view="trip">My Trip <span class="m-count" id="m-tcount">0</span></button>
        <button type="button" class="m-btn" data-view="location">My location</button>
      </div>
      <div class="m-tip" id="m-tip" hidden></div>
      <section class="m-sheet" id="m-sheet" aria-label="Map details"><button type="button" class="m-grab" id="m-grab" aria-label="Change panel height"><i></i></button><div class="m-body" id="m-body" tabindex="-1"></div></section>
      <div class="m-toast" id="m-toast" role="status" aria-live="polite"></div>
      <p class="m-credit">Imagery: Sentinel-2 cloudless 2016 by EOX, CC BY 4.0, Copernicus Sentinel data. Elevation: Copernicus DEM GLO-30. Roads: © OpenStreetMap contributors, ODbL. Boundaries: geoBoundaries.</p>`;
    $('m-close').onclick = collapse; $('m-back').onclick = () => unlift();
    $('m-explore-mode').onclick = () => setMode('explore'); $('m-plan-mode').onclick = () => setMode('plan');
    document.querySelectorAll('.m-bar [data-view]').forEach(b => { b.onclick = () => { if (S.sheet === 'peek') S.sheet = 'half'; setView(b.dataset.view); }; });
    $('m-grab').onclick = () => { S.sheet = S.sheet === 'peek' ? 'half' : S.sheet === 'half' ? 'full' : 'peek'; paintSheet(); };
    grabDrag();
    $('m-body').addEventListener('click', onPanelClick); $('m-body').addEventListener('input', onPanelInput); $('m-body').addEventListener('change', onPanelChange);
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !S.open) return;
      if (S.place) { S.place = null; setView('district'); syncUrl(); } else if (S.lifted) unlift(); else collapse();
    });
    addEventListener('popstate', routeFromUrl); addEventListener('hashchange', routeFromUrl);
    counts();
  }
  function grabDrag() {
    const g = $('m-grab'); let y0 = null;
    g.addEventListener('pointerdown', e => { y0 = e.clientY; });
    g.addEventListener('pointerup', e => { if (y0 === null) return; const d = e.clientY - y0; y0 = null; if (Math.abs(d) < 24) return; const o = ['peek', 'half', 'full'], i = o.indexOf(S.sheet); S.sheet = o[Math.max(0, Math.min(2, i + (d < 0 ? 1 : -1)))]; paintSheet(); e.preventDefault(); });
  }
  function paintSheet() { const s = $('m-sheet'); s.dataset.h = S.sheet; }
  function announce(t) { const e = $('m-toast'); e.textContent = t; e.classList.add('show'); clearTimeout(announce.t); announce.t = setTimeout(() => e.classList.remove('show'), 2600); }
  function counts() {
    const t = $('m-tcount'); if (t) t.textContent = trip.stops.length;
    const n = S.filters.types.length + S.filters.climate.length + (S.filters.month !== '' ? 1 : 0);
    const f = $('m-fcount'); if (f) f.textContent = n ? ` (${n})` : '';
    if (island) meta.forEach(m => island.setFeatureState({ source: 'districts', id: m.slug }, { picked: trip.districts.includes(m.slug), dim: n > 0 && !everything().some(p => inDistrict(p, m.slug) && matches(p)) }));
  }
  function setMode(m) {
    S.mode = m; $('m-explore-mode').setAttribute('aria-pressed', m === 'explore'); $('m-plan-mode').setAttribute('aria-pressed', m === 'plan');
    if (m === 'plan') { setView('trip'); announce('Tap districts to add them to your trip.'); } else setView(S.lifted ? 'district' : 'districts');
  }

  function setView(v) {
    S.view = v;
    if (v !== 'place') S.place = S.place && v === 'place' ? S.place : null;
    $('m-back').hidden = !S.lifted; $('m-close').hidden = S.lifted;
    if (isPhone() && S.sheet === 'peek' && v !== 'districts') S.sheet = 'half';
    paintSheet();
    document.querySelectorAll('.m-bar [data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === v ? 'true' : 'false'));
    const body = $('m-body');
    body.innerHTML = ({ districts: viewDistricts, preview: viewPreview, district: viewDistrict, place: viewPlace, filters: viewFilters, trip: viewTrip, location: viewLocation, cluster: viewCluster })[v]();
    body.scrollTop = 0;
    if (v === 'trip' && !S.routeOn) liveRoute();
  }

  const placeRow = p => `<li><button type="button" class="m-row${matches(p) ? '' : ' is-faded'}" data-place="${p.id}"><strong>${esc(p.name)}</strong><span>${esc(TYPES[p.types[0]])} · ${esc(p.visit)}</span></button></li>`;
  function viewDistricts() {
    const q = S.query.trim().toLowerCase();
    const ds = meta.filter(m => !q || m.name.toLowerCase().includes(q));
    const ps = q.length > 1 ? places.concat(listed).filter(p => p.name.toLowerCase().includes(q)).slice(0, 30) : [];
    const anyF = S.filters.types.length || S.filters.climate.length || S.filters.month !== '';
    return `<h2>Choose a district</h2>
      <label class="m-field"><span class="visually-hidden">Search districts and places</span><input id="m-search" type="search" placeholder="Search districts and places" value="${esc(S.query)}" autocomplete="off"></label>
      ${ps.length ? `<ul class="m-list">${ps.map(p => `<li><button type="button" class="m-row" data-place="${p.id}" data-district="${p.district}"><strong>${esc(p.name)}</strong><span>In ${esc(dMeta(p.district).name)} District</span></button></li>`).join('')}</ul>` : ''}
      <ul class="m-list">${ds.map(m => { const all = everything().filter(p => inDistrict(p, m.slug)); const hit = all.filter(matches).length; return `<li><button type="button" class="m-row" data-district="${m.slug}"><strong>${esc(m.name)}</strong><span>${all.length ? (anyF ? `${hit} of ${all.length} places match` : `${all.length} place${all.length > 1 ? 's' : ''}`) : 'Places coming soon'}</span></button></li>`; }).join('')}</ul>
      ${!ds.length && !ps.length ? '<p class="m-note">No district or place has that name.</p>' : ''}`;
  }
  function viewPreview() {
    const m = dMeta(S.preview), n = places.filter(p => inDistrict(p, S.preview)).length;
    return `<h2>${esc(m.name)}</h2><p class="m-note">${n ? `${n} place${n > 1 ? 's' : ''} to explore.` : 'We are still adding places here.'}</p><button type="button" class="button button-moss" data-district="${m.slug}" data-go="1">Explore ${esc(m.name)}</button>`;
  }
  function viewDistrict() {
    const m = dMeta(S.slug), all = places.filter(p => p.district === S.slug), shared = places.filter(p => p.district !== S.slug && inDistrict(p, S.slug));
    const near = !all.length ? meta.slice().sort((a, b) => dist(a.center, m.center) - dist(b.center, m.center)).filter(x => x.slug !== m.slug && places.some(p => inDistrict(p, x.slug))).slice(0, 3) : [];
    const groups = Object.keys(TYPES).map(t => [t, all.filter(p => p.types[0] === t)]).filter(g => g[1].length);
    const mine = listed.filter(l => l.district === S.slug), more = mine.filter(l => l.types[0] !== 'stay'), hotels = mine.filter(l => l.types[0] === 'stay');
    const cats = [...new Set(more.map(l => l.cat))].sort().map(c => [c, more.filter(l => l.cat === c)]);
    return `<p class="eyebrow">District</p><h2>${esc(m.name)}</h2><p><a class="m-link" href="${asset('districts/' + m.slug + '.html')}">Read the ${esc(m.name)} guide</a></p>
      ${all.length ? groups.map(([t, l]) => `<h3>${esc(TYPES[t])}</h3><ul class="m-list">${l.map(placeRow).join('')}</ul>`).join('') : more.length ? `<p class="m-note">We haven't written full guides for ${esc(m.name)} yet.</p>` : `<p class="m-note">We're still adding places in ${esc(m.name)}.</p><h3>Nearby districts</h3><ul class="m-list">${near.map(x => `<li><button type="button" class="m-row" data-district="${x.slug}"><strong>${esc(x.name)}</strong></button></li>`).join('')}</ul>`}
      ${more.length ? `<h3>More places to explore</h3><p class="m-note">Listed places, not yet checked by us. Zoom in to see them all.</p>${cats.map(([c, l]) => `<details class="m-more"><summary>${esc(c)} (${l.length})</summary><ul class="m-list">${l.map(listedRow).join('')}</ul></details>`).join('')}` : ''}
      ${hotels.length ? `<h3>Hotels</h3><button type="button" class="button button-ghost button-sm" data-hotels="1">${S.hotels ? 'Hide hotels on the map' : `Show ${hotels.length} hotels on the map`}</button><details class="m-more"><summary>All hotels (${hotels.length})</summary><ul class="m-list">${hotels.map(listedRow).join('')}</ul></details>` : ''}
      ${shared.length ? `<h3>Shared with nearby districts</h3><ul class="m-list">${shared.map(p => `<li><button type="button" class="m-row" data-place="${p.id}"><strong>${esc(p.name)}</strong><span>Mostly in ${esc(dMeta(p.district).name)}</span></button></li>`).join('')}</ul>` : ''}`;
  }
  const listedRow = p => `<li><button type="button" class="m-row" data-place="${p.id}" data-district="${p.district}"><strong>${esc(p.name)}</strong></button></li>`;
  function viewCluster() { return `<button type="button" class="m-link" data-view-go="district">All places in ${esc(dMeta(S.slug).name)}</button><h2>Places here</h2><ul class="m-list">${S.cluster.map(byId).map(listedRow).join('')}</ul>`; }
  function viewListed(p) {
    const hotel = p.types[0] === 'stay', water = /Waterfall|Lake|Pond|Beach/.test(p.cat), added = trip.stops.includes(p.id), a = p.road && byId(p.road.anchor);
    return `<button type="button" class="m-link" data-view-go="${S.lifted ? 'district' : 'districts'}">All places in ${esc(dMeta(p.district).name)}</button>
      <p class="eyebrow">${esc(p.cat)} · Listed place</p><h2>${esc(p.name)}</h2><p class="m-sub">${esc(dMeta(p.district).name)} District</p>
      <div class="m-actions">${!hotel && p.road ? `<button type="button" class="button button-moss" data-add="${p.id}">${added ? 'Added. Undo' : 'Add to My Trip'}</button>` : ''}<a class="button button-ghost" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank" rel="noopener">Get Directions</a></div>
      <p class="m-hint">Not checked by us. Access, opening hours, fees and conditions are not confirmed, so ask locally before you go.</p>
      ${water ? '<p class="m-note">This listing does not mean swimming or boating is safe or allowed here.</p>' : ''}
      ${hotel ? `<dl class="m-dl"><div><dt>Official class</dt><dd>${p.star ? esc(p.star) + ' star class, Sri Lanka Tourism directory' : 'Not on record here'}</dd></div><div><dt>Rates and rooms</dt><dd>Not checked</dd></div></dl><p class="m-note">Not a Ceylonways partner. The planner's prices use sample stays, not this hotel.</p>` : ''}
      ${a ? `<h3>Getting there</h3><p>About ${Math.round(p.road.km)} km by road from <button type="button" class="m-inline" data-place="${a.id}" ${a.hub ? 'disabled' : ''}>${esc(a.name)}</button>, around ${fmtMin(p.road.min)}.</p>` : ''}
      <p class="m-source">Location ${p.src === 'osm' ? 'matches OpenStreetMap' : 'comes from an online map search'}. Listed ${esc('5 November 2026')}.</p>`;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const km = (a, b) => { const p = Math.PI / 180, x = Math.sin((b.lat - a.lat) * p / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin((b.lon - a.lon) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const fmtMin = m => { const h = Math.floor(m / 60), r = Math.round(m % 60 / 5) * 5; return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };
  const spur = id => { const p = byId(id); return p && p.listed ? p.road : null; };
  const mainLeg = (a, b) => (a === b ? { km: 0, min: 0 } : routes[`${a}|${b}`] || routes[`${b}|${a}`] || null);
  // A listed place joins the route through its road link to the closest guide place.
  const leg = (a, b) => {
    if (!routes) return null;
    const ra = spur(a), rb = spur(b), mid = mainLeg(ra ? ra.anchor : a, rb ? rb.anchor : b);
    return mid && { km: mid.km + (ra ? ra.km : 0) + (rb ? rb.km : 0), min: mid.min + (ra ? ra.min : 0) + (rb ? rb.min : 0) };
  };
  const legLine = (a, b) => {
    const ra = spur(a), rb = spur(b), A = ra ? ra.anchor : a, B = rb ? rb.anchor : b;
    let mid = [];
    if (A !== B) { const f = routes[`${A}|${B}`]; mid = decode((f || routes[`${B}|${A}`]).g); if (!f) mid.reverse(); }
    return [...(ra ? decode(ra.g).reverse() : []), ...mid, ...(rb ? decode(rb.g) : [])];
  };

  function viewPlace() {
    const p = byId(S.place), added = trip.stops.includes(p.id);
    if (p.listed) return viewListed(p);
    const acts = (p.activities || []).map(id => E.actById[id]).filter(Boolean);
    const nearby = places.filter(x => x.id !== p.id).map(x => ({ x, d: km(p, x) })).sort((a, b) => a.d - b.d).slice(0, 3);
    const pk = CW.packages.filter(k => k.stops.some(s => s.acts.some(a => (p.activities || []).includes(a))));
    const month = S.filters.month !== '' ? Number(S.filters.month) : new Date().getMonth();
    const seas = { good: 'Usually good', mixed: 'Mixed', wet: 'Often wet' }[CW.seasons[p.region][month]];
    return `<button type="button" class="m-link" data-view-go="${S.lifted ? 'district' : 'districts'}">All places in ${esc(dMeta(p.district).name)}</button>
      <p class="eyebrow">${esc(p.types.map(t => TYPES[t]).join(' · '))}</p><h2>${esc(p.name)}</h2>
      <p class="m-sub">${esc(dMeta(p.district).name)} District${(p.also || []).length ? `, also in ${esc(p.also.map(a => dMeta(a).name).join(', '))}` : ''}</p>
      <div class="m-actions"><button type="button" class="button button-moss" data-add="${p.id}">${added ? 'Added. Undo' : 'Add to My Trip'}</button>${pk.length ? `<a class="button button-ghost" href="#m-pk-${p.id}">View Packages</a>` : ''}<a class="button button-ghost" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank" rel="noopener">Get Directions</a></div>
      <p>${esc(p.overview)}</p><p class="m-why"><strong>Why go.</strong> ${esc(p.why)}</p>
      ${acts.length ? `<h3>Things to do</h3><ul class="m-facts">${acts.map(a => `<li><strong>${esc(a.name)}</strong><span>${a.hours} h · ${esc(a.when)}${a.adult ? ` · about ${E.money(a.adult, 'USD')} per adult, sample price` : ' · free'}</span></li>`).join('')}</ul>` : ''}
      <h3>Getting there</h3><p>${esc(p.access)}</p>
      <h3>Plan your visit</h3><dl class="m-dl"><div><dt>Suggested time</dt><dd>${esc(p.visit)}</dd></div><div><dt>Opening hours</dt><dd>Not confirmed yet</dd></div><div><dt>Entry fees</dt><dd>Not confirmed yet</dd></div><div><dt>${esc(MONTHS[month])}</dt><dd>${seas}. Typical conditions, not a forecast.</dd></div></dl>
      <h3>Good to know</h3><dl class="m-dl"><div><dt>Walking</dt><dd>${esc(p.walk)}</dd></div><div><dt>What to wear</dt><dd>${esc(p.dress)}</dd></div><div><dt>Accessibility, facilities</dt><dd>Not confirmed yet</dd></div></dl>
      <h3>Nearby</h3><ul class="m-list">${nearby.map(n => `<li><button type="button" class="m-row" data-place="${n.x.id}" data-district="${n.x.district}"><strong>${esc(n.x.name)}</strong><span>About ${Math.round(n.d)} km away in a straight line</span></button></li>`).join('')}</ul>
      ${pk.length ? `<h3 id="m-pk-${p.id}">Packages that stop here</h3><ul class="m-list">${pk.map(k => `<li><a class="m-row" href="${asset('packages/' + k.slug + '.html')}"><strong>${esc(k.name)}</strong><span>${k.days} days. Sample price. Availability not checked.</span></a></li>`).join('')}</ul>` : ''}
      <p><a class="m-link" href="${asset('places/' + p.id + '.html')}">Read the full guide to ${esc(p.name)}</a></p>
      <p class="m-source">Location checked against the district boundary, not yet on site. Details written ${esc(CW.config.sampleDate)}. Check hours and fees before you go.</p>`;
  }
  function openPlace(id, fromList) {
    const p = byId(id); S.place = id;
    if (!S.lifted || p.district !== S.slug) return lift(p.district, id);
    S.view = 'place'; const hold = S.place; setView('place'); S.place = hold;
    if (!simple) {
      if (!reduce) district.easeTo({ center: [p.lon, p.lat], zoom: Math.max(district.getZoom(), 10.4), offset: isPhone() ? [0, -Math.round(innerHeight * 0.2)] : [-200, 0], duration: 700 });
      drawMarkers();
    } else simple.markers();
    syncUrl();
    if (!fromList) $('m-body').focus({ preventScroll: true });
  }

  function viewFilters() {
    const f = S.filters, chip = (group, k, l) => `<button type="button" class="chip-btn" data-filter-group="${group}" data-filter-key="${k}" aria-pressed="${f[group].includes(k)}">${esc(l)}</button>`;
    const every = everything(), hit = every.filter(matches).length;
    return `<h2>Filters</h2><p class="m-note">${hit} of ${every.length} places match.${hit ? '' : ' Try removing a filter.'}</p>
      <h3>Climate</h3><div class="m-chips">${Object.entries(CLIMATES).map(([k, l]) => chip('climate', k, l)).join('')}</div>
      <h3>Experience</h3><div class="m-chips">${Object.entries(TYPES).map(([k, l]) => chip('types', k, l)).join('')}</div>
      <h3>Travel month</h3><label class="m-field"><span class="visually-hidden">Travel month</span><select id="m-month"><option value="">Any month</option>${MONTHS.map((m, i) => `<option value="${i}"${String(i) === String(f.month) ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <p class="m-note">Month shows typical conditions by local climate, not live weather. Districts with no match go dark but stay selectable.</p>
      <button type="button" class="button button-ghost" data-clear-filters="1">Clear filters</button>`;
  }

  /* ---------- Trip ---------- */
  async function needRoutes() { if (!routes) routes = await (await fetch(asset('assets/map/routes.json'))).json(); }
  function toggleTripDistrict(slug) {
    const i = trip.districts.indexOf(slug);
    i < 0 ? trip.districts.push(slug) : trip.districts.splice(i, 1);
    saveTrip(); counts(); announce(`${dMeta(slug).name} ${i < 0 ? 'added' : 'removed'}.`);
    if (S.view === 'trip') setView('trip');
  }
  function toggleStop(id) {
    const i = trip.stops.indexOf(id), p = byId(id);
    if (i < 0) { trip.stops.push(id); if (!trip.districts.includes(p.district)) trip.districts.push(p.district); } else trip.stops.splice(i, 1);
    saveTrip(); counts(); clearRoute(false);
    announce(i < 0 ? `${p.name} added to My Trip.` : `${p.name} removed.`);
    if (S.view === 'place' || S.view === 'trip') { const hold = S.place; setView(S.view); S.place = hold; }
    liveRoute();
  }
  function viewTrip() {
    const stops = trip.stops.map(byId).filter(Boolean);
    const empty = trip.districts.filter(d => !stops.some(s => s.district === d));
    const starts = [...hubs, ...places].map(o => `<option value="${o.id}"${o.id === trip.start ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
    return `<h2>My Trip</h2>
      ${trip.districts.length ? `<p class="m-note">${trip.districts.length} district${trip.districts.length > 1 ? 's' : ''}, ${stops.length} stop${stops.length === 1 ? '' : 's'}: ${esc(trip.districts.map(d => dMeta(d).name).join(', '))}</p>` : '<p class="m-note">Switch to Plan My Trip and tap districts, or add places as you explore.</p>'}
      ${empty.map(d => `<p class="m-hint">Add a stop in ${esc(dMeta(d).name)}, or <button type="button" class="m-inline" data-suggest="${d}">let us suggest one</button>.</p>`).join('')}
      ${stops.length ? `<ol class="m-stops">${stops.map((s, i) => `<li><span>${esc(s.name)}</span><span class="m-stop-tools"><button type="button" data-move="${i}" data-d="-1" aria-label="Move ${esc(s.name)} earlier"${i ? '' : ' disabled'}>Earlier</button><button type="button" data-move="${i}" data-d="1" aria-label="Move ${esc(s.name)} later"${i < stops.length - 1 ? '' : ' disabled'}>Later</button><button type="button" data-add="${s.id}" aria-label="Remove ${esc(s.name)}">Remove</button></span></li>`).join('')}</ol>` : ''}
      <h3>Your details</h3>
      <label class="m-field">Where do you start?<select id="m-start">${starts}</select></label>
      <label class="m-check"><input type="checkbox" id="m-loop"${trip.loop ? ' checked' : ''}> Finish where I start</label>
      <label class="m-field">How many days do you have?<input type="number" id="m-days" min="1" max="30" value="${trip.days}"></label>
      <label class="m-field">How will you travel?<select id="m-vehicle"><option value="car"${trip.vehicle === 'car' ? ' selected' : ''}>Private car and driver</option><option value="van"${trip.vehicle === 'van' ? ' selected' : ''}>Private van and driver</option></select></label>
      <label class="m-field">Travel pace<select id="m-pace">${Object.keys(PACE).map(k => `<option value="${k}"${trip.pace === k ? ' selected' : ''}>${CW.config.pace[k].label}</option>`).join('')}</select></label>
      <button type="button" class="button button-moss" data-build="1"${stops.length ? '' : ' disabled'}>Build my route</button>
      ${trip.manual ? '<button type="button" class="m-inline" data-auto="1">Use the suggested order again</button>' : ''}
      <div id="m-itin"></div>`;
  }
  function bestOrder(start, end, ids) {
    const t = (a, b) => (leg(a, b) ? leg(a, b).min : 1e6);
    const cost = o => { let s = 0, prev = start; o.forEach(i => { s += t(prev, i); prev = i; }); return s + (end ? t(prev, end) : 0); };
    let cur = [], left = ids.slice(), prev = start;
    while (left.length) { left.sort((a, b) => t(prev, a) - t(prev, b)); prev = left.shift(); cur.push(prev); }
    let better = true;
    while (better) { better = false; for (let i = 0; i < cur.length - 1; i++) for (let j = i + 1; j < cur.length; j++) { const n = cur.slice(0, i).concat(cur.slice(i, j + 1).reverse(), cur.slice(j + 1)); if (cost(n) < cost(cur) - 0.5) { cur = n; better = true; } } }
    return cur;
  }
  const visitHours = s => (/half a day/i.test(s) ? 4 : /45 min/.test(s) ? 0.75 : (() => { const m = s.match(/(\d+)(?: to (\d+))?/); return m ? (Number(m[1]) + Number(m[2] || m[1])) / 2 : 2; })());
  function decode(str) {
    let i = 0, lat = 0, lon = 0; const out = [];
    while (i < str.length) {
      for (const k of [0, 1]) { let s = 0, r = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << s; s += 5; } while (b >= 32); const d = r & 1 ? ~(r >> 1) : r >> 1; if (k) lon += d; else lat += d; }
      out.push([lon / 1e5, lat / 1e5]);
    }
    return out;
  }
  function makeItinerary() {
    const end = trip.loop ? trip.start : null;
    const order = trip.manual ? trip.stops.slice() : bestOrder(trip.start, end, trip.stops);
    if (!trip.manual) { trip.stops = order; saveTrip(); }
    const seq = [trip.start, ...order, ...(end ? [end] : [])];
    const legs = []; let coords = [];
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1]; if (a === b) continue;
      const r = leg(a, b);
      if (!r) return null;
      const line = legLine(a, b);
      legs.push({ a, b, km: r.km, min: r.min, line }); coords = coords.concat(line);
    }
    const limit = PACE[trip.pace], days = [{ n: 1, items: [], used: 0 }];
    legs.forEach(l => {
      const stop = byId(l.b), need = l.min / 60 + (stop.hub ? 0 : visitHours(stop.visit));
      let d = days[days.length - 1];
      if (d.used > 0 && d.used + need > limit) { d = { n: d.n + 1, items: [], used: 0 }; days.push(d); }
      d.items.push(l); d.used += need;
    });
    return { legs, coords, days, km: legs.reduce((s, l) => s + l.km, 0), min: legs.reduce((s, l) => s + l.min, 0) };
  }
  let stopMarkers = [], routeAnim = 0, liveTurn = 0, drawn = [];
  // The route glows best on darker imagery. It must be back to IMAGERY before a district lifts.
  function shade(on) {
    island.setPaintProperty('sat', 'raster-brightness-max', on ? 0.6 : IMAGERY['raster-brightness-max']);
    island.setPaintProperty('sat', 'raster-saturation', on ? -0.3 : IMAGERY['raster-saturation']);
  }
  function clearRoute(repaint) {
    cancelAnimationFrame(routeAnim); liveTurn++; S.routeOn = false; stage.classList.remove('is-route');
    stopMarkers.forEach(m => m.remove()); stopMarkers = [];
    if (island && island.getSource('route')) { ['route', 'pulse'].forEach(s => island.getSource(s).setData({ type: 'FeatureCollection', features: [] })); shade(false); }
    if (simple) simple.route(null);
    if (repaint && S.view === 'trip') setView('trip');
  }
  // Draws the path as soon as stops are picked, without waiting for Build my route.
  async function liveRoute() {
    const turn = ++liveTurn;
    if (!S.open || S.lifted || (!island && !simple)) return;
    if (!trip.stops.length) return clearRoute(false);
    try { await Promise.all([needRoutes(), needListings()]); } catch (e) { return; }
    if (turn !== liveTurn || !S.open || S.lifted) return;
    const before = trip.stops.join(), it = makeItinerary();
    if (!it) return;
    if (S.view === 'trip' && trip.stops.join() !== before) setView('trip');
    drawRoute(it);
  }
  async function buildRoute() {
    const out = () => $('m-itin');
    if (S.lifted) await unlift();
    setView('trip'); out().innerHTML = '<p class="m-note">Finding road routes…</p>';
    try { await Promise.all([needRoutes(), needListings()]); } catch (e) { out().innerHTML = `<p class="m-note">We couldn't get a road route. Please try again.</p><button type="button" class="button button-ghost" data-build="1">Try Again</button>`; return; }
    const it = makeItinerary();
    if (!it) { out().innerHTML = "<p class=\"m-note\">We couldn't get a road route. Please try again.</p>"; return; }
    setView('trip');
    const over = it.days.length - trip.days;
    $('m-itin').innerHTML = `<h3>Your route</h3>
      <p class="m-total"><strong>${Math.round(it.km)} km</strong> on the road, about <strong>${fmtMin(it.min)}</strong> of driving, ${it.days.length} day${it.days.length > 1 ? 's' : ''}</p>
      ${over > 0 ? `<p class="m-hint">This needs ${it.days.length} days at a ${trip.pace} pace, and you have ${trip.days}. Remove a stop or add days.</p>` : over < 0 ? `<p class="m-note">${-over} spare day${over < -1 ? 's' : ''} for rest, or add more stops.</p>` : ''}
      ${it.days.map(d => `<div class="m-day"><p class="eyebrow">Day ${d.n}</p>${d.items.map(l => { const s = byId(l.b); return `<p><strong>${esc(s.name)}</strong><span>Drive ${Math.round(l.km)} km, about ${fmtMin(l.min)}${s.hub ? '' : ` · Time here: ${esc(s.visit.toLowerCase())}`}</span></p>`; }).join('')}</div>`).join('')}
      <p class="m-source">Road routes from OpenStreetMap, worked out in advance. Drive times are estimates and can run longer in the hills.</p>
      <a class="button button-moss" href="${asset('plan.html')}#plan=${planLink(it)}">See the cost and stays</a>
      <h3>Closest packages</h3><ul class="m-list">${closestPackages().map(k => `<li><a class="m-row" href="${asset('packages/' + k.p.slug + '.html')}"><strong>${esc(k.p.name)}</strong><span>${k.n} of your stops. ${k.p.days} days. Sample price.</span></a></li>`).join('')}</ul>`;
    drawRoute(it);
    $('m-itin').scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }
  function closestPackages() {
    const near = id => nearestBase(byId(id));
    const bases = new Set(trip.stops.map(near));
    return CW.packages.map(p => ({ p, n: p.stops.filter(s => bases.has(s.base)).length })).sort((a, b) => b.n - a.n).slice(0, 3);
  }
  function nearestBase(p) { return Object.entries(CW.bases).filter(([, b]) => !b.airport).sort((a, b) => km(p, a[1]) - km(p, b[1]))[0][0]; }
  function planLink(it) {
    const stops = []; trip.stops.forEach(id => { const b = nearestBase(byId(id)); const last = stops[stops.length - 1]; if (!last || last.base !== b) stops.push({ base: b, ids: [id] }); else last.ids.push(id); });
    const nights = Math.max(stops.length, Math.max(trip.days, it.days.length) - 1), each = Math.floor(nights / stops.length); let rest = nights - each * stops.length;
    const plan = E.fromPackage(CW.packages[0], { pace: trip.pace, vehicle: trip.vehicle, arrival: '' });
    plan.stops = stops.map(s => ({ base: s.base, nights: each + (rest-- > 0 ? 1 : 0), stay: E.pickStay(s.base, plan.tier, plan.rule), arriveBy: 'road', acts: s.ids.flatMap(id => byId(id).activities || []).filter(a => E.actById[a] && E.actById[a].base === s.base) }));
    return btoa(unescape(encodeURIComponent(JSON.stringify(plan)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function drawRoute(it) {
    cancelAnimationFrame(routeAnim); liveTurn++;
    S.routeOn = true; stage.classList.add('is-route');
    if (simple) return simple.route(it);
    stopMarkers.forEach(m => m.remove()); stopMarkers = [];
    const c = it.coords, cum = [0];
    for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + Math.hypot((c[i][0] - c[i - 1][0]) * Math.cos(c[i][1] * Math.PI / 180), c[i][1] - c[i - 1][1]));
    const total = cum[cum.length - 1];
    // Only the part of the trip that changed draws itself again.
    let same = 0; while (same < c.length && same < drawn.length && c[same][0] === drawn[same][0] && c[same][1] === drawn[same][1]) same++;
    const from = same ? cum[same - 1] : 0, span = total - from; drawn = c;
    shade(true);
    if (span > 0) {
      const b = new maplibregl.LngLatBounds(); c.forEach(p => b.extend(p));
      const pad = isPhone() ? { top: 70, bottom: Math.round(innerHeight * 0.66), left: 30, right: 30 } : { top: 90, bottom: 60, left: 60, right: 480 };
      // cameraForBounds ignores perspective, so the near edge of a tilted view needs extra room.
      // Zooming out shrinks towards the screen centre, so the offset for the panel grows to match.
      const cam = island.cameraForBounds(b, { padding: pad, pitch: 45, bearing: 0, maxZoom: 10.5 });
      if (cam) {
        const out = 0.45, grow = 2 ** out, mid = b.getCenter(), at = maplibregl.LngLat.convert(cam.center);
        island.easeTo({ center: [mid.lng + (at.lng - mid.lng) * grow, mid.lat + (at.lat - mid.lat) * grow], zoom: cam.zoom - out, pitch: 45, bearing: 0, duration: reduce ? 0 : 900 });
      }
    }
    const src = island.getSource('route'), pulse = island.getSource('pulse'), line = p => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: p }, properties: {} });
    const order = [trip.start, ...trip.stops];
    const pin = (id, n) => { const s = byId(id), el = document.createElement('div'); el.className = 'm-num'; el.textContent = n; el.title = s.name; stopMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(island)); };
    if (reduce) { src.setData(line(c)); order.forEach((id, i) => pin(id, i || 'S')); return; }
    const at = d => {
      let lo = 0, hi = c.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
      const k = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
      return { i: lo, p: [c[lo][0] + (c[hi][0] - c[lo][0]) * k, c[lo][1] + (c[hi][1] - c[lo][1]) * k] };
    };
    const el = document.createElement('div'); el.className = 'm-head'; el.innerHTML = '<i></i>';
    const head = new maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat(c[0]).addTo(island);
    stopMarkers.push(head);
    const glow = el.firstChild, tail = total * 0.07;
    const place = (d, size) => {
      const h = at(d), t = at(Math.max(0, d - tail * size));
      head.setLngLat(h.p); pulse.setData(line([t.p, ...c.slice(t.i + 1, h.i + 1), h.p]));
      return h;
    };
    const stepsAt = []; let run = 0; it.legs.forEach(l => { run += l.line.length; stepsAt.push(cum[Math.min(run, c.length) - 1]); });
    let shown = 0; pin(order[0], 'S');
    const t0 = performance.now(), wait0 = span > 0 ? 500 : 0, draw = span > 0 ? Math.max(700, 2500 * span / total) : 0;
    const lap = Math.min(9000, Math.max(4000, total * 2600)), rest = 800;
    let lapFrom = 0, last = 0;
    const tick = t => {
      routeAnim = requestAnimationFrame(tick);
      if (!lapFrom) {
        const k = draw ? Math.min(1, Math.max(0, (t - t0 - wait0) / draw)) : 1, d = from + span * k, h = place(d, 1);
        src.setData(line(c.slice(0, h.i + 1).concat([h.p])));
        while (shown < order.length - 1 && d >= stepsAt[shown]) { shown++; pin(order[shown], shown); }
        if (k === 1) lapFrom = t + rest;
        return;
      }
      // After the drawing, a light keeps running along the route. 30 frames a second is enough and saves battery.
      if (t < lapFrom || t - last < 32) return;
      last = t;
      const f = ((t - lapFrom) % (lap + rest)) / lap;
      if (f >= 1) { glow.style.opacity = 0; pulse.setData(line([c[0], c[0]])); return; }
      const fade = Math.min(1, f / 0.04, (1 - f) / 0.04);
      glow.style.opacity = fade; place(total * f, fade);
    };
    routeAnim = requestAnimationFrame(tick);
  }

  /* ---------- Live Location: consent, permission, then a geographic check ---------- */
  function viewLocation() {
    const nearby = () => places.map(p => ({ p, d: km(loc, p) })).sort((a, b) => a.d - b.d).slice(0, 5);
    const msgs = {
      off: `<h2>My location</h2><p>Are you currently in Sri Lanka?</p><div class="m-actions"><button type="button" class="button button-moss" data-loc="yes">Yes, show my location</button><button type="button" class="button button-ghost" data-loc="no">No</button></div><p class="m-source">Your position stays in this browser. It is never saved or sent to us.</p>`,
      asking: '<h2>My location</h2><p class="m-note">Waiting for your browser…</p>',
      no: '<h2>My location</h2><p class="m-note">No problem. You can explore and plan your trip by hand.</p>',
      outside: '<h2>My location</h2><p>Live Location is available only while you are in Sri Lanka. You can still explore destinations and plan your trip.</p>',
      unverified: `<h2>My location</h2><p>We couldn't verify your current location. Please enable location access and try again.</p><button type="button" class="button button-moss" data-loc="yes">Try Again</button>`
    };
    if (loc.state !== 'on') return msgs[loc.state];
    const list = nearby();
    return `<h2>You are here</h2><p class="m-note">Accurate to about ${Math.round(loc.acc)} m${Date.now() - loc.last > 15000 ? '. Updating' : ''}.</p>
      <button type="button" class="button button-ghost" data-loc="stop">Stop sharing my location</button>
      <h3>Nearby</h3><ul class="m-list">${list.map(n => `<li><button type="button" class="m-row" data-place="${n.p.id}" data-district="${n.p.district}"><strong>${esc(n.p.name)}</strong><span>${n.d < 1 ? 'Less than 1 km away' : `About ${n.d < 10 ? n.d.toFixed(1) : Math.round(n.d)} km away`} in a straight line</span></button></li>`).join('')}</ul>
      <button type="button" class="button button-moss" data-loc="start" data-near="${list[0].p.id}">Start my trip here</button>
      <p class="m-source">Routes begin at your closest listed place, ${esc(list[0].p.name)}, because roads are worked out in advance.</p>`;
  }
  function inRing(lon, lat, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; }
  const polys = () => (zone.type === 'MultiPolygon' ? zone.coordinates : [zone.coordinates]);
  const inZone = (lon, lat) => polys().some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h)));
  function edgeKm(lon, lat) {
    const f = Math.cos(lat * Math.PI / 180); let best = Infinity;
    polys().forEach(p => p.forEach(r => { for (let i = 1; i < r.length; i++) { const ax = (r[i - 1][0] - lon) * f, ay = r[i - 1][1] - lat, bx = (r[i][0] - lon) * f, by = r[i][1] - lat, dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(ax + t * dx, ay + t * dy); if (d < best) best = d; } }));
    return best * 111.32;
  }
  // Inside needs accuracy of 2,000 m or better. Outside must be clear by more than the accuracy radius.
  function classify(lon, lat, acc) {
    if (inZone(lon, lat)) return acc <= 2000 ? 'inside' : 'unknown';
    return edgeKm(lon, lat) * 1000 > acc ? 'outside' : 'unknown';
  }
  function setLoc(state) {
    loc.state = state;
    if (state !== 'on') { hideLocMarker(); }
    if (S.view === 'location') setView('location');
  }
  function stopWatch() { if (loc.id !== null) navigator.geolocation.clearWatch(loc.id); loc.id = null; clearTimeout(loc.timer); }
  function startLoc() {
    if (!('geolocation' in navigator)) return setLoc('unverified');
    setLoc('asking'); stopWatch();
    loc.id = navigator.geolocation.watchPosition(reading, () => { stopWatch(); clearPosition(); setLoc('unverified'); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  function reading(pos) {
    const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords, r = classify(lon, lat, acc);
    if (r === 'inside') { Object.assign(loc, { lat, lon, acc, last: Date.now() }); clearTimeout(loc.timer); const was = loc.state; loc.state = 'on'; showLocMarker(); if (was !== 'on' || S.view === 'location') { if (S.view === 'location') setView('location'); } return; }
    if (r === 'outside') { stopWatch(); clearPosition(); return setLoc('outside'); }
    if (loc.state === 'on') { if (!loc.timer) loc.timer = setTimeout(() => { stopWatch(); clearPosition(); setLoc('unverified'); loc.timer = null; }, 60000); if (S.view === 'location') setView('location'); } else { stopWatch(); clearPosition(); setLoc('unverified'); }
  }
  function clearPosition() { loc.lat = 0; loc.lon = 0; loc.acc = 0; loc.last = 0; }
  let locMarkers = [];
  function circle() { const n = 48, out = [], d = loc.acc / 111320; for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; out.push([loc.lon + d * Math.cos(a) / Math.cos(loc.lat * Math.PI / 180), loc.lat + d * Math.sin(a)]); } return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [out] } }; }
  function showLocMarker() {
    if (simple) return simple.location(loc);
    [island, district].forEach((m, i) => {
      m.getSource('loc').setData(circle());
      if (!locMarkers[i]) { const el = document.createElement('div'); el.className = 'm-here'; el.setAttribute('aria-label', 'You are here'); el.title = 'You are here'; locMarkers[i] = new maplibregl.Marker({ element: el }).setLngLat([loc.lon, loc.lat]).addTo(m); } else locMarkers[i].setLngLat([loc.lon, loc.lat]);
    });
  }
  function hideLocMarker() {
    if (simple) return simple.location(null);
    locMarkers.forEach(m => m && m.remove()); locMarkers = [];
    [island, district].forEach(m => { if (m && m.getSource('loc')) m.getSource('loc').setData({ type: 'FeatureCollection', features: [] }); });
  }
  function syncLoc() { if (loc.state === 'on') showLocMarker(); }

  /* ---------- Panel events ---------- */
  function onPanelClick(e) {
    const t = e.target.closest('button, a'); if (!t) return; const d = t.dataset;
    if (d.place) { const p = byId(d.place); if (S.lifted && p.district === S.slug) openPlace(d.place, true); else lift(p.district, d.place); return; }
    if (d.district) return lift(d.district);
    if (d.add) return toggleStop(d.add);
    if (d.hotels) { S.hotels = !S.hotels; counts(); drawMarkers(); return setView('district'); }
    if (d.viewGo) { S.place = null; setView(d.viewGo); syncUrl(); return; }
    if (d.filterGroup) { const a = S.filters[d.filterGroup], i = a.indexOf(d.filterKey); i < 0 ? a.push(d.filterKey) : a.splice(i, 1); afterFilter(); return; }
    if (d.clearFilters) { S.filters = { types: [], climate: [], month: '' }; afterFilter(); return; }
    if (d.build) return buildRoute();
    if (d.auto) { trip.manual = false; saveTrip(); return buildRoute(); }
    if (d.suggest) { const p = places.filter(x => x.district === d.suggest)[0]; if (p) toggleStop(p.id); else announce('No places here yet.'); return; }
    if (d.move !== undefined) { const i = Number(d.move), j = i + Number(d.d); [trip.stops[i], trip.stops[j]] = [trip.stops[j], trip.stops[i]]; trip.manual = true; saveTrip(); clearRoute(false); return buildRoute(); }
    if (d.loc === 'yes') return startLoc();
    if (d.loc === 'no') { setLoc('no'); return; }
    if (d.loc === 'stop') { stopWatch(); clearPosition(); hideLocMarker(); setLoc('off'); if (trip.start === 'here') trip.start = 'airport'; return; }
    if (d.loc === 'start') { trip.start = d.near; saveTrip(); setMode('plan'); return; }
  }
  function afterFilter() { counts(); if (S.lifted) drawMarkers(); setView(S.view === 'filters' ? 'filters' : S.view); }
  function onPanelInput(e) {
    if (e.target.id === 'm-search') { S.query = e.target.value; const pos = e.target.selectionStart; setView('districts'); const s = $('m-search'); s.focus(); s.setSelectionRange(pos, pos); }
  }
  function onPanelChange(e) {
    const id = e.target.id, v = e.target.value;
    if (id === 'm-month') { S.filters.month = v; return afterFilter(); }
    if (id === 'm-start') trip.start = v;
    if (id === 'm-loop') trip.loop = e.target.checked;
    if (id === 'm-days') trip.days = Math.min(30, Math.max(1, Number(v) || 1));
    if (id === 'm-vehicle') trip.vehicle = v;
    if (id === 'm-pace') trip.pace = v;
    if (/^m-(start|loop|days|vehicle|pace)$/.test(id)) { saveTrip(); clearRoute(false); liveRoute(); }
  }

  /* ---------- URL state ---------- */
  function syncUrl() {
    const h = !S.open ? '' : '#map' + (S.slug ? '/' + S.slug + (S.place ? '/' + S.place : '') : '');
    if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
  }
  async function routeFromUrl() {
    const m = location.hash.match(/^#map(?:\/([a-z-]+))?(?:\/([a-z0-9-]+))?/); if (!m) return;
    expand();
    if (m[2]) await needListings();
    if (m[1] && dMeta(m[1])) lift(m[1], m[2] && byId(m[2]) ? m[2] : undefined);
  }
  function afterReady() {
    $('m-explore').disabled = false; $('m-tap').hidden = false;
    $('m-explore').onclick = () => expand(); $('m-tap').onclick = () => expand();
    if (!simple) startDrift();
    counts(); routeFromUrl();
  }

  /* ---------- Simple map: flat SVG from the same boundaries ---------- */
  function startSimple() {
    stage.classList.add('is-simple');
    const X = lon => (lon - 79.4) * 200, Y = lat => (10 - lat) * 200 / Math.cos(7.8 * Math.PI / 180) * Math.cos(7.8 * Math.PI / 180);
    const path = g => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(p => p.map(r => 'M' + r.map(c => `${X(c[0]).toFixed(1)} ${Y(c[1]).toFixed(1)}`).join('L') + 'Z').join('')).join('');
    const host = $('m-simple'); host.hidden = false;
    host.innerHTML = `<svg viewBox="0 0 540 850" role="group" aria-label="Flat map of Sri Lanka by district"><g id="s-d">${districtsGeo.features.map(f => `<path d="${path(f.geometry)}" data-slug="${f.properties.slug}" tabindex="0" role="button" aria-label="${esc(f.properties.name)}"></path>`).join('')}</g><path id="s-route" fill="none"></path><g id="s-pins"></g><g id="s-loc"></g></svg>`;
    const svg = host.firstChild;
    const go = e => { const s = e.target.dataset.slug; if (!s) return; if (!S.open) expand(); if (S.mode === 'plan') return toggleTripDistrict(s); lift(s); };
    svg.addEventListener('click', go); svg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
    simple = {
      island() { svg.setAttribute('viewBox', '0 0 540 850'); svg.querySelector('#s-pins').innerHTML = ''; svg.querySelectorAll('[data-slug]').forEach(p => p.classList.remove('on')); },
      district(s) { const b = dMeta(s).bbox, m = 14; svg.setAttribute('viewBox', `${X(b[0]) - m} ${Y(b[3]) - m} ${X(b[2]) - X(b[0]) + 2 * m} ${Y(b[1]) - Y(b[3]) + 2 * m}`); svg.querySelectorAll('[data-slug]').forEach(p => p.classList.toggle('on', p.dataset.slug === s)); },
      markers() { const size = S.slug ? (dMeta(S.slug).bbox[2] - dMeta(S.slug).bbox[0]) * 200 / 60 : 4; svg.querySelector('#s-pins').innerHTML = places.filter(p => inDistrict(p, S.slug)).map(p => `<circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="${size}" class="${S.place === p.id ? 'on' : ''}"><title>${esc(p.name)}</title></circle>`).join(''); },
      route(it) { svg.querySelector('#s-route').setAttribute('d', it ? 'M' + it.coords.map(c => `${X(c[0]).toFixed(1)} ${Y(c[1]).toFixed(1)}`).join('L') : ''); },
      location(l) { svg.querySelector('#s-loc').innerHTML = l ? `<circle cx="${X(l.lon)}" cy="${Y(l.lat)}" r="5" class="here"><title>You are here</title></circle>` : ''; }
    };
    window.__map = { S, trip, simple };
  }

  document.body.classList.add('is-loading');
  boot();
})();
