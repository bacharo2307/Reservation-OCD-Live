/* OCD LIVE — application client (PWA). Le serveur reste l'autorité : le navigateur ne fait qu'afficher. */
(function () {
  'use strict';

  var O = window.OCD, F = O.F, icon = O.icon, esc = O.esc;
  var $app = document.getElementById('app');
  var $header = document.getElementById('header');
  var $banner = document.getElementById('banner');
  var $sheet = document.getElementById('sheet-root');

  var STEPS = ['Mode de participation', 'Votre package', 'Votre date', 'Votre horaire', 'Vos informations', 'Récapitulatif', 'Paiement'];
  var MODES = {
    presentiel: { label: 'Présentiel', long: 'Live en présentiel', icon: 'studio', desc: 'Au studio OCD de Lomé, avec notre régie.' },
    distance: { label: 'À distance', long: 'Live à distance', icon: 'globe', desc: 'Depuis chez vous, partout dans le monde, avec une assistante OCD.' },
  };
  var METHODS = {
    mobile_money_tg: { name: 'Mobile Money Togo', desc: 'Flooz, T-Money', icon: 'phone' },
    mobile_money_other: { name: 'Autre Mobile Money', desc: 'MTN, Orange, Wave…', icon: 'phone' },
    card: { name: 'Carte bancaire', desc: 'Visa, Mastercard', icon: 'card' },
  };
  var DAY_LABEL = { open: 'disponible', few: 'presque complet', full: 'complet', closed: 'fermé', disabled: 'indisponible' };
  var STORE_KEY = 'ocdlive-draft-v1';

  function newDraft() {
    return { mode: null, packageId: null, date: null, start: null, holdKey: null, payKey: null, id: null, token: null, booking: null, payMethod: null, agreed: false,
      info: { name: '', company: '', sector: '', products: '', country: '', city: '', phone: '', email: '' } };
  }

  var S = { cfg: null, packages: [], view: 'loading', step: 1, d: newDraft(), month: null, monthData: null, dayData: null, loadingKey: null,
    conflict: null, errors: {}, pay: null, busy: false, skew: 0 };

  var now = function () { return Date.now() + S.skew; };

  // ---------- Données ----------
  function api(path, opts) {
    var o = opts || {};
    var h = Object.assign({}, o.headers || {});
    if (S.d.token && o.auth !== false) h['X-Booking-Token'] = S.d.token;
    return O.request(path, { method: o.method, body: o.body, headers: h }).then(function (r) {
      if (r && r.booking && r.booking.serverTime) S.skew = Date.parse(r.booking.serverTime) - Date.now();
      return r;
    });
  }

  function save() {
    try {
      var d = Object.assign({}, S.d);
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ d: d, step: S.step, view: S.view, month: S.month }));
    } catch (e) { /* stockage indisponible : la réservation reste possible */ }
  }
  function clearSaved() { try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* rien */ } }

  function pkg() { return S.packages.find(function (p) { return p.id === S.d.packageId; }) || null; }
  function priceOf(p, mode) { return p.isQuote ? null : p.prices[mode]; }
  function countryTz(name) { var c = (S.cfg.countries || []).find(function (x) { return x.name === name; }); return c ? c.tz : null; }
  function isLive(b) { return b && (b.status === 'hold' || b.status === 'pending_payment') && b.expiresAt && Date.parse(b.expiresAt) > now(); }

  function firstMonth() {
    var today = new Date(now()).toISOString().slice(0, 10);
    var launch = S.cfg.booking.launchDate;
    return (launch > today ? launch : today).slice(0, 7);
  }
  function lastMonth() {
    return new Date(now() + S.cfg.booking.horizonDays * 864e5).toISOString().slice(0, 7);
  }
  function shiftMonth(m, delta) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + delta;
    var d = new Date(Date.UTC(y, mo, 1));
    return d.toISOString().slice(0, 7);
  }

  // ---------- Navigation ----------
  function go(step) {
    S.view = 'booking';
    S.step = step;
    S.errors = {};
    if (step === 4) S.dayData = null; // toujours des disponibilités fraîches
    render();
    window.scrollTo(0, 0);
  }

  function resetSlot() {
    var d = S.d;
    if (d.id && d.booking && d.booking.status === 'hold') {
      api('/bookings/' + d.id, { method: 'DELETE' }).catch(function () { /* expirera tout seul */ });
    }
    if (!d.booking || d.booking.status === 'hold') { d.id = null; d.token = null; d.booking = null; }
    d.start = null;
    S.conflict = null;
  }

  function handleExpired(msg) {
    O.toast(msg || 'Le délai est dépassé : le créneau a été libéré. Choisissez un nouvel horaire.', 'warn');
    S.d.id = null; S.d.token = null; S.d.booking = null; S.d.start = null; S.pay = null;
    go(S.d.date ? 4 : 3);
  }

  // ---------- Rendu ----------
  function render() {
    renderHeader();
    $banner.innerHTML = S.cfg && S.cfg.payment.provider === 'demo'
      ? '<div class="banner">Mode démonstration : les paiements sont simulés, aucun argent n’est prélevé.</div>' : '';
    var html = '';
    $app.className = 'wrap' + (S.view === 'home' ? ' home' : '');
    if (S.view === 'home') html = renderHome() + footer();
    else if (S.view === 'booking') html = renderBooking();
    else if (S.view === 'success') html = renderSuccess() + footer();
    $app.innerHTML = html;
    save();
  }

  function renderHeader() {
    $header.innerHTML = '<div class="topbar-in"><button class="brand" data-a="home" aria-label="Accueil OCD LIVE">' + O.wordmark(S.cfg && S.cfg.brand) + '</button>' +
      '<div class="top-actions"><button class="iconbtn" data-a="theme" aria-label="Changer de thème">' + icon(O.currentTheme() === 'dark' ? 'sun' : 'moon', 20) + '</button></div></div>';
  }

  function footer() {
    var b = S.cfg.brand;
    return '<footer class="foot"><p>' + esc(b.slogan) + '</p><small>' + esc(b.org) + ' · <a href="/admin/">Espace équipe</a></small></footer>';
  }

  function minPrice(mode) {
    var ps = S.packages.filter(function (p) { return p.modes.indexOf(mode) >= 0 && priceOf(p, mode) != null; }).map(function (p) { return priceOf(p, mode); });
    return ps.length ? Math.min.apply(null, ps) : null;
  }

  function modeCard(mode, selected) {
    var M = MODES[mode], mp = minPrice(mode);
    return '<button class="glass mode-card' + (mode === 'distance' ? ' alt' : '') + (selected ? ' is-selected' : '') + '" data-a="mode" data-mode="' + mode + '">' +
      '<span class="mode-icon">' + icon(M.icon, 24) + '</span>' +
      '<span class="mode-body"><span class="mode-title">' + M.long + '</span><span class="mode-desc">' + M.desc + '</span></span>' +
      '<span class="mode-foot"><span class="mode-price">' + (mp != null ? '<small>dès </small>' + F.price(mp) : '') + '</span><span class="mode-arrow">' + icon('arrow', 16) + '</span></span></button>';
  }

  var HEART = '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.2 5 6.8 5c2 0 3.5 1.1 5.2 3 1.7-1.9 3.2-3 5.2-3 3.6 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21Z"/></svg>';

  function renderHome() {
    var b = S.cfg.brand;
    var launch = S.cfg.booking.launchDate;
    var today = new Date(now()).toISOString().slice(0, 10);
    var eyebrow = launch > today ? 'Lives à partir du ' + F.day(Date.parse(launch)) : 'Réservations ouvertes';
    var ai = S.cfg.voice.enabled
      ? '<button class="glass ai-cta" data-a="voice"><span class="orb-mini">' + icon('mic', 20) + '</span><span class="grow"><b>Réserver en parlant</b><small>Notre réceptionniste IA vérifie tout avec vous</small></span>' + icon('arrow', 18) + '</button>' : '';
    var step = function (n, t, s) { return '<div class="step3"><span class="num">' + n + '</span><span><b>' + t + '</b><small>' + s + '</small></span></div>'; };
    return '<section class="hero-grid"><div class="hero-copy">' +
      '<span class="eyebrow"><i class="live-dot"></i>' + esc(eyebrow) + '</span>' +
      '<h1>Votre business mérite d’être <span class="grad">vu</span>.</h1>' +
      '<p class="lead">Réservez votre live commercial, au studio OCD de Lomé ou depuis chez vous, partout dans le monde.</p>' +
      '<div class="choices">' + modeCard('presentiel') + modeCard('distance') + '</div>' + ai + '</div>' +
      '<div class="hero-visual" aria-hidden="true"><div class="glass phone"><div class="screen">' +
      '<div class="screen-top"><span class="live-pill"><i class="live-dot"></i>LIVE</span><span class="screen-handle">' + icon('live', 14) + esc(b.channel) + '</span></div>' +
      '<div class="hearts">' + HEART + HEART + HEART + '</div>' +
      '<div class="screen-card"><b>Votre produit ici</b><small>Présenté en direct à toute la communauté</small></div></div></div>' +
      '<div class="glass float-chip c1"><span class="dot">' + icon('studio', 16) + '</span><span>Studio de Lomé<small>Régie incluse</small></span></div>' +
      '<div class="glass float-chip c2"><span class="dot">' + icon('globe', 16) + '</span><span>À distance<small>Assistante OCD en direct</small></span></div></div></section>' +
      '<section class="glass steps3">' + step(1, 'Choisissez votre live', 'Au studio ou à distance') + step(2, 'Réservez votre créneau', 'Date, heure, paiement Mobile Money') +
      step(3, 'Vendez en direct', 'Sur le compte ' + esc(b.channel)) + '</section>';
  }

  function renderBooking() {
    var d = S.d;
    // Une étape ne s'affiche que si les précédentes sont remplies.
    if (S.step >= 2 && !d.mode) S.step = 1;
    if (S.step >= 3 && !pkg()) S.step = 2;
    if (S.step >= 4 && !d.date) S.step = 3;
    if (S.step >= 5 && !d.booking) S.step = 4;
    var s = S.step;
    var head = '<div class="stephead"><button class="iconbtn" data-a="back" aria-label="Retour">' + icon('back', 22) + '</button>' +
      '<div class="stephead-txt"><small>Étape ' + s + ' sur 7</small><b>' + STEPS[s - 1] + '</b></div>' +
      (d.mode ? '<span class="chip">' + MODES[d.mode].label + '</span>' : '') + '</div>' +
      '<div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="7" aria-valuenow="' + s + '"><i style="width:' + (s / 7 * 100) + '%"></i></div>';
    var hold = s >= 5 && isLive(d.booking)
      ? '<div class="hold">' + icon('clock', 18) + '<span>' + (d.booking.status === 'hold' ? 'Créneau retenu pour vous' : 'Délai de paiement') + ' : <b id="hold-timer">' + F.countdown(Date.parse(d.booking.expiresAt) - now()) + '</b></span></div>' : '';
    var body = [stepMode, stepPackage, stepDate, stepTime, stepInfo, stepRecap, stepPay][s - 1]();
    return head + hold + '<div class="stepbody">' + body + '</div>' + actionBar();
  }

  function summaryLine() {
    var p = pkg(), d = S.d, parts = [];
    if (p) parts.push(esc(p.name));
    if (d.start) parts.push(F.dayShort(Date.parse(d.start)) + ' · ' + F.time(Date.parse(d.start)));
    else if (d.date) parts.push(F.dayShort(Date.parse(d.date)));
    var price = p ? F.price(priceOf(p, d.mode)) : '';
    return parts.length ? '<div class="actionbar-sum"><span>' + parts.join(' · ') + '</span><b>' + price + '</b></div>' : '';
  }

  function actionBar() {
    var s = S.step, d = S.d, btn = '';
    if (s === 4) btn = '<button class="btn btn-primary btn-block" data-a="hold"' + (!d.start || S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Vérification…' : 'Retenir ce créneau') + '</button>';
    else if (s === 5) btn = '<button class="btn btn-primary btn-block" data-a="info-next"' + (S.busy ? ' disabled' : '') + '>Continuer</button>';
    else if (s === 6) {
      var quote = pkg() && pkg().isQuote;
      btn = '<button class="btn btn-primary btn-block" id="confirm-btn" data-a="confirm"' + (!d.agreed || S.busy ? ' disabled' : '') + '>' + (quote ? 'Envoyer ma demande' : 'Confirmer ma réservation') + '</button>';
    } else if (s === 7 && !S.pay) {
      btn = '<button class="btn btn-primary btn-block" data-a="pay"' + (!d.payMethod || S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Un instant…' : 'Payer ' + F.price(d.booking && d.booking.price)) + '</button>';
    }
    if (!btn) return '';
    return '<div class="glass actionbar">' + summaryLine() + btn + '</div>';
  }

  function stepMode() {
    return '<div class="choices" style="margin-top:0">' + modeCard('presentiel', S.d.mode === 'presentiel') + modeCard('distance', S.d.mode === 'distance') + '</div>';
  }

  function stepPackage() {
    var mode = S.d.mode;
    var list = S.packages.filter(function (p) { return p.modes.indexOf(mode) >= 0; });
    var intro = mode === 'distance' ? 'Une assistante OCD vous accompagne pendant tout le live.' : 'Notre régie s’occupe de la technique, vous vous occupez de vendre.';
    return '<p class="muted">Choisissez la formule qui correspond à votre business. ' + intro + '</p><div class="stack">' + list.map(function (p) {
      var price = priceOf(p, mode), sel = p.id === S.d.packageId;
      var hours = p.durationMin * (p.sessions || 1) / 60;
      var per = price != null ? 'soit ' + F.number(Math.round(price / hours)) + ' FCFA / heure' : 'Tarif établi avec l’équipe selon vos besoins';
      return '<article class="glass pkg' + (sel ? ' is-selected' : '') + '">' +
        '<div class="pkg-head"><div><h3>' + esc(p.name) + '</h3><p class="muted small">' + esc(p.tagline) + '</p></div>' + (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') + '</div>' +
        '<div class="pkg-meta"><span>' + icon('clock', 16) + (p.sessions > 1 ? p.sessions + ' lives de ' : '') + F.duration(p.durationMin) + '</span>' +
        (p.promo ? '<span class="chip tone-ok">' + esc(p.promo.label || ('-' + p.promo.percent + ' %')) + '</span>' : '') + '</div>' +
        '<div class="pkg-price"><b>' + F.price(price) + '</b><small>' + per + '</small></div>' +
        '<ul class="perks">' + (p.perks || []).map(function (x) { return '<li>' + icon('check', 16) + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' +
        (p.conditions ? '<p class="small muted">' + esc(p.conditions) + '</p>' : '') +
        '<button class="btn ' + (sel ? 'btn-primary' : 'btn-ghost') + ' btn-block" data-a="package" data-id="' + esc(p.id) + '">' + (sel ? 'Choisi · continuer' : 'Choisir ' + esc(p.name)) + '</button></article>';
    }).join('') + '</div>';
  }

  function ensure(kind) {
    var d = S.d, key, url;
    if (kind === 'month') {
      key = [d.mode, d.packageId, S.month].join('|');
      if (S.monthData && S.monthData.key === key) return true;
      url = '/availability/month?mode=' + d.mode + '&package=' + encodeURIComponent(d.packageId) + '&month=' + S.month;
    } else {
      key = [d.mode, d.packageId, d.date, d.id || ''].join('|');
      if (S.dayData && S.dayData.key === key) return true;
      url = '/availability/day?mode=' + d.mode + '&package=' + encodeURIComponent(d.packageId) + '&date=' + d.date + (d.id ? '&booking=' + d.id : '');
    }
    if (S.loadingKey === key) return false;
    S.loadingKey = key;
    api(url).then(function (r) { r.key = key; if (kind === 'month') S.monthData = r; else S.dayData = r; })
      .catch(function (e) { var r = { key: key, error: e.message, days: [], slots: [] }; if (kind === 'month') S.monthData = r; else S.dayData = r; })
      .then(function () { S.loadingKey = null; if (S.view === 'booking') render(); });
    return false;
  }

  function stepDate() {
    if (!S.month || S.month < firstMonth()) S.month = firstMonth();
    if (!ensure('month')) return '<div class="skeleton" style="min-height:360px"></div>';
    var md = S.monthData;
    if (md.error) return errorBox(md.error, 'reload');
    var y = +S.month.slice(0, 4), m = +S.month.slice(5, 7);
    var firstDay = Date.UTC(y, m - 1, 1);
    var lead = (new Date(firstDay).getUTCDay() + 6) % 7;
    var cells = '';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (x) { cells += '<span class="cal-dow" aria-hidden="true">' + x + '</span>'; });
    for (var i = 0; i < lead; i++) cells += '<span></span>';
    md.days.forEach(function (day) {
      var n = +day.date.slice(8, 10), st = day.status;
      var dis = st === 'disabled' || st === 'closed' || st === 'full';
      cells += '<button class="day ' + st + (day.date === S.d.date ? ' is-selected' : '') + '" data-a="date" data-date="' + day.date + '"' + (dis ? ' disabled' : '') +
        ' aria-label="' + esc(F.day(Date.parse(day.date)) + ' : ' + DAY_LABEL[st]) + '"><span>' + n + '</span><i class="dot"></i></button>';
    });
    var canPrev = S.month > firstMonth(), canNext = S.month < lastMonth();
    return '<div class="glass cal"><div class="cal-head"><button class="iconbtn" data-a="month" data-delta="-1" aria-label="Mois précédent"' + (canPrev ? '' : ' disabled') + '>' + icon('back', 20) + '</button>' +
      '<b>' + F.month(firstDay) + '</b><button class="iconbtn" data-a="month" data-delta="1" aria-label="Mois suivant"' + (canNext ? '' : ' disabled') + ' style="transform:scaleX(-1)">' + icon('back', 20) + '</button></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="legend"><span><i style="background:var(--ok)"></i>Disponible</span><span><i style="background:var(--warn)"></i>Presque complet</span><span><i style="background:var(--bad)"></i>Complet</span><span><i style="background:var(--text-3)"></i>Fermé</span></div></div>' +
      '<p class="note">' + icon('clock', 16) + '<span>' + esc(pkg().name) + ' · ' + F.duration(pkg().durationMin) + ' · horaires du studio ' + S.cfg.studio.openHour + 'h – ' + S.cfg.studio.closeHour + 'h (heure de Lomé)</span></p>';
  }

  function stepTime() {
    var d = S.d, p = pkg();
    if (!ensure('day')) return '<div class="skeleton" style="min-height:300px"></div>';
    var dd = S.dayData;
    if (dd.error) return errorBox(dd.error, 'reload');
    var local = O.browserTz !== O.TZ && F.time(Date.parse(d.date + 'T12:00:00Z'), O.browserTz) !== F.time(Date.parse(d.date + 'T12:00:00Z'));
    var slots = dd.slots.filter(function (s) { return s.state !== 'past'; });
    var html = '<div><h2>' + esc(F.cap(F.day(Date.parse(d.date)))) + '</h2><p class="muted small">' + esc(p.name) + ' · ' + F.duration(p.durationMin) + ' · heure de Lomé (GMT)</p></div>';
    if (local) html += '<p class="note">' + icon('globe', 16) + '<span>Votre appareil est sur un autre fuseau horaire : votre heure locale est indiquée sous chaque horaire.</span></p>';
    if (S.conflict) {
      html += '<div class="alert"><div class="alert-head">' + icon('alert', 18) + '<span>Désolé, ce créneau vient d’être réservé par un autre client.</span></div>' +
        (S.conflict.alternatives.length ? '<span>Voici les prochains horaires libres :</span><div class="row">' + S.conflict.alternatives.map(function (a) {
          return '<button class="btn btn-ghost btn-sm" data-a="alt" data-start="' + a.start + '">' + esc(F.dayShort(Date.parse(a.start))) + ' · ' + F.time(Date.parse(a.start)) + '</button>';
        }).join('') + '</div>' : '<span>Choisissez un autre horaire ou une autre date.</span>') + '</div>';
    }
    var free = slots.filter(function (s) { return s.state === 'free'; }).length;
    if (!slots.length || slots.every(function (s) { return s.state === 'closed'; })) {
      return html + '<div class="glass empty">Le studio est fermé ce jour-là.<br><button class="linkbtn" data-a="goto" data-step="3">Choisir une autre date</button></div>';
    }
    if (!free && !d.start) html += '<div class="glass empty">Plus aucun horaire libre ce jour-là.<br><button class="linkbtn" data-a="goto" data-step="3">Choisir une autre date</button></div>';
    html += '<div class="slots">' + slots.map(function (s) {
      var st = s.state, ms = Date.parse(s.start), sel = d.start === s.start;
      var sub = st === 'free' ? (local ? F.time(ms, O.browserTz) + ' chez vous' : 'Libre') : st === 'held' ? 'Retenu' : st === 'closed' ? 'Fermé' : 'Réservé';
      var dis = st !== 'free' && !sel;
      return '<button class="slot ' + st + (sel ? ' is-selected' : '') + '" data-a="slot" data-start="' + s.start + '"' + (dis ? ' disabled' : '') + ' aria-pressed="' + sel + '">' +
        '<b>' + F.time(ms) + ' – ' + F.time(Date.parse(s.end)) + '</b><small>' + sub + '</small></button>';
    }).join('') + '</div>';
    html += '<div class="legend"><span><i style="background:var(--ok)"></i>Libre</span><span><i style="background:var(--warn)"></i>Retenu par un client en cours de réservation</span><span><i style="background:var(--text-3)"></i>Réservé</span></div>';
    html += '<p class="note">' + icon('lock', 16) + '<span>Le créneau choisi est bloqué pour vous pendant ' + S.cfg.booking.holdMin + ' minutes, le temps de finaliser.</span></p>';
    return html;
  }

  function field(k, label, type, opts) {
    var o = opts || {}, v = S.d.info[k], e = S.errors[k];
    var attrs = ' id="f-' + k + '" data-field="' + k + '" name="' + k + '"' + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (e ? ' aria-invalid="true" aria-describedby="e-' + k + '"' : '') + (o.required === false ? '' : ' required');
    var input;
    if (type === 'select') {
      input = '<select' + attrs + '><option value="">Choisir…</option>' + o.options.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
    } else if (type === 'textarea') {
      input = '<textarea' + attrs + ' maxlength="240">' + esc(v) + '</textarea>';
    } else {
      input = '<input type="' + type + '"' + attrs + ' value="' + esc(v) + '"' + (type === 'tel' ? ' inputmode="tel"' : '') + '>';
    }
    return '<div class="field' + (e ? ' has-error' : '') + '"><label for="f-' + k + '">' + label + '</label>' + input + (e ? '<span class="err" id="e-' + k + '">' + esc(e) + '</span>' : '') + '</div>';
  }

  function stepInfo() {
    var i = S.d.info;
    if (S.d.mode === 'presentiel' && !i.country) { i.country = 'Togo'; if (!i.city) i.city = 'Lomé'; }
    return '<p class="muted">Ces informations permettent à l’équipe OCD de préparer votre live et de présenter votre business.</p>' +
      '<form class="glass form" id="info-form" novalidate>' +
      field('name', 'Nom et prénom', 'text', { auto: 'name', ph: 'Ex. : Awa Mensah' }) +
      field('company', 'Entreprise ou boutique', 'text', { auto: 'organization', ph: 'Ex. : Saveurs d’Awa' }) +
      field('sector', 'Votre business', 'select', { options: S.cfg.sectors }) +
      field('products', 'Ce que vous allez vendre ou présenter', 'textarea', { ph: 'Ex. : plats cuisinés, chaussures pour femmes, crèmes naturelles…' }) +
      '<div class="grid2">' + field('country', 'Pays', 'select', { options: S.cfg.countries.map(function (c) { return c.name; }) }) +
      field('city', 'Ville', 'text', { auto: 'address-level2', ph: 'Ex. : Lomé' }) + '</div>' +
      field('phone', 'Téléphone WhatsApp', 'tel', { auto: 'tel', ph: 'Ex. : +228 90 00 00 00' }) +
      field('email', 'Email (facultatif)', 'email', { auto: 'email', ph: 'vous@exemple.com', required: false }) +
      '<button type="submit" class="sr">Continuer</button></form>';
  }

  function recapRow(label, value, sub) {
    return '<div class="recap-row"><dt>' + label + '</dt><dd>' + value + (sub ? '<small>' + sub + '</small>' : '') + '</dd></div>';
  }

  function whenLines(b, info) {
    var s = Date.parse(b.start), e = Date.parse(b.end);
    var main = F.time(s) + ' – ' + F.time(e) + ' (heure de Lomé)';
    var tz = b.mode === 'distance' && info ? countryTz(info.country) : null;
    var sub = tz && F.time(s, tz) !== F.time(s) ? 'soit ' + F.time(s, tz) + ' – ' + F.time(e, tz) + ' à ' + esc(info.city || info.country) : '';
    return { day: F.cap(F.dayYear(s)), main: main, sub: sub };
  }

  function stepRecap() {
    var d = S.d, b = d.booking, p = pkg(), i = d.info;
    if (!b) return errorBox('Réservation introuvable.', 'restart');
    var w = whenLines(b, i);
    var place = b.mode === 'presentiel' ? esc(S.cfg.brand.studio) : 'Depuis ' + esc(i.city) + ', ' + esc(i.country);
    return '<p class="muted">Vérifiez vos informations avant de confirmer.</p>' +
      '<div class="section-head"><h3>Votre live</h3><button class="linkbtn" data-a="goto" data-step="3">Modifier</button></div>' +
      '<dl class="glass recap">' + recapRow('Participation', MODES[b.mode].long) + recapRow('Package', esc(b.packageName), b.sessions > 1 ? b.sessions + ' lives dans le mois, le premier réservé ici' : '') +
      recapRow('Durée', F.duration(b.durationMin)) + recapRow('Date', w.day) + recapRow('Horaire', w.main, w.sub) + recapRow('Lieu', place) +
      recapRow('Diffusion', 'Compte ' + esc(S.cfg.brand.channel)) + (b.mode === 'distance' ? recapRow('Accompagnement', 'Une assistante OCD en direct') : '') + '</dl>' +
      '<div class="section-head"><h3>Vous</h3><button class="linkbtn" data-a="goto" data-step="5">Modifier</button></div>' +
      '<dl class="glass recap">' + recapRow('Nom', esc(i.name)) + recapRow('Entreprise', esc(i.company)) + recapRow('Business', esc(i.sector)) +
      recapRow('Vous présentez', esc(i.products)) + recapRow('Téléphone', esc(i.phone)) + (i.email ? recapRow('Email', esc(i.email)) : '') + '</dl>' +
      '<dl class="glass recap">' + recapRow('<b>Montant</b>', '<b>' + F.price(b.price) + '</b>', p && p.isQuote ? 'L’équipe OCD vous envoie un devis' : '') + '</dl>' +
      '<label class="check glass" style="padding:14px 16px"><input type="checkbox" id="agree"' + (d.agreed ? ' checked' : '') + '><span>Je confirme que ces informations sont exactes et je souhaite réserver ce live.</span></label>';
  }

  function availableMethods() {
    var all = S.cfg.payment.methods || [];
    if (S.cfg.payment.provider === 'manual') return all.filter(function (m) { return m !== 'card'; });
    return all;
  }

  function stepPay() {
    var d = S.d, b = d.booking;
    if (!b) return errorBox('Réservation introuvable.', 'restart');
    var amount = '<div class="glass amount"><span>Montant à payer</span><b>' + F.price(b.price) + '</b><small>' + esc(b.packageName) + ' · ' + esc(b.ref || '') + '</small></div>';
    if (S.pay) {
      var ins = S.pay.instructions || { steps: [] };
      var steps = '<ol class="steps-list">' + (ins.steps || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
      if (ins.kind === 'demo') {
        return amount + '<div class="glass panel">' + steps + '<button class="btn btn-primary btn-block" data-a="demo-pay"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Paiement en cours…' : 'Valider le paiement de démonstration') + '</button></div>';
      }
      return amount + '<div class="glass panel"><h3>Comment payer</h3>' + steps +
        '<p class="note">' + icon('clock', 16) + '<span>Statut : en attente de confirmation par l’équipe OCD. Cette page se met à jour toute seule.</span></p>' +
        '<button class="btn btn-ghost btn-block" data-a="refresh">' + icon('refresh', 18) + 'Actualiser</button></div>';
    }
    return amount + '<fieldset class="methods"><legend>Moyen de paiement</legend>' + availableMethods().map(function (m) {
      var M = METHODS[m];
      return '<label class="glass method' + (d.payMethod === m ? ' is-selected' : '') + '"><input type="radio" name="pay" value="' + m + '"' + (d.payMethod === m ? ' checked' : '') + '>' +
        '<span class="method-icon">' + icon(M.icon, 20) + '</span><span><b>' + M.name + '</b><small>' + M.desc + '</small></span></label>';
    }).join('') + '</fieldset>' +
      '<p class="note">' + icon('shield', 16) + '<span>Votre réservation est confirmée uniquement après réception du paiement. Sans paiement dans le délai, le créneau est libéré automatiquement.</span></p>';
  }

  function renderSuccess() {
    var b = S.d.booking, i = S.d.info;
    if (!b) return errorBox('Réservation introuvable.', 'restart');
    var quote = b.status === 'quote';
    var w = whenLines(b, i);
    var next = quote
      ? ['L’équipe OCD vous contacte rapidement avec un devis.', 'Votre créneau reste bloqué pour vous en attendant.']
      : b.mode === 'presentiel'
        ? ['Gardez votre référence : elle vous sera demandée au studio.', 'Présentez-vous au studio OCD de Lomé un peu avant l’heure, avec vos produits.', 'Notre régie lance votre live sur le compte ' + S.cfg.brand.channel + '.']
        : ['Gardez votre référence.', 'Votre assistante OCD vous contacte sur WhatsApp avant le live pour tester votre connexion.', 'Le jour J, elle vous fait monter sur le live ' + S.cfg.brand.channel + ' et vous accompagne.'];
    return '<div class="glass success"><div class="success-icon">' + icon('check', 32) + '</div>' +
      '<h2>' + (quote ? 'Demande envoyée' : 'Réservation confirmée') + '</h2><span class="muted">Référence</span><span class="ref">' + esc(b.ref) + '</span></div>' +
      '<dl class="glass recap" style="margin-top:14px">' + recapRow('Package', esc(b.packageName)) + recapRow('Date', w.day) + recapRow('Horaire', w.main, w.sub) +
      recapRow('Participation', MODES[b.mode].long) + recapRow('Montant', F.price(b.price)) + '</dl>' +
      '<div class="glass panel" style="margin-top:14px"><h3>Et maintenant ?</h3><ol class="steps-list">' + next.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      (i.email ? '<p class="small muted">Un email de confirmation est envoyé à ' + esc(i.email) + '.</p>' : '') + '</div>' +
      '<div class="stack" style="margin-top:14px"><button class="btn btn-ghost btn-block" data-a="ics">' + icon('calendar', 18) + 'Ajouter à mon agenda</button>' +
      '<button class="btn btn-primary btn-block" data-a="new">Faire une autre réservation</button></div>';
  }

  function errorBox(msg, action) {
    return '<div class="alert"><div class="alert-head">' + icon('alert', 18) + '<span>' + esc(msg) + '</span></div>' +
      '<div><button class="btn btn-ghost btn-sm" data-a="' + action + '">' + (action === 'reload' ? 'Réessayer' : 'Recommencer') + '</button></div></div>';
  }

  // ---------- Actions ----------
  var A = {
    home: function () { S.view = 'home'; render(); window.scrollTo(0, 0); },
    theme: function () { O.toggleTheme(); renderHeader(); },
    voice: function () { aiOpen(); },
    'ai-start-voice': function () { aiStart('voice'); },
    'ai-start-text': function () { aiStart('text'); },
    'ai-close': function () { aiClose(false); },
    'ai-mic': function () {
      if (!AI || AI.busy) return;
      if (AI.listening) { V.stopListening(); return; }
      if (AI.speaking) { V.stopSpeaking(); AI.speaking = false; }
      AI.mode = 'voice';
      aiListen();
    },
    'ai-form': function () { aiHandoff(); },
    'ai-human': function () {
      if (!AI) return;
      if (!AI.id) { AI.human = { whatsapp: S.cfg.voice.whatsapp }; aiRender(); return; }
      aiSend('Je voudrais parler à une personne de l’équipe OCD.');
    },
    close: function () { $sheet.innerHTML = ''; },
    back: function () {
      if (S.step <= 1) return A.home();
      if (S.step === 7 && S.pay) { S.pay = null; }
      go(S.step - 1);
    },
    goto: function (el) { go(+el.dataset.step); },
    mode: function (el) {
      var m = el.dataset.mode;
      if (S.d.mode !== m) { resetSlot(); S.d.mode = m; S.d.packageId = null; S.d.date = null; S.monthData = null; }
      go(2);
    },
    package: function (el) {
      if (S.d.packageId !== el.dataset.id) { resetSlot(); S.d.packageId = el.dataset.id; S.monthData = null; }
      go(3);
    },
    month: function (el) { S.month = shiftMonth(S.month, +el.dataset.delta); render(); },
    date: function (el) {
      if (S.d.date !== el.dataset.date) { resetSlot(); S.d.date = el.dataset.date; }
      go(4);
    },
    slot: function (el) {
      if (S.d.start !== el.dataset.start) { S.d.start = el.dataset.start; S.d.holdKey = O.uuid(); }
      S.conflict = null;
      render();
    },
    alt: function (el) {
      var st = el.dataset.start;
      S.d.date = st.slice(0, 10); S.d.start = st; S.d.holdKey = O.uuid(); S.conflict = null; S.dayData = null;
      render();
    },
    hold: function () {
      var d = S.d;
      if (S.busy || !d.start) return;
      if (d.booking && d.booking.start === d.start && d.booking.status === 'hold' && isLive(d.booking)) return go(5);
      S.busy = true; render();
      var prev = d.id && d.booking && d.booking.status === 'hold' ? { id: d.id, token: d.token } : null;
      api('/holds', { method: 'POST', auth: false, body: { mode: d.mode, packageId: d.packageId, start: d.start, previous: prev }, headers: { 'Idempotency-Key': d.holdKey || O.uuid() } })
        .then(function (r) {
          S.busy = false;
          d.id = r.booking.id; d.token = r.token; d.booking = r.booking; d.agreed = false;
          O.toast('Créneau retenu pour vous pendant ' + S.cfg.booking.holdMin + ' minutes.', 'ok');
          go(5);
        })
        .catch(function (e) {
          S.busy = false;
          if (prev) { d.id = null; d.token = null; d.booking = null; }
          if (e.code === 'slot_taken') { S.conflict = { alternatives: (e.data && e.data.alternatives) || [] }; d.start = null; S.dayData = null; }
          else O.toast(e.message, 'bad');
          render();
        });
    },
    'info-next': function () {
      if (S.busy) return;
      S.busy = true; render();
      api('/bookings/' + S.d.id + '/contact', { method: 'PUT', body: S.d.info })
        .then(function (r) { S.busy = false; S.d.booking = r.booking; go(6); })
        .catch(function (e) {
          S.busy = false;
          if (e.status === 410 || e.status === 404 || e.status === 401) return handleExpired(e.message);
          S.errors = (e.data && e.data.fields) || {};
          if (!Object.keys(S.errors).length) O.toast(e.message, 'bad');
          render();
          var first = document.querySelector('[aria-invalid="true"]');
          if (first) first.focus();
        });
    },
    confirm: function () {
      if (S.busy || !S.d.agreed) return;
      S.busy = true; render();
      api('/bookings/' + S.d.id + '/confirm', { method: 'POST' })
        .then(function (r) {
          S.busy = false; S.d.booking = r.booking;
          if (r.booking.status === 'pending_payment') { S.d.payKey = O.uuid(); S.pay = null; go(7); }
          else { S.view = 'success'; render(); window.scrollTo(0, 0); }
        })
        .catch(function (e) { S.busy = false; if (e.status === 410) return handleExpired(e.message); O.toast(e.message, 'bad'); render(); });
    },
    pay: function () {
      var d = S.d;
      if (S.busy || !d.payMethod) return;
      S.busy = true; render();
      api('/bookings/' + d.id + '/payments', { method: 'POST', body: { method: d.payMethod }, headers: { 'Idempotency-Key': d.payKey || O.uuid() } })
        .then(function (r) {
          S.busy = false; d.booking = r.booking;
          if (r.alreadyPaid || r.booking.status === 'confirmed') { S.view = 'success'; render(); return; }
          S.pay = { payment: r.payment, instructions: r.instructions };
          if (r.redirectUrl) { window.location.href = r.redirectUrl; return; }
          render();
        })
        .catch(function (e) { S.busy = false; if (e.status === 410) return handleExpired(e.message); O.toast(e.message, 'bad'); render(); });
    },
    'demo-pay': function () {
      if (S.busy || !S.pay) return;
      S.busy = true; render();
      api('/bookings/' + S.d.id + '/payments/demo-complete', { method: 'POST', body: { providerRef: S.pay.payment.providerRef } })
        .then(function (r) { S.busy = false; S.d.booking = r.booking; S.pay = null; S.view = 'success'; render(); window.scrollTo(0, 0); O.toast('Paiement reçu : votre live est confirmé.', 'ok'); })
        .catch(function (e) { S.busy = false; O.toast(e.message, 'bad'); render(); });
    },
    refresh: function () { pollBooking(true); },
    reload: function () { S.monthData = null; S.dayData = null; render(); },
    restart: function () { A.new(); },
    new: function () { S.d = newDraft(); S.pay = null; S.conflict = null; S.monthData = null; S.dayData = null; clearSaved(); A.home(); },
    ics: function () { downloadIcs(); },
    hardreload: function () { location.reload(); },
  };

  function openSheet(inner) {
    $sheet.innerHTML = '<div class="sheet-backdrop" data-a="backdrop"><div class="sheet" role="dialog" aria-modal="true">' + inner + '</div></div>';
    var btn = $sheet.querySelector('button');
    if (btn) btn.focus();
  }

  function pollBooking(manual) {
    if (!S.d.id) return;
    api('/bookings/' + S.d.id).then(function (r) {
      S.d.booking = r.booking;
      if (r.booking.status === 'confirmed') { S.pay = null; S.view = 'success'; render(); O.toast('Paiement reçu : votre live est confirmé.', 'ok'); }
      else if (r.booking.status === 'expired' || r.booking.status === 'cancelled') handleExpired('Le délai de paiement est dépassé : le créneau a été libéré.');
      else if (manual) O.toast('Paiement pas encore reçu par l’équipe.', 'info');
    }).catch(function (e) { if (manual) O.toast(e.message, 'bad'); });
  }

  function downloadIcs() {
    var b = S.d.booking;
    if (!b) return;
    var stamp = function (iso) { return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var where = b.mode === 'presentiel' ? S.cfg.brand.studio : 'À distance — live ' + S.cfg.brand.channel;
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OCD LIVE//FR', 'BEGIN:VEVENT', 'UID:' + b.id + '@ocdlive', 'DTSTAMP:' + stamp(new Date().toISOString()),
      'DTSTART:' + stamp(b.start), 'DTEND:' + stamp(b.end), 'SUMMARY:Live OCD — ' + b.packageName + ' (' + b.ref + ')', 'LOCATION:' + where, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'live-ocd-' + (b.ref || 'reservation') + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // ---------- Réceptionniste IA ----------
  // Le serveur décide (créneau, fiche, confirmation) ; l'écran affiche, parle et écoute.
  var V = window.OCDVoice;
  var $ai = document.getElementById('ai-root');
  var AI = null;

  function aiOpen() {
    AI = { phase: 'intro', mode: V.canListen ? 'voice' : 'text', id: null, token: null, busy: false, listening: false, speaking: false, transcript: [], fiche: [], live: '', human: null };
    aiRender();
  }

  function aiStatus() {
    if (AI.phase === 'intro') return 'Réservez en parlant naturellement';
    if (AI.busy) return 'Je vérifie…';
    if (AI.speaking) return 'Je vous réponds…';
    if (AI.listening) return 'Je vous écoute…';
    return AI.mode === 'voice' ? 'Touchez le micro pour parler' : 'Écrivez votre message';
  }

  function aiRender() {
    if (!AI) { $ai.innerHTML = ''; return; }
    var prev = document.getElementById('ai-text');
    var draft = prev ? prev.value : '';
    var orb = AI.busy ? 'thinking' : AI.speaking ? 'speaking' : AI.listening ? 'listening' : 'idle';
    var head = '<div class="ai-head"><div class="grow"><b>Réceptionniste OCD</b><small id="ai-status">' + esc(aiStatus()) + '</small></div>' +
      (AI.listening ? '<span class="mic-on"><i></i>Micro actif</span>' : '') +
      '<button class="iconbtn" data-a="ai-close" aria-label="Terminer la conversation">' + icon('x', 20) + '</button></div>';
    var html = head + '<div class="ai-stage"><div class="orb" data-state="' + orb + '"></div>';
    if (AI.phase === 'intro') {
      html += '<p class="ai-live muted">Dites ce que vous vendez et quand vous voulez passer en live. Je vérifie chaque information avec vous et je ne confirme rien sans votre accord.</p><div class="ai-intro">' +
        (V.canListen ? '<button class="btn btn-primary btn-block" data-a="ai-start-voice"' + (AI.busy ? ' disabled' : '') + '>' + icon('mic', 18) + 'Autoriser le micro et commencer</button>'
          : '<p class="small muted">La voix n’est pas disponible sur ce navigateur : vous pouvez écrire.</p>') +
        '<button class="btn btn-ghost btn-block" data-a="ai-start-text"' + (AI.busy ? ' disabled' : '') + '>Écrire plutôt</button>' +
        '<p class="small muted">Aucun enregistrement audio n’est conservé.</p></div></div>';
    } else {
      html += '<p class="ai-live" id="ai-live" aria-live="polite">' + esc(AI.live) + '</p></div>';
      if (AI.fiche.length) {
        html += '<div class="fiche">' + AI.fiche.map(function (f) {
          return '<span class="chip' + (f.confirmed ? '' : ' pending') + '" title="' + (f.confirmed ? 'Confirmé' : 'À confirmer') + '">' + (f.confirmed ? icon('check', 13) : '') + esc(f.label) + ' : ' + esc(f.value) + '</span>';
        }).join('') + '</div>';
      }
      if (AI.human) {
        var wa = AI.human.whatsapp || S.cfg.voice.whatsapp;
        html += '<div class="glass human-card"><b>Parler à l’équipe OCD</b>' + (wa
          ? '<a class="btn btn-primary btn-block" href="https://wa.me/' + esc(wa.replace(/\D/g, '')) + '" target="_blank" rel="noopener">Écrire sur WhatsApp</a>'
          : '<span class="small muted">L’équipe a été prévenue et vous recontacte sur WhatsApp.</span>') + '</div>';
      }
      html += '<div class="ai-transcript" id="ai-transcript">' + AI.transcript.map(function (m) {
        return '<div class="bubble ' + (m.role === 'user' ? 'me' : 'ai') + '">' + esc(m.text) + '</div>';
      }).join('') + (AI.busy ? '<div class="bubble ai typing">…</div>' : '') + '</div>';
      html += '<div class="ai-controls"><button class="btn btn-ghost" data-a="ai-form">' + icon('edit', 16) + 'Formulaire</button>' +
        (V.canListen ? '<button class="mic-btn' + (AI.listening || AI.speaking ? '' : ' off') + '" data-a="ai-mic" aria-label="' + (AI.listening ? 'Couper le micro' : AI.speaking ? 'Interrompre et parler' : 'Parler') + '"' + (AI.busy ? ' disabled' : '') + '>' + icon('mic', 26) + '</button>' : '') +
        '<button class="btn btn-ghost" data-a="ai-human">' + icon('users', 16) + 'Un humain</button></div>' +
        '<form class="ai-input" id="ai-form"><input id="ai-text" autocomplete="off" placeholder="Écrire un message…" maxlength="600" aria-label="Votre message">' +
        '<button class="iconbtn" type="submit" aria-label="Envoyer"' + (AI.busy ? ' disabled' : '') + '>' + icon('arrow', 18) + '</button></form>';
    }
    $ai.innerHTML = '<div class="ai-overlay"><div class="glass ai-panel" role="dialog" aria-modal="true" aria-label="Réceptionniste IA">' + html + '</div></div>';
    var t = document.getElementById('ai-transcript');
    if (t) t.scrollTop = t.scrollHeight;
    var inp = document.getElementById('ai-text');
    if (inp) { inp.value = draft; if (AI.mode === 'text' && !AI.busy) inp.focus(); }
  }

  function aiLive(text) {
    AI.live = text;
    var el = document.getElementById('ai-live');
    if (el) el.textContent = text;
  }

  function aiStart(mode) {
    if (!AI || AI.busy) return;
    AI.busy = true;
    if (mode === 'voice') V.unlock(); // pendant le geste de l'utilisateur (iOS)
    aiRender();
    var ready = mode === 'voice'
      ? V.requestMic().then(function () { AI.mode = 'voice'; }).catch(function () { AI.mode = 'text'; O.toast('Micro refusé : vous pouvez écrire vos messages.', 'warn'); })
      : Promise.resolve().then(function () { AI.mode = 'text'; });
    ready.then(function () { return O.request('/ai/sessions', { method: 'POST', body: { channel: AI.mode } }); })
      .then(function (r) {
        if (!AI) return;
        AI.id = r.session.id; AI.token = r.session.token; AI.busy = false; AI.phase = 'chat';
        aiReply(r.reply, r.state, null);
      })
      .catch(function (e) { if (!AI) return; AI.busy = false; aiRender(); O.toast(e.message, 'bad'); });
  }

  function aiReply(text, state, action) {
    AI.transcript.push({ role: 'assistant', text: text });
    if (state) AI.fiche = state.fields || [];
    AI.live = text;
    var next = function () {
      if (!AI) return;
      if (action) aiAction(action);
      else if (AI.mode === 'voice') aiListen();
    };
    if (AI.mode === 'voice' && V.canSpeak) {
      AI.speaking = true; aiRender();
      V.speak(text).then(function () { if (!AI || !AI.speaking) return; AI.speaking = false; aiRender(); next(); });
    } else { aiRender(); next(); }
  }

  function aiListen() {
    if (!AI || AI.busy || !V.canListen) return;
    AI.listening = true; AI.live = ''; aiRender();
    V.listen({
      onInterim: function (t) { if (AI) aiLive(t); },
      onEnd: function (text) {
        if (!AI) return;
        AI.listening = false;
        if (text) aiSend(text);
        else { AI.live = 'Je n’ai rien entendu. Touchez le micro pour parler.'; aiRender(); }
      },
      onError: function (err) {
        if (!AI) return;
        AI.listening = false;
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'unsupported') { AI.mode = 'text'; O.toast('Micro indisponible : vous pouvez écrire.', 'warn'); }
        aiRender();
      },
    });
  }

  function aiSend(text) {
    if (!AI || AI.busy || !AI.id) return;
    V.stopListening(); V.stopSpeaking();
    AI.speaking = false; AI.listening = false; AI.busy = true; AI.live = '';
    AI.transcript.push({ role: 'user', text: text });
    aiRender();
    O.request('/ai/sessions/' + AI.id + '/messages', { method: 'POST', body: { text: text }, headers: { 'X-AI-Token': AI.token } })
      .then(function (r) { if (!AI) return; AI.busy = false; aiReply(r.reply, r.state, r.action); })
      .catch(function (e) {
        if (!AI) return;
        AI.busy = false;
        if (e.status === 410) AI.transcript.push({ role: 'assistant', text: e.message });
        else O.toast(e.message, 'bad');
        aiRender();
      });
  }

  // Passage au paiement, à la confirmation ou au formulaire, avec ce qui a été recueilli.
  function aiAction(a) {
    if (a.type === 'human') { AI.human = a; aiRender(); return; }
    var d = newDraft();
    d.mode = a.mode || null;
    d.packageId = a.packageId || null;
    Object.keys(a.info || {}).forEach(function (k) { if (k in d.info) d.info[k] = a.info[k]; });
    if (a.booking) {
      d.id = a.booking.id; d.token = a.token; d.booking = a.booking; d.start = a.booking.start;
      d.date = a.booking.start.slice(0, 10); d.mode = a.booking.mode; d.packageId = a.booking.packageId;
    }
    S.d = d; S.pay = null; S.monthData = null; S.dayData = null; S.conflict = null;
    aiClose(true);
    if (a.type === 'payment') { d.payKey = O.uuid(); go(7); }
    else if (a.type === 'success') { S.view = 'success'; render(); window.scrollTo(0, 0); }
    else go(d.booking ? 5 : d.packageId ? 3 : d.mode ? 2 : 1);
  }

  function aiHandoff() {
    if (!AI) return;
    if (!AI.id) { aiClose(false); go(1); return; }
    var id = AI.id, token = AI.token;
    AI.id = null; // évite une seconde clôture
    O.request('/ai/sessions/' + id + '/end', { method: 'POST', body: { keepHold: true }, headers: { 'X-AI-Token': token } })
      .then(function (r) { aiAction(Object.assign({ type: 'form' }, r.handoff || {})); })
      .catch(function () { aiClose(false); go(1); });
  }

  function aiClose(keepHold) {
    if (!AI) return;
    V.stopListening(); V.stopSpeaking();
    if (AI.id) O.request('/ai/sessions/' + AI.id + '/end', { method: 'POST', body: { keepHold: Boolean(keepHold) }, headers: { 'X-AI-Token': AI.token } }).catch(function () { /* rien */ });
    AI = null;
    aiRender();
  }

  // ---------- Événements ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el) return;
    if (el.dataset.a === 'backdrop' && e.target !== el) return;
    if (el.dataset.a === 'backdrop') return A.close();
    var fn = A[el.dataset.a];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', function (e) {
    var f = e.target.closest('[data-field]');
    if (f) S.d.info[f.dataset.field] = f.value;
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-field]')) { S.d.info[t.dataset.field] = t.value; save(); }
    if (t.id === 'agree') { S.d.agreed = t.checked; var b = document.getElementById('confirm-btn'); if (b) b.disabled = !t.checked; save(); }
    if (t.name === 'pay') { S.d.payMethod = t.value; render(); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'info-form') { e.preventDefault(); A['info-next'](); }
    if (e.target.id === 'ai-form') {
      e.preventDefault();
      var inp = document.getElementById('ai-text');
      var text = inp && inp.value.trim();
      if (text && AI && !AI.busy) { inp.value = ''; AI.mode = 'text'; aiSend(text); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (AI) aiClose(false);
    else if ($sheet.innerHTML) A.close();
  });

  // Compte à rebours et suivi du paiement.
  var ticks = 0;
  setInterval(function () {
    ticks++;
    var b = S.d.booking;
    if (S.view !== 'booking' || S.step < 5 || !b) return;
    if (b.status === 'hold' || b.status === 'pending_payment') {
      var left = Date.parse(b.expiresAt) - now();
      var el = document.getElementById('hold-timer');
      if (el) el.textContent = F.countdown(left);
      if (left <= 0) { pollBooking(false); if (b.status === 'hold') handleExpired(); }
    }
    if (S.step === 7 && S.pay && S.pay.instructions && S.pay.instructions.kind !== 'demo' && ticks % 8 === 0) pollBooking(false);
  }, 1000);

  // ---------- Démarrage ----------
  function restore() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    S.view = 'home';
    if (!saved || !saved.d) return Promise.resolve();
    S.d = Object.assign(newDraft(), saved.d);
    S.month = saved.month || null;
    if (S.d.packageId && !pkg()) { S.d = newDraft(); return Promise.resolve(); }
    if (!S.d.id || !S.d.token) {
      if (saved.view === 'booking') { S.view = 'booking'; S.step = Math.min(saved.step || 1, S.d.date ? 4 : S.d.packageId ? 3 : S.d.mode ? 2 : 1); }
      return Promise.resolve();
    }
    return api('/bookings/' + S.d.id).then(function (r) {
      var b = r.booking;
      S.d.booking = b;
      if (b.status === 'confirmed' || b.status === 'quote') { S.view = saved.view === 'home' ? 'home' : 'success'; return; }
      if (b.status === 'pending_payment') { S.view = 'booking'; S.step = 7; return; }
      if (b.status === 'hold') { S.view = 'booking'; S.step = Math.max(5, Math.min(saved.step || 5, 6)); return; }
      S.d.id = null; S.d.token = null; S.d.booking = null; S.d.start = null;
      S.view = 'booking'; S.step = S.d.date ? 4 : 3;
    }).catch(function () { S.d.id = null; S.d.token = null; S.d.booking = null; });
  }

  function boot() {
    Promise.all([api('/config'), api('/packages')]).then(function (r) {
      S.cfg = r[0]; S.packages = r[1].packages;
      return restore();
    }).then(render).catch(function (e) {
      renderHeader();
      $app.innerHTML = '<div class="alert" style="margin-top:24px"><div class="alert-head">' + icon('alert', 18) + '<span>' + esc(e.message) + '</span></div><div><button class="btn btn-ghost btn-sm" data-a="hardreload">Réessayer</button></div></div>';
    });
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* hors ligne non disponible */ }); });
  }
  boot();
})();
