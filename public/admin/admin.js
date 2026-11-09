/* OCD LIVE — espace équipe. Toutes les règles (droits, chevauchements) sont vérifiées par le serveur. */
(function () {
  'use strict';

  var O = window.OCD, F = O.F, icon = O.icon, esc = O.esc;
  var $app = document.getElementById('app');
  var $header = document.getElementById('header');
  var $sheet = document.getElementById('sheet-root');

  var STATUS = {
    hold: ['Créneau retenu', 'warn'], pending_payment: ['En attente de paiement', 'warn'], quote: ['Devis à envoyer', 'info'],
    confirmed: ['Confirmée', 'ok'], cancelled: ['Annulée', 'bad'], expired: ['Expirée', 'muted'],
  };
  var PAY_STATUS = { pending: ['En attente', 'warn'], processing: ['En cours', 'warn'], succeeded: ['Réussi', 'ok'], failed: ['Échoué', 'bad'], refunded: ['Remboursé', 'info'], cancelled: ['Annulé', 'muted'] };
  var METHOD = { mobile_money_tg: 'Mobile Money Togo', mobile_money_other: 'Autre Mobile Money', card: 'Carte bancaire' };
  var MODE = { presentiel: 'Présentiel', distance: 'À distance' };
  var NOTE_ICON = { pending_payment: ['wallet', 'warn'], confirmed: ['check', 'ok'], quote: ['box', 'info'], quote_accepted: ['check', 'ok'], expired: ['clock', 'muted'], cancelled: ['ban', 'bad'], rescheduled: ['calendar', 'info'], late_payment: ['alert', 'bad'] };

  var TABS = [
    { id: 'dash', label: 'Tableau de bord', icon: 'grid', perm: 'dashboard' },
    { id: 'bookings', label: 'Réservations', icon: 'list', perm: 'bookings.read' },
    { id: 'packages', label: 'Packages', icon: 'box', perm: 'packages.write' },
    { id: 'resources', label: 'Assistantes et studio', icon: 'users', perm: 'resources.write' },
    { id: 'days', label: 'Jours bloqués', icon: 'ban', perm: 'days.write' },
    { id: 'customers', label: 'Clients', icon: 'users', perm: 'customers.read' },
    { id: 'payments', label: 'Paiements', icon: 'wallet', perm: 'payments.read' },
    { id: 'audit', label: 'Journal', icon: 'history', perm: 'audit.read' },
    { id: 'users', label: 'Utilisateurs', icon: 'lock', perm: 'users.manage' },
    { id: 'settings', label: 'Réglages', icon: 'sliders', perm: 'settings.write' },
  ];

  var S = { user: null, tab: O.store('ocdlive-admin-tab') || 'dash', data: {}, filters: { status: 'active', mode: '', q: '', from: '', to: '' }, unread: 0, resources: [], packages: [] };

  function api(path, opts) {
    var o = opts || {};
    return O.request('/admin' + path, { method: o.method, body: o.body, headers: { 'X-OCD-Admin': '1' } }).catch(function (e) {
      if (e.status === 401 && path !== '/login') { S.user = null; render(); }
      throw e;
    });
  }
  function can(perm) {
    if (!S.user) return false;
    var p = S.user.perms || [];
    return p.indexOf('*') >= 0 || p.indexOf(perm) >= 0;
  }
  function chip(map, key) { var s = map[key] || [key, 'muted']; return '<span class="chip tone-' + s[1] + '">' + esc(s[0]) + '</span>'; }

  // ---------- Rendu ----------
  function renderHeader() {
    $header.innerHTML = '<div class="topbar-in"><a class="brand" href="/admin/">' + O.wordmark(S.brand) + '<span class="muted small" style="font-weight:700">Espace équipe</span></a>' +
      '<div class="top-actions">' + (S.user ? '<span class="small muted" style="display:none" id="who">' + esc(S.user.name) + '</span>' : '') +
      '<button class="iconbtn" data-a="theme" aria-label="Changer de thème">' + icon(O.currentTheme() === 'dark' ? 'sun' : 'moon', 20) + '</button>' +
      (S.user ? '<button class="iconbtn" data-a="logout" aria-label="Se déconnecter" title="Se déconnecter">' + icon('logout', 20) + '</button>' : '') + '</div></div>';
  }

  function render() {
    renderHeader();
    if (!S.user) { $app.innerHTML = loginView(); return; }
    var tabs = TABS.filter(function (t) { return can(t.perm); });
    if (!tabs.some(function (t) { return t.id === S.tab; })) S.tab = tabs[0].id;
    var nav = '<nav class="tabs" aria-label="Menu">' + tabs.map(function (t) {
      return '<button class="tab' + (t.id === S.tab ? ' active' : '') + '" data-a="tab" data-tab="' + t.id + '">' + icon(t.icon, 16) + t.label + (t.id === 'dash' && S.unread ? '<span class="count">' + S.unread + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
    var head = '<div class="section-head" style="margin-bottom:10px"><h2>' + esc(tabs.find(function (t) { return t.id === S.tab; }).label) + '</h2><span class="small muted">' + esc(S.user.name) + ' · ' + esc(S.user.roleLabel) + '</span></div>';
    $app.innerHTML = nav + head + '<div id="view">' + (VIEWS[S.tab] ? VIEWS[S.tab]() : '') + '</div>';
  }

  function loginView() {
    return '<div class="login"><form class="glass form" id="login-form"><h2>Connexion</h2><p class="muted small">Espace réservé à l’équipe OCD.</p>' +
      '<div class="field"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="l-pass">Mot de passe</label><input id="l-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Se connecter</button><p class="err" id="l-err" role="alert"></p></form></div>';
  }

  function load(key, path, then) {
    if (S.data[key] !== undefined) return S.data[key];
    S.data[key] = null;
    api(path).then(function (r) { S.data[key] = r; if (then) then(r); render(); })
      .catch(function (e) { S.data[key] = { error: e.message }; render(); });
    return null;
  }
  var loading = '<div class="skeleton"></div>';
  function errorBox(r) { return '<div class="alert"><div class="alert-head">' + icon('alert', 18) + '<span>' + esc(r.error) + '</span></div></div>'; }
  function refresh(keys) { (keys || Object.keys(S.data)).forEach(function (k) { delete S.data[k]; }); render(); }

  var VIEWS = {};

  VIEWS.dash = function () {
    var d = load('dash', '/dashboard', function (r) { S.unread = r.kpis.unread; });
    var n = load('notes', '/notifications?size=40');
    if (!d || !n) return loading;
    if (d.error) return errorBox(d);
    var k = d.kpis;
    var kpi = function (v, l) { return '<div class="glass kpi"><b>' + v + '</b><span>' + l + '</span></div>'; };
    var html = '<div class="kpis">' + kpi(k.confirmed, 'Réservations confirmées') + kpi(F.price(k.revenue), 'Encaissé') +
      kpi(k.waiting, 'En attente (paiement ou devis)') + kpi(k.next7, 'Lives dans les 7 jours') + '</div>';
    if (k.holds) html += '<p class="note">' + icon('clock', 16) + '<span>' + k.holds + ' client(s) en train de réserver en ce moment.</span></p>';
    html += '<div class="section-head"><h3>Notifications</h3>' + (k.unread ? '<button class="linkbtn" data-a="read-all">Tout marquer comme lu</button>' : '') + '</div>';
    if (n.error) return html + errorBox(n);
    html += '<div class="stack">' + (n.notifications.length ? n.notifications.map(function (x) {
      var ic = NOTE_ICON[x.kind] || ['bell', 'info'];
      return '<article class="glass notif' + (x.read_at ? '' : ' unread') + '"><span class="notif-icon tone-' + ic[1] + '">' + icon(ic[0], 18) + '</span>' +
        '<div><b>' + esc(x.title) + '</b><p>' + esc(x.body) + '</p><small>' + F.stamp(Date.parse(x.created_at)) + '</small></div></article>';
    }).join('') : '<div class="glass empty">Aucune notification pour le moment.</div>') + '</div>';
    return html;
  };

  VIEWS.bookings = function () {
    var f = S.filters;
    var qs = '?status=' + f.status + (f.mode ? '&mode=' + f.mode : '') + (f.q ? '&q=' + encodeURIComponent(f.q) : '') + (f.from ? '&from=' + f.from : '') + (f.to ? '&to=' + f.to : '') + '&size=100';
    var key = 'bookings' + qs;
    loadResources();
    var r = load(key, '/bookings' + qs);
    var filters = '<form class="filters" id="filters">' +
      '<select name="status" aria-label="Statut"><option value="active">Actives</option><option value="confirmed">Confirmées</option><option value="waiting">En attente</option><option value="closed">Annulées ou expirées</option><option value="all">Toutes</option></select>' +
      '<select name="mode" aria-label="Mode"><option value="">Tous les modes</option><option value="presentiel">Présentiel</option><option value="distance">À distance</option></select>' +
      '<input type="date" name="from" aria-label="Du" value="' + esc(f.from) + '"><input type="date" name="to" aria-label="Au" value="' + esc(f.to) + '">' +
      '<input type="search" name="q" placeholder="Nom, entreprise, téléphone, référence" value="' + esc(f.q) + '"><button class="btn btn-ghost btn-sm" type="submit">Filtrer</button></form>';
    filters = filters.replace('value="' + f.status + '"', 'value="' + f.status + '" selected').replace('value="' + f.mode + '">' + (MODE[f.mode] || ''), 'value="' + f.mode + '" selected>' + (MODE[f.mode] || ''));
    if (!r) return filters + loading;
    if (r.error) return filters + errorBox(r);
    if (!r.bookings.length) return filters + '<div class="glass empty">Aucune réservation pour ces critères.</div>';
    var byDay = {};
    r.bookings.forEach(function (b) { var k = b.start.slice(0, 10); (byDay[k] = byDay[k] || []).push(b); });
    return filters + Object.keys(byDay).map(function (day) {
      return '<div class="section-head" style="margin-top:14px"><h3>' + esc(F.cap(F.dayYear(Date.parse(day)))) + '</h3><span class="small muted">' + byDay[day].length + ' live(s)</span></div><div class="stack">' + byDay[day].map(bookingCard).join('') + '</div>';
    }).join('');
  };

  function bookingCard(b) {
    var c = b.contact || {};
    var s = Date.parse(b.start), e = Date.parse(b.end);
    var where = b.mode === 'presentiel' ? 'Studio OCD de Lomé' : 'À distance depuis ' + esc(c.city) + ' (' + esc(c.country) + ') · ' + esc(b.resourceName);
    var actions = [];
    if (b.status === 'quote' && can('bookings.write')) actions.push('<button class="btn btn-primary btn-sm" data-a="confirm" data-id="' + b.id + '">Accepter la demande</button>');
    if ((b.status === 'pending_payment' || b.status === 'expired') && b.ref && can('payments.write')) actions.push('<button class="btn btn-primary btn-sm" data-a="confirm" data-id="' + b.id + '">Paiement reçu</button>');
    if (['pending_payment', 'quote', 'confirmed'].indexOf(b.status) >= 0 && can('bookings.write')) {
      actions.push('<button class="btn btn-ghost btn-sm" data-a="reschedule" data-id="' + b.id + '">Reporter</button>');
      if (b.mode === 'distance') actions.push('<button class="btn btn-ghost btn-sm" data-a="assign" data-id="' + b.id + '">Assistante</button>');
      actions.push('<button class="btn btn-danger btn-sm" data-a="cancel" data-id="' + b.id + '">Annuler</button>');
    }
    S.data['b:' + b.id] = b;
    return '<article class="glass res"><div class="res-top"><span class="res-who">' + esc(c.name) + ' · ' + esc(c.company) + '</span><span class="row">' + (b.source === 'voice' ? '<span class="chip tone-info">' + icon('mic', 12) + 'Via la réceptionniste IA</span>' : '') + chip(STATUS, b.status) + '</span></div>' +
      '<div class="res-line">' + icon('clock', 15) + '<span><b>' + F.time(s) + ' – ' + F.time(e) + '</b> · ' + esc(b.packageName) + (b.sessions > 1 ? ' (' + b.sessions + ' lives)' : '') + ' · ' + F.price(b.price) + (b.paymentStatus ? ' · paiement ' + esc((PAY_STATUS[b.paymentStatus] || [b.paymentStatus])[0].toLowerCase()) : '') + '</span></div>' +
      '<div class="res-line">' + icon(b.mode === 'presentiel' ? 'studio' : 'globe', 15) + '<span>' + where + '</span></div>' +
      '<div class="res-line">' + icon('box', 15) + '<span>' + esc(c.sector) + ' — ' + esc(c.products) + '</span></div>' +
      '<div class="res-line">' + icon('phone', 15) + '<span>' + esc(c.phone) + (c.email ? ' · ' + esc(c.email) : '') + ' · <span class="muted">' + esc(b.ref) + '</span></span></div>' +
      (b.cancelReason ? '<div class="res-line">' + icon('alert', 15) + '<span>Motif : ' + esc(b.cancelReason) + '</span></div>' : '') +
      (actions.length ? '<div class="res-actions">' + actions.join('') + '</div>' : '') + '</article>';
  }

  function loadResources() {
    if (S.data.res === undefined) load('res', '/resources', function (r) { S.resources = r.resources; });
  }

  VIEWS.packages = function () {
    var r = load('pkgs', '/packages', function (x) { S.packages = x.packages; });
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return '<p class="muted">Un package désactivé n’est plus proposé aux nouveaux clients, mais reste visible dans les anciennes réservations.</p>' +
      '<div class="row" style="margin:12px 0"><button class="btn btn-ghost btn-sm" data-a="pkg-new">' + icon('plus', 16) + 'Nouveau package</button></div>' +
      '<div class="stack">' + r.packages.map(function (p) {
        var prices = p.is_quote ? 'Sur devis' : p.modes.map(function (m) { return MODE[m] + ' : ' + F.price(m === 'presentiel' ? p.price_presentiel : p.price_distance); }).join(' · ');
        return '<article class="glass res' + (p.active ? '' : '" style="opacity:.6') + '"><div class="res-top"><span class="res-who">' + esc(p.name) + '</span>' +
          (p.active ? '<span class="chip tone-ok">Actif</span>' : '<span class="chip">Désactivé</span>') + '</div>' +
          '<div class="res-line">' + icon('clock', 15) + '<span>' + (p.sessions > 1 ? p.sessions + ' lives de ' : '') + F.duration(p.duration_min) + ' · ' + p.modes.map(function (m) { return MODE[m]; }).join(' / ') + '</span></div>' +
          '<div class="res-line">' + icon('wallet', 15) + '<span>' + prices + (p.promo_percent ? ' · promo -' + p.promo_percent + ' % du ' + esc(String(p.promo_from).slice(0, 10)) + ' au ' + esc(String(p.promo_to).slice(0, 10)) : '') + '</span></div>' +
          '<div class="res-actions"><button class="btn btn-ghost btn-sm" data-a="pkg-edit" data-id="' + esc(p.id) + '">' + icon('edit', 16) + 'Modifier</button>' +
          '<button class="btn btn-ghost btn-sm" data-a="pkg-toggle" data-id="' + esc(p.id) + '">' + (p.active ? 'Désactiver' : 'Activer') + '</button></div></article>';
      }).join('') + '</div>';
  };

  VIEWS.resources = function () {
    var r = load('res', '/resources', function (x) { S.resources = x.resources; });
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return '<p class="muted">Chaque assistante active permet un live à distance de plus au même moment. Deux clients ne sont jamais affectés à la même assistante en même temps.</p>' +
      '<form class="filters" id="res-form" style="margin-top:12px"><input name="name" placeholder="Nom de la nouvelle assistante" required><button class="btn btn-ghost btn-sm" type="submit">' + icon('plus', 16) + 'Ajouter</button></form>' +
      '<div class="glass table-wrap"><table class="table"><thead><tr><th>Ressource</th><th>Type</th><th>Statut</th><th></th></tr></thead><tbody>' + r.resources.map(function (x) {
        return '<tr><td><b>' + esc(x.name) + '</b></td><td>' + (x.kind === 'studio' ? 'Studio' : 'Assistante') + '</td><td>' + (x.active ? '<span class="chip tone-ok">Active</span>' : '<span class="chip">Inactive</span>') + '</td>' +
          '<td><button class="linkbtn" data-a="res-rename" data-id="' + esc(x.id) + '">Renommer</button> · <button class="linkbtn" data-a="res-toggle" data-id="' + esc(x.id) + '">' + (x.active ? 'Désactiver' : 'Activer') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  VIEWS.days = function () {
    var r = load('days', '/blocked-days');
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return '<p class="muted">Un jour bloqué n’est plus proposé aux clients. Les réservations déjà faites ce jour-là restent à traiter (report ou annulation).</p>' +
      '<form class="filters" id="day-form" style="margin-top:12px"><input type="date" name="day" required><input name="reason" placeholder="Motif (facultatif)"><button class="btn btn-ghost btn-sm" type="submit">Bloquer ce jour</button></form>' +
      (r.days.length ? '<div class="stack">' + r.days.map(function (d) {
        return '<div class="glass res"><div class="res-top"><b>' + esc(F.cap(F.dayYear(Date.parse(d.day)))) + '</b><button class="linkbtn" data-a="unblock" data-day="' + d.day + '">Débloquer</button></div>' + (d.reason ? '<span class="muted small">' + esc(d.reason) + '</span>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="glass empty">Aucun jour bloqué.</div>');
  };

  function table(cols, rows) {
    return '<div class="glass table-wrap"><table class="table"><thead><tr>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.join('') : '<tr><td colspan="' + cols.length + '" class="muted">Rien pour le moment.</td></tr>') + '</tbody></table></div>';
  }

  VIEWS.customers = function () {
    var r = load('customers', '/customers?size=100');
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return table(['Client', 'Entreprise', 'Business', 'Lieu', 'Contact', 'Lives'], r.customers.map(function (c) {
      return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.company) + '</td><td>' + esc(c.sector) + '</td><td>' + esc(c.city) + ', ' + esc(c.country) + '</td><td>' + esc(c.phone) + (c.email ? '<br><span class="muted">' + esc(c.email) + '</span>' : '') + '</td><td>' + c.lives + '</td></tr>';
    }));
  };

  VIEWS.payments = function () {
    var r = load('payments', '/payments?size=100');
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return table(['Date', 'Réservation', 'Client', 'Moyen', 'Montant', 'Statut'], r.payments.map(function (p) {
      return '<tr><td>' + F.stamp(Date.parse(p.created_at)) + '</td><td>' + esc(p.ref) + '<br><span class="muted">' + esc(p.package_name) + '</span></td><td>' + esc(p.customer) + '<br><span class="muted">' + esc(p.company) + '</span></td>' +
        '<td>' + esc(METHOD[p.method] || p.method || '') + '<br><span class="muted">' + esc(p.provider) + '</span></td><td><b>' + F.price(p.amount) + '</b></td><td>' + chip(PAY_STATUS, p.status) + '</td></tr>';
    }));
  };

  VIEWS.audit = function () {
    var r = load('audit', '/audit?size=100');
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return table(['Date', 'Qui', 'Action', 'Détails'], r.entries.map(function (x) {
      var details = x.details ? JSON.stringify(x.details) : '';
      return '<tr><td>' + F.stamp(Date.parse(x.created_at)) + '</td><td>' + esc(x.actor_email || '') + '</td><td><b>' + esc(x.action) + '</b><br><span class="muted">' + esc(x.entity) + ' ' + esc(x.entity_id || '') + '</span></td><td class="small muted" style="max-width:420px;word-break:break-word">' + esc(details.slice(0, 400)) + '</td></tr>';
    }));
  };

  VIEWS.users = function () {
    var r = load('users', '/users');
    loadResources();
    if (!r) return loading;
    if (r.error) return errorBox(r);
    return '<div class="row" style="margin-bottom:12px"><button class="btn btn-ghost btn-sm" data-a="user-new">' + icon('plus', 16) + 'Nouvel utilisateur</button></div>' +
      table(['Nom', 'Email', 'Rôle', 'Statut', 'Dernière connexion', ''], r.users.map(function (u) {
        return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.email) + '</td><td>' + esc(r.roles[u.role]) + '</td><td>' + (u.active ? '<span class="chip tone-ok">Actif</span>' : '<span class="chip">Désactivé</span>') + '</td>' +
          '<td>' + (u.last_login_at ? F.stamp(Date.parse(u.last_login_at)) : '—') + '</td><td><button class="linkbtn" data-a="user-edit" data-id="' + u.id + '">Modifier</button></td></tr>';
      }));
  };

  VIEWS.settings = function () {
    var r = load('settings', '/settings');
    if (!r) return loading;
    if (r.error) return errorBox(r);
    var s = r.settings;
    var num = function (form, k, label, v, min, max, hint) {
      return '<div class="field"><label for="' + form + '-' + k + '">' + label + '</label><input id="' + form + '-' + k + '" name="' + k + '" type="number" min="' + min + '" max="' + max + '" value="' + v + '" required>' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
    };
    var txt = function (form, k, label, v, ph, hint) {
      return '<div class="field"><label for="' + form + '-' + k + '">' + label + '</label><input id="' + form + '-' + k + '" name="' + k + '" value="' + esc(v || '') + '" placeholder="' + esc(ph || '') + '">' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
    };
    var contact = s.contact || {}, pay = s.payment || {};
    return '<div class="stack">' +
      '<form class="glass form" id="set-payment" data-key="payment"><h3>Paiement Mobile Money</h3><div class="grid2">' +
      txt('pm', 'mobileMoneyNumber', 'Numéro Mobile Money affiché aux clients', pay.mobileMoneyNumber, '+228 90 00 00 00', 'Vide : l’équipe contacte le client pour le paiement.') +
      txt('pm', 'mobileMoneyName', 'Nom du bénéficiaire', pay.mobileMoneyName, 'OCD') +
      '</div><button class="btn btn-primary" type="submit">Enregistrer</button></form>' +
      '<form class="glass form" id="set-contact" data-key="contact"><h3>Contact de l’équipe</h3><div class="grid2">' +
      txt('ct', 'whatsapp', 'WhatsApp de l’équipe', contact.whatsapp, '+228 90 00 00 00', 'Proposé quand un client demande à parler à quelqu’un.') +
      txt('ct', 'teamEmails', 'Emails qui reçoivent les notifications', (contact.teamEmails || []).join(', '), 'equipe@exemple.com, bovann@exemple.com', 'Séparés par des virgules.') +
      '</div><button class="btn btn-primary" type="submit">Enregistrer</button></form>' +
      '<form class="glass form" id="set-studio" data-key="studio"><h3>Horaires du studio (heure de Lomé)</h3><div class="grid2">' +
      num('st', 'openHour', 'Ouverture (heure)', s.studio.openHour, 0, 23) + num('st', 'closeHour', 'Fermeture (heure)', s.studio.closeHour, 1, 24) +
      num('st', 'stepMin', 'Intervalle entre deux horaires proposés (min)', s.studio.stepMin, 15, 120) + num('st', 'bufferMin', 'Marge de préparation entre deux lives (min)', s.studio.bufferMin, 0, 180) +
      '</div><button class="btn btn-primary" type="submit">Enregistrer</button></form>' +
      '<form class="glass form" id="set-booking" data-key="booking"><h3>Réservations</h3><div class="grid2">' +
      num('bk', 'holdMin', 'Durée de retenue d’un créneau (min)', s.booking.holdMin, 2, 30, 'Le temps laissé au client pour finaliser.') +
      num('bk', 'paymentTimeoutMin', 'Délai de paiement (min)', s.booking.paymentTimeoutMin, 5, 2880, 'Passé ce délai, le créneau est libéré.') +
      num('bk', 'leadMin', 'Délai minimum avant un live (min)', s.booking.leadMin, 0, 2880) + num('bk', 'horizonDays', 'Réservable jusqu’à (jours)', s.booking.horizonDays, 7, 365) +
      '<div class="field"><label for="bk-launch">Date d’ouverture des lives</label><input id="bk-launch" name="launchDate" type="date" value="' + esc(s.booking.launchDate) + '" required></div>' +
      '</div><button class="btn btn-primary" type="submit">Enregistrer</button></form>' +
      '<form class="glass form" id="set-voice" data-key="voice"><h3>Réceptionniste IA</h3><label class="check"><input type="checkbox" name="enabled"' + (s.voice.enabled ? ' checked' : '') + '><span>Proposer la réceptionniste IA sur le site (nécessite la clé ANTHROPIC_API_KEY sur Railway)</span></label>' +
      '<button class="btn btn-primary" type="submit">Enregistrer</button></form></div>';
  };

  // ---------- Fenêtres ----------
  function sheet(title, body) {
    $sheet.innerHTML = '<div class="sheet-backdrop" data-a="backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-head"><h2>' + esc(title) + '</h2><button class="iconbtn" data-a="close" aria-label="Fermer">' + icon('x', 20) + '</button></div>' + body + '</div></div>';
    var f = $sheet.querySelector('input, select, textarea');
    if (f) f.focus();
  }
  function closeSheet() { $sheet.innerHTML = ''; }

  function act(promise, okMsg, keys) {
    return promise.then(function () { closeSheet(); O.toast(okMsg, 'ok'); refresh(keys); })
      .catch(function (e) { O.toast(e.message, 'bad'); var el = document.getElementById('sheet-err'); if (el) el.textContent = e.message; });
  }

  function packageForm(p) {
    var v = p || { modes: ['presentiel'], duration_min: 90, sessions: 1, perks: [], active: true };
    var has = function (m) { return v.modes.indexOf(m) >= 0 ? ' checked' : ''; };
    return '<form class="stack" id="pkg-form" data-id="' + esc(p ? p.id : '') + '">' +
      '<div class="field"><label>Nom</label><input name="name" value="' + esc(v.name || '') + '" required maxlength="60"></div>' +
      '<div class="field"><label>Accroche</label><input name="tagline" value="' + esc(v.tagline || '') + '" maxlength="120"></div>' +
      '<div class="row"><label class="check"><input type="checkbox" name="m_presentiel"' + has('presentiel') + '>Présentiel</label><label class="check"><input type="checkbox" name="m_distance"' + has('distance') + '>À distance</label><label class="check"><input type="checkbox" name="is_quote"' + (v.is_quote ? ' checked' : '') + '>Sur devis</label></div>' +
      '<div class="grid2"><div class="field"><label>Durée d’un live (min)</label><input type="number" name="duration_min" min="30" max="720" step="15" value="' + v.duration_min + '" required></div>' +
      '<div class="field"><label>Nombre de lives</label><input type="number" name="sessions" min="1" max="31" value="' + v.sessions + '" required></div>' +
      '<div class="field"><label>Prix présentiel (FCFA)</label><input type="number" name="price_presentiel" min="0" step="500" value="' + (v.price_presentiel == null ? '' : v.price_presentiel) + '" placeholder="vide = sans"></div>' +
      '<div class="field"><label>Prix à distance (FCFA)</label><input type="number" name="price_distance" min="0" step="500" value="' + (v.price_distance == null ? '' : v.price_distance) + '" placeholder="vide = sans"></div></div>' +
      '<div class="field"><label>Avantages (un par ligne)</label><textarea name="perks" rows="4">' + esc((v.perks || []).join('\n')) + '</textarea></div>' +
      '<div class="field"><label>Conditions</label><textarea name="conditions" rows="2">' + esc(v.conditions || '') + '</textarea></div>' +
      '<div class="grid2"><div class="field"><label>Badge</label><input name="badge" value="' + esc(v.badge || '') + '" maxlength="40"></div>' +
      '<div class="field"><label>Ordre d’affichage</label><input type="number" name="sort" min="0" max="1000" value="' + (v.sort || 0) + '"></div></div>' +
      '<h3>Période promotionnelle</h3><div class="grid2"><div class="field"><label>Réduction (%)</label><input type="number" name="promo_percent" min="1" max="90" value="' + (v.promo_percent || '') + '"></div>' +
      '<div class="field"><label>Libellé</label><input name="promo_label" value="' + esc(v.promo_label || '') + '" maxlength="60"></div>' +
      '<div class="field"><label>Du</label><input type="date" name="promo_from" value="' + esc(v.promo_from ? String(v.promo_from).slice(0, 10) : '') + '"></div>' +
      '<div class="field"><label>Au</label><input type="date" name="promo_to" value="' + esc(v.promo_to ? String(v.promo_to).slice(0, 10) : '') + '"></div></div>' +
      '<p class="err" id="sheet-err"></p><button class="btn btn-primary btn-block" type="submit">Enregistrer</button></form>';
  }

  function readPackageForm(f) {
    var g = function (n) { return f.elements[n]; };
    var numOrNull = function (n) { return g(n).value === '' ? null : Number(g(n).value); };
    var modes = [];
    if (g('m_presentiel').checked) modes.push('presentiel');
    if (g('m_distance').checked) modes.push('distance');
    return {
      name: g('name').value, tagline: g('tagline').value, modes: modes, is_quote: g('is_quote').checked,
      duration_min: Number(g('duration_min').value), sessions: Number(g('sessions').value),
      price_presentiel: modes.indexOf('presentiel') >= 0 ? numOrNull('price_presentiel') : null,
      price_distance: modes.indexOf('distance') >= 0 ? numOrNull('price_distance') : null,
      perks: g('perks').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean),
      conditions: g('conditions').value, badge: g('badge').value, sort: Number(g('sort').value || 0),
      promo_percent: numOrNull('promo_percent'), promo_label: g('promo_label').value || null,
      promo_from: g('promo_from').value || null, promo_to: g('promo_to').value || null,
    };
  }

  function userForm(u) {
    var roles = (S.data.users && S.data.users.roles) || {};
    var assistants = S.resources.filter(function (r) { return r.kind === 'assistant'; });
    return '<form class="stack" id="user-form" data-id="' + (u ? u.id : '') + '">' +
      (u ? '<p class="muted">' + esc(u.name) + ' · ' + esc(u.email) + '</p>' :
        '<div class="field"><label>Nom</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div>') +
      '<div class="field"><label>Rôle</label><select name="role">' + Object.keys(roles).map(function (k) { return '<option value="' + k + '"' + (u && u.role === k ? ' selected' : '') + '>' + esc(roles[k]) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Assistante liée (pour le rôle Assistante)</label><select name="resourceId"><option value="">Aucune</option>' + assistants.map(function (r) { return '<option value="' + esc(r.id) + '"' + (u && u.resource_id === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>' + (u ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe') + '</label><input name="password" type="password" minlength="10" autocomplete="new-password"' + (u ? '' : ' required') + '><span class="hint">10 caractères minimum.</span></div>' +
      (u ? '<label class="check"><input type="checkbox" name="active"' + (u.active ? ' checked' : '') + '>Compte actif</label>' : '') +
      '<p class="err" id="sheet-err"></p><button class="btn btn-primary btn-block" type="submit">Enregistrer</button></form>';
  }

  // ---------- Actions ----------
  var A = {
    theme: function () { O.toggleTheme(); renderHeader(); },
    logout: function () { api('/logout', { method: 'POST' }).catch(function () {}).then(function () { S.user = null; S.data = {}; render(); }); },
    tab: function (el) { S.tab = el.dataset.tab; O.store('ocdlive-admin-tab', S.tab); refresh(); window.scrollTo(0, 0); },
    close: closeSheet,
    'read-all': function () { act(api('/notifications/read', { method: 'POST', body: {} }), 'Notifications lues.', ['dash', 'notes']); },
    confirm: function (el) {
      var b = S.data['b:' + el.dataset.id];
      var msg = b.status === 'quote' ? 'Accepter la demande ' + b.ref + ' ?' : 'Confirmer la réception du paiement de ' + F.price(b.price) + ' pour ' + b.ref + ' ?';
      if (!window.confirm(msg)) return;
      act(api('/bookings/' + b.id + '/confirm', { method: 'POST' }), 'Réservation confirmée.');
    },
    cancel: function (el) {
      var b = S.data['b:' + el.dataset.id];
      sheet('Annuler ' + b.ref, '<form class="stack" id="cancel-form" data-id="' + b.id + '"><p class="muted">' + esc(b.contact.name) + ' · ' + esc(F.day(Date.parse(b.start))) + ' à ' + F.time(Date.parse(b.start)) + '. Le créneau sera libéré et le client prévenu par email s’il en a donné un.</p>' +
        '<div class="field"><label>Motif</label><input name="reason" maxlength="200" placeholder="Ex. : demande du client"></div><p class="err" id="sheet-err"></p><button class="btn btn-danger btn-block" type="submit">Annuler la réservation</button></form>');
    },
    reschedule: function (el) {
      var b = S.data['b:' + el.dataset.id];
      sheet('Reporter ' + b.ref, '<form class="stack" id="resched-form" data-id="' + b.id + '"><p class="muted">' + esc(b.packageName) + ' · ' + F.duration(b.durationMin) + ' · actuellement le ' + esc(F.day(Date.parse(b.start))) + ' à ' + F.time(Date.parse(b.start)) + '.</p>' +
        '<div class="field"><label>Nouvelle date</label><input type="date" name="date" required value="' + b.start.slice(0, 10) + '"></div><div id="resched-slots"></div><p class="err" id="sheet-err"></p>' +
        '<button class="btn btn-primary btn-block" type="submit">Reporter</button></form>');
      loadSlots(b, b.start.slice(0, 10));
    },
    assign: function (el) {
      var b = S.data['b:' + el.dataset.id];
      var opts = S.resources.filter(function (r) { return r.kind === 'assistant' && r.active; });
      sheet('Assistante pour ' + b.ref, '<form class="stack" id="assign-form" data-id="' + b.id + '"><div class="field"><label>Assistante</label><select name="resourceId">' + opts.map(function (r) {
        return '<option value="' + esc(r.id) + '"' + (r.id === b.resourceId ? ' selected' : '') + '>' + esc(r.name) + '</option>';
      }).join('') + '</select></div><p class="err" id="sheet-err"></p><button class="btn btn-primary btn-block" type="submit">Affecter</button></form>');
    },
    'pkg-new': function () { sheet('Nouveau package', packageForm(null)); },
    'pkg-edit': function (el) { sheet('Modifier le package', packageForm(S.packages.find(function (p) { return p.id === el.dataset.id; }))); },
    'pkg-toggle': function (el) {
      var p = S.packages.find(function (x) { return x.id === el.dataset.id; });
      act(api('/packages/' + p.id, { method: 'PATCH', body: { active: !p.active } }), p.active ? 'Package désactivé.' : 'Package activé.', ['pkgs']);
    },
    'res-rename': function (el) {
      var r = S.resources.find(function (x) { return x.id === el.dataset.id; });
      var name = window.prompt('Nouveau nom', r.name);
      if (name) act(api('/resources/' + r.id, { method: 'PATCH', body: { name: name } }), 'Nom mis à jour.', ['res']);
    },
    'res-toggle': function (el) {
      var r = S.resources.find(function (x) { return x.id === el.dataset.id; });
      act(api('/resources/' + r.id, { method: 'PATCH', body: { active: !r.active } }), 'Ressource mise à jour.', ['res']);
    },
    unblock: function (el) { act(api('/blocked-days/' + el.dataset.day, { method: 'DELETE' }), 'Jour débloqué.', ['days']); },
    'user-new': function () { sheet('Nouvel utilisateur', userForm(null)); },
    'user-edit': function (el) { sheet('Modifier l’utilisateur', userForm(S.data.users.users.find(function (u) { return u.id === el.dataset.id; }))); },
    'pick-slot': function (el) {
      document.querySelectorAll('#resched-slots .slot').forEach(function (s) { s.classList.remove('is-selected'); });
      el.classList.add('is-selected');
      document.getElementById('resched-form').dataset.start = el.dataset.start;
    },
  };

  function loadSlots(b, date) {
    var box = document.getElementById('resched-slots');
    if (!box) return;
    box.innerHTML = '<div class="skeleton" style="min-height:80px"></div>';
    api('/availability/day?mode=' + b.mode + '&package=' + encodeURIComponent(b.packageId) + '&date=' + date + '&booking=' + b.id).then(function (r) {
      var free = r.slots.filter(function (s) { return s.state === 'free'; });
      box.innerHTML = free.length ? '<div class="slots">' + free.map(function (s) {
        return '<button type="button" class="slot" data-a="pick-slot" data-start="' + s.start + '"><b>' + F.time(Date.parse(s.start)) + ' – ' + F.time(Date.parse(s.end)) + '</b><small>Libre</small></button>';
      }).join('') + '</div>' : '<p class="muted">Aucun horaire libre ce jour-là.</p>';
    }).catch(function (e) { box.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  // ---------- Événements ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el) return;
    if (el.dataset.a === 'backdrop') { if (e.target === el) closeSheet(); return; }
    var fn = A[el.dataset.a];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $sheet.innerHTML) closeSheet(); });
  document.addEventListener('change', function (e) {
    if (e.target.name === 'date' && e.target.closest('#resched-form')) {
      var f = e.target.closest('#resched-form');
      delete f.dataset.start;
      loadSlots(S.data['b:' + f.dataset.id], e.target.value);
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    e.preventDefault();
    if (f.id === 'login-form') {
      var err = document.getElementById('l-err');
      err.textContent = '';
      api('/login', { method: 'POST', body: { email: f.elements[0].value, password: f.elements[1].value } })
        .then(function (r) { S.user = r.user; S.data = {}; render(); startPolling(); })
        .catch(function (x) { err.textContent = x.message; });
    } else if (f.id === 'filters') {
      S.filters = { status: f.elements.status.value, mode: f.elements.mode.value, from: f.elements.from.value, to: f.elements.to.value, q: f.elements.q.value.trim() };
      render();
    } else if (f.id === 'cancel-form') {
      act(api('/bookings/' + f.dataset.id + '/cancel', { method: 'POST', body: { reason: f.elements.reason.value } }), 'Réservation annulée.');
    } else if (f.id === 'resched-form') {
      if (!f.dataset.start) { document.getElementById('sheet-err').textContent = 'Choisissez un horaire libre.'; return; }
      act(api('/bookings/' + f.dataset.id + '/reschedule', { method: 'POST', body: { start: f.dataset.start } }), 'Réservation reportée.');
    } else if (f.id === 'assign-form') {
      act(api('/bookings/' + f.dataset.id + '/assign', { method: 'POST', body: { resourceId: f.elements.resourceId.value } }), 'Assistante affectée.');
    } else if (f.id === 'pkg-form') {
      var body = readPackageForm(f);
      var id = f.dataset.id;
      act(id ? api('/packages/' + id, { method: 'PATCH', body: body }) : api('/packages', { method: 'POST', body: body }), 'Package enregistré.', ['pkgs']);
    } else if (f.id === 'res-form') {
      act(api('/resources', { method: 'POST', body: { kind: 'assistant', name: f.elements.name.value } }), 'Assistante ajoutée.', ['res']);
    } else if (f.id === 'day-form') {
      api('/blocked-days', { method: 'POST', body: { day: f.elements.day.value, reason: f.elements.reason.value } }).then(function (r) {
        O.toast(r.existingBookings ? 'Jour bloqué. Attention : ' + r.existingBookings + ' réservation(s) déjà prévue(s) ce jour-là.' : 'Jour bloqué.', r.existingBookings ? 'warn' : 'ok');
        refresh(['days']);
      }).catch(function (x) { O.toast(x.message, 'bad'); });
    } else if (f.id === 'user-form') {
      var el = f.elements;
      var data = { role: el.role.value, resourceId: el.resourceId.value || null };
      if (el.password.value) data.password = el.password.value;
      if (f.dataset.id) { data.active = el.active.checked; act(api('/users/' + f.dataset.id, { method: 'PATCH', body: data }), 'Utilisateur mis à jour.', ['users']); }
      else { data.name = el.name.value; data.email = el.email.value; act(api('/users', { method: 'POST', body: data }), 'Utilisateur créé.', ['users']); }
    } else if (f.dataset.key) {
      var payload = {};
      Array.prototype.forEach.call(f.elements, function (x) {
        if (!x.name) return;
        payload[x.name] = x.type === 'checkbox' ? x.checked : x.type === 'number' ? Number(x.value) : x.value;
      });
      act(api('/settings/' + f.dataset.key, { method: 'PUT', body: payload }), 'Réglages enregistrés.', ['settings']);
    }
  });

  // Nouvelles notifications : vérification toutes les 30 secondes.
  var polling = null;
  function startPolling() {
    if (polling || !can('dashboard')) return;
    polling = setInterval(function () {
      if (!S.user || document.hidden) return;
      api('/dashboard').then(function (r) {
        if (r.kpis.unread > S.unread) {
          O.toast('Nouvelle notification : ' + (r.kpis.unread - S.unread) + ' de plus.', 'info');
          S.unread = r.kpis.unread;
          if (S.tab === 'dash') refresh(['dash', 'notes']); else render();
        }
      }).catch(function () { /* réessai au prochain passage */ });
    }, 30000);
  }

  O.request('/config').then(function (c) { S.brand = c.brand; renderHeader(); }).catch(function () { /* logo par défaut */ });
  api('/me').then(function (r) { S.user = r.user; render(); startPolling(); }).catch(function () { S.user = null; render(); });
})();
