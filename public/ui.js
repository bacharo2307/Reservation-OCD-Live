/* OCD LIVE — utilitaires partagés (application client et espace équipe). */
(function () {
  'use strict';

  var TZ = 'Africa/Lome';

  var ICONS = {
    studio: '<path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };

  function icon(name, size) {
    var s = size || 20;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var fmtCache = {};
  function fmt(ms, opts, tz) {
    var key = (tz || TZ) + JSON.stringify(opts);
    if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: tz || TZ }, opts));
    return fmtCache[key].format(new Date(ms));
  }
  var first = function (s) { return s.replace(/(^|\s)1(\s)/, '$11er$2'); };
  var cap = function (s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  var F = {
    time: function (ms, tz) { return fmt(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz).replace(':', 'h').replace(/^0/, ''); },
    day: function (ms) { return first(fmt(ms, { weekday: 'long', day: 'numeric', month: 'long' })); },
    dayYear: function (ms) { return first(fmt(ms, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })); },
    dayShort: function (ms) { return first(fmt(ms, { weekday: 'short', day: 'numeric', month: 'short' })); },
    month: function (ms) { return cap(fmt(ms, { month: 'long', year: 'numeric' })); },
    stamp: function (ms) { return fmt(ms, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); },
    price: function (n) { return n == null ? 'Sur devis' : new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ') + ' FCFA'; },
    number: function (n) { return new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' '); },
    duration: function (min) { var h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? String(m).padStart(2, '0') : ''); },
    countdown: function (ms) { var s = Math.max(0, Math.floor(ms / 1000)); var h = Math.floor(s / 3600); var m = Math.floor((s % 3600) / 60); var r = String(s % 60).padStart(2, '0'); return h ? h + 'h' + String(m).padStart(2, '0') : m + ':' + r; },
    cap: cap,
  };

  var browserTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return TZ; } })();

  // Appels API : JSON, erreurs lisibles, en-têtes supplémentaires.
  function request(path, opts) {
    var o = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
    return fetch('/api' + path, { method: o.method || 'GET', headers: headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), credentials: 'same-origin' })
      .catch(function () {
        var e = new Error('Connexion impossible. Vérifiez votre connexion Internet et réessayez.');
        e.network = true;
        throw e;
      })
      .then(function (res) {
        return res.text().then(function (t) {
          var data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
          if (!res.ok) {
            var err = new Error((data && data.error && data.error.message) || 'Une erreur est survenue.');
            err.status = res.status;
            err.code = data && data.error && data.error.code;
            err.data = (data && data.error) || {};
            throw err;
          }
          return data;
        });
      });
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  function toast(msg, tone) {
    var root = document.getElementById('toasts');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast glass tone-' + (tone || 'info');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 300); }, 4200);
  }

  // Thème clair / sombre (préférence mémorisée sur cet appareil).
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', currentTheme() === 'dark' ? '#0d0b14' : '#f6f3ee');
  }
  function currentTheme() {
    var a = document.documentElement.getAttribute('data-theme');
    if (a) return a;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store('ocdlive-theme', next);
    return next;
  }
  applyTheme(store('ocdlive-theme'));

  function wordmark(brand) {
    if (brand && brand.logoUrl) return '<img class="logo" src="' + esc(brand.logoUrl) + '" alt="' + esc(brand.name || 'OCD LIVE') + '">';
    return '<span class="wordmark"><b>OCD</b><span class="live-pill"><i class="live-dot"></i>LIVE</span></span>';
  }

  window.OCD = { TZ: TZ, icon: icon, esc: esc, F: F, fmt: fmt, browserTz: browserTz, request: request, uuid: uuid, toast: toast, toggleTheme: toggleTheme, currentTheme: currentTheme, store: store, wordmark: wordmark };
})();
