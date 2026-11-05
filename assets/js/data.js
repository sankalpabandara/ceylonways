/* Ceylonways sample data.
   Everything in this file is SAMPLE planning data for the prototype.
   No rate, rating, review count or offer here comes from a live source.
   Replace with supplier and Google Places data once agreements and keys exist.
   This file is loaded by the browser (window.CW) and by build.mjs (Node vm). */
(function (root) {
  'use strict';

  const config = {
    siteName: 'Ceylonways',
    // Temporary GitHub Pages address. Change it when a real domain is connected.
    siteUrl: 'https://sankalpabandara.github.io/ceylonways',
    // Keep false while prices are sample data. Set true at launch to let search engines in.
    allowIndexing: false,
    dataLabel: 'Sample data',
    sampleDate: '3 November 2026',
    // The founder first asked for Google Maps scores of 5.0.
    // Visitors can pick that strict rule in the planner. The default below is broader
    // because a strict 5.0 rule usually leaves only properties with very few reviews.
    quality: { minRating: 4.5, minReviews: 50, founderRule: { minRating: 5.0, minReviews: 0 } },
    // A review count under this is treated as too small to judge recurring complaints.
    smallSample: 100,
    currencies: {
      USD: { symbol: 'US$', rate: 1 },
      EUR: { symbol: '€', rate: 0.92 },
      GBP: { symbol: '£', rate: 0.78 },
      AUD: { symbol: 'A$', rate: 1.52 },
      INR: { symbol: '₹', rate: 84 },
      LKR: { symbol: 'Rs ', rate: 300 }
    },
    transport: {
      car: { label: 'Car', maxPax: 3, dayRate: 55, perKm: 0.12, transferPerKm: 0.42 },
      van: { label: 'Van', maxPax: 8, dayRate: 75, perKm: 0.16, transferPerKm: 0.55 },
      localRidePerActivity: 10
    },
    meals: { adultPerDay: 18, adultPerDayHalfBoard: 8, childShare: 0.5 },
    childExtraBedPerNight: 15,
    pace: {
      relaxed: { label: 'Relaxed', hoursPerDay: 5, note: 'Late starts, one main plan a day.' },
      balanced: { label: 'Balanced', hoursPerDay: 7, note: 'A morning plan and an afternoon plan.' },
      active: { label: 'Active', hoursPerDay: 9, note: 'Early starts and full days.' }
    }
  };

  // Overnight bases plus the airport. Coordinates feed the schematic map only.
  const bases = {
    cmb: { name: 'Colombo Airport', short: 'Airport', region: 'west', lat: 7.18, lon: 79.884, airport: true },
    negombo: { name: 'Negombo', short: 'Negombo', region: 'west', lat: 7.209, lon: 79.838, coastal: true, minNights: 1 },
    sigiriya: { name: 'Sigiriya and Dambulla', short: 'Sigiriya', region: 'cultural', lat: 7.957, lon: 80.76, minNights: 2 },
    kandy: { name: 'Kandy', short: 'Kandy', region: 'hills', lat: 7.291, lon: 80.634, minNights: 1 },
    nuwara: { name: 'Nuwara Eliya', short: 'Nuwara Eliya', region: 'hills', lat: 6.949, lon: 80.789, minNights: 1 },
    ella: { name: 'Ella', short: 'Ella', region: 'hills', lat: 6.867, lon: 81.046, minNights: 2 },
    udawalawe: { name: 'Udawalawe', short: 'Udawalawe', region: 'wild', lat: 6.474, lon: 80.889, minNights: 1 },
    tissa: { name: 'Tissamaharama for Yala', short: 'Yala', region: 'wild', lat: 6.284, lon: 81.287, minNights: 1 },
    sinharaja: { name: 'Sinharaja Rainforest', short: 'Sinharaja', region: 'wild', lat: 6.43, lon: 80.42, minNights: 1 },
    mirissa: { name: 'Mirissa and Weligama', short: 'Mirissa', region: 'south', lat: 5.947, lon: 80.459, coastal: true, minNights: 2 },
    galle: { name: 'Galle', short: 'Galle', region: 'south', lat: 6.033, lon: 80.217, coastal: true, minNights: 1 },
    trinco: { name: 'Trincomalee', short: 'Trincomalee', region: 'east', lat: 8.587, lon: 81.215, coastal: true, minNights: 2 }
  };

  // Road links with typical private car times. The engine finds the shortest
  // path between any two bases from these links. Times are approximate and
  // depend on traffic, weather and stops.
  const roads = [
    ['cmb', 'negombo', 0.3, 10], ['cmb', 'kandy', 3.2, 110], ['cmb', 'sigiriya', 4, 150],
    ['cmb', 'galle', 2.3, 150], ['cmb', 'udawalawe', 3.8, 185], ['cmb', 'sinharaja', 4, 155],
    ['cmb', 'ella', 6, 215], ['cmb', 'tissa', 4.5, 255],
    ['negombo', 'sigiriya', 3.8, 145], ['negombo', 'kandy', 3, 100],
    ['sigiriya', 'kandy', 2.5, 90], ['sigiriya', 'trinco', 2, 95],
    ['kandy', 'nuwara', 2.5, 77], ['kandy', 'trinco', 4, 180], ['kandy', 'ella', 4.8, 140],
    ['nuwara', 'ella', 2.5, 58], ['ella', 'tissa', 2, 85], ['ella', 'udawalawe', 2.5, 95],
    ['tissa', 'udawalawe', 1.5, 60], ['tissa', 'mirissa', 2.5, 110], ['udawalawe', 'mirissa', 2.5, 110],
    ['udawalawe', 'galle', 3, 135], ['udawalawe', 'sinharaja', 2.5, 90], ['mirissa', 'galle', 0.9, 35],
    ['galle', 'sinharaja', 2.5, 90]
  ];

  // Scenic rail legs. The driver repositions by road and meets you.
  const trains = {
    'kandy>ella': { hours: 7, price: 12, note: 'Reserved observation or second class seat. Seats sell out in busy months.' },
    'kandy>nuwara': { hours: 4, price: 8, note: 'Train to Nanu Oya station, then 20 minutes by car.' },
    'nuwara>ella': { hours: 3, price: 6, note: 'From Nanu Oya station.' }
  };

  // Seasonal guide by region. 'good', 'mixed' or 'wet' for each month (Jan first).
  const seasons = {
    west: ['good', 'good', 'good', 'good', 'wet', 'wet', 'mixed', 'mixed', 'mixed', 'wet', 'wet', 'good'],
    south: ['good', 'good', 'good', 'good', 'wet', 'wet', 'mixed', 'mixed', 'mixed', 'wet', 'mixed', 'good'],
    hills: ['good', 'good', 'good', 'good', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'wet', 'wet', 'mixed'],
    cultural: ['good', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'good', 'mixed', 'wet', 'wet'],
    wild: ['good', 'good', 'good', 'good', 'good', 'mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'wet', 'mixed'],
    east: ['wet', 'mixed', 'mixed', 'good', 'good', 'good', 'good', 'good', 'good', 'mixed', 'wet', 'wet']
  };
  const seasonNotes = {
    west: 'The southwest monsoon brings rain and rough seas to the west coast, mostly from May to September.',
    south: 'The south coast is at its calmest from December to April. Seas are rough from May to September.',
    hills: 'Mornings are cool all year. October and November are often the wettest months.',
    cultural: 'Dry and hot for much of the year. Heavier rain usually comes from October to December.',
    wild: 'Yala often closes part of the park for a few weeks around September. Check before you book.',
    east: 'The east coast is best from April to September. The northeast monsoon brings rain from November to January.'
  };
  // Sample price change on room rates by region and month.
  const seasonRate = {
    good: 1.15, mixed: 1, wet: 0.88
  };

  // SAMPLE stays. Names describe a type of property, not a real hotel.
  // rating = sample Google style score out of 5. stars = official class, or null.
  const S = (id, base, name, tier, type, rate, rating, reviews, extra) =>
    Object.assign({ id, base, name, tier, type, rate, rating, reviews, stars: null, meals: 'Breakfast', cancel: 'Free cancellation up to 7 days before arrival', facilities: [], roomSleeps: 3, relationship: 'editorial' }, extra);
  const stays = [
    S('neg-1', 'negombo', 'Lagoon side guesthouse', 'simple', 'Guesthouse', 38, 4.7, 412, { facilities: ['Air conditioning', 'Garden', 'Airport pickup'], location: '15 minutes from the airport', complaints: 'Some guests mention aircraft noise in the early morning.' }),
    S('neg-2', 'negombo', 'Beachfront boutique hotel', 'boutique', 'Boutique hotel', 85, 4.6, 1280, { stars: 4, facilities: ['Pool', 'Beach access', 'Restaurant'], location: 'On the beach, 30 minutes from the airport', complaints: 'A few guests mention slow service at dinner.' }),
    S('neg-3', 'negombo', 'Small heritage villa', 'boutique', 'Villa', 120, 5.0, 23, { facilities: ['Private pool', 'Garden'], location: 'Quiet lane near the lagoon', cancel: 'Free cancellation up to 14 days before arrival' }),

    S('sig-1', 'sigiriya', 'Family run village homestay', 'simple', 'Homestay', 32, 4.9, 318, { facilities: ['Home cooked dinner', 'Bicycles', 'Garden'], meals: 'Half board', location: '3 km from Sigiriya Rock', complaints: 'Rooms are basic. Some guests mention insects in the wet months.' }),
    S('sig-2', 'sigiriya', 'Jungle edge eco lodge', 'boutique', 'Eco lodge', 95, 4.8, 640, { facilities: ['Pool', 'Nature walks', 'Restaurant'], location: '10 minutes from Sigiriya Rock', type: 'Eco lodge', complaints: 'A few guests mention patchy wifi.' }),
    S('sig-3', 'sigiriya', 'Rock view resort', 'luxury', 'Resort', 210, 4.6, 2100, { stars: 5, facilities: ['Infinity pool', 'Spa', 'Restaurant', 'Family rooms'], meals: 'Half board', location: 'View of Sigiriya Rock', cancel: 'Non refundable after booking', complaints: 'Some guests say the buffet is repetitive over several nights.' }),
    S('sig-4', 'sigiriya', 'Tree house cabins', 'boutique', 'Eco lodge', 70, 5.0, 41, { facilities: ['Garden', 'Bicycles'], location: '5 km from Sigiriya Rock', roomSleeps: 2 }),

    S('kan-1', 'kandy', 'Hillside guesthouse', 'simple', 'Guesthouse', 35, 4.8, 520, { facilities: ['City view', 'Terrace'], location: '10 minutes by tuk tuk to the lake', complaints: 'Steep road up. Some guests mention street noise.' }),
    S('kan-2', 'kandy', 'Colonial bungalow hotel', 'boutique', 'Boutique hotel', 110, 4.7, 890, { stars: 4, facilities: ['Pool', 'Garden', 'Restaurant'], location: 'Above the city, 15 minutes to the temple' }),
    S('kan-3', 'kandy', 'River valley resort', 'luxury', 'Resort', 190, 4.7, 1650, { stars: 5, facilities: ['Pool', 'Spa', 'Family rooms'], location: '30 minutes outside the city', complaints: 'Some guests note the drive into Kandy is slow at rush hour.' }),

    S('nuw-1', 'nuwara', 'Tea estate bungalow', 'boutique', 'Boutique hotel', 130, 4.9, 210, { facilities: ['Fireplace', 'Tea tasting', 'Garden'], meals: 'Half board', location: 'On a working tea estate, 25 minutes from town' }),
    S('nuw-2', 'nuwara', 'Town guesthouse', 'simple', 'Guesthouse', 30, 4.5, 260, { facilities: ['Hot water', 'Parking'], location: 'Walk to Gregory Lake', complaints: 'Rooms can feel cold at night. Ask for extra blankets.' }),
    S('nuw-3', 'nuwara', 'Grand hill hotel', 'luxury', 'Hotel', 170, 4.5, 3400, { stars: 5, facilities: ['Restaurant', 'Garden', 'Family rooms'], location: 'Town centre', complaints: 'Some guests mention dated rooms in the older wing.' }),

    S('ell-1', 'ella', 'Valley view homestay', 'simple', 'Homestay', 34, 4.9, 455, { facilities: ['Balcony', 'Home cooked dinner'], location: '15 minute walk to Ella town', complaints: 'Steep path. Not ideal for heavy luggage.' }),
    S('ell-2', 'ella', 'Tea hill boutique hotel', 'boutique', 'Boutique hotel', 105, 4.8, 730, { facilities: ['Pool', 'Restaurant', 'Mountain view'], location: '5 minutes by tuk tuk from town' }),
    S('ell-3', 'ella', 'Mountain eco retreat', 'luxury', 'Eco lodge', 220, 4.9, 380, { facilities: ['Infinity pool', 'Spa', 'Yoga'], meals: 'Half board', location: '20 minutes from town on a quiet road', cancel: 'Free cancellation up to 21 days before arrival' }),
    S('ell-4', 'ella', 'Small garden cottages', 'simple', 'Guesthouse', 45, 5.0, 64, { facilities: ['Garden', 'Mountain view'], location: '10 minute walk to town', roomSleeps: 2 }),

    S('uda-1', 'udawalawe', 'Safari camp tents', 'boutique', 'Eco lodge', 90, 4.7, 340, { facilities: ['Campfire', 'Restaurant'], meals: 'Half board', location: '10 minutes from the park gate' }),
    S('uda-2', 'udawalawe', 'Lakeside guesthouse', 'simple', 'Guesthouse', 30, 4.6, 190, { facilities: ['Garden', 'Air conditioning'], location: '15 minutes from the park gate' }),

    S('tis-1', 'tissa', 'Lake view guesthouse', 'simple', 'Guesthouse', 33, 4.6, 380, { facilities: ['Air conditioning', 'Bicycles'], location: '40 minutes to the Yala gate', complaints: 'Some guests mention thin walls.' }),
    S('tis-2', 'tissa', 'Wild coast safari lodge', 'luxury', 'Eco lodge', 260, 4.7, 1200, { stars: 5, facilities: ['Pool', 'Spa', 'Family rooms'], meals: 'Half board', location: 'Next to the park boundary', cancel: 'Non refundable after booking' }),
    S('tis-3', 'tissa', 'Paddy field villa', 'boutique', 'Villa', 95, 4.8, 150, { facilities: ['Pool', 'Garden'], location: '35 minutes to the Yala gate' }),

    S('sin-1', 'sinharaja', 'Rainforest edge lodge', 'simple', 'Eco lodge', 40, 4.7, 160, { facilities: ['Guided walks', 'Restaurant'], meals: 'Full board', location: 'Near the Kudawa entrance', complaints: 'Leeches on the trails in wet months. Ask for leech socks.' }),
    S('sin-2', 'sinharaja', 'Forest view eco cabins', 'boutique', 'Eco lodge', 110, 4.9, 95, { facilities: ['Pool', 'Nature walks'], meals: 'Half board', location: 'Deniyaya side of the forest' }),

    S('mir-1', 'mirissa', 'Surf guesthouse', 'simple', 'Guesthouse', 36, 4.6, 610, { facilities: ['Air conditioning', 'Surfboard storage'], location: '3 minute walk to the beach', complaints: 'Some guests mention noise from beach bars at night.' }),
    S('mir-2', 'mirissa', 'Clifftop boutique hotel', 'boutique', 'Boutique hotel', 125, 4.8, 980, { stars: 4, facilities: ['Pool', 'Ocean view', 'Restaurant'], location: 'Above a quiet bay, 5 minutes to Mirissa beach' }),
    S('mir-3', 'mirissa', 'Private beach villa', 'luxury', 'Villa', 240, 4.9, 120, { facilities: ['Private pool', 'Chef on request', 'Family rooms'], location: 'Weligama bay', cancel: 'Free cancellation up to 30 days before arrival', offer: 'mir-3-offer' }),
    S('mir-4', 'mirissa', 'Palm garden resort', 'luxury', 'Resort', 175, 4.5, 2300, { stars: 5, facilities: ['Pool', 'Spa', 'Kids club', 'Family rooms'], location: 'On the beach', complaints: 'Some guests mention a busy pool area in high season.' }),

    S('gal-1', 'galle', 'Fort heritage guesthouse', 'simple', 'Guesthouse', 48, 4.8, 700, { facilities: ['Air conditioning', 'Roof terrace'], location: 'Inside Galle Fort', complaints: 'Some rooms are small.' }),
    S('gal-2', 'galle', 'Restored merchant house', 'boutique', 'Boutique hotel', 150, 4.9, 410, { facilities: ['Plunge pool', 'Restaurant'], location: 'Inside Galle Fort', unavailable: [['12-20', '01-05']] }),
    S('gal-3', 'galle', 'Jungle beach resort', 'luxury', 'Resort', 230, 4.6, 1900, { stars: 5, facilities: ['Pool', 'Spa', 'Family rooms'], location: 'Unawatuna, 15 minutes from the fort' }),

    S('tri-1', 'trinco', 'Beach cabana guesthouse', 'simple', 'Guesthouse', 35, 4.6, 290, { facilities: ['Beach access', 'Air conditioning'], location: 'Nilaveli beach' }),
    S('tri-2', 'trinco', 'East coast beach resort', 'luxury', 'Resort', 160, 4.6, 1500, { stars: 4, facilities: ['Pool', 'Dive centre', 'Family rooms'], location: 'Uppuveli beach', complaints: 'Some guests mention seaweed on the beach in some months.' }),
    S('tri-3', 'trinco', 'Quiet bay boutique hotel', 'boutique', 'Boutique hotel', 98, 5.0, 37, { facilities: ['Pool', 'Restaurant'], location: 'Marble Beach area' })
  ];

  // SAMPLE offers. Shown only when the stay dates fall inside the window.
  const offers = {
    'mir-3-offer': { stay: 'mir-3', title: 'Stay 3 nights, pay for 2', from: '05-01', to: '10-31', minNights: 3, freeNights: 1, terms: 'Sample offer. Valid for stays between 1 May and 31 October. Not combinable with other offers.' },
    'nuw-1-offer': { stay: 'nuw-1', title: '10% off weekday nights', from: '01-07', to: '03-31', percent: 10, terms: 'Sample offer. Valid 7 January to 31 March. Weekend nights not discounted in a live version.' }
  };
  stays.find(s => s.id === 'nuw-1').offer = 'nuw-1-offer';

  // SAMPLE activities. Prices are per person in USD and include entry where noted.
  const A = (id, base, name, type, hours, adult, child, extra) =>
    Object.assign({ id, base, name, type, hours, adult, child, minAge: 0 }, extra);
  const activities = [
    A('sig-rock', 'sigiriya', 'Climb Sigiriya Rock', 'culture', 3, 36, 18, { when: 'Early morning', note: 'About 1,200 steps. Go at opening time to avoid the heat.', entry: true }),
    A('sig-dambulla', 'sigiriya', 'Dambulla cave temple', 'culture', 2, 10, 0, { when: 'Afternoon', note: 'Cover shoulders and knees.', entry: true }),
    A('sig-safari', 'sigiriya', 'Minneriya or Kaudulla jeep safari', 'wildlife', 3.5, 48, 30, { when: 'Afternoon', note: 'Large elephant herds gather here, mostly from July to October.' }),
    A('sig-polon', 'sigiriya', 'Polonnaruwa ancient city by bicycle', 'culture', 5, 35, 18, { when: 'Morning', note: 'One hour each way by road. Flat and easy cycling.', entry: true }),
    A('sig-cook', 'sigiriya', 'Village cooking lunch', 'food', 3, 25, 12, { when: 'Midday', note: 'Cook rice and curry with a local family.' }),
    A('kan-temple', 'kandy', 'Temple of the Sacred Tooth Relic', 'culture', 2, 15, 0, { when: 'Evening ceremony', note: 'White clothing is respectful. Shoes stay outside.', entry: true }),
    A('kan-garden', 'kandy', 'Royal Botanic Gardens, Peradeniya', 'nature', 2.5, 12, 6, { when: 'Morning', entry: true }),
    A('kan-dance', 'kandy', 'Kandyan dance show', 'culture', 1, 8, 4, { when: 'Evening' }),
    A('nuw-tea', 'nuwara', 'Tea factory tour and tasting', 'nature', 2, 8, 0, { when: 'Morning', note: 'See green leaf turn into black tea.' }),
    A('nuw-horton', 'nuwara', 'Horton Plains and World\'s End walk', 'nature', 6, 45, 25, { when: 'Very early start', note: 'Leave at 5 am. 9 km loop walk. Clouds often roll in by 10 am.', entry: true }),
    A('ell-peak', 'ella', 'Little Adam\'s Peak walk', 'nature', 2, 0, 0, { when: 'Sunrise or late afternoon' }),
    A('ell-bridge', 'ella', 'Nine Arch Bridge walk', 'nature', 1.5, 0, 0, { when: 'Morning', note: 'Check train times to see one cross.' }),
    A('ell-rock', 'ella', 'Ella Rock hike with a guide', 'nature', 4, 20, 10, { when: 'Early morning', minAge: 10, note: 'Steep in places. Good shoes needed.' }),
    A('ell-cook', 'ella', 'Sri Lankan cooking class', 'food', 3, 22, 11, { when: 'Afternoon' }),
    A('uda-safari', 'udawalawe', 'Udawalawe jeep safari', 'wildlife', 4, 55, 30, { when: 'Morning or afternoon', note: 'Elephants are seen on almost every drive.', entry: true }),
    A('uda-eth', 'udawalawe', 'Elephant Transit Home feeding', 'wildlife', 1, 8, 4, { when: 'Feeding times only', entry: true }),
    A('tis-yala', 'tissa', 'Yala jeep safari, half day', 'wildlife', 5, 70, 40, { when: 'Dawn', note: 'Leopards are possible, never promised. Part of the park often closes around September.', entry: true }),
    A('tis-kat', 'tissa', 'Kataragama evening ceremony', 'culture', 2, 0, 0, { when: 'Evening' }),
    A('sin-walk', 'sinharaja', 'Sinharaja guided rainforest walk', 'nature', 5, 35, 18, { when: 'Morning', note: 'Bird life is best early. Expect leeches in wet months.', entry: true }),
    A('mir-whale', 'mirissa', 'Whale watching boat trip', 'wildlife', 5, 55, 30, { when: 'Early morning', months: [11, 12, 1, 2, 3, 4], minAge: 5, note: 'Season roughly November to April. Seas can be rough.' }),
    A('mir-surf', 'mirissa', 'Surf lesson at Weligama', 'beach', 2, 25, 20, { when: 'Morning', minAge: 8 }),
    A('mir-snork', 'mirissa', 'Turtle snorkelling trip', 'beach', 2, 20, 15, { when: 'Morning', minAge: 6 }),
    A('gal-fort', 'galle', 'Galle Fort walking tour', 'culture', 2.5, 15, 0, { when: 'Late afternoon' }),
    A('gal-jungle', 'galle', 'Jungle Beach and Japanese Peace Pagoda', 'beach', 3, 0, 0, { when: 'Morning' }),
    A('tri-pigeon', 'trinco', 'Pigeon Island snorkelling', 'beach', 4, 45, 25, { when: 'Morning', months: [4, 5, 6, 7, 8, 9, 10], minAge: 6, note: 'Boats usually run from about April to October.', entry: true }),
    A('tri-temple', 'trinco', 'Koneswaram temple and Swami Rock', 'culture', 1.5, 0, 0, { when: 'Late afternoon' }),
    A('neg-lagoon', 'negombo', 'Lagoon boat trip', 'nature', 2, 20, 10, { when: 'Morning' })
  ];

  // Starting packages. nights per stop, a default stay and default activities.
  const packages = [
    {
      slug: 'sri-lanka-highlights-7-days', name: 'Sri Lanka Highlights', group: ['seven', 'first'],
      short: 'The classic first trip: Sigiriya, Kandy, the hill country and Galle.',
      days: 7, style: 'First time discovery', pace: 'balanced', tier: 'boutique', vehicle: 'auto', transport: 'driver',
      stops: [
        { base: 'sigiriya', nights: 2, stay: 'sig-2', acts: ['sig-rock', 'sig-dambulla', 'sig-safari'] },
        { base: 'kandy', nights: 1, stay: 'kan-2', acts: ['kan-temple'] },
        { base: 'ella', nights: 2, stay: 'ell-2', acts: ['ell-peak', 'ell-bridge'], arriveBy: 'train' },
        { base: 'galle', nights: 1, stay: 'gal-1', acts: ['gal-fort'] }
      ],
      bestMonths: 'December to April', photo: 'sigiriya',
      included: ['Private car and driver for the whole trip', 'Scenic train seats from Kandy to Ella', 'Breakfast every day', 'Entry to Sigiriya Rock, Dambulla and the Temple of the Tooth', 'One jeep safari'],
      excluded: ['International flights', 'Travel insurance', 'Sri Lanka visa or ETA', 'Lunches and most dinners', 'Tips']
    },
    {
      slug: 'south-coast-escape-5-days', name: 'South Coast Escape', group: ['five', 'coast'],
      short: 'Five unhurried days between Galle Fort and the Mirissa beaches.',
      days: 5, style: 'Beach and slow travel', pace: 'relaxed', tier: 'boutique', vehicle: 'auto', transport: 'transfers',
      stops: [
        { base: 'galle', nights: 2, stay: 'gal-2', acts: ['gal-fort'] },
        { base: 'mirissa', nights: 2, stay: 'mir-2', acts: ['mir-whale'] }
      ],
      bestMonths: 'December to April', photo: 'mirissa',
      included: ['Airport and hotel transfers', 'Breakfast every day', 'Galle Fort walking tour', 'Whale watching in season'],
      excluded: ['International flights', 'Travel insurance', 'Sri Lanka visa or ETA', 'Lunches and dinners', 'A car on beach days']
    },
    {
      slug: 'hill-country-and-wildlife-8-days', name: 'Hill Country and Wildlife', group: ['seven', 'nature'],
      short: 'Tea estates, mountain walks and an elephant safari on the way down to the sea.',
      days: 8, style: 'Nature and walking', pace: 'balanced', tier: 'boutique', vehicle: 'auto', transport: 'driver',
      stops: [
        { base: 'kandy', nights: 2, stay: 'kan-2', acts: ['kan-temple', 'kan-garden'] },
        { base: 'nuwara', nights: 1, stay: 'nuw-1', acts: ['nuw-tea'] },
        { base: 'ella', nights: 2, stay: 'ell-2', acts: ['ell-peak', 'ell-rock'], arriveBy: 'train' },
        { base: 'udawalawe', nights: 1, stay: 'uda-1', acts: ['uda-safari'] },
        { base: 'mirissa', nights: 1, stay: 'mir-2', acts: [] }
      ],
      bestMonths: 'January to April', photo: 'ella',
      included: ['Private car and driver', 'Train seats from Nuwara Eliya to Ella', 'Breakfast daily, some dinners', 'Tea factory visit', 'Udawalawe jeep safari'],
      excluded: ['International flights', 'Travel insurance', 'Sri Lanka visa or ETA', 'Most lunches', 'Tips']
    },
    {
      slug: 'sri-lanka-honeymoon-10-days', name: 'Honeymoon in Sri Lanka', group: ['long', 'honeymoon'],
      short: 'Quiet stays with views, a few big moments and four slow days by the sea.',
      days: 10, style: 'Romantic and slow', pace: 'relaxed', tier: 'luxury', vehicle: 'auto', transport: 'driver',
      stops: [
        { base: 'sigiriya', nights: 2, stay: 'sig-3', acts: ['sig-rock'] },
        { base: 'kandy', nights: 1, stay: 'kan-3', acts: ['kan-temple'] },
        { base: 'ella', nights: 2, stay: 'ell-3', acts: ['ell-peak'], arriveBy: 'train' },
        { base: 'mirissa', nights: 4, stay: 'mir-3', acts: ['mir-whale'] }
      ],
      bestMonths: 'December to April', photo: 'diyaluma',
      included: ['Private car and driver', 'Scenic train seats', 'Breakfast daily, half board in Sigiriya and Ella', 'Private beach villa for four nights', 'Whale watching in season'],
      excluded: ['International flights', 'Travel insurance', 'Sri Lanka visa or ETA', 'Spa treatments', 'Tips']
    },
    {
      slug: 'sri-lanka-family-adventure-12-days', name: 'Family Adventure', group: ['long', 'family'],
      short: 'Short drives, pools at most stops, elephants, a leopard safari and beach time.',
      days: 12, style: 'Family friendly', pace: 'relaxed', tier: 'boutique', vehicle: 'auto', transport: 'driver',
      stops: [
        { base: 'negombo', nights: 1, stay: 'neg-2', acts: [] },
        { base: 'sigiriya', nights: 3, stay: 'sig-3', acts: ['sig-rock', 'sig-safari', 'sig-cook'] },
        { base: 'kandy', nights: 2, stay: 'kan-3', acts: ['kan-garden', 'kan-dance'] },
        { base: 'ella', nights: 2, stay: 'ell-2', acts: ['ell-bridge', 'ell-peak'], arriveBy: 'train' },
        { base: 'tissa', nights: 1, stay: 'tis-2', acts: ['tis-yala'] },
        { base: 'mirissa', nights: 2, stay: 'mir-4', acts: ['mir-snork'] }
      ],
      bestMonths: 'December to April, or July and August for the cultural north', photo: 'sigiriya-hero',
      included: ['Private van and driver', 'Scenic train seats', 'Breakfast daily, half board at the resorts', 'Two jeep safaris', 'Cooking lunch and dance show'],
      excluded: ['International flights', 'Travel insurance', 'Sri Lanka visa or ETA', 'Most lunches', 'Tips']
    },
    {
      slug: 'budget-sri-lanka-7-days', name: 'Sri Lanka on a Budget', group: ['seven', 'budget'],
      short: 'Good homestays, trains and free walks. Big views without a big bill.',
      days: 7, style: 'Budget friendly', pace: 'balanced', tier: 'simple', vehicle: 'auto', transport: 'transfers',
      stops: [
        { base: 'kandy', nights: 2, stay: 'kan-1', acts: ['kan-temple'] },
        { base: 'ella', nights: 2, stay: 'ell-1', acts: ['ell-peak', 'ell-bridge'], arriveBy: 'train' },
        { base: 'mirissa', nights: 2, stay: 'mir-1', acts: [] }
      ],
      bestMonths: 'December to April', photo: 'sinharaja',
      included: ['Transfers between towns', 'Scenic train from Kandy to Ella', 'Breakfast every day', 'Temple of the Tooth entry'],
      excluded: ['International flights', 'Travel insurance', 'Sri Lanka visa or ETA', 'Lunches and dinners', 'A car for day trips']
    }
  ];

  const packageGroups = {
    five: '5 Day Escapes', seven: '7 Day Highlights', long: '10 to 14 Day Journeys',
    honeymoon: 'Honeymoon', family: 'Family', budget: 'Budget Friendly', first: 'First Trip', coast: 'Coast', nature: 'Nature'
  };

  // Simplified coastline [lon, lat] for the schematic map. Not for navigation.
  const outline = [
    [80.25, 9.83], [80.6, 9.45], [80.82, 9.27], [81.0, 8.93], [81.23, 8.57], [81.42, 8.22], [81.56, 7.93], [81.7, 7.72],
    [81.85, 7.3], [81.83, 6.88], [81.7, 6.45], [81.35, 6.2], [81.12, 6.1], [80.8, 6.0], [80.59, 5.92], [80.45, 5.95],
    [80.22, 6.03], [80.05, 6.25], [79.96, 6.58], [79.85, 6.93], [79.83, 7.2], [79.8, 7.6], [79.83, 8.03], [79.87, 8.5],
    [79.95, 8.9], [80.05, 9.1], [80.2, 9.5], [79.98, 9.66], [80.03, 9.82]
  ];
  const project = (lat, lon) => [Math.round((lon - 79.6) * 100), Math.round((9.95 - lat) * 100)];

  root.CW = { config, bases, roads, trains, seasons, seasonNotes, seasonRate, stays, offers, activities, packages, packageGroups, outline, project };
})(typeof window !== 'undefined' ? window : globalThis);
