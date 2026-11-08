/* Ceylonways journey. Scrolling the home page drives a camera along the real road of the Sri Lanka Highlights trip.
   Scrolling stays native: the page moves as normal and the map follows it. Without 3D, with reduced motion or
   without JavaScript, the same text and photos stay on the page as a plain article. map-app.js starts this. */
(function () {
  'use strict';
  const wrap = document.getElementById('journey');
  if (!wrap) return;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = c => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  // The light of the day. Fog is what turns the imagery into distance.
  const LIGHT = {
    plate: { top: '#1F7A74', horizon: '#1F7A74', fog: '#1F7A74', tint: '#1F7A74', tintOn: 0, ground: 1, hfog: 1, blend: 1 },
    dawn: { top: '#6F8FB6', horizon: '#FFD7AE', fog: '#FFD7AE', tint: '#FF9A5C', tintOn: .1, ground: .22, hfog: .7, blend: .65, sun: 98 },
    morning: { top: '#7FB2D9', horizon: '#E9F1F4', fog: '#E9F1F4', tint: '#FFFFFF', tintOn: 0, ground: .34, hfog: .62, blend: .7 },
    mist: { top: '#C5D2DB', horizon: '#EEF3F4', fog: '#EEF3F4', tint: '#FFFFFF', tintOn: .06, ground: .16, hfog: .72, blend: .8 },
    gold: { top: '#6C8BB0', horizon: '#FFD29A', fog: '#FFD29A', tint: '#FF9A3C', tintOn: .08, ground: .3, hfog: .66, blend: .68 },
    sunset: { top: '#27406B', horizon: '#F58B4C', fog: '#F58B4C', tint: '#FF6A2B', tintOn: .14, ground: .3, hfog: .72, blend: .72, sun: 262 }
  };
  Object.values(LIGHT).forEach(l => { ['top', 'horizon', 'fog', 'tint'].forEach(k => { l[k] = rgb(l[k]); }); });

  // Shots are art directed by hand. km says how far along the road the journey has reached at that moment.
  const SHOTS = {
    plate: { snd: [.3, 0, 0], top: true, light: 'plate', km: 0, cloud: 0 },
    coast: { snd: [.9, 0, 0], c: [79.82, 7.18], z: 10.2, p: 76, b: 72, orbit: 6, el: 0, light: 'dawn', km: 0, cloud: 0, sea: 1, haze: 1 },
    sigiriya: { snd: [0, .9, .05], c: [80.74, 7.9], z: 12, p: 78, b: 15, orbit: 14, el: 300, light: 'dawn', km: 149.6, cloud: .08, sea: 1 },
    kandy: { snd: [0, .7, .08], c: [80.62, 7.235], z: 11.2, p: 75, b: 62, orbit: 14, el: 720, light: 'morning', km: 239.3, cloud: .1, sea: 1 },
    high: { snd: [0, .22, .75], c: [80.74, 6.93], z: 11.2, p: 77, b: 118, orbit: 12, el: 2400, light: 'mist', km: 307.9, cloud: .85, sea: 1 },
    ella: { snd: [0, .6, .16], c: [81.02, 6.86], z: 11.7, p: 78, b: 196, orbit: -12, el: 1450, light: 'gold', km: 376.3, cloud: .25, sea: 1 },
    galle: { snd: [.9, .08, 0], c: [80.235, 6.04], z: 12.2, p: 72, b: 250, orbit: 10, el: 10, light: 'sunset', km: 580.5, cloud: .05, sea: 1 },
    island: { snd: [.28, 0, 0], top: true, light: 'plate', km: 741.1, cloud: 0 },
    months: { snd: [.12, 0, 0], top: true, light: 'plate', km: 741.1, cloud: 0, months: true },
    atlas: { snd: [.12, 0, 0], top: true, light: 'plate', km: 741.1, cloud: 0 }
  };
  const LANDMARKS = [
    ['Sigiriya Rock', 80.7603, 7.957], ['Dambulla', 80.6492, 7.8567], ['Knuckles Range', 80.8, 7.42], ['Kandy', 80.6413, 7.2936], ['Victoria Reservoir', 80.79, 7.24],
    ['Pidurutalagala, 2,524 m', 80.7735, 7.0007], ['Nuwara Eliya', 80.7829, 6.9497], ['Adam\'s Peak, 2,243 m', 80.4994, 6.8096], ['Horton Plains', 80.8036, 6.8023],
    ['Ella Gap', 81.04, 6.84], ['Nine Arch Bridge', 81.0608, 6.8768], ['Galle Fort', 80.2169, 6.0269], ['Hikkaduwa', 80.1, 6.14], ['Mirissa', 80.459, 5.9449]
  ];
  // Typical conditions by area, from the same table as the travel guide.
  const AREA = { colombo: 'west', gampaha: 'west', kalutara: 'west', puttalam: 'west', galle: 'south', matara: 'south', kandy: 'hills', 'nuwara-eliya': 'hills', badulla: 'hills', kegalle: 'hills', ratnapura: 'hills', matale: 'cultural', anuradhapura: 'cultural', polonnaruwa: 'cultural', kurunegala: 'cultural', hambantota: 'wild', monaragala: 'wild', trincomalee: 'east', batticaloa: 'east', ampara: 'east', jaffna: 'east', kilinochchi: 'east', mullaitivu: 'east', vavuniya: 'east', mannar: 'east' };
  const AREA_NAME = { west: 'the west coast', south: 'the south coast', hills: 'the hill country', cultural: 'the Cultural Triangle', wild: 'Yala and Udawalawe', east: 'the east coast and the north' };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const list = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '');

  let A = null, map = null, data = null, keys = [], steps = [], end = 0, vh = 0, y = 0, last = 0, raf = 0, paused = false, ready = false;
  const look = { b: 0, p: 0, drag: null };
  let flying = false, settled = false, stageH = 0, little = false;
  let idle = 0, px = 0, py = 0, cx = 0, cy = 0, drawnKm = -1, skyKey = '', seaOn = -1, lineOn = -1, month = -1, head = null, labels = [], sharpOn = false, phone = false, topCam = null;
  const hud = { km: $('j-km'), ele: $('j-ele'), day: $('j-day'), fill: $('j-fill'), dot: $('j-dot') };
  const seen = { km: '', ele: '', day: '' };

  const eleAt = km => { const k = data.km; let lo = 0, hi = k.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m] <= km) lo = m; else hi = m; } const t = (km - k[lo]) / ((k[hi] - k[lo]) || 1); return { i: lo, e: lerp(data.ele[lo], data.ele[hi], t), p: [lerp(data.line[lo][0], data.line[hi][0], t), lerp(data.line[lo][1], data.line[hi][1], t)] }; };
  const dayAt = km => (km <= 150 ? 1 : km <= 240 ? 3 : km <= 377 ? 4 : km <= 581 ? 6 : 7);

  function measure() {
    // Phones hide and show their address bar while you scroll. vh is the height with the bar showing, so it never changes,
    // and the stage runs on under the bar, so the land always fills the screen.
    vh = A.seeH(); stageH = A.stage.clientHeight || vh; phone = A.isPhone(); little = Math.min(innerWidth, innerHeight) <= 720; // a phone on its side is still a phone
    const top = wrap.getBoundingClientRect().top + scrollY;
    steps = [...wrap.querySelectorAll('.step')].map(el => {
      const r = el.getBoundingClientRect(), t = r.top + scrollY - top;
      const nm = el.querySelector('.step-name');
      const box = nm ? { bottom: nm.offsetTop + nm.offsetHeight, right: nm.offsetLeft + Math.min(nm.offsetWidth, nm.textContent.length * nm.offsetHeight * .5) } : null;
      return { el, nm, box, inner: el.querySelector('.step-in'), top: t, h: r.height, shot: el.dataset.shot, hold: el.dataset.shot === 'atlas' ? t + vh * .1 : t + Math.max(0, (r.height - vh) / 2) };
    });
    const fit = (pad, p, b) => { pad.bottom = Math.min(pad.bottom, stageH - pad.top - 90); const f = map.cameraForBounds([[79.55, 5.85], [81.95, 9.9]], { padding: pad, pitch: p, bearing: b }); if (!f) return { c: [80.7, 7.8], z: 6, p, b, el: 0 }; const c = maplibregl.LngLat.convert(f.center); return { c: [c.lng, c.lat], z: Math.max(LOWEST, f.zoom), p, b, el: 0 }; };
    const W = innerWidth, sideways = vh <= 480 && W > 560, over = stageH - vh, under = !sideways && W <= 1000;
    const first = under ? fit({ top: Math.round(vh * .15), bottom: A.plateGap(), left: 16, right: 16 }, 46, -12) : fit({ top: 10, bottom: 84 + over, left: 60, right: 60 }, 48, -12);
    const beside = fit({ top: sideways ? 12 : 40, bottom: (sideways ? 20 : 100) + over, left: 30, right: Math.round(W * .58) }, 24, 0);
    // On a narrow screen the island stands above the words, so each stop keeps it clear of its own text.
    const above = s => { const c = s.el.querySelector('.step-copy'); return fit({ top: 16, bottom: Math.max(Math.round(vh * .58), c ? vh - c.offsetTop + 10 : 0) + over, left: 30, right: 30 }, 20, 0); };
    keys = steps.map((s, i) => Object.assign({ y: s.hold, id: s.shot }, SHOTS[s.shot], SHOTS[s.shot].top ? (i ? (under ? above(s) : beside) : first) : null));
    keys[0].y = 0;
    end = steps[steps.length - 1].top + steps[steps.length - 1].h - vh;
    if (phone) keys.forEach(k => { if (!k.top) k.z -= .35; });
  }

  // Catmull Rom keeps the flight smooth through every shot, so there is never a corner in the camera path.
  const spline = (a, b, c, d, t) => { const t2 = t * t, t3 = t2 * t; return .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); };

  function camera(scroll, now) {
    let i = 0; while (i < keys.length - 2 && scroll >= keys[i + 1].y) i++;
    const a = keys[i], b = keys[i + 1], p = keys[Math.max(0, i - 1)], n = keys[Math.min(keys.length - 1, i + 2)];
    const raw = clamp((scroll - a.y) / ((b.y - a.y) || 1), 0, 1), t = smooth(.1, .9, raw);
    const orbit = (a.orbit || 0) * (raw < .5 ? raw : 0) + (b.orbit || 0) * (raw >= .5 ? raw - 1 : 0);
    const hop = a.top || b.top ? 0 : Math.sin(Math.PI * t) * .5; // the camera rises between stops and comes down at the next
    const cam = {
      center: [spline(p.c[0], a.c[0], b.c[0], n.c[0], t), spline(p.c[1], a.c[1], b.c[1], n.c[1], t)],
      zoom: lerp(a.z, b.z, t) - hop,
      pitch: clamp(lerp(a.p, b.p, t) - hop * 5, 0, 82),
      bearing: lerp(a.b, b.b, t) + orbit,
      elevation: lerp(a.el, b.el, t)
    };
    if (!little) { cam.bearing += cx * 1.6 + Math.sin(now / 9000) * .5; cam.pitch = clamp(cam.pitch - cy * 1, 0, 82); }
    cam.bearing += look.b; cam.pitch = clamp(cam.pitch + look.p, 0, 82);
    return { cam, a, b, t, raw };
  }

  // The map caches land textures while it flies, so a change of colour has to clear that cache.
  const redraw = () => { if (map.terrain) map.terrain.sourceCache.freeRtt(); map.triggerRepaint(); };
  // Terrain tiles hang a skirt from their edges to close the gaps between levels of detail.
  const skirt = m => { if (map.terrain) map.terrain.getMeshFrameDelta = () => m; };

  function light(a, b, t) {
    const A1 = LIGHT[a.light], B1 = LIGHT[b.light], g = k => lerp(A1[k], B1[k], t);
    const top = mix(A1.top, B1.top, t), horizon = mix(A1.horizon, B1.horizon, t), fog = mix(A1.fog, B1.fog, t);
    const sky = { 'sky-color': css(top), 'horizon-color': css(horizon), 'fog-color': css(fog), 'fog-ground-blend': +g('ground').toFixed(3), 'horizon-fog-blend': +g('hfog').toFixed(3), 'sky-horizon-blend': +g('blend').toFixed(3), 'atmosphere-blend': 0 };
    const key = JSON.stringify(sky);
    if (key !== skyKey) { skyKey = key; map.setSky(sky); }
    const lines = a.top && b.top ? 1 : a.top || b.top ? +(1 - smooth(.05, .5, a.top ? t : 1 - t)).toFixed(1) : 0;
    if (lines !== lineOn) { lineOn = lines; map.setPaintProperty('lines', 'line-opacity', lines * .7); redraw(); }
    A.stage.style.backgroundColor = css(fog); // past the far edge of the map, the fog carries on to the horizon
    const tint = $('j-tint'); tint.style.background = css(mix(A1.tint, B1.tint, t)); tint.style.opacity = lerp(A1.tintOn, B1.tintOn, t).toFixed(3);
    const sea = Math.round(lerp(a.sea || 0, b.sea || 0, t) * 20) / 20;
    if (sea !== seaOn) { seaOn = sea; map.setPaintProperty('j-sea', 'background-opacity', sea); skirt(sea > .9 ? 1500 : A.skirt); redraw(); }
    const haze = lerp(a.haze || 0, b.haze || 0, t), hz = $('j-haze');
    hz.style.color = css(fog); hz.style.opacity = haze.toFixed(3);
  }

  // New road only changes the land around its tip. By default every update would repaint all the land in view, which is the costliest thing in the flight.
  const roadEdit = []; let drawnI = 0;
  const nearRoad = t => { const n = 2 ** t.z; return roadEdit.some(seg => seg.some(p => { const x = (p[0] + 180) / 360 * n - t.x, v = (1 - Math.asinh(Math.tan(p[1] * Math.PI / 180)) / Math.PI) / 2 * n - t.y; return x > -.08 && x < 1.08 && v > -.08 && v < 1.08; })); };
  let wholeRoad = false, wholeTimer = 0;
  function keepLand() {
    const done = map._terrainDataCallback; if (!done) return;
    map.style.off('data', done);
    map._terrainDataCallback = e => { if (e.sourceId === 'j-route' && e.tile && !wholeRoad && !nearRoad(e.tile.tileID.canonical)) return; done(e); };
    map.style.on('data', map._terrainDataCallback);
  }

  function route(km) {
    const pos = eleAt(km);
    head.setLngLat(pos.p);
    head.getElement().firstChild.style.opacity = km > .5 && km < data.total - .5 && month < 0 ? 1 : 0;
    if (Math.abs(km - drawnKm) > 2.5 || (km >= data.total && drawnKm < data.total)) {
      roadEdit.push(data.line.slice(Math.min(drawnI, pos.i), Math.max(drawnI, pos.i) + 2)); if (roadEdit.length > 8) roadEdit.shift();
      drawnKm = km; drawnI = pos.i;
      map.getSource('j-route').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: km < 1 ? [pos.p, pos.p] : [...data.line.slice(0, pos.i + 1), pos.p] } });
    }
    const pct = (km / data.total * 100).toFixed(2);
    hud.fill.style.clipPath = `inset(0 ${(100 - pct).toFixed(2)}% 0 0)`;
    hud.dot.style.left = pct + '%'; hud.dot.style.bottom = `${clamp(pos.e / 2000, 0, 1) * 100}%`;
    const kmT = `${Math.round(km)} km`, eleT = `${Math.round(pos.e).toLocaleString('en-US')} m`, dayT = `Day ${dayAt(km)}`;
    if (kmT !== seen.km) hud.km.textContent = seen.km = kmT;
    if (eleT !== seen.ele) hud.ele.textContent = seen.ele = eleT;
    if (dayT !== seen.day) hud.day.textContent = seen.day = dayT;
  }

  function sun(a, b, t, cam) {
    const w = (LIGHT[a.light].sun ? 1 - t : 0) + (LIGHT[b.light].sun ? t : 0), el = $('j-sun');
    if (w < .02) { if (el.style.opacity !== '0') el.style.opacity = 0; return; }
    const az = LIGHT[b.light].sun && t > .5 || !LIGHT[a.light].sun ? LIGHT[b.light].sun : LIGHT[a.light].sun;
    const off = (((az - cam.bearing) % 360) + 540) % 360 - 180, W = innerWidth, x = W / 2 + off / (37 * W / stageH) * W;
    // The horizon sits where the view line is level: 90 degrees minus the pitch above the centre of a 36.87 degree view.
    const y = stageH / 2 * (1 - Math.tan((90 - cam.pitch) * Math.PI / 180) / .3333);
    el.style.opacity = (w * clamp(1 - Math.abs(off) / 60, 0, 1)).toFixed(3);
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
  }

  /* Sound: real recordings, off until the visitor turns it on. Three loops rise and fall with the scene. */
  const snd = { ctx: null, master: null, gain: {}, on: false, last: [0, 0, 0] };
  const NAMES = ['sea', 'birds', 'rain'];
  async function soundStart() {
    if (!snd.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      snd.ctx = new AC();
      snd.master = snd.ctx.createGain(); snd.master.gain.value = 0; snd.master.connect(snd.ctx.destination);
      await Promise.all(NAMES.map(async n => {
        const buf = await snd.ctx.decodeAudioData(await (await fetch(A.asset(`assets/audio/${n}.mp3`))).arrayBuffer());
        const src = snd.ctx.createBufferSource(), g = snd.ctx.createGain();
        src.buffer = buf; src.loop = true; src.loopStart = .06; src.loopEnd = buf.duration - .06;
        g.gain.value = 0; src.connect(g); g.connect(snd.master); src.start(0, .06);
        snd.gain[n] = g;
      }));
    }
    await snd.ctx.resume();
    snd.master.gain.setTargetAtTime(paused ? .35 : .85, snd.ctx.currentTime, .5);
    return true;
  }
  function soundStop() { if (!snd.ctx) return; snd.master.gain.setTargetAtTime(0, snd.ctx.currentTime, .2); setTimeout(() => { if (!snd.on && snd.ctx) snd.ctx.suspend(); }, 900); }
  function soundMix(v) {
    if (!snd.on) return;
    NAMES.forEach((n, i) => { const g = snd.gain[n]; if (g && Math.abs(v[i] - snd.last[i]) > .012) { snd.last[i] = v[i]; g.gain.setTargetAtTime(v[i], snd.ctx.currentTime, .45); } }); // the loops finish decoding at different times
  }
  async function soundToggle() {
    snd.on = !snd.on;
    document.querySelectorAll('[data-sound]').forEach(b => b.setAttribute('aria-pressed', String(snd.on)));
    if (snd.on) { const ok = await soundStart().catch(() => false); if (!ok) { snd.on = false; document.querySelectorAll('[data-sound]').forEach(b => { b.setAttribute('aria-pressed', 'false'); b.hidden = true; }); return; } snd.last = [-1, -1, -1]; render(y, performance.now(), true); } else soundStop();
  }

  function clouds(amount, scroll) {
    const a = $('j-cloud-a'), b = $('j-cloud-b');
    const drift = scroll * .05;
    a.style.opacity = amount.toFixed(3); b.style.opacity = (amount * .85).toFixed(3);
    a.style.transform = `translate3d(${(-drift % 900).toFixed(1)}px,0,0) scale(${(1 + amount * .5).toFixed(3)})`;
    b.style.transform = `translate3d(${(drift * .6 % 900).toFixed(1)}px,0,0) scale(${(1.15 + amount * .7).toFixed(3)})`;
  }

  function panels(scroll) {
    for (const s of steps) {
      if (!s.inner) continue;
      const span = Math.min(vh * .42, s.h * .24), startAt = s.top - vh * .32, stopAt = s.top + s.h - vh * .68;
      const v = smooth(startAt, startAt + span, scroll) * (1 - smooth(stopAt - span, stopAt, scroll));
      const o = v.toFixed(3);
      if (s.o !== o) { s.o = o; s.inner.style.opacity = o; s.inner.style.visibility = v < .01 ? 'hidden' : 'visible'; s.inner.style.transform = `translate3d(0,${((1 - v) * 28).toFixed(1)}px,0)`; }
    }
    const intro = document.querySelector('.m-intro'), g = document.querySelector('.m-giant'), f = clamp(1 - scroll / (vh * .5), 0, 1);
    intro.style.opacity = f.toFixed(3); intro.style.visibility = f < .01 ? 'hidden' : 'visible'; intro.style.transform = `translate3d(0,${(-(1 - f) * 40).toFixed(1)}px,0)`;
    if (g) { g.style.opacity = f.toFixed(3); g.style.transform = `translate3d(${(-cx * 12).toFixed(1)}px,${(-scroll * .35 - cy * 7).toFixed(1)}px,0)`; }
    const sheetAt = steps.find(s => s.shot === 'atlas'), fly = scroll > vh * .2 && scroll < (sheetAt ? sheetAt.top - vh * .6 : end - 2);
    if (fly !== flying) { flying = fly; wrap.classList.toggle('is-flying', fly); document.documentElement.classList.toggle('is-flying', fly); }
  }

  function marks(cam) {
    const reach = phone ? .24 : .34, low = cam.zoom > 9.8 && month < 0, W = innerWidth, H = vh, placed = [];
    // The giant name of the stop fills the sky, so a label must stand clear of it.
    const box = (steps.find(s => s.nm && y >= s.top - vh * .32 && y < s.top + s.h - vh * .68) || {}).box;
    for (const l of labels) {
      let on = low && Math.hypot(l.lon - cam.center[0], l.lat - cam.center[1]) < reach;
      if (on) {
        const q = map.project([l.lon, l.lat]), wide = l.w;
        // The copy sits low on the left and the photo low on the right. A label stands about 60 pixels above its point.
        on = q.y > 90 && q.y < H - (phone ? 300 : 110) && q.x > wide && q.x < W - wide
          && !(phone ? q.y > H * .5 : (q.x < W * .54 && q.y > H * .53) || (q.x - wide < W * .24 && q.y > H * .44) || (q.x + wide > W * .64 && q.y > H * .52));
        if (on && box && q.y - 66 < box.bottom + 40 && q.x - wide < box.right) on = false;
        if (on && placed.some(p => Math.abs(p.x - q.x) < p.w + wide + 8 && Math.abs(p.y - q.y) < 30)) on = false;
        if (on) placed.push({ x: q.x, y: q.y, w: wide });
      }
      const o = on ? '1' : '0';
      if (l.o !== o) { l.o = o; l.el.style.opacity = o; }
    }
  }

  function setMonth(i) {
    if (i === month) return; month = i;
    const s = window.CW.seasons, code = { good: 1, mixed: 2, wet: 3 };
    Object.keys(AREA).forEach(slug => map.setFeatureState({ source: 'districts', id: slug }, { s: i < 0 ? 0 : code[s[AREA[slug]][i]] }));
    ['j-halo', 'j-glow', 'j-line'].forEach(id => map.setLayoutProperty(id, 'visibility', i < 0 ? 'visible' : 'none'));
    redraw();
    if (i < 0) return;
    const of = w => Object.keys(AREA_NAME).filter(k => s[k][i] === w).map(k => AREA_NAME[k]);
    const good = of('good'), wet = of('wet');
    $('j-month').textContent = MONTHS[i];
    $('j-monsoon').textContent = i >= 4 && i <= 8 ? 'Southwest monsoon' : i === 0 || i >= 10 ? 'Northeast monsoon' : 'Between the monsoons';
    $('j-good').textContent = good.length ? `Best now: ${list(good)}.` : 'No area is at its best this month.';
    $('j-wet').textContent = wet.length ? `Wettest now: ${list(wet)}.` : 'No area is usually wet this month.';
    const r = $('j-range'); if (Number(r.value) !== i) r.value = i;
    r.setAttribute('aria-valuetext', MONTHS[i]);
  }

  function render(scroll, now, force) {
    // Past the last stop the camera has arrived. Reading the sheet must not redraw the land on every frame.
    const arrived = scroll >= keys[keys.length - 1].y && !look.drag && Math.abs(look.b) + Math.abs(look.p) < .02;
    if (arrived && settled && !force) { panels(scroll); return; }
    settled = arrived;
    const f = camera(scroll, now);
    map.jumpTo(f.cam);
    light(f.a, f.b, f.t);
    const km = clamp(lerp(f.a.km, f.b.km, smooth(0, 1, f.raw)), 0, data.total);
    route(km);
    clouds(lerp(f.a.cloud, f.b.cloud, f.t), scroll);
    sun(f.a, f.b, f.t, f.cam);
    const wet = month >= 0 ? Object.keys(AREA_NAME).filter(k => window.CW.seasons[k][month] === 'wet').length / 3 : 0;
    soundMix([lerp(f.a.snd[0], f.b.snd[0], f.t), lerp(f.a.snd[1], f.b.snd[1], f.t), clamp(lerp(f.a.snd[2], f.b.snd[2], f.t) + wet * .75, 0, .85)]);
    panels(scroll);
    marks(f.cam);
    if (!sharpOn && scroll > vh * .25) addSharp();
    if (sharpOn && f.b.id !== warmId) { warmId = f.b.id; warm(f.b); }
    const m = steps.find(s => s.shot === 'months');
    if (m) {
      const p = (scroll - m.top) / Math.max(1, m.h - vh);
      setMonth(p < -.05 || p > 1.02 ? -1 : clamp(Math.floor(clamp(p, 0, .999) * 12), 0, 11));
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused || document.hidden || window.__hold) return;
    const gap = now - last, dt = Math.min(64, gap || 16); last = now;
    const target = clamp(scrollY, 0, end + vh);
    if (!look.drag) { look.b *= Math.exp(-dt / 700); look.p *= Math.exp(-dt / 700); }
    const moved = Math.abs(target - y) > .15 || Math.abs(px - cx) + Math.abs(py - cy) > .002 || Math.abs(look.b) + Math.abs(look.p) > .02;
    y += (target - y) * (1 - Math.exp(-dt / 130));
    cx += (px - cx) * (1 - Math.exp(-dt / 400)); cy += (py - cy) * (1 - Math.exp(-dt / 400));
    if (y > end + 4 && !moved) return; // the stage has scrolled away, so nothing needs drawing
    if (moved) steady(gap);
    if (!moved && (little || ++idle & 3)) return; // at rest the land only sways, so a quarter of the frames is enough
    render(Math.min(y, end), now);
  }

  // A slower graphics chip trades a little sharpness for a steady flight.
  const pace = { n: 0, t: 0, base: 1, now: 1 };
  function steady(gap) {
    if (gap > 250) return; // a pause, not a slow frame
    pace.t += gap;
    if (++pace.n < 60) return;
    const ms = pace.t / pace.n, floor = Math.max(.75, pace.base * .6); pace.n = pace.t = 0;
    if (ms > 36 && pace.now > floor) { pace.now = Math.max(floor, pace.now * .8); map.setPixelRatio(pace.now); map.triggerRepaint(); }
  }

  // A short phone needs the island small above the words. Below this zoom the imagery has no tiles.
  const LOWEST = 5;
  // Far land sits in the fog, so the map can load 40 percent fewer tiles with no visible change.
  const DETAIL = [9.314, 1.5];

  // Sharper imagery for the low parts of the flight. It only loads once the visitor starts the journey.
  function addSharp() {
    sharpOn = true;
    document.querySelectorAll('.j-clouds img').forEach(i => { i.src = i.dataset.cloud; });
    map.addSource('j-land', { type: 'raster', tiles: ['cw://land/{z}/{x}/{y}'], tileSize: 256, minzoom: 6, maxzoom: little ? 12 : 13, bounds: [79.4, 5.75, 82.1, 10] });
    map.addLayer({ id: 'j-land', type: 'raster', source: 'j-land', minzoom: 9.2, paint: Object.assign({}, A.imagery, { 'raster-fade-duration': 150 }) }, 'dim');
    map.setSourceTileLodParams(...DETAIL, 'j-land');
  }
  // While you read one stop, the land around the next one comes down quietly, so it is sharp when you arrive.
  const warmQ = []; let warmId = '', warmOn = 0;
  const pump = () => { while (warmOn < 4 && warmQ.length) { warmOn++; fetch(warmQ.shift(), { priority: 'low' }).then(r => r.arrayBuffer()).catch(() => {}).finally(() => { warmOn--; pump(); }); } };
  function warm(k) {
    const net = navigator.connection;
    if (k.top || !k.c || (net && (net.saveData || /2g/.test(net.effectiveType || '')))) return;
    const top = little ? 12 : 13, lat = k.c[1] * Math.PI / 180;
    warmQ.length = 0;
    for (let z = top; z >= top - 2; z--) {
      const n = 2 ** z, fx = (k.c[0] + 180) / 360 * n, fy = (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n;
      for (let x = Math.floor(fx - 2); x <= fx + 1; x++) for (let v = Math.floor(fy - 2); v <= fy + 1; v++) {
        A.meta.forEach(m => { if (A.tileThere(m.slug, z, x, v)) warmQ.push(A.asset(`assets/map/d/${m.slug}/${z}/${x}/${v}.webp`)); });
      }
    }
    pump();
  }
  const JLAYERS = ['j-land', 'j-halo', 'j-glow', 'j-line', 'j-season'];
  const show = on => JLAYERS.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); });

  function layers() {
    map.addLayer({ id: 'j-sea', type: 'background', paint: { 'background-color': '#0D5255', 'background-opacity': 0, 'background-opacity-transition': { duration: 0 } } }, 'grid');
    map.addLayer({ id: 'j-season', type: 'fill', source: 'districts', paint: { 'fill-color': ['match', ['coalesce', ['feature-state', 's'], 0], 1, '#FFD36B', 2, '#FFFFFF', 3, '#2E7BFF', '#000000'], 'fill-opacity': ['match', ['coalesce', ['feature-state', 's'], 0], 1, .4, 2, .14, 3, .62, 0] } }, 'lines');
    map.addSource('j-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const round = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({ id: 'j-halo', type: 'line', source: 'j-route', layout: round, paint: { 'line-color': '#FF2BD6', 'line-width': 16, 'line-blur': 12, 'line-opacity': .4 } });
    map.addLayer({ id: 'j-glow', type: 'line', source: 'j-route', layout: round, paint: { 'line-color': '#FF2BD6', 'line-width': 6, 'line-blur': 3, 'line-opacity': .85 } });
    map.addLayer({ id: 'j-line', type: 'line', source: 'j-route', layout: round, paint: { 'line-color': '#FFD6F7', 'line-width': 2.2 } });
    const el = document.createElement('div'); el.className = 'j-head'; el.innerHTML = '<i style="opacity:0"></i>';
    head = A.freeMarker(new maplibregl.Marker({ element: el })).setLngLat(data.line[0]).addTo(map);
    labels = LANDMARKS.map(([name, lon, lat]) => {
      const e = document.createElement('div'); e.className = 'm-land'; e.setAttribute('aria-hidden', 'true'); e.innerHTML = `<div class="m-land-in" style="opacity:0"><span>${name}</span><i></i></div>`;
      A.freeMarker(new maplibregl.Marker({ element: e, anchor: 'bottom' })).setLngLat([lon, lat]).addTo(map);
      return { el: e.firstChild, lon, lat, o: '0', w: name.length * 4.4 + 10 };
    });
  }

  function hudDraw() {
    const W = 1000, H = 60, pts = data.km.map((k, i) => `${(k / data.total * W).toFixed(1)} ${(H - clamp(data.ele[i] / 2000, 0, 1) * H).toFixed(1)}`);
    const d = 'M' + pts.join('L');
    document.querySelectorAll('.j-profile').forEach(s => { s.querySelector('path').setAttribute('d', `${d}L${W} ${H}L0 ${H}Z`); });
    data.stops.slice(1, -1).forEach(st => { const a = document.querySelector(`.j-stop[data-stop="${st.id}"]`); if (a) a.style.left = `${st.km / data.total * 100}%`; });
  }

  /* The home sheet: a row lights its districts or draws its road on the island */
  let trips = null, lit = [], tripOn = '', rowOn = null;
  const light1 = (slugs, on) => slugs.forEach(id => map.setFeatureState({ source: 'districts', id }, { picked: on }));
  const anyRoad = () => { wholeRoad = true; clearTimeout(wholeTimer); wholeTimer = setTimeout(() => { wholeRoad = false; }, 900); };
  async function pointAt(row) {
    if (row === rowOn || paused) return;
    if (rowOn) rowOn.classList.remove('is-on');
    rowOn = row; if (row) row.classList.add('is-on');
    if (lit.length) { light1(lit, false); lit = []; }
    const area = row && row.dataset.area, trip = row && row.dataset.trip;
    if (area) { lit = area.split(' '); light1(lit, true); }
    redraw();
    if (trip === tripOn || (!trip && !tripOn)) return;
    tripOn = trip || '';
    anyRoad();
    if (trip) {
      trips = trips || await fetch(A.asset('assets/map/trips.json')).then(r => r.json()).catch(() => ({}));
      if (tripOn === trip && trips[trip]) map.getSource('j-route').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: trips[trip] } });
    } else { drawnKm = -1; render(Math.min(y, end), performance.now(), true); }
  }
  function sheetRows() {
    const sheet = document.querySelector('.atlas-sheet'); if (!sheet) return;
    if (!matchMedia('(hover: hover) and (min-width: 1001px)').matches) return; // on a phone the sheet covers the island, so lighting it is wasted work
    ['pointerover', 'focusin'].forEach(n => sheet.addEventListener(n, e => { const r = e.target.closest('[data-area], [data-trip]'); if (r) pointAt(r); }));
    sheet.addEventListener('pointerleave', () => pointAt(null));
  }

  async function start(api) {
    A = api; map = api.island;
    data = await fetch(A.asset('assets/map/journey.json')).then(r => r.json());
    map.setMaxPitch(82); map.setMinZoom(LOWEST);
    map.setCenterClampedToGround(false);
    map.setSourceTileLodParams(...DETAIL);
    layers(); hudDraw(); measure(); keepLand();
    pace.base = pace.now = map.getPixelRatio();
    ready = true; y = scrollY;
    fetch(A.asset('assets/map/depths.geojson')).then(r => r.json()).then(g => {
      map.addSource('j-depths', { type: 'geojson', data: g });
      map.addLayer({ id: 'j-depth', type: 'line', source: 'j-depths', layout: { visibility: paused ? 'visible' : 'none' }, paint: { 'line-color': '#FFFFFF', 'line-width': .7, 'line-opacity': ['interpolate', ['linear'], ['get', 'd'], 200, .3, 1000, .2, 4000, .1] } }, 'sat');
      redraw();
    }).catch(() => {});
    // The address bar fires resize too. Only a real change of layout may move the camera path, and the map must be drawn again after one.
    const redo = () => { if (paused) return; measure(); settled = false; render(Math.min(y, end), performance.now(), true); };
    let seenW = innerWidth, seenH = vh, boxW = A.stage.clientWidth, boxH = A.stage.clientHeight;
    addEventListener('resize', () => { const h = A.seeH(); if (innerWidth === seenW && h === seenH) return; seenW = innerWidth; seenH = h; if (!paused) map.resize(); });
    // A change of sharpness also counts as a resize for the map, and it comes when the phone is already short of time.
    map.on('resize', () => { const w = A.stage.clientWidth, h = A.stage.clientHeight; if (w === boxW && h === boxH) return; boxW = w; boxH = h; redo(); });
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; } }, { passive: true });
    // Drag to look around. Sideways only on touch, so the page still scrolls under the thumb.
    A.stage.addEventListener('pointerdown', e => { if (e.target.closest('a,button,input') || scrollY < vh * .2 || A.isOpen()) return; look.drag = { x: e.clientX, y: e.clientY, b: look.b, p: look.p, touch: e.pointerType !== 'mouse' }; wrap.classList.add('is-looking'); });
    addEventListener('pointermove', e => { const d = look.drag; if (!d) return; look.b = clamp(d.b - (e.clientX - d.x) * .12, -55, 55); if (!d.touch) look.p = clamp(d.p + (e.clientY - d.y) * .05, -18, 6); }, { passive: true });
    ['pointerup', 'pointercancel', 'blur'].forEach(n => addEventListener(n, () => { look.drag = null; wrap.classList.remove('is-looking'); }));
    document.querySelectorAll('[data-sound]').forEach(b => { b.hidden = false; b.addEventListener('click', soundToggle); });
    document.addEventListener('visibilitychange', () => { if (snd.ctx && snd.on) { if (document.hidden) snd.ctx.suspend(); else snd.ctx.resume(); } });
    wrap.addEventListener('click', e => {
      if (e.target.closest('.j-skip')) { e.preventDefault(); $('after-journey').scrollIntoView({ behavior: 'instant' }); return; } // a smooth scroll would whip the camera through every stop
      const s = e.target.closest('[data-go]'); if (!s) return;
      e.preventDefault();
      const k = keys.find(q => q.id === s.dataset.go); if (k) scrollTo({ top: k.y, behavior: 'smooth' });
    });
    $('j-range').addEventListener('input', e => {
      const m = steps.find(s => s.shot === 'months'); if (!m) return;
      const p = (Number(e.target.value) + .5) / 12, to = wrap.getBoundingClientRect().top + scrollY + m.top + p * (m.h - vh);
      scrollTo({ top: to, behavior: 'instant' });
    });
    sheetRows();
    wrap.classList.add('is-live');
    render(y, performance.now(), true);
    raf = requestAnimationFrame(frame);
    window.__journey = { keys: () => keys, end: () => end, y: () => y, month: () => month, data };
  }
  function pause() {
    if (!ready) return; paused = true;
    if (snd.on) { snd.master.gain.setTargetAtTime(.35, snd.ctx.currentTime, .4); soundMix([.5, .15, 0]); }
    map.setSky(undefined); skyKey = ''; seaOn = -1;
    skirt(A.skirt); if (pace.now !== pace.base) map.setPixelRatio(pace.base); map.setPaintProperty('j-sea', 'background-opacity', 0); map.setPaintProperty('lines', 'line-opacity', 1); if (map.getLayer('j-depth')) map.setLayoutProperty('j-depth', 'visibility', 'visible'); lineOn = -1; A.stage.style.backgroundColor = '';
    map.setCenterClampedToGround(true); map.setMaxPitch(70); map.setMinZoom(5.5);
    show(false); head.getElement().firstChild.style.opacity = 0;
    labels.forEach(l => { l.el.style.opacity = 0; l.o = '0'; });
    setMonth(-1);
    wrap.classList.remove('is-flying'); document.documentElement.classList.remove('is-flying'); flying = false;
    ['.m-intro', '.m-giant'].forEach(q => { const e = document.querySelector(q); if (e) e.removeAttribute('style'); });
  }
  function resume() {
    if (!ready) return;
    map.setMaxPitch(82); map.setMinZoom(LOWEST); map.setCenterClampedToGround(false); show(true); if (map.getLayer('j-depth')) map.setLayoutProperty('j-depth', 'visibility', 'none'); if (pace.now !== pace.base) map.setPixelRatio(pace.now);
    paused = false; y = scrollY; last = 0; drawnKm = -1; settled = false; measure();
    render(Math.min(y, end), performance.now(), true);
    if (snd.on) snd.master.gain.setTargetAtTime(.85, snd.ctx.currentTime, .4);
  }
  // True where the island takes clicks: on the first screen and beside the home sheet.
  const atRest = () => { const a = steps.find(s => s.shot === 'atlas'); return scrollY < 60 || (a && scrollY > a.top - vh * .4); };
  window.CWJourney = { start, pause, resume, atRest };
})();
