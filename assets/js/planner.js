/* Ceylonways package customizer. Works without a backend: plans live in this
   browser (localStorage), in a share link, or in a downloaded file. */
(function () {
  'use strict';
  const CW = window.CW; const E = window.CWEngine;
  const { config, bases, packages, activities, trains } = CW;
  const host = document.getElementById('planner');
  if (!host || !CW || !E) return;
  const ROOT = host.dataset.root || '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pkgBySlug = Object.fromEntries(packages.map(p => [p.slug, p]));
  const DRAFT = 'ceylonways-draft-v1'; const SAVED = 'ceylonways-saved-v1';
  const RATINGS = [[0, 'Any rating'], [4, '4.0 or higher'], [4.5, '4.5 or higher'], [4.8, '4.8 or higher'], [5, '5.0 only (founder\'s rule)']];
  const REVIEWS = [[0, 'Any number'], [20, '20 or more'], [50, '50 or more'], [100, '100 or more'], [500, '500 or more']];
  const INTERESTS = [['wildlife', 'Wildlife'], ['culture', 'Culture and heritage'], ['nature', 'Nature and walking'], ['beach', 'Beaches and surf'], ['food', 'Food']];
  const fmtDate = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  const fmtLong = s => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  /* ---------- Plan validation (shared links and storage are untrusted) ---------- */
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.stops)) return null;
    const base = pkgBySlug[raw.pkg] || packages[0];
    const p = E.fromPackage(base);
    const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const date = v => (typeof v === 'string' && E.parseDate(v)) ? v : '';
    p.pkg = base.slug;
    p.arrival = date(raw.arrival); p.departure = date(raw.departure);
    p.adults = num(raw.adults, 1, 8, 2);
    p.kids = Array.isArray(raw.kids) ? raw.kids.slice(0, 4).map(k => num(k, 0, 17, 6)) : [];
    p.rooms = num(raw.rooms, 0, 8, 0);
    p.currency = config.currencies[raw.currency] ? raw.currency : 'USD';
    p.budget = num(raw.budget, 0, 1e9, 0);
    p.budgetIncludesFlights = !!raw.budgetIncludesFlights;
    p.flightsPerPerson = num(raw.flightsPerPerson, 0, 1e8, 0);
    p.transport = raw.transport === 'transfers' ? 'transfers' : 'driver';
    p.vehicle = ['auto', 'car', 'van'].includes(raw.vehicle) ? raw.vehicle : 'auto';
    p.pace = config.pace[raw.pace] ? raw.pace : 'balanced';
    p.tier = ['simple', 'boutique', 'luxury'].includes(raw.tier) ? raw.tier : base.tier;
    p.rule = { minRating: num(raw.rule && raw.rule.minRating, 0, 5, config.quality.minRating), minReviews: num(raw.rule && raw.rule.minReviews, 0, 1e6, config.quality.minReviews) };
    p.needs = typeof raw.needs === 'string' ? raw.needs.slice(0, 1000) : '';
    p.diet = typeof raw.diet === 'string' ? raw.diet.slice(0, 1000) : '';
    p.interests = Array.isArray(raw.interests) ? raw.interests.filter(i => INTERESTS.some(([k]) => k === i)) : [];
    const stops = raw.stops.slice(0, 8).map(s => {
      if (!s || !bases[s.base] || bases[s.base].airport) return null;
      const stay = E.stayById[s.stay] && E.stayById[s.stay].base === s.base ? s.stay : E.pickStay(s.base, p.tier, p.rule);
      const acts = Array.isArray(s.acts) ? [...new Set(s.acts)].filter(id => E.actById[id] && E.actById[id].base === s.base) : [];
      return { base: s.base, nights: num(s.nights, 1, 14, 1), stay, acts, arriveBy: s.arriveBy === 'train' ? 'train' : 'road' };
    }).filter(Boolean);
    if (!stops.length) return null;
    p.stops = stops;
    return p;
  }

  /* ---------- State, undo and redo ---------- */
  let plan; let past = []; let future = []; let lastTotal = null; const dismissed = new Set();
  function commit(next, msg) {
    past.push(JSON.stringify(plan)); if (past.length > 80) past.shift();
    future = []; plan = next; afterChange(msg);
  }
  function undo() { if (!past.length) return; future.push(JSON.stringify(plan)); plan = JSON.parse(past.pop()); syncForm(); afterChange('Change undone.'); }
  function redo() { if (!future.length) return; past.push(JSON.stringify(plan)); plan = JSON.parse(future.pop()); syncForm(); afterChange('Change redone.'); }
  function afterChange(msg) {
    store.set(DRAFT, plan);
    // Keep the form in step with undo, suggestions and dialogs, without losing focus.
    const act = document.activeElement; const key = act && act.dataset && act.dataset.field ? `[data-field="${act.dataset.field}"]${act.dataset.i ? `[data-i="${act.dataset.i}"]` : ''}${act.type === 'radio' || act.type === 'checkbox' ? `[value="${act.value}"]` : ''}` : null;
    syncForm(); render();
    if (key) { const el = $('setup-form').querySelector(key); if (el && el !== act) el.focus(); }
    if (msg) toast(msg);
  }
  const edit = (fn, msg) => { const next = E.clone(plan); fn(next); commit(next, msg); };

  /* ---------- Initial plan ---------- */
  const params = new URLSearchParams(location.search);
  let restoredFrom = '';
  function initialPlan() {
    if (location.hash.startsWith('#plan=')) {
      try {
        const json = decodeURIComponent(escape(atob(location.hash.slice(6).replace(/-/g, '+').replace(/_/g, '/'))));
        const p = sanitize(JSON.parse(json)); if (p) { restoredFrom = 'Opened a shared plan.'; return p; }
      } catch (e) { restoredFrom = 'That share link could not be read, so we opened a starting package instead.'; }
    }
    const slug = params.get('package');
    if (slug && pkgBySlug[slug]) return E.fromPackage(pkgBySlug[slug]);
    const draft = sanitize(store.get(DRAFT));
    if (draft) { restoredFrom = 'Welcome back. We restored the plan you were working on.'; return draft; }
    return E.fromPackage(packages[0]);
  }

  /* ---------- Static skeleton ---------- */
  host.innerHTML = `
  <div class="planner-grid">
    <div class="planner-main">
      <section class="setup glass-strong panel" aria-labelledby="setup-title">
        <details id="setup-details" open>
          <summary><div><h2 id="setup-title">Your trip details</h2><p class="setup-summary" id="setup-summary"></p></div></summary>
          <div class="form-grid" id="setup-form"></div>
        </details>
      </section>
      <div class="notices" id="notices" aria-live="polite"></div>
      <section id="suggest-section" class="glass-strong panel" aria-labelledby="suggest-title">
        <div class="p-section-title"><h2 id="suggest-title">Ways to save</h2><span class="badge badge-sample">Based on sample rates</span></div>
        <div id="suggestions"></div>
      </section>
      <section aria-labelledby="itin-title" id="itinerary-section">
        <div class="p-section-title"><h2 id="itin-title">Day by day</h2>
          <div class="toolbar">
            <button type="button" class="icon-btn" data-action="undo" id="undo-btn">Undo</button>
            <button type="button" class="icon-btn" data-action="redo" id="redo-btn">Redo</button>
            <button type="button" class="icon-btn" data-action="add-place">Add a place</button>
            <button type="button" class="icon-btn" data-action="reset">Start again</button>
          </div>
        </div>
        <div class="stops" id="stops"></div>
        <div class="elsewhere glass-strong panel" id="elsewhere"></div>
      </section>
      <section class="quote glass-strong panel" aria-labelledby="quote-title" id="quote">
        <div class="p-section-title"><h2 id="quote-title">Request a confirmed quote</h2></div>
        <p>When you are happy with the plan, ask for a quote. A person checks every hotel, driver and ticket for your dates and sends back a confirmed price. You only book after that.</p>
        <form class="quote-form" id="quote-form" novalidate>
          <label class="field">Your name<input name="name" autocomplete="name" required></label>
          <label class="field">Email<input name="email" type="email" autocomplete="email" required></label>
          <label class="field">Country you live in<input name="country" autocomplete="country-name"></label>
          <label class="field">Best way to reach you<select name="contact"><option>Email</option><option>WhatsApp</option><option>Phone call</option></select></label>
          <label class="check field-wide"><input type="checkbox" name="flexible"> My dates are flexible by a few days</label>
          <label class="field field-wide">Anything else we should know<textarea name="message" maxlength="2000"></textarea></label>
          <div class="field-wide"><button class="button button-moss" type="submit">Prepare my request</button></div>
        </form>
        <div class="quote-out" id="quote-out" aria-live="polite"></div>
      </section>
    </div>
    <aside class="planner-side" aria-label="Trip summary">
      <section class="summary glass-strong" id="summary"></section>
      <section class="summary glass-strong" id="saved" aria-labelledby="saved-title"><h2 class="h3" id="saved-title">Saved trips</h2><div id="saved-list"></div></section>
    </aside>
  </div>
  <div class="mobile-total" id="mobile-total"></div>
  <dialog class="sheet" id="sheet" aria-labelledby="sheet-title"><div class="sheet-head"><h2 id="sheet-title"></h2><button type="button" class="icon-btn" data-close>Close</button></div><div class="sheet-body" id="sheet-body"></div></dialog>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  const $ = id => document.getElementById(id);

  /* ---------- Setup form ---------- */
  const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
  function buildForm() {
    $('setup-form').innerHTML = `
      <label class="field field-wide">Starting package
        <select data-field="pkg">${packages.map(p => opt(p.slug, `${p.name}, ${p.days} days`)).join('')}</select>
        <span class="hint">Changing the package replaces the itinerary. Your dates, travellers and budget stay.</span></label>
      <fieldset class="field-group"><legend>Dates</legend>
        <label class="field">Arrival in Sri Lanka<input type="date" data-field="arrival"></label>
        <label class="field">Departure<input type="date" data-field="departure"><span class="hint" id="dep-hint"></span></label>
        <div class="field">Number of days<div class="stepper"><button type="button" data-action="days-minus" aria-label="One day less"><span class="minus" aria-hidden="true"></span></button><output id="days-out" aria-live="polite"></output><button type="button" data-action="days-plus" aria-label="One day more">+</button></div></div>
      </fieldset>
      <fieldset class="field-group"><legend>Travellers</legend>
        <div class="field">Adults<div class="stepper"><button type="button" data-action="adults-minus" aria-label="One adult less"><span class="minus" aria-hidden="true"></span></button><output id="adults-out"></output><button type="button" data-action="adults-plus" aria-label="One adult more">+</button></div></div>
        <div class="field">Children<div class="stepper"><button type="button" data-action="kids-minus" aria-label="One child less"><span class="minus" aria-hidden="true"></span></button><output id="kids-out"></output><button type="button" data-action="kids-plus" aria-label="One child more">+</button></div></div>
        <div class="field field-wide" id="kid-ages-wrap"><span>Children's ages on the day you arrive</span><div class="kid-ages" id="kid-ages"></div><span class="hint">Ages change entry prices and beds. Children under 12 can share a room with two adults.</span></div>
        <label class="field">Rooms<select data-field="rooms" id="rooms-select"></select></label>
        <label class="field">Vehicle<select data-field="vehicle">${opt('auto', 'Choose for us')}${opt('car', 'Car, up to 3 people')}${opt('van', 'Van, up to 8 people')}</select></label>
      </fieldset>
      <fieldset class="field-group"><legend>Budget</legend>
        <label class="field">Total budget<input type="number" inputmode="numeric" min="0" step="50" data-field="budget" placeholder="For example 3000"></label>
        <label class="field">Currency<select data-field="currency">${Object.keys(config.currencies).map(c => opt(c, c)).join('')}</select><span class="hint">Fixed sample rates from ${config.sampleDate}. Not live.</span></label>
        <label class="check field-wide"><input type="checkbox" data-field="budgetIncludesFlights"> My budget includes international flights</label>
        <label class="field" id="flights-wrap">Flights per person, your estimate<input type="number" inputmode="numeric" min="0" step="50" data-field="flightsPerPerson"></label>
      </fieldset>
      <fieldset class="field-group"><legend>Style</legend>
        <div class="field field-wide"><span>Stay style</span><div class="seg" role="radiogroup" aria-label="Stay style">${['simple', 'boutique', 'luxury'].map(t => `<label><input type="radio" name="tier" value="${t}" data-field="tier"><span>${E.tierLabel(t)}</span></label>`).join('')}</div><span class="hint">Changing this swaps every stay to that style. You can undo.</span></div>
        <div class="field field-wide"><span>Travel pace</span><div class="seg" role="radiogroup" aria-label="Travel pace">${Object.entries(config.pace).map(([k, v]) => `<label><input type="radio" name="pace" value="${k}" data-field="pace"><span>${v.label}</span></label>`).join('')}</div><span class="hint" id="pace-hint"></span></div>
        <div class="field field-wide"><span>Getting around</span><div class="seg" role="radiogroup" aria-label="Transport">${[['driver', 'Private car and driver'], ['transfers', 'Transfers between towns only']].map(([k, t]) => `<label><input type="radio" name="transport" value="${k}" data-field="transport"><span>${t}</span></label>`).join('')}</div></div>
        <div class="field field-wide"><span>Interests</span><div class="seg">${INTERESTS.map(([k, t]) => `<label><input type="checkbox" value="${k}" data-field="interests"><span>${t}</span></label>`).join('')}</div><span class="hint">We list matching activities first.</span></div>
      </fieldset>
      <fieldset class="field-group"><legend>Quality rule for stays</legend>
        <label class="field">Minimum rating<select data-field="minRating">${RATINGS.map(([v, t]) => opt(v, t)).join('')}</select></label>
        <label class="field">Minimum reviews<select data-field="minReviews">${REVIEWS.map(([v, t]) => opt(v, t)).join('')}</select></label>
        <p class="hint field-wide">Ratings here are sample scores out of 5, not live Google data. A rating is not a star class. Stays below your rule are marked, and we never lower your rule without asking.</p>
      </fieldset>
      <fieldset class="field-group"><legend>Needs</legend>
        <label class="field field-wide">Access needs<textarea data-field="needs" placeholder="For example: no steep steps, ground floor rooms, wheelchair user"></textarea></label>
        <label class="field field-wide">Food and diet<textarea data-field="diet" placeholder="For example: vegetarian, nut allergy, halal"></textarea></label>
      </fieldset>`;
  }

  function syncForm() {
    const f = $('setup-form'); const q = s => f.querySelector(s);
    q('[data-field="pkg"]').value = plan.pkg;
    q('[data-field="arrival"]').value = plan.arrival; q('[data-field="departure"]').value = plan.departure;
    const today = new Date().toISOString().slice(0, 10); q('[data-field="arrival"]').min = today; q('[data-field="departure"]').min = plan.arrival || today;
    q('[data-field="budget"]').value = plan.budget || '';
    q('[data-field="currency"]').value = plan.currency;
    q('[data-field="budgetIncludesFlights"]').checked = plan.budgetIncludesFlights;
    q('[data-field="flightsPerPerson"]').value = plan.flightsPerPerson || '';
    $('flights-wrap').hidden = !plan.budgetIncludesFlights;
    q('[data-field="vehicle"]').value = plan.vehicle;
    f.querySelectorAll('[data-field="tier"]').forEach(r => { r.checked = r.value === plan.tier; });
    f.querySelectorAll('[data-field="pace"]').forEach(r => { r.checked = r.value === plan.pace; });
    f.querySelectorAll('[data-field="transport"]').forEach(r => { r.checked = r.value === plan.transport; });
    f.querySelectorAll('[data-field="interests"]').forEach(c => { c.checked = plan.interests.includes(c.value); });
    q('[data-field="minRating"]').value = String(RATINGS.some(([v]) => v === plan.rule.minRating) ? plan.rule.minRating : 0);
    q('[data-field="minReviews"]').value = String(REVIEWS.some(([v]) => v === plan.rule.minReviews) ? plan.rule.minReviews : 0);
    q('[data-field="needs"]').value = plan.needs || ''; q('[data-field="diet"]').value = plan.diet || '';
    $('pace-hint').textContent = config.pace[plan.pace].note;
    const ages = ['Under 1', ...Array.from({ length: 17 }, (_, i) => `${i + 1} years`)];
    $('kid-ages').innerHTML = plan.kids.map((a, i) => `<label><span class="visually-hidden">Age of child ${i + 1}</span><select data-field="kid" data-i="${i}">${ages.map((t, v) => opt(v, t, v === a)).join('')}</select></label>`).join('');
    $('kid-ages-wrap').hidden = !plan.kids.length;
  }

  /* ---------- Rendering ---------- */
  function render() {
    const c = E.calculate(plan);
    const money = n => E.money(n, plan.currency);
    $('adults-out').textContent = plan.adults; $('kids-out').textContent = plan.kids.length; $('days-out').textContent = `${c.tripDays} days`;
    const rs = $('rooms-select'); const min = c.party.minRooms;
    rs.innerHTML = opt(0, `Choose for us (${min} room${min > 1 ? 's' : ''})`, !plan.rooms) + [0, 1, 2].map(n => opt(min + n, `${min + n} room${min + n > 1 ? 's' : ''}`, plan.rooms === min + n)).join('');
    const lastDay = c.days[c.days.length - 1].date;
    $('dep-hint').textContent = lastDay ? `This itinerary leaves on ${fmtDate(lastDay)}.` : 'Leave empty to follow the itinerary.';
    $('setup-summary').textContent = `${pkgBySlug[plan.pkg].name} · ${plan.arrival ? fmtLong(plan.arrival) : 'No dates yet'} · ${plan.adults} adult${plan.adults > 1 ? 's' : ''}${plan.kids.length ? `, ${plan.kids.length} child${plan.kids.length > 1 ? 'ren' : ''}` : ''} · ${plan.budget ? money(plan.budget / config.currencies[plan.currency].rate) + ' budget' : 'No budget set'}`;
    $('undo-btn').disabled = !past.length; $('redo-btn').disabled = !future.length;
    renderNotices(c); renderSuggestions(c); renderStops(c); renderElsewhere(); renderSummary(c); renderSaved();
  }

  function renderNotices(c) {
    const out = []; const money = n => E.money(n, plan.currency);
    c.warnings.forEach(w => {
      if (w.kind === 'dates') out.push(`<div class="notice notice-warn"><span>${w.text}</span><button type="button" class="button button-sm button-moss" data-action="fit-dates" data-want="${w.want}">Fit the itinerary to ${w.want} nights</button><button type="button" class="button button-sm button-ghost" data-action="match-departure">Use the itinerary's dates</button></div>`);
      if (w.kind === 'nodate') out.push(`<div class="notice notice-info"><span>${w.text}</span></div>`);
    });
    c.ruleGaps.filter(b => !dismissed.has('gap:' + b + plan.rule.minRating + plan.rule.minReviews)).forEach(b => {
      const broader = broaderRule(b);
      out.push(`<div class="notice notice-warn"><span>No stay in ${bases[b].short} meets your rule (${plan.rule.minRating.toFixed(1)} or higher with ${plan.rule.minReviews}+ reviews) in our sample list. The current stay there is marked below your rule.</span>${broader ? `<button type="button" class="button button-sm button-moss" data-action="broaden" data-r="${broader.minRating}" data-n="${broader.minReviews}">Widen to ${broader.minRating.toFixed(1)}+ with ${broader.minReviews}+ reviews</button>` : ''}<button type="button" class="button button-sm button-ghost" data-action="keep-rule" data-key="gap:${b}${plan.rule.minRating}${plan.rule.minReviews}">Keep my rule</button></div>`);
    });
    if (c.party.pax > 8) out.push(`<div class="notice notice-warn"><span>Groups over 8 need two vehicles or a small bus. The estimate uses one van. We will price this properly in your quote.</span></div>`);
    if (!plan.budget) out.push(`<div class="notice notice-info"><span>Add a total budget in your trip details to see whether this plan fits.</span></div>`);
    else if (c.groundBudget <= 0) out.push(`<div class="notice notice-bad"><span>Your flight estimate uses up the whole budget. Raise the budget or lower the flight estimate.</span></div>`);
    $('notices').innerHTML = out.join('');
  }

  function broaderRule(base) {
    const steps = [[4.8, 50], [4.8, 20], [4.5, 50], [4.5, 20], [4, 0], [0, 0]];
    for (const [r, n] of steps) {
      if (r > plan.rule.minRating || (r === plan.rule.minRating && n >= plan.rule.minReviews)) continue;
      if (E.staysAt(base).some(s => s.rating >= r && s.reviews >= n)) return { minRating: r, minReviews: n };
    }
    return null;
  }

  let currentSuggestions = [];
  function renderSuggestions(c) {
    const money = n => E.money(n, plan.currency);
    const { list } = E.suggestions(plan); currentSuggestions = list;
    const over = plan.budget && c.remaining < 0;
    let head = '';
    if (over) {
      const cheapest = E.cheapestVersion(plan);
      const gap = -c.remaining;
      if (cheapest.calc.total > c.groundBudget) {
        head = `<div class="notice notice-bad"><span><strong>This route cannot fit your budget.</strong> Even with the lowest priced stays that meet your rule, the shortest stays in each place, transfers only and no paid activities, it costs about ${money(cheapest.calc.total)}. That is ${money(cheapest.calc.total - c.groundBudget)} more than your ${plan.budgetIncludesFlights ? 'budget after flights' : 'budget'}. Realistic options: a shorter trip with fewer places, travelling outside the busy season, widening your rating rule, or raising the budget.</span><button type="button" class="button button-sm button-ghost" data-action="try-package" data-slug="budget-sri-lanka-7-days">Try the budget package</button><button type="button" class="button button-sm button-ghost" data-action="set-budget" data-v="${Math.ceil(cheapest.calc.total * config.currencies[plan.currency].rate / 50) * 50 + (plan.budgetIncludesFlights ? plan.flightsPerPerson * c.party.pax : 0)}">Set budget to the lowest version</button></div>`;
      } else {
        head = `<div class="notice notice-warn"><span>You are <strong>${money(gap)}</strong> over your budget. The lowest version of this route that keeps your rule costs about ${money(cheapest.calc.total)}. The changes below bring you closer. Nothing changes until you apply it.</span><button type="button" class="button button-sm button-ghost" data-action="preview-cheapest">See the lowest version</button></div>`;
      }
    } else if (plan.budget) {
      head = `<div class="notice notice-good"><span>Your plan fits your budget with ${money(c.remaining)} to spare. Here are ways to spend less anyway.</span></div>`;
    }
    const card = (s, i) => `<article class="sugg glass-strong">
      <div class="sugg-top"><div><p class="sugg-kind">${{ stay: 'Alternative stay', offer: 'Offer for your dates', route: 'Shorter route', activity: 'Optional experience', transport: 'Transport', nights: 'Shorter stay' }[s.kind]}</p><h3>${esc(s.title)}</h3></div>
        <p class="save-amt">Save ${money(s.saving)}<small>for your group</small></p></div>
      <p class="before-after"><span>Trip total</span> <s>${money(s.before)}</s> <span aria-hidden="true">→</span> <b>${money(s.after)}</b>${plan.budget ? ` <span class="badge ${c.groundBudget - s.after >= 0 ? 'badge-good' : 'badge-bad'}">${c.groundBudget - s.after >= 0 ? 'Within budget' : 'Still over budget'}</span>` : ''}</p>
      <details><summary>What changes</summary><ul>${s.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul></details>
      ${s.why.length ? `<p class="why">Why we suggest this: ${esc(s.why.join(' '))}</p>` : ''}
      <div class="sugg-actions"><button type="button" class="button button-sm button-moss" data-action="apply-sugg" data-i="${i}">Apply this change</button>${s.kind === 'stay' || s.kind === 'offer' ? `<button type="button" class="button button-sm button-ghost" data-action="stays" data-i="${plan.stops.findIndex((st, k) => st.stay !== s.plan.stops[k].stay)}">Compare all stays here</button>` : ''}</div>
    </article>`;
    const top = list.slice(0, 3); const rest = list.slice(3);
    $('suggestions').innerHTML = head + (list.length ? `<div class="sugg-list">${top.map(card).join('')}</div>${rest.length ? `<details class="more-sugg"><summary class="link-arrow">Show ${rest.length} more ways to save</summary><div class="sugg-list">${rest.map((s, i) => card(s, i + 3)).join('')}</div></details>` : ''}` : `<p class="muted">No cheaper options keep your rating rule and route. Try widening the rule, or a simpler stay style.</p>`);
  }

  function badgeRow(stay, calcStop) {
    const b = [`<span class="badge badge-sample">Sample stay</span>`];
    b.push(`<span class="badge ${E.meetsRule(stay, plan.rule) ? 'badge-good' : 'badge-bad'}">Sample rating ${stay.rating.toFixed(1)} of 5 · ${stay.reviews.toLocaleString('en-US')} reviews</span>`);
    if (stay.reviews < config.smallSample) b.push(`<span class="badge">Small review sample</span>`);
    b.push(`<span class="badge">${stay.stars ? `${stay.stars} star class` : 'No star class'}</span>`);
    b.push(`<span class="badge">${esc(stay.meals)}</span>`);
    if (calcStop && calcStop.price.offer) b.push(`<span class="badge badge-offer">${esc(calcStop.price.offer.title)} applied</span>`);
    return `<div class="badges">${b.join('')}</div>`;
  }

  function renderStops(c) {
    const money = n => E.money(n, plan.currency);
    const pace = config.pace[plan.pace];
    const dayHtml = d => {
      const leg = d.leg; let legHtml = '';
      if (leg) {
        const from = leg.from === 'cmb' ? 'the airport' : bases[leg.from].short;
        const to = leg.to === 'cmb' ? 'the airport' : bases[leg.to].short;
        const trainHere = trains[`${leg.from}>${leg.to}`];
        legHtml = `<p class="pday-leg">${leg.mode === 'train' ? `Scenic train from ${from} to ${to}, about ${E.fmtHours(leg.hours)}. Your bags go by road.` : `Drive from ${from} to ${to}, about ${E.fmtHours(leg.hours)}, ${leg.km} km.`}${trainHere && !d.departure ? ` <button type="button" class="icon-btn" data-action="toggle-train" data-i="${d.stopIndex}">${leg.mode === 'train' ? 'Go by road instead' : 'Take the train instead'}</button>` : ''}</p>`;
      }
      const actLi = (id, stop, pre) => { const a = E.actById[id]; const cost = a.adult * c.party.adultPriced + a.child * c.party.childPriced; return `<li><span>${pre ? `<span class="act-meta">Before you leave ${esc(bases[plan.stops[stop].base].short)}: </span>` : ''}${esc(a.name)}<span class="act-meta"> · ${a.hours} h · ${esc(a.when)} · ${cost ? money(cost) : 'Free'}</span></span><button type="button" class="icon-btn" data-action="remove-act" data-i="${stop}" data-id="${id}" aria-label="Remove ${esc(a.name)}">Remove</button></li>`; };
      const acts = d.acts.map(id => actLi(id, d.stopIndex, false)).join('');
      const pct = Math.min(100, d.used / pace.hoursPerDay * 100);
      return `<li class="pday"><p class="pday-label">Day ${d.index + 1}<small>${d.date ? fmtDate(d.date) : ''}</small></p><div>
        ${d.before.length ? `<ul class="pday-acts" style="margin-bottom:8px">${d.before.map(b => actLi(b.id, b.stop, true)).join('')}</ul>` : ''}
        ${legHtml}
        ${acts ? `<ul class="pday-acts">${acts}</ul>` : d.before.length && !d.departure ? '' : `<p class="pday-free">${d.departure ? 'Fly home. Allow three hours at the airport.' : d.leg ? 'Settle in after the journey.' : 'Free time. Rest, explore or add something.'}</p>`}
        ${d.departure ? '' : `<div class="load${d.used > pace.hoursPerDay ? ' over' : ''}" title="Planned hours against your pace"><span style="width:${pct}%"></span></div>`}
        ${d.warnings.map(w => `<p class="pday-warn">${esc(w)}</p>`).join('')}
      </div></li>`;
    };
    const stopsHtml = plan.stops.map((s, i) => {
      const info = c.stopInfo[i]; const stay = info.stay; const days = c.days.filter(d => d.stopIndex === i && !d.departure);
      const first = days[0]; const last = days[days.length - 1];
      const here = activities.filter(a => a.base === s.base).sort((a, b) => (plan.interests.includes(b.type) - plan.interests.includes(a.type)));
      return `<article class="stop glass-strong" aria-labelledby="stop-${i}">
        <div class="stop-head"><div><h3 id="stop-${i}">${esc(bases[s.base].name)}</h3><p class="stop-meta">${s.nights} night${s.nights > 1 ? 's' : ''} · Day ${first.index + 1}${s.nights > 1 ? ` to ${last.index + 1}` : ''}${first.date ? ` · ${fmtDate(first.date)} to ${fmtDate(E.iso(E.addDays(E.parseDate(last.date), 1)))}` : ''}</p></div>
          <div class="stop-tools">
            <div class="stepper" role="group" aria-label="Nights in ${esc(bases[s.base].short)}"><button type="button" data-action="night-minus" data-i="${i}" aria-label="One night less in ${esc(bases[s.base].short)}"${s.nights <= 1 ? ' disabled' : ''}><span class="minus" aria-hidden="true"></span></button><output>${s.nights}</output><button type="button" data-action="night-plus" data-i="${i}" aria-label="One night more in ${esc(bases[s.base].short)}"${s.nights >= 14 ? ' disabled' : ''}>+</button></div>
            <button type="button" class="icon-btn" data-action="move" data-i="${i}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="Visit ${esc(bases[s.base].short)} earlier">Earlier</button>
            <button type="button" class="icon-btn" data-action="move" data-i="${i}" data-d="1"${i === plan.stops.length - 1 ? ' disabled' : ''} aria-label="Visit ${esc(bases[s.base].short)} later">Later</button>
            <button type="button" class="icon-btn" data-action="change-place" data-i="${i}">Change place</button>
            <button type="button" class="icon-btn" data-action="remove-stop" data-i="${i}"${plan.stops.length < 2 ? ' disabled' : ''}>Remove</button>
          </div></div>
        ${info.warnings.length ? `<div class="stop-notices">${info.warnings.map(w => `<div class="notice ${w.kind === 'unavailable' || w.kind === 'rule' ? 'notice-bad' : 'notice-warn'}"><span>${esc(w.text)}</span>${w.kind === 'unavailable' || w.kind === 'rule' ? `<button type="button" class="button button-sm button-ghost" data-action="stays" data-i="${i}">See other stays</button>` : ''}</div>`).join('')}</div>` : ''}
        <div class="stay-row"><div><strong>${esc(stay.name)}</strong> <span class="stay-sub">· ${esc(stay.type)} · ${esc(stay.location)}</span>${badgeRow(stay, info)}</div>
          <div><p class="stay-sub">${money(info.price.total)} for ${s.nights} night${s.nights > 1 ? 's' : ''}, ${c.party.rooms} room${c.party.rooms > 1 ? 's' : ''}</p><button type="button" class="button button-sm button-ghost" data-action="stays" data-i="${i}">Change stay</button></div></div>
        <ol class="days">${days.map(dayHtml).join('')}</ol>
        <details class="acts-edit"><summary>Add or remove things to do in ${esc(bases[s.base].short)}</summary>
          ${here.map(a => { const cost = a.adult * c.party.adultPriced + a.child * c.party.childPriced; return `<label class="check"><span>${esc(a.name)}<span class="act-meta">${a.hours} h · ${esc(a.when)} · ${cost ? money(cost) + ' for your group' : 'Free'}${a.note ? ' · ' + esc(a.note) : ''}</span></span><input type="checkbox" data-action="toggle-act" data-i="${i}" data-id="${a.id}"${s.acts.includes(a.id) ? ' checked' : ''}></label>`; }).join('')}
        </details>
      </article>`;
    }).join('');
    const dep = c.days[c.days.length - 1];
    $('stops').innerHTML = stopsHtml + `<article class="stop glass-strong" aria-label="Departure day"><ol class="days">${dayHtml(dep)}</ol></article>`;
  }

  function renderElsewhere() {
    const inRoute = new Set(plan.stops.map(s => s.base));
    const others = activities.filter(a => !inRoute.has(a.base)).sort((a, b) => (plan.interests.includes(b.type) - plan.interests.includes(a.type)) || (b.adult - a.adult)).slice(0, 6);
    $('elsewhere').innerHTML = `<h3>Want something that is not on this route?</h3><p class="small">These need a stop somewhere new. We show the extra nights, driving and cost before anything changes.</p><ul>${others.map(a => `<li><span><strong>${esc(a.name)}</strong> <span class="muted">· needs a stop in ${esc(bases[a.base].short)}</span></span><button type="button" class="icon-btn" data-action="add-place" data-base="${a.base}" data-act="${a.id}">See what it takes</button></li>`).join('')}</ul>`;
  }

  function renderSummary(c) {
    const money = n => E.money(n, plan.currency);
    const pkg = pkgBySlug[plan.pkg];
    const pct = c.groundBudget > 0 ? Math.min(100, c.total / c.groundBudget * 100) : 0;
    const over = plan.budget && c.remaining < 0;
    const offers = c.stopInfo.filter(s => s.price.offer).map(s => `${s.price.offer.title} at ${s.stay.name}: ${money(s.price.offer.saving)} off`);
    $('summary').innerHTML = `
      <div class="sum-label"><p class="eyebrow">Your trip</p><span class="badge badge-sample">Planning estimate</span></div>
      <h2 class="h3">${esc(pkg.name)}${JSON.stringify(E.fromPackage(pkg).stops) !== JSON.stringify(plan.stops) ? '<span class="small"> · customized</span>' : ''}</h2>
      <p class="sum-total" id="sum-total">${money(c.total)}</p>
      <p class="sum-pp">${money(c.total / c.party.pax)} per person · ${c.party.pax} traveller${c.party.pax > 1 ? 's' : ''}</p>
      ${plan.budget ? `<div class="budget-bar${over ? ' over' : ''}" role="img" aria-label="${Math.round(c.total / Math.max(1, c.groundBudget) * 100)} percent of budget used"><span style="width:${pct}%"></span></div>
      <p class="budget-text ${over ? 'over' : 'under'}">${c.groundBudget <= 0 ? 'Flights use up the whole budget.' : over ? `${money(-c.remaining)} over your budget` : `${money(c.remaining)} left in your budget`}${plan.budgetIncludesFlights ? ` after about ${money(c.flights)} for flights` : ''}</p>` : `<p class="budget-text">No budget set yet.</p>`}
      <dl class="trip-facts"><div><dt>Days</dt><dd>${c.tripDays}</dd></div><div><dt>Nights</dt><dd>${c.nights}</dd></div><div><dt>Rooms</dt><dd>${c.party.rooms}</dd></div><div><dt>On the road</dt><dd>${Math.round(c.driveHours)} h</dd></div></dl>
      ${E.mapSvg(plan.stops.map(s => s.base), { cls: 'route-map side-map', label: 'Schematic map of your route, not to scale' })}
      <details open><summary class="h3" style="font-size:20px;cursor:pointer;min-height:44px;display:flex;align-items:center">Cost breakdown</summary>
      <dl class="cost-list">
        <div><dt>Stays${c.party.extraBeds ? ' and extra beds' : ''}</dt><dd>${money(c.lines.stays)}</dd></div>
        <div><dt>${plan.transport === 'driver' ? `Private ${c.party.vehicle} and driver` : 'Transfers and local rides'}</dt><dd>${money(c.lines.transport)}</dd></div>
        <div><dt>Train seats</dt><dd>${money(c.lines.trains)}</dd></div>
        <div><dt>Activities and entry</dt><dd>${money(c.lines.activities)}</dd></div>
        <div><dt>Meals not in your stays</dt><dd>${money(c.lines.meals)}</dd></div>
        <div><dt>Ceylonways service fee</dt><dd>Not set yet</dd></div>
        <div class="cost-total"><dt>Estimated total</dt><dd>${money(c.total)}</dd></div>
      </dl></details>
      ${offers.length ? `<p class="small">Offers applied: ${esc(offers.join('. '))}. Sample offers.</p>` : ''}
      <p class="small">Sample rates, ratings and offers. Not a quote. Flights, insurance, visa fees and tips are not included.${plan.currency !== 'USD' ? ` Converted from USD at a fixed sample rate.` : ''}</p>
      <div class="actions-grid">
        <button type="button" class="button button-moss button-sm" data-action="save">Save</button>
        <button type="button" class="button button-ghost button-sm" data-action="share">Share link</button>
        <button type="button" class="button button-ghost button-sm" data-action="download">Download</button>
        <button type="button" class="button button-ghost button-sm" data-action="print">Print or PDF</button>
      </div>
      <a class="button button-ghost button-sm" style="width:100%;margin-top:8px" href="#quote">Request a confirmed quote</a>
      <p class="stage-line">Now: <strong>planning estimate</strong> → confirmed quote → confirmed booking</p>`;
    // Smooth cost change
    const el = $('sum-total');
    if (lastTotal !== null && lastTotal !== c.total && !reduce) {
      const from = lastTotal; const to = c.total; const t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 450); const v = from + (to - from) * (1 - Math.pow(1 - k, 3)); el.textContent = money(v); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step); setTimeout(() => { el.textContent = money(to); }, 700); el.classList.add('tick-flash'); setTimeout(() => el.classList.remove('tick-flash'), 600);
    }
    lastTotal = c.total;
    $('mobile-total').innerHTML = `<div><span class="mt-amt">${money(c.total)}</span><span class="mt-sub${over ? ' over' : ''}">${plan.budget ? (over ? `${money(-c.remaining)} over budget` : `${money(c.remaining)} under budget`) : 'Estimate, no budget set'}</span></div>
      <button type="button" class="button button-sm button-ghost" data-action="goto" data-target="suggest-section">Save money</button>
      <button type="button" class="button button-sm button-moss" data-action="goto" data-target="summary">Details</button>`;
  }

  function renderSaved() {
    const list = store.get(SAVED) || [];
    $('saved-list').innerHTML = list.length ? `<ul class="saved-list">${list.map((s, i) => `<li><span>${esc(s.name)}<span class="small" style="display:block">${esc(s.when)}</span></span><span class="saved-actions"><button type="button" class="icon-btn" data-action="open-saved" data-i="${i}">Open</button><button type="button" class="icon-btn" data-action="delete-saved" data-i="${i}" aria-label="Delete ${esc(s.name)}">Delete</button></span></li>`).join('')}</ul>` : `<p class="small">Nothing saved yet. Saved trips stay in this browser on this device only.</p>`;
  }

  /* ---------- Dialog ---------- */
  const sheet = $('sheet'); let lastFocus = null;
  function openSheet(title, html) {
    lastFocus = document.activeElement;
    $('sheet-title').textContent = title; $('sheet-body').innerHTML = html;
    if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
    sheet.querySelector('[data-close]').focus();
  }
  function closeSheet() { if (sheet.open) { if (typeof sheet.close === 'function') sheet.close(); else sheet.removeAttribute('open'); } if (lastFocus) lastFocus.focus(); }
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });

  function staysDialog(i, sort) {
    sort = sort || 'match';
    const s = plan.stops[i]; const cur = E.stayById[s.stay]; const now = E.calculate(plan);
    const money = n => E.money(n, plan.currency);
    let rows = E.staysAt(s.base).map(x => { const n = E.clone(plan); n.stops[i].stay = x.id; const c = E.calculate(n); return { x, n, c, info: c.stopInfo[i] }; });
    const ok = r => E.meetsRule(r.x, plan.rule);
    rows.sort(sort === 'price' ? (a, b) => a.c.total - b.c.total : sort === 'rating' ? (a, b) => b.x.rating - a.x.rating || b.x.reviews - a.x.reviews : (a, b) => (ok(b) - ok(a)) || (Math.abs(a.c.total - now.total) - Math.abs(b.c.total - now.total)));
    const anyOk = rows.some(ok);
    openSheet(`Stays in ${bases[s.base].short}`, `
      <p class="sample-banner"><strong>Sample data.</strong> These are sample stay types with sample ratings, not real hotels or live Google scores.</p>
      <div class="rule-line"><span>Your rule: ${plan.rule.minRating ? plan.rule.minRating.toFixed(1) + ' or higher' : 'any rating'}, ${plan.rule.minReviews}+ reviews.</span>
        <label class="field" style="margin-left:auto">Sort<select id="stay-sort">${opt('match', 'Best match', sort === 'match')}${opt('price', 'Lowest total', sort === 'price')}${opt('rating', 'Highest rating', sort === 'rating')}</select></label></div>
      ${anyOk ? '' : `<div class="notice notice-warn"><span>No stay here meets your rule. You can still pick one below, or widen the rule in your trip details.</span></div>`}
      ${rows.map(r => {
        const d = r.c.total - now.total; const isCur = r.x.id === cur.id;
        const diff = isCur ? [] : E.compareStays(cur, r.x);
        return `<article class="opt${isCur ? ' is-current' : ''}${ok(r) ? '' : ' is-dim'}">
          <div class="opt-top"><div><h3>${esc(r.x.name)}</h3><p class="small" style="margin:0">${esc(r.x.type)} · ${E.tierLabel(r.x.tier)} · ${esc(r.x.location)}</p></div>
            <div class="opt-price"><strong>${money(r.info.price.total)}</strong><small>${s.nights} night${s.nights > 1 ? 's' : ''}, ${now.party.rooms} room${now.party.rooms > 1 ? 's' : ''}, taxes included</small>${isCur ? '<small>Your current stay</small>' : `<small class="${d > 0 ? 'delta-up' : 'delta-down'}">Trip total ${d > 0 ? 'rises' : 'drops'} by ${money(Math.abs(d))}</small>`}</div></div>
          ${badgeRow(r.x, r.info)}
          ${ok(r) ? '' : `<p class="small" style="color:var(--bad);margin:0">Below your rating rule.</p>`}
          <ul><li>${esc(r.x.cancel)}</li><li>Facilities: ${esc(r.x.facilities.join(', ').toLowerCase())}</li>
          <li>${r.x.reviews >= config.smallSample ? (r.x.complaints ? `What some guests mention: ${esc(r.x.complaints)}` : 'No recurring complaint stands out in the sample reviews.') : 'Too few reviews to judge recurring complaints.'}</li>
          <li>Editorial pick. No sponsorship or commission.</li>
          ${diff.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
          ${r.info.price.unavailable ? `<div class="notice notice-bad"><span>No sample rate for some of your nights. This stay may be full or closed on those dates. Pick another stay or move your dates.</span></div>` : ''}
          ${isCur ? '' : `<div><button type="button" class="button button-sm button-moss" data-action="pick-stay" data-i="${i}" data-id="${r.x.id}"${r.info.price.unavailable ? ' disabled' : ''}>Choose this stay</button></div>`}
        </article>`;
      }).join('')}`);
    $('stay-sort').addEventListener('change', e => staysDialog(i, e.target.value));
  }

  function previewHtml(pv, extra) {
    const money = n => E.money(n, plan.currency);
    return `<div class="preview-box">
      <span>Trip total: ${money(pv.before)} → <b>${money(pv.after)}</b> (${pv.delta >= 0 ? 'up' : 'down'} ${money(Math.abs(pv.delta))})</span>
      <span>Time on the road: ${Math.abs(pv.hours) < 0.25 ? 'about the same' : `${pv.hours > 0 ? 'about ' + E.fmtHours(pv.hours) + ' more' : 'about ' + E.fmtHours(-pv.hours) + ' less'}`}</span>
      <span>Trip length: ${pv.days === 0 ? 'no change' : `${pv.days > 0 ? pv.days + ' more' : -pv.days + ' fewer'} day${Math.abs(pv.days) > 1 ? 's' : ''}`}</span>
      ${pv.dropped.length ? `<span class="delta-up">These activities will be removed: ${esc(pv.dropped.join(', '))}</span>` : ''}
      ${plan.budget ? `<span class="${pv.calc.remaining >= 0 ? 'delta-down' : 'delta-up'}">${pv.calc.remaining >= 0 ? 'Still within your budget' : 'Over your budget by ' + money(-pv.calc.remaining)}</span>` : ''}
      ${extra || ''}</div>`;
  }

  let pendingPlans = [];
  function addPlaceDialog(onlyBase, actId) {
    const inRoute = new Set(plan.stops.map(s => s.base));
    const options = Object.keys(bases).filter(b => !bases[b].airport && (onlyBase ? b === onlyBase : !inRoute.has(b)));
    pendingPlans = [];
    const body = options.map(b => {
      if (inRoute.has(b)) {
        const i = plan.stops.findIndex(s => s.base === b);
        const next = E.clone(plan); if (actId && !next.stops[i].acts.includes(actId)) next.stops[i].acts.push(actId);
        pendingPlans.push({ plan: next, msg: `Added to ${bases[b].short}.` });
        return `<article class="opt"><h3>${esc(bases[b].name)} is already on your route</h3>${actId ? previewHtml(E.preview(plan, next)) : ''}<div><button type="button" class="button button-sm button-moss" data-action="apply-pending" data-k="${pendingPlans.length - 1}">${actId ? 'Add the activity' : 'Close'}</button></div></article>`;
      }
      const next = E.withStop(plan, b); const at = next.stops.findIndex(s => s.base === b);
      if (actId) next.stops[at].acts.push(actId);
      const pv = E.preview(plan, next);
      const prev = at === 0 ? 'the airport' : bases[next.stops[at - 1].base].short; const nx = at === next.stops.length - 1 ? 'the airport' : bases[next.stops[at + 1].base].short;
      pendingPlans.push({ plan: next, msg: `${bases[b].short} added to your route.` });
      const coastNote = !bases[b].coastal && plan.stops.every(s => bases[s.base].coastal) ? '<span>This is inland from your coastal route. The driving and the extra night are part of the cost above.</span>' : '';
      return `<article class="opt"><div class="opt-top"><h3>${esc(bases[b].name)}</h3><span class="badge">${next.stops[at].nights} night${next.stops[at].nights > 1 ? 's' : ''}, between ${prev} and ${nx}</span></div>
        ${previewHtml(pv, coastNote)}<p class="small" style="margin:0">${esc(CW.seasonNotes[bases[b].region])}</p>
        <div><button type="button" class="button button-sm button-moss" data-action="apply-pending" data-k="${pendingPlans.length - 1}">Add ${esc(bases[b].short)}</button></div></article>`;
    }).join('');
    openSheet(actId ? `Add ${E.actById[actId].name}` : 'Add a place', (actId ? `<p>${esc(E.actById[actId].name)} happens near ${esc(bases[onlyBase].short)}. Here is what adding it means for your trip.</p>` : '<p>We place each new stop where it adds the least driving. You can move it afterwards.</p>') + body);
  }

  function changePlaceDialog(i) {
    const s = plan.stops[i]; const inRoute = new Set(plan.stops.map(x => x.base));
    pendingPlans = [];
    const body = Object.keys(bases).filter(b => !bases[b].airport && !inRoute.has(b)).map(b => {
      const next = E.clone(plan);
      next.stops[i] = { base: b, nights: Math.max(s.nights, bases[b].minNights || 1), stay: E.pickStay(b, plan.tier, plan.rule), acts: [], arriveBy: 'road' };
      const pv = E.preview(plan, next);
      pendingPlans.push({ plan: next, msg: `${bases[s.base].short} changed to ${bases[b].short}.` });
      return `<article class="opt"><h3>${esc(bases[b].name)}</h3>${previewHtml(pv)}<div><button type="button" class="button button-sm button-moss" data-action="apply-pending" data-k="${pendingPlans.length - 1}">Go to ${esc(bases[b].short)} instead</button></div></article>`;
    }).join('');
    openSheet(`Change ${bases[s.base].short}`, `<p>Your nights stay the same where possible. Activities in ${esc(bases[s.base].short)} are removed, and you can add new ones after.</p>${body}`);
  }

  function confirmDialog(title, text, next, msg, pv) {
    pendingPlans = [{ plan: next, msg }];
    openSheet(title, `<p>${text}</p>${pv ? previewHtml(pv) : ''}<div class="sugg-actions"><button type="button" class="button button-moss" data-action="apply-pending" data-k="0">Yes, change it</button><button type="button" class="button button-ghost" data-close>Cancel</button></div>`);
  }

  /* ---------- Day count helpers ---------- */
  function addNight(p) {
    const c = E.calculate(p);
    const busiest = p.stops.map((s, i) => { const d = c.days.filter(x => x.stopIndex === i && !x.departure); return { i, load: d.reduce((n, x) => n + x.used, 0) / d.length }; }).sort((a, b) => b.load - a.load)[0];
    p.stops[busiest.i].nights += 1; return bases[p.stops[busiest.i].base].short;
  }
  function removeNight(p) {
    const cand = p.stops.map((s, i) => ({ s, i })).filter(o => o.s.nights > (bases[o.s.base].minNights || 1)).sort((a, b) => b.s.nights - a.s.nights)[0]
      || p.stops.map((s, i) => ({ s, i })).filter(o => o.s.nights > 1).sort((a, b) => b.s.nights - a.s.nights)[0];
    if (!cand) return null; p.stops[cand.i].nights -= 1; return bases[cand.s.base].short;
  }

  /* ---------- Text export ---------- */
  function planText() {
    const c = E.calculate(plan); const money = n => E.money(n, plan.currency); const L = [];
    L.push('CEYLONWAYS TRIP PLAN', `${pkgBySlug[plan.pkg].name}${plan.arrival ? ', arriving ' + fmtLong(plan.arrival) : ''}`, '');
    L.push(`Travellers: ${plan.adults} adult${plan.adults > 1 ? 's' : ''}${plan.kids.length ? ', children aged ' + plan.kids.join(', ') : ''}. Rooms: ${c.party.rooms}.`);
    L.push(`Length: ${c.tripDays} days, ${c.nights} nights. Pace: ${config.pace[plan.pace].label}. Transport: ${plan.transport === 'driver' ? 'private ' + c.party.vehicle + ' and driver' : 'transfers between towns'}.`);
    L.push(`Stay rule: ${plan.rule.minRating ? plan.rule.minRating.toFixed(1) + ' or higher' : 'any rating'}, ${plan.rule.minReviews}+ reviews.`, '');
    c.days.forEach(d => {
      L.push(`DAY ${d.index + 1}${d.date ? ' · ' + fmtDate(d.date) : ''} · ${d.departure ? 'Departure' : bases[d.base].name}`);
      const place = id => id === 'cmb' ? 'the airport' : bases[id].short;
      d.before.forEach(b => L.push(`  Before you leave ${bases[plan.stops[b.stop].base].short}: ${E.actById[b.id].name} (${E.actById[b.id].hours} h)`));
      if (d.leg) L.push(`  ${d.leg.mode === 'train' ? 'Scenic train' : 'Drive'} from ${place(d.leg.from)} to ${place(d.leg.to)}, about ${E.fmtHours(d.leg.hours)}`);
      d.acts.forEach(id => L.push(`  ${E.actById[id].name} (${E.actById[id].hours} h)`));
      if (!d.departure && d.index === c.stopInfo[d.stopIndex].nightStart) { const st = c.stopInfo[d.stopIndex].stay; L.push(`  Stay: ${st.name} (sample), ${st.meals.toLowerCase()}, ${plan.stops[d.stopIndex].nights} night${plan.stops[d.stopIndex].nights > 1 ? 's' : ''}`); }
      d.warnings.forEach(w => L.push(`  Note: ${w}`));
      L.push('');
    });
    L.push('ESTIMATED COST', `Stays: ${money(c.lines.stays)}`, `Transport: ${money(c.lines.transport)}`, `Train seats: ${money(c.lines.trains)}`, `Activities and entry: ${money(c.lines.activities)}`, `Meals not in stays: ${money(c.lines.meals)}`, `Service fee: not set yet`, `Total: ${money(c.total)} (${money(c.total / c.party.pax)} per person)`);
    if (plan.budget) L.push(`Budget: ${money(plan.budget / config.currencies[plan.currency].rate)}${plan.budgetIncludesFlights ? ' including flights' : ''}. ${c.remaining >= 0 ? money(c.remaining) + ' left.' : money(-c.remaining) + ' over.'}`);
    if (plan.needs) L.push('', `Access needs: ${plan.needs}`);
    if (plan.diet) L.push(`Food and diet: ${plan.diet}`);
    L.push('', 'This is a planning estimate made with sample data. It is not a quote or a booking. Hotel rates, ratings, offers, train seats and entry fees must be confirmed with each supplier. Flights, insurance, visa fees and tips are not included.', '', 'Open this plan again: ' + shareUrl());
    return L.join('\n');
  }
  function shareUrl() {
    const json = JSON.stringify(plan);
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${location.origin === 'null' || location.protocol === 'file:' ? location.href.split('#')[0].split('?')[0] : location.origin + location.pathname}#plan=${b64}`;
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }

  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }

  /* ---------- Events ---------- */
  host.addEventListener('click', async e => {
    const b = e.target.closest('[data-action]'); if (!b || b.tagName === 'INPUT') return;
    const a = b.dataset.action; const i = Number(b.dataset.i);
    const money = n => E.money(n, plan.currency);
    switch (a) {
      case 'undo': return undo();
      case 'redo': return redo();
      case 'reset': return confirmDialog('Start again?', `This loads ${pkgBySlug[plan.pkg].name} as it was. Your dates, travellers and budget stay. You can undo.`, Object.assign(E.fromPackage(pkgBySlug[plan.pkg]), keepSetup()), 'Package restored.');
      case 'days-plus': return edit(p => { const where = addNight(p); toast(`Added a night in ${where}, your busiest stop.`); });
      case 'days-minus': { const n = E.clone(plan); const where = removeNight(n); if (!where) return toast('Every place is already at one night. Remove a place instead.'); return commit(n, `One night less in ${where}.`); }
      case 'adults-plus': if (plan.adults >= 8) return toast('For groups over 8 adults, ask us for a group quote.'); return edit(p => { p.adults++; p.rooms = 0; }, 'Traveller added. Rooms updated.');
      case 'adults-minus': if (plan.adults <= 1) return; return edit(p => { p.adults--; p.rooms = 0; }, 'Traveller removed. Rooms updated.');
      case 'kids-plus': if (plan.kids.length >= 4) return toast('For more than 4 children, ask us for a family quote.'); return edit(p => { p.kids.push(6); p.rooms = 0; }, 'Child added. Set their age below.');
      case 'kids-minus': if (!plan.kids.length) return; return edit(p => { p.kids.pop(); p.rooms = 0; }, 'Child removed.');
      case 'night-plus': return edit(p => { p.stops[i].nights++; }, `One more night in ${bases[plan.stops[i].base].short}.`);
      case 'night-minus': return edit(p => { p.stops[i].nights--; }, `One night less in ${bases[plan.stops[i].base].short}.`);
      case 'move': { const d = Number(b.dataset.d); const next = E.clone(plan); const [s] = next.stops.splice(i, 1); next.stops.splice(i + d, 0, s); next.stops.forEach((st, k) => { const prev = k === 0 ? 'cmb' : next.stops[k - 1].base; if (st.arriveBy === 'train' && !trains[`${prev}>${st.base}`]) st.arriveBy = 'road'; }); const pv = E.preview(plan, next); return commit(next, `Route reordered. Driving ${pv.hours > 0 ? 'up' : 'down'} about ${E.fmtHours(Math.abs(pv.hours))}.`); }
      case 'remove-stop': { const next = E.clone(plan); next.stops.splice(i, 1); return confirmDialog(`Remove ${bases[plan.stops[i].base].short}?`, 'The route is rejoined without this stop.', next, `${bases[plan.stops[i].base].short} removed.`, E.preview(plan, next)); }
      case 'change-place': return changePlaceDialog(i);
      case 'add-place': return addPlaceDialog(b.dataset.base, b.dataset.act);
      case 'apply-pending': { const p = pendingPlans[Number(b.dataset.k)]; closeSheet(); if (p && JSON.stringify(p.plan) !== JSON.stringify(plan)) commit(p.plan, p.msg); return; }
      case 'stays': return staysDialog(i);
      case 'pick-stay': { const id = b.dataset.id; closeSheet(); return edit(p => { p.stops[i].stay = id; }, `Stay changed to ${E.stayById[id].name}.`); }
      case 'toggle-train': return edit(p => { p.stops[i].arriveBy = p.stops[i].arriveBy === 'train' ? 'road' : 'train'; }, plan.stops[i].arriveBy === 'train' ? 'This leg is now by road.' : 'This leg is now by train. Your driver takes the bags.');
      case 'remove-act': { const id = b.dataset.id; return edit(p => { p.stops[i].acts = p.stops[i].acts.filter(x => x !== id); }, `${E.actById[id].name} removed.`); }
      case 'apply-sugg': { const s = currentSuggestions[i]; if (s) commit(E.clone(s.plan), `Applied. You save ${money(s.saving)}. Press Undo to go back.`); return; }
      case 'preview-cheapest': { const ch = E.cheapestVersion(plan); return confirmDialog('The lowest priced version of this route', 'Lowest priced stays that meet your rule, the shortest sensible stay in each place, the cheaper way of getting around, and free activities only.', ch.plan, 'Switched to the lowest priced version. Undo to go back.', E.preview(plan, ch.plan)); }
      case 'try-package': return confirmDialog('Try the budget package?', 'This replaces your itinerary with Sri Lanka on a Budget. Your dates, travellers and budget stay. You can undo.', Object.assign(E.fromPackage(pkgBySlug[b.dataset.slug]), keepSetup()), 'Budget package loaded.');
      case 'set-budget': return edit(p => { p.budget = Number(b.dataset.v); }, 'Budget updated.');
      case 'broaden': return edit(p => { p.rule = { minRating: Number(b.dataset.r), minReviews: Number(b.dataset.n) }; }, 'Rule widened. Stays below it are still marked.');
      case 'keep-rule': dismissed.add(b.dataset.key); return render();
      case 'fit-dates': { const want = Number(b.dataset.want); const n = E.clone(plan); let guard = 40; while (n.stops.reduce((t, s) => t + s.nights, 0) < want && guard--) addNight(n); while (n.stops.reduce((t, s) => t + s.nights, 0) > want && guard-- && removeNight(n)); return commit(n, `Itinerary set to ${n.stops.reduce((t, s) => t + s.nights, 0)} nights.`); }
      case 'match-departure': return edit(p => { p.departure = ''; }, 'Departure now follows the itinerary.');
      case 'goto': return document.getElementById(b.dataset.target).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      case 'save': return saveDialog();
      case 'share': { const url = shareUrl(); if (await copy(url)) return toast('Share link copied. Anyone with it can open this plan.'); return openSheet('Share this plan', `<p>Copy this link. It holds the whole plan, so it works without an account.</p><label class="field">Share link<textarea readonly rows="4" onclick="this.select()">${esc(url)}</textarea></label>`); }
      case 'download': download(`ceylonways-${plan.pkg}.txt`, planText()); return toast('Itinerary downloaded as a text file.');
      case 'print': return window.print();
      case 'open-saved': { const list = store.get(SAVED) || []; const p = sanitize(list[i] && list[i].plan); if (!p) return toast('That saved trip could not be read.'); commit(p, `Opened "${list[i].name}".`); syncForm(); return; }
      case 'delete-saved': { const list = store.get(SAVED) || []; const [gone] = list.splice(i, 1); store.set(SAVED, list); renderSaved(); return toast(`Deleted "${gone.name}" from this browser.`); }
      case 'confirm-save': {
        const name = ($('save-name').value || '').trim().slice(0, 80) || 'My Sri Lanka trip';
        const list = store.get(SAVED) || []; list.unshift({ name, when: 'Saved ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), plan });
        closeSheet();
        if (store.set(SAVED, list.slice(0, 12))) { renderSaved(); toast('Saved in this browser.'); } else toast('This browser blocked saving. Use Download or Share link instead.');
        return;
      }
    }
  });

  function keepSetup() { return { arrival: plan.arrival, departure: plan.departure, adults: plan.adults, kids: plan.kids.slice(), rooms: plan.rooms, currency: plan.currency, budget: plan.budget, budgetIncludesFlights: plan.budgetIncludesFlights, flightsPerPerson: plan.flightsPerPerson, rule: Object.assign({}, plan.rule), needs: plan.needs, diet: plan.diet, interests: plan.interests.slice(), vehicle: plan.vehicle }; }
  function saveDialog() {
    const def = `${pkgBySlug[plan.pkg].name}${plan.arrival ? ', ' + fmtDate(plan.arrival) : ''}`;
    openSheet('Save this trip', `<p>Saved trips stay in this browser on this device. They do not sync. Use Share link to move a plan to another device.</p><label class="field">Name<input id="save-name" value="${esc(def)}" maxlength="80"></label><div class="sugg-actions"><button type="button" class="button button-moss" data-action="confirm-save">Save</button></div>`);
  }

  // Form fields
  host.addEventListener('change', e => {
    const t = e.target; const f = t.dataset.field; const a = t.dataset.action;
    if (a === 'toggle-act') { const i = Number(t.dataset.i); const id = t.dataset.id; return edit(p => { const s = p.stops[i]; s.acts = t.checked ? [...s.acts, id] : s.acts.filter(x => x !== id); }, `${E.actById[id].name} ${t.checked ? 'added' : 'removed'}.`); }
    if (!f) return;
    switch (f) {
      case 'pkg': { const slug = t.value; t.value = plan.pkg; return confirmDialog(`Start from ${pkgBySlug[slug].name}?`, 'This replaces your itinerary. Your dates, travellers and budget stay. You can undo.', Object.assign(E.fromPackage(pkgBySlug[slug]), keepSetup(), { pkg: slug, tier: pkgBySlug[slug].tier, pace: pkgBySlug[slug].pace, transport: pkgBySlug[slug].transport }), `${pkgBySlug[slug].name} loaded.`); }
      case 'arrival': return edit(p => { p.arrival = E.parseDate(t.value) ? t.value : ''; if (p.departure && p.arrival && p.departure <= p.arrival) p.departure = ''; }, t.value ? 'Dates set. Seasonal prices and notes updated.' : 'Dates cleared.');
      case 'departure': return edit(p => { p.departure = E.parseDate(t.value) ? t.value : ''; });
      case 'kid': return edit(p => { p.kids[Number(t.dataset.i)] = Number(t.value); p.rooms = 0; });
      case 'rooms': return edit(p => { p.rooms = Number(t.value); }, 'Rooms updated.');
      case 'vehicle': { const pax = plan.adults + plan.kids.length; if (t.value === 'car' && pax > 3) { t.value = plan.vehicle; return toast('A car fits up to 3 people with luggage. Your group needs a van.'); } return edit(p => { p.vehicle = t.value; }); }
      case 'budget': return edit(p => { p.budget = Math.max(0, Number(t.value) || 0); }, 'Budget updated.');
      case 'currency': edit(p => { const old = config.currencies[p.currency].rate; const nw = config.currencies[t.value].rate; p.budget = Math.round(p.budget / old * nw); p.flightsPerPerson = Math.round(p.flightsPerPerson / old * nw); p.currency = t.value; }, `Showing prices in ${t.value}. Budget converted.`); return syncForm();
      case 'budgetIncludesFlights': edit(p => { p.budgetIncludesFlights = t.checked; }); return syncForm();
      case 'flightsPerPerson': return edit(p => { p.flightsPerPerson = Math.max(0, Number(t.value) || 0); });
      case 'tier': return edit(p => { p.tier = t.value; p.stops.forEach(s => { s.stay = E.pickStay(s.base, t.value, p.rule); }); }, `Every stay switched to ${E.tierLabel(t.value).toLowerCase()}. Undo to go back.`);
      case 'pace': edit(p => { p.pace = t.value; }, `Pace set to ${config.pace[t.value].label.toLowerCase()}.`); return syncForm();
      case 'transport': return edit(p => { p.transport = t.value; }, t.value === 'driver' ? 'Private car and driver for the whole trip.' : 'Transfers between towns. Local rides added for activities.');
      case 'interests': return edit(p => { p.interests = t.checked ? [...p.interests, t.value] : p.interests.filter(x => x !== t.value); });
      case 'minRating': return edit(p => { p.rule.minRating = Number(t.value); }, 'Rating rule updated.');
      case 'minReviews': return edit(p => { p.rule.minReviews = Number(t.value); }, 'Review rule updated.');
      case 'needs': return edit(p => { p.needs = t.value.slice(0, 1000); });
      case 'diet': return edit(p => { p.diet = t.value.slice(0, 1000); });
    }
  });

  // Quote request: prepared locally, never sent.
  $('quote-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target); const name = String(fd.get('name') || '').trim(); const email = String(fd.get('email') || '').trim();
    const out = $('quote-out');
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.innerHTML = `<div class="notice notice-bad"><span>Please add your name and a valid email so we can reply.</span></div>`; return; }
    const req = ['CEYLONWAYS QUOTE REQUEST', `Name: ${name}`, `Email: ${email}`, `Country: ${fd.get('country') || 'Not given'}`, `Contact by: ${fd.get('contact')}`, `Flexible dates: ${fd.get('flexible') ? 'Yes' : 'No'}`, `Message: ${fd.get('message') || 'None'}`, '', planText()].join('\n');
    out.innerHTML = `<div class="notice notice-warn"><span><strong>Your request is ready, but it has not been sent.</strong> Ceylonways does not have a live quote inbox yet, so nothing has left this device. Download it or copy it to keep it.</span><button type="button" class="button button-sm button-moss" id="q-dl">Download request</button><button type="button" class="button button-sm button-ghost" id="q-copy">Copy request</button></div>`;
    $('q-dl').onclick = () => download('ceylonways-quote-request.txt', req);
    $('q-copy').onclick = async () => toast(await copy(req) ? 'Request copied.' : 'Copy is blocked here. Use Download instead.');
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); }
  });

  /* ---------- Start ---------- */
  plan = initialPlan();
  buildForm(); syncForm(); render();
  // Drop one-time parameters so a reload restores the draft instead of the package.
  if (location.hash.startsWith('#plan=') || params.has('package') || params.has('add')) history.replaceState(null, '', location.pathname + (location.hash === '#saved' ? '#saved' : ''));
  if (restoredFrom) toast(restoredFrom);
  const addBase = params.get('add');
  if (addBase && bases[addBase] && !bases[addBase].airport) setTimeout(() => addPlaceDialog(addBase), 50);
  if (location.hash === '#saved') document.getElementById('saved').scrollIntoView();
  if (matchMedia('(max-width: 720px)').matches) $('setup-details').open = false;
  store.set(DRAFT, plan);
})();
