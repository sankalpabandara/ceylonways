/* Ceylonways planning engine. Pure functions over window.CW sample data.
   Used by the planner in the browser and by build.mjs and the tests in Node. */
(function (root) {
  'use strict';
  const CW = root.CW;
  const { config, bases, roads, trains, seasons, seasonNotes, seasonRate, stays, offers, activities } = CW;
  const stayById = Object.fromEntries(stays.map(s => [s.id, s]));
  const actById = Object.fromEntries(activities.map(a => [a.id, a]));
  const WALKABLE = new Set(['ell-peak', 'ell-bridge', 'gal-fort']);

  /* ---------- Road network: all pairs shortest time (Floyd Warshall) ---------- */
  const ids = Object.keys(bases);
  const D = {};
  ids.forEach(a => { D[a] = {}; ids.forEach(b => { D[a][b] = a === b ? { hours: 0, km: 0 } : { hours: Infinity, km: Infinity }; }); });
  roads.forEach(([a, b, h, km]) => { D[a][b] = { hours: h, km }; D[b][a] = { hours: h, km }; });
  ids.forEach(k => ids.forEach(i => ids.forEach(j => {
    const via = D[i][k].hours + D[k][j].hours;
    if (via < D[i][j].hours) D[i][j] = { hours: via, km: D[i][k].km + D[k][j].km };
  })));
  const road = (a, b) => D[a][b];

  /* ---------- Small helpers ---------- */
  const round = n => Math.round(n);
  const parseDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null; const [y, m, d] = s.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return isNaN(dt) ? null : dt; };
  const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);
  const iso = dt => dt.toISOString().slice(0, 10);
  const mmdd = dt => iso(dt).slice(5);
  const inWindow = (md, from, to) => from <= to ? md >= from && md <= to : md >= from || md <= to;
  const clone = o => JSON.parse(JSON.stringify(o));
  const nightsOf = plan => plan.stops.reduce((n, s) => n + s.nights, 0);

  function party(plan) {
    const kids = (plan.kids || []).map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 17);
    const adults = Math.max(1, Number(plan.adults) || 1);
    const adultPriced = adults + kids.filter(a => a >= 12).length;
    const childPriced = kids.filter(a => a >= 3 && a < 12).length;
    const big = adultPriced;
    const small = kids.filter(a => a < 12).length;
    const minRooms = Math.max(Math.ceil(big / 2), Math.ceil((big + small) / 3));
    const rooms = Math.max(minRooms, Number(plan.rooms) || 0);
    const pax = adults + kids.length;
    const vehicle = plan.vehicle && plan.vehicle !== 'auto' ? plan.vehicle : (pax <= config.transport.car.maxPax ? 'car' : 'van');
    return { adults, kids, adultPriced, childPriced, pax, minRooms, rooms, vehicle, extraBeds: kids.filter(a => a >= 6 && a < 12).length };
  }

  /* ---------- Quality rule ---------- */
  const meetsRule = (stay, rule) => stay.rating >= rule.minRating && stay.reviews >= rule.minReviews;
  const staysAt = base => stays.filter(s => s.base === base);
  function pickStay(base, tier, rule) {
    const all = staysAt(base);
    const ok = all.filter(s => meetsRule(s, rule));
    const pool = ok.length ? ok : all;
    return (pool.find(s => s.tier === tier) || pool.slice().sort((a, b) => b.rating - a.rating || a.rate - b.rate)[0]).id;
  }

  /* ---------- Season ---------- */
  const monthOf = dt => dt.getUTCMonth();
  const seasonFor = (base, dt) => dt ? seasons[bases[base].region][monthOf(dt)] : null;

  /* ---------- Stay pricing ---------- */
  function priceStay(stay, nightDates, rooms, p) {
    let total = 0; let unavailable = false; const lines = [];
    nightDates.forEach(dt => {
      const factor = dt ? seasonRate[seasonFor(stay.base, dt)] : 1;
      total += stay.rate * factor * rooms;
      if (dt && stay.unavailable && stay.unavailable.some(([f, t]) => inWindow(mmdd(dt), f, t))) unavailable = true;
    });
    let offer = null;
    if (stay.offer && nightDates[0]) {
      const o = offers[stay.offer];
      const fits = nightDates.every(dt => inWindow(mmdd(dt), o.from, o.to)) && nightDates.length >= (o.minNights || 1);
      if (fits) {
        const nightly = total / nightDates.length;
        const saving = o.freeNights ? nightly * o.freeNights * Math.floor(nightDates.length / o.minNights) : total * (o.percent / 100);
        total -= saving; offer = { ...o, id: stay.offer, saving: round(saving) };
      }
    }
    const beds = p.extraBeds * config.childExtraBedPerNight * nightDates.length;
    if (beds) lines.push(`Extra beds for children: ${beds}`);
    return { total: round(total + beds), beds, unavailable, offer };
  }

  /* ---------- Build legs and the day by day schedule ---------- */
  function legsFor(plan) {
    const seq = ['cmb', ...plan.stops.map(s => s.base), 'cmb'];
    return seq.slice(1).map((to, i) => {
      const from = seq[i]; const r = road(from, to);
      const stop = plan.stops[i];
      const t = stop && stop.arriveBy === 'train' ? trains[`${from}>${to}`] : null;
      return { from, to, km: r.km, roadHours: r.hours, mode: t ? 'train' : 'road', hours: t ? t.hours : r.hours, train: t || null, trainWanted: !!(stop && stop.arriveBy === 'train') };
    });
  }

  function schedule(plan, legs) {
    const pace = config.pace[plan.pace] || config.pace.balanced;
    const start = parseDate(plan.arrival);
    const days = []; let k = 0;
    plan.stops.forEach((s, i) => {
      for (let n = 0; n < s.nights; n++, k++) {
        days.push({ index: k, date: start ? iso(addDays(start, k)) : null, base: s.base, stopIndex: i, leg: n === 0 ? legs[i] : null, acts: [], before: [], used: n === 0 ? legs[i].hours : 0, warnings: [] });
      }
    });
    days.push({ index: k, date: start ? iso(addDays(start, k)) : null, base: 'cmb', stopIndex: plan.stops.length - 1, leg: legs[legs.length - 1], acts: [], before: [], used: legs[legs.length - 1].hours, departure: true, warnings: [] });

    // Early starts never go on a day you arrive after a long journey. At a one
    // night stop they move to the next morning, before you drive on.
    const isMorning = a => /^(early morning|dawn|very early start|morning)$/i.test(a.when);
    plan.stops.forEach((s, i) => {
      const mine = days.filter(d => d.stopIndex === i && !d.departure);
      const nextMorning = days[mine[mine.length - 1].index + 1];
      s.acts.map(id => actById[id]).filter(Boolean).sort((a, b) => b.hours - a.hours).forEach(a => {
        let pool = mine;
        if (isMorning(a)) { const calm = mine.filter(d => !d.leg || d.leg.hours < 1.5); pool = calm.length ? calm : [nextMorning]; }
        const target = pool.slice().sort((x, y) => (x.used - y.used) || (x.index - y.index))[0];
        if (target === nextMorning) target.before.push({ id: a.id, stop: i }); else target.acts.push(a.id);
        target.used += a.hours;
      });
    });
    days.forEach(d => {
      if (d.leg && d.leg.hours >= 5) d.warnings.push(`Long travel day: about ${fmtHours(d.leg.hours)} on the ${d.leg.mode === 'train' ? 'train' : 'road'}.`);
      if (!d.departure && (d.acts.length || d.before.length) && d.used > pace.hoursPerDay) d.warnings.push(`Busy day for a ${pace.label.toLowerCase()} pace: about ${fmtHours(d.used)} of travel and plans. Think about adding a night here.`);
      if (d.departure && d.before.length && d.used > pace.hoursPerDay + 2) d.warnings.push(`Long last day: an early activity, then about ${fmtHours(d.leg.hours)} to the airport. Check your flight time.`);
      if (d.departure && d.leg.hours > 4) d.warnings.push(`The drive to the airport is about ${fmtHours(d.leg.hours)}. For an early flight, spend the last night in Negombo.`);
    });
    return days;
  }

  const fmtHours = h => { const whole = Math.floor(h); const m = Math.round((h - whole) * 60); return m ? `${whole} h ${m} min` : `${whole} h`; };

  /* ---------- Main calculation ---------- */
  function calculate(plan) {
    const p = party(plan);
    const legs = legsFor(plan);
    const start = parseDate(plan.arrival);
    const warnings = []; const stopInfo = [];
    let night = 0; let stayTotal = 0; let meals = 0;
    const mealRate = m => m === 'Full board' ? 3 : m === 'Half board' ? config.meals.adultPerDayHalfBoard : config.meals.adultPerDay;
    const eaters = p.adultPriced + p.childPriced * config.meals.childShare;

    plan.stops.forEach((s, i) => {
      const stay = stayById[s.stay];
      const dates = Array.from({ length: s.nights }, (_, n) => start ? addDays(start, night + n) : null);
      const price = priceStay(stay, dates, p.rooms, p);
      const seasonsHere = start ? [...new Set(dates.map(dt => seasonFor(s.base, dt)))] : [];
      const info = { stay, price, season: seasonsHere, warnings: [], nightStart: night };
      if (price.unavailable) info.warnings.push({ kind: 'unavailable', text: `${stay.name} has no sample rate for some of your nights. Choose another stay or move your dates.` });
      if (seasonsHere.includes('wet')) info.warnings.push({ kind: 'season', text: seasonNotes[bases[s.base].region] });
      if (s.nights < (bases[s.base].minNights || 1)) info.warnings.push({ kind: 'short', text: `Most visitors spend at least ${bases[s.base].minNights} nights in ${bases[s.base].short}.` });
      if (!meetsRule(stay, plan.rule)) info.warnings.push({ kind: 'rule', text: `This stay is below your rating rule (${plan.rule.minRating.toFixed(1)}+ with ${plan.rule.minReviews}+ reviews).` });
      if (legs[i].trainWanted && !legs[i].train) info.warnings.push({ kind: 'train', text: `There is no scenic train from ${bases[legs[i].from].short} to ${bases[s.base].short}. This leg is by road.` });
      s.acts.forEach(id => {
        const a = actById[id]; if (!a) return;
        if (a.months && start && !dates.some(dt => a.months.includes(monthOf(dt) + 1))) info.warnings.push({ kind: 'season', text: `${a.name} is usually not running on your dates.` });
        const young = p.kids.filter(age => age < (a.minAge || 0));
        if (young.length) info.warnings.push({ kind: 'age', text: `${a.name} has a minimum age of ${a.minAge}. One adult may need to stay back with the younger children.` });
      });
      stayTotal += price.total;
      meals += s.nights * mealRate(stay.meals) * eaters;
      night += s.nights; stopInfo.push(info);
    });
    meals += config.meals.adultPerDay * eaters; // departure day
    const tripDays = night + 1;

    // Transport
    const roadKm = legs.reduce((n, l) => n + l.km, 0);
    const v = config.transport[p.vehicle];
    let transport; const actCount = plan.stops.reduce((n, s) => n + s.acts.filter(id => !WALKABLE.has(id)).length, 0);
    if (plan.transport === 'transfers') transport = roadKm * v.transferPerKm + actCount * config.transport.localRidePerActivity * Math.ceil(p.pax / 3);
    else transport = tripDays * v.dayRate + roadKm * v.perKm;
    const trainSeats = p.adultPriced + p.childPriced;
    const trainCost = legs.reduce((n, l) => n + (l.train ? l.train.price * trainSeats : 0), 0);

    // Activities
    let actCost = 0;
    plan.stops.forEach(s => s.acts.forEach(id => { const a = actById[id]; if (a) actCost += a.adult * p.adultPriced + a.child * p.childPriced; }));

    const lines = {
      stays: round(stayTotal), transport: round(transport), trains: round(trainCost), activities: round(actCost), meals: round(meals)
    };
    const total = Object.values(lines).reduce((a, b) => a + b, 0);
    const days = schedule(plan, legs);
    const driveHours = legs.reduce((n, l) => n + l.roadHours, 0);
    const travelHours = legs.reduce((n, l) => n + l.hours, 0);

    // Budget in USD
    const rate = config.currencies[plan.currency || 'USD'].rate;
    const budgetUsd = (Number(plan.budget) || 0) / rate;
    const flights = plan.budgetIncludesFlights ? (Number(plan.flightsPerPerson) || 0) / rate * p.pax : 0;
    const groundBudget = budgetUsd - flights;

    if (plan.departure) {
      const dep = parseDate(plan.departure);
      if (start && dep) {
        const want = round((dep - start) / 864e5);
        if (want !== night) warnings.push({ kind: 'dates', text: `Your dates give ${want} nights, but this itinerary has ${night}.`, want });
      }
    }
    if (!start) warnings.push({ kind: 'nodate', text: 'Add your arrival date to see seasonal prices, offers and weather notes.' });
    const ruleGaps = [...new Set(plan.stops.map(s => s.base))].filter(b => !staysAt(b).some(s => meetsRule(s, plan.rule)));

    return { party: p, legs, days, stopInfo, lines, total, tripDays, nights: night, driveHours, travelHours, roadKm, groundBudget, flights, remaining: groundBudget - total, warnings, ruleGaps };
  }

  /* ---------- Plan helpers ---------- */
  function fromPackage(pkg, overrides) {
    const rule = (overrides && overrides.rule) || { minRating: config.quality.minRating, minReviews: config.quality.minReviews };
    return Object.assign({
      v: 1, pkg: pkg.slug, arrival: '', departure: '', adults: 2, kids: [], rooms: 0, currency: 'USD', budget: 0,
      budgetIncludesFlights: false, flightsPerPerson: 0, transport: pkg.transport, vehicle: 'auto', pace: pkg.pace, tier: pkg.tier,
      rule, needs: '', interests: [],
      stops: pkg.stops.map(s => ({ base: s.base, nights: s.nights, stay: s.stay, acts: s.acts.slice(), arriveBy: s.arriveBy || 'road' }))
    }, overrides || {});
  }

  function bestInsert(plan, base) {
    let best = { at: plan.stops.length, added: Infinity };
    for (let i = 0; i <= plan.stops.length; i++) {
      const prev = i === 0 ? 'cmb' : plan.stops[i - 1].base;
      const next = i === plan.stops.length ? 'cmb' : plan.stops[i].base;
      const added = road(prev, base).hours + road(base, next).hours - road(prev, next).hours;
      if (added < best.added) best = { at: i, added };
    }
    return best;
  }

  function withStop(plan, base, nights) {
    const next = clone(plan);
    const { at } = bestInsert(plan, base);
    next.stops.splice(at, 0, { base, nights: nights || bases[base].minNights || 1, stay: pickStay(base, plan.tier, plan.rule), acts: [], arriveBy: 'road' });
    return next;
  }

  function bestOrder(plan) {
    const n = plan.stops.length;
    if (n < 3 || n > 7) return null;
    const cost = order => { let h = 0; let prev = 'cmb'; order.forEach(i => { h += road(prev, plan.stops[i].base).hours; prev = plan.stops[i].base; }); return h + road(prev, 'cmb').hours; };
    const idx = [...Array(n).keys()];
    let best = { order: idx, hours: cost(idx) }; const current = best.hours;
    const perm = (arr, l) => {
      if (l === arr.length) { const h = cost(arr); if (h < best.hours - 1e-9) best = { order: arr.slice(), hours: h }; return; }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    perm(idx.slice(), 0);
    if (current - best.hours < 0.75) return null;
    const next = clone(plan); next.stops = best.order.map(i => clone(plan.stops[i]));
    next.stops.forEach((s, i) => { const prev = i === 0 ? 'cmb' : next.stops[i - 1].base; if (s.arriveBy === 'train' && !trains[`${prev}>${s.base}`]) s.arriveBy = 'road'; });
    return { plan: next, saved: current - best.hours };
  }

  /* ---------- Compare two stays in plain language ---------- */
  function compareStays(a, b) {
    const out = [];
    out.push(`Sample rating ${b.rating.toFixed(1)} from ${b.reviews.toLocaleString('en-US')} reviews, against ${a.rating.toFixed(1)} from ${a.reviews.toLocaleString('en-US')}.`);
    if (a.tier !== b.tier) out.push(`${tierLabel(b.tier)} instead of ${tierLabel(a.tier).toLowerCase()}.`);
    if (a.meals !== b.meals) out.push(`Meals: ${b.meals.toLowerCase()} instead of ${a.meals.toLowerCase()}.`);
    if (a.cancel !== b.cancel) out.push(`Cancellation: ${b.cancel.toLowerCase()}.`);
    const lost = a.facilities.filter(f => !b.facilities.includes(f));
    const gained = b.facilities.filter(f => !a.facilities.includes(f));
    if (lost.length) out.push(`You lose: ${lost.join(', ').toLowerCase()}.`);
    if (gained.length) out.push(`You gain: ${gained.join(', ').toLowerCase()}.`);
    if (a.location !== b.location) out.push(`Location: ${b.location}.`);
    if (b.roomSleeps < a.roomSleeps) out.push(`Rooms here sleep ${b.roomSleeps}. Families may need an extra room.`);
    return out;
  }
  const tierLabel = t => ({ simple: 'Simple and comfortable', boutique: 'Boutique', luxury: 'Luxury' })[t];

  /* ---------- Savings suggestions ---------- */
  function suggestions(plan) {
    const before = calculate(plan); const out = [];
    const push = (kind, title, next, details, why) => {
      const after = calculate(next); const saving = before.total - after.total;
      if (saving <= 0) return;
      out.push({ kind, title, plan: next, before: before.total, after: after.total, saving, details, why });
    };

    plan.stops.forEach((s, i) => {
      const cur = stayById[s.stay];
      const alts = staysAt(s.base).filter(x => x.id !== cur.id && meetsRule(x, plan.rule));
      const priced = alts.map(x => { const n = clone(plan); n.stops[i].stay = x.id; const c = calculate(n); return { x, n, c }; })
        .filter(o => o.c.total < before.total && !o.c.stopInfo[i].price.unavailable)
        .sort((a, b) => (b.x.rating - a.x.rating) || (a.c.total - b.c.total));
      const pick = priced[0]; if (!pick) return;
      const offer = pick.c.stopInfo[i].price.offer;
      const why = [`Meets your rating rule. ${pick.x.reviews < config.smallSample ? 'The review count is small, so treat the score with care.' : ''}`.trim()];
      if (pick.x.meals === cur.meals) why.push(`Keeps ${cur.meals.toLowerCase()}.`);
      if (pick.x.roomSleeps >= cur.roomSleeps) why.push('Rooms suit your group size.');
      push(offer ? 'offer' : 'stay', offer ? `${offer.title} at ${pick.x.name}, ${bases[s.base].short}` : `Stay at ${pick.x.name} in ${bases[s.base].short}`, pick.n,
        [...(offer ? [`${offer.terms}`] : []), ...compareStays(cur, pick.x)], why);
    });

    const order = bestOrder(plan);
    if (order) push('route', 'Visit your stops in a shorter order', order.plan,
      [`New order: ${order.plan.stops.map(s => bases[s.base].short).join(', ')}.`, `About ${fmtHours(order.saved)} less driving in total.`, 'Activities and stays move with each stop.'],
      ['Same places and nights. Less time in the car.']);

    plan.stops.forEach((s, i) => s.acts.forEach(id => {
      const a = actById[id]; if (!a || (a.adult === 0 && a.child === 0)) return;
      const n = clone(plan); n.stops[i].acts = n.stops[i].acts.filter(x => x !== id);
      push('activity', `Leave out ${a.name}`, n, [`Your route and stays do not change.`, `You can still add it later.`], ['Optional experience. Not needed for the route to work.']);
    }));

    if (plan.transport === 'driver') {
      const n = clone(plan); n.transport = 'transfers';
      push('transport', 'Use transfers instead of a car for the whole trip', n,
        ['A driver takes you between towns only.', 'For day trips you use tuk tuks or hotel transport. We add an allowance for these.', 'Less flexible for spontaneous stops.'],
        [`Works best when you stay ${plan.stops.length < 4 ? 'in few places' : 'two nights or more in most places'}.`]);
    }

    if (before.remaining < 0) {
      const longest = plan.stops.map((s, i) => ({ s, i })).filter(o => o.s.nights > (bases[o.s.base].minNights || 1)).sort((a, b) => b.s.nights - a.s.nights)[0];
      if (longest) {
        const n = clone(plan); n.stops[longest.i].nights -= 1;
        push('nights', `One night less in ${bases[longest.s.base].short}`, n, ['Your trip becomes one day shorter.', 'Activities are spread over fewer days.'], ['Keeps every place on your route.']);
      }
    }

    // Keep the biggest saving per kind of change near the top, then the rest.
    out.sort((a, b) => b.saving - a.saving);
    return { before, list: out };
  }

  /* What is the cheapest version of this route that still keeps the visitor's rule? */
  function cheapestVersion(plan) {
    const n = clone(plan);
    n.stops.forEach(s => {
      const ok = staysAt(s.base).filter(x => meetsRule(x, plan.rule));
      if (ok.length) s.stay = ok.slice().sort((a, b) => a.rate - b.rate)[0].id;
      s.acts = s.acts.filter(id => { const a = actById[id]; return a && a.adult === 0; });
      s.nights = Math.max(bases[s.base].minNights || 1, Math.min(s.nights, bases[s.base].minNights || 1));
    });
    const t = clone(n); t.transport = 'transfers';
    const a = calculate(n); const b = calculate(t);
    return a.total <= b.total ? { plan: n, calc: a } : { plan: t, calc: b };
  }

  function preview(plan, next) {
    const a = calculate(plan); const b = calculate(next);
    const dropped = [];
    plan.stops.forEach(s => s.acts.forEach(id => { if (!next.stops.some(t => t.acts.includes(id))) dropped.push(actById[id].name); }));
    return { before: a.total, after: b.total, delta: b.total - a.total, hours: b.driveHours - a.driveHours, days: b.tripDays - a.tripDays, dropped, calc: b };
  }

  /* ---------- Money in the visitor's currency ---------- */
  function money(usd, cur) {
    const c = config.currencies[cur || 'USD'];
    const v = usd * c.rate;
    const step = cur === 'LKR' || cur === 'INR' ? 100 : 1;
    const n = Math.round(v / step) * step;
    return c.symbol + Math.abs(n).toLocaleString('en-US');
  }

  /* ---------- Schematic map (SVG string) ---------- */
  function mapSvg(baseIds, opts) {
    const o = Object.assign({ label: 'Schematic map of the route. Not to scale.', cls: 'route-map', airport: true, names: true }, opts);
    const pt = id => CW.project(bases[id].lat, bases[id].lon);
    const outlinePath = 'M' + CW.outline.map(([lon, lat]) => CW.project(lat, lon).join(' ')).join(' L') + ' Z';
    const seq = o.airport ? ['cmb', ...baseIds, 'cmb'] : baseIds;
    const line = seq.map(pt).map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' ');
    const dots = [...new Set(baseIds)].map((id, i) => { const [x, y] = pt(id); const right = x < 150; return `<g class="map-stop" data-base="${id}"><circle cx="${x}" cy="${y}" r="5"/>${o.names ? `<text x="${right ? x + 9 : x - 9}" y="${y + 4}" text-anchor="${right ? 'start' : 'end'}">${bases[id].short}</text>` : ''}</g>`; }).join('');
    const [ax, ay] = pt('cmb');
    return `<svg class="${o.cls}" viewBox="0 0 235 410" role="img" aria-label="${o.label}"><path class="map-land" d="${outlinePath}"/><path class="map-route" d="${line}" pathLength="1"/>${o.airport ? `<g class="map-airport"><rect x="${ax - 5}" y="${ay - 5}" width="10" height="10" rx="2"/><text x="${ax + 2}" y="${ay + 18}" text-anchor="middle">Airport</text></g>` : ''}${dots}</svg>`;
  }

  root.CWEngine = { mapSvg, road, party, meetsRule, staysAt, pickStay, calculate, fromPackage, bestInsert, withStop, bestOrder, suggestions, cheapestVersion, preview, compareStays, tierLabel, money, fmtHours, stayById, actById, parseDate, iso, addDays, seasonFor, clone };
})(typeof window !== 'undefined' ? window : globalThis);
