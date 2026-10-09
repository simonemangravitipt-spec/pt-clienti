/* Calendario dei pagamenti: giorno, settimana, mese, anno.
   Mostra le scadenze delle rate con un pallino:
   vuoto con bordo arancione = da incassare, rosso = insoluto (scadenza passata), verde = incassato.
   Usa gli stessi dati della schermata Incassi (window.PT, impostato da app.js). */
(function () {
  'use strict';
  function P() { return window.PT; }

  var GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var GGL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var WL = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  var VIEWS = [['day', 'Giorno'], ['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno'], ['agenda', 'Programma']];
  var PREF = 'ptapp.cal';
  var C = { view: 'month', date: null, sel: null, drawer: false, drawerAnim: false, mini: null, scrollReq: true };
  var cache = {};

  try {
    var pr = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (pr && VIEWS.some(function (v) { return v[0] === pr.view; })) C.view = pr.view;
  } catch (e) { /* le preferenze sono solo una comodità */ }
  function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify({ view: C.view })); } catch (e) { /* ok */ } }

  /* ---------- date ---------- */
  function pd(iso) { return P().pd(iso); }
  function pad(n) { return P().pad(n); }
  function esc(s) { return P().esc(s); }
  function today() { return P().todayISO(); }
  function addD(iso, n) { return P().addDaysISO(iso, n); }
  function wd(iso) { var p = pd(iso); return new Date(p.y, p.m - 1, p.d).getDay(); }
  function mon(iso) { return addD(iso, -((wd(iso) + 6) % 7)); }
  function ymOf(iso) { return iso.slice(0, 7); }
  function daysIn(ym) { return P().daysIn(ym); }
  function shiftMonth(iso, n) { var ym = P().addM(ymOf(iso), n); return ym + '-' + pad(Math.min(pd(iso).d, daysIn(ym))); }
  function dayShort(iso) { var p = pd(iso); return GG[wd(iso)] + ' ' + p.d + ' ' + P().MESI[p.m - 1].slice(0, 3); }
  function dayLong(iso) { var p = pd(iso); return GGL[wd(iso)] + ' ' + p.d + ' ' + P().MESI[p.m - 1] + ' ' + p.y; }

  /* ---------- pagamenti del giorno ---------- */
  function paysOn(iso) {
    var ym = ymOf(iso);
    if (!cache[ym]) cache[ym] = P().monthPays(ym);
    return cache[ym].filter(function (x) { return x.due === iso; });
  }
  function stOf(x) { return P().payState(x.p, x.ym); }
  function count(list) {
    var n = { pend: 0, late: 0, ok: 0 };
    list.forEach(function (x) { n[stOf(x)]++; });
    return n;
  }
  function dot(st) { return '<i class="pdot ' + st + '" aria-hidden="true"></i>'; }
  function dots(list, max) {
    var order = { late: 0, pend: 1, ok: 2 };
    var l = list.slice().sort(function (a, b) { return order[stOf(a)] - order[stOf(b)]; });
    var h = l.slice(0, max).map(function (x) { return dot(stOf(x)); }).join('');
    return h + (l.length > max ? '<em>+' + (l.length - max) + '</em>' : '');
  }
  function topState(list) { var n = count(list); return n.late ? 'late' : n.pend ? 'pend' : n.ok ? 'ok' : ''; }
  function summaryText(list) {
    var n = count(list), a = [];
    if (n.late) a.push(n.late + (n.late === 1 ? ' insoluto' : ' insoluti'));
    if (n.pend) a.push(n.pend + ' da incassare');
    if (n.ok) a.push(n.ok + (n.ok === 1 ? ' incassato' : ' incassati'));
    return a.join(', ');
  }
  function rows(list) { return list.map(function (x) { return P().payRow(x, false); }).join(''); }

  /* ---------- barra in alto ---------- */
  function title() {
    var p = pd(C.date), M = P().MESI;
    if (C.view === 'year') return String(p.y);
    if (C.view === 'day') return p.d + ' ' + M[p.m - 1] + ' ' + p.y;
    if (C.view === 'week') {
      var s = mon(C.date), e = addD(s, 6), a = pd(s), b = pd(e);
      if (a.m === b.m) return M[a.m - 1] + ' ' + a.y;
      return M[a.m - 1].slice(0, 3) + ' – ' + M[b.m - 1].slice(0, 3) + ' ' + b.y;
    }
    return M[p.m - 1] + ' ' + p.y;
  }
  function viewName() { return VIEWS.filter(function (v) { return v[0] === C.view; })[0][1]; }
  var ICON_MENU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  function topbar() {
    return '<header class="ctop"><button type="button" class="ib" data-ca="drawer" aria-label="Apri il menu del calendario">' + ICON_MENU + '</button>' +
      '<div class="ttl"><b>' + esc(title()) + '</b><span>' + viewName() + '</span></div>' +
      '<button type="button" class="ib" data-ca="prev" aria-label="Precedente">‹</button><button type="button" class="ib" data-ca="next" aria-label="Successivo">›</button>' +
      '<button type="button" class="btn sm" data-ca="today">Oggi</button></header>';
  }
  function legend() {
    return '<div class="legend small"><span>' + dot('pend') + 'Da incassare</span><span>' + dot('late') + 'Insoluto</span><span>' + dot('ok') + 'Incassato</span></div>';
  }
  function monthSum(ym) {
    var l = P().monthPays(ym), n = count(l), amt = { pend: 0, late: 0, ok: 0 };
    l.forEach(function (x) { amt[stOf(x)] += P().amountDue(x.p, x.ym); });
    function cell(st, lab) { return '<div class="ms"><span class="lab">' + dot(st) + lab + '</span><b class="num">' + fmtE(amt[st]) + '</b><small class="muted">' + n[st] + (n[st] === 1 ? ' rata' : ' rate') + '</small></div>'; }
    return '<div class="msum">' + cell('ok', 'Incassato') + cell('late', 'Insoluti') + cell('pend', 'Da incassare') + '</div>';
  }
  function fmtE(n) { return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n) + '€'; }

  /* ---------- giorno ---------- */
  function dayView() {
    var list = paysOn(C.date), t = today();
    var h = '<section class="daysec"><div class="sechead"><h2 class="' + (C.date === t ? 'tod' : '') + '">' + dayLong(C.date) + (C.date === t ? ' · oggi' : '') + '</h2></div>';
    h += list.length ? '<p class="muted small" style="margin:0">' + summaryText(list) + '. Tocca il quadrato quando arriva il pagamento.</p><ul class="rows">' + rows(list) + '</ul>' :
      '<div class="empty">Nessuna rata in scadenza in questo giorno.</div>';
    return h + legend() + '</section>';
  }

  /* ---------- settimana ---------- */
  function weekView() {
    var start = mon(C.date), t = today(), days = [], i;
    for (i = 0; i < 7; i++) days.push(addD(start, i));
    var h = '<div class="wstrip">' + days.map(function (d) {
      var l = paysOn(d);
      return '<button type="button" class="wd' + (d === t ? ' today' : '') + (d === C.date ? ' cur' : '') + '" data-ca="goday" data-d="' + d + '" aria-label="' + dayLong(d) + (l.length ? ': ' + summaryText(l) : '') + '"><span>' + WL[(wd(d) + 6) % 7] + '</span><b>' + pd(d).d + '</b><span class="mdots">' + dots(l, 3) + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="wlist">' + days.map(function (d) {
      var l = paysOn(d);
      return '<section class="daysec"><div class="sechead"><h2 class="' + (d === t ? 'tod' : '') + '">' + dayShort(d) + (d === t ? ' · oggi' : '') + '</h2>' + (l.length ? '<span class="muted small">' + summaryText(l) + '</span>' : '') + '</div>' +
        (l.length ? '<ul class="rows">' + rows(l) + '</ul>' : '<p class="muted small" style="margin:0">Nessuna rata</p>') + '</section>';
    }).join('') + legend() + '</div>';
    return h;
  }

  /* ---------- mese ---------- */
  function monthView() {
    var ym = ymOf(C.date), first = ym + '-01', off = (wd(first) + 6) % 7, nrows = Math.ceil((off + daysIn(ym)) / 7), start = mon(first), t = today();
    var sel = C.sel || C.date;
    var h = monthSum(ym) + '<div class="mhead">' + WL.map(function (g) { return '<span>' + g + '</span>'; }).join('') + '</div><div class="mgrid">';
    for (var i = 0; i < nrows * 7; i++) {
      var d = addD(start, i), l = paysOn(d);
      h += '<button type="button" class="mc' + (ymOf(d) === ym ? '' : ' out') + (d === t ? ' today' : '') + (d === sel ? ' sel' : '') + '" data-ca="mday" data-d="' + d + '" aria-label="' + dayLong(d) + (l.length ? ': ' + summaryText(l) : '') + '"><b>' + pd(d).d + '</b><span class="mdots">' + dots(l, 6) + '</span></button>';
    }
    var sl = paysOn(sel);
    h += '</div>' + legend() + '<section class="daysec"><div class="sechead"><h2>' + dayLong(sel) + '</h2><button type="button" class="btn sm" data-ca="goday" data-d="' + sel + '">Apri giornata</button></div>' +
      (sl.length ? '<ul class="rows">' + rows(sl) + '</ul>' : '<div class="empty">Nessuna rata in scadenza in questo giorno.</div>') + '</section>';
    return h;
  }

  /* ---------- programma: tutte le rate del mese in ordine di scadenza ---------- */
  function agendaView() {
    var ym = ymOf(C.date), list = P().monthPays(ym), t = today(), by = {}, order = [];
    list.forEach(function (x) { if (!by[x.due]) { by[x.due] = []; order.push(x.due); } by[x.due].push(x); });
    var h = monthSum(ym) + '<div class="agenda">';
    if (!list.length) h += '<div class="empty" style="margin:14px 16px 0">Nessuna rata in scadenza a ' + P().MESI[pd(ym + '-01').m - 1] + '.</div>';
    order.forEach(function (d) {
      var l = by[d];
      h += '<section class="daysec"><div class="sechead"><h2 class="' + (d === t ? 'tod' : '') + '">' + dayShort(d) + (d === t ? ' · oggi' : '') + '</h2><span class="muted small">' + summaryText(l) + '</span></div><ul class="rows">' + rows(l) + '</ul></section>';
    });
    return h + legend() + '</div>';
  }

  /* ---------- anno ---------- */
  var DCLS = { late: ' dl', pend: ' dp', ok: ' dk', '': '' };
  function yearView() {
    var y = pd(C.date).y, t = today(), h = '<div class="ygrid">';
    for (var m = 1; m <= 12; m++) {
      var ym = y + '-' + pad(m), first = ym + '-01', off = (wd(first) + 6) % 7;
      h += '<div class="ym"><button type="button" class="ymt" data-ca="ymonth" data-d="' + first + '">' + P().MESI[m - 1] + '</button><div class="ymg">';
      WL.forEach(function (g) { h += '<span class="yw">' + g + '</span>'; });
      for (var i = 0; i < off; i++) h += '<span></span>';
      for (var d = 1; d <= daysIn(ym); d++) {
        var iso = ym + '-' + pad(d), l = paysOn(iso);
        h += '<button type="button" class="yd' + DCLS[topState(l)] + (iso === t ? ' today' : '') + '" data-ca="goday" data-d="' + iso + '" aria-label="' + dayLong(iso) + (l.length ? ': ' + summaryText(l) : '') + '">' + d + '</button>';
      }
      h += '</div></div>';
    }
    return h + '</div>' + legend();
  }

  /* ---------- menu laterale ---------- */
  function miniHtml() {
    var ym = C.mini || ymOf(C.date), first = ym + '-01', off = (wd(first) + 6) % 7, t = today(), h;
    h = '<div class="mini"><div class="minihead"><b>' + P().MESI[pd(first).m - 1] + ' ' + pd(first).y + '</b><span><button type="button" class="ib sm" data-ca="miniprev" aria-label="Mese precedente">‹</button><button type="button" class="ib sm" data-ca="mininext" aria-label="Mese successivo">›</button></span></div><div class="minig">';
    WL.forEach(function (g) { h += '<span class="yw">' + g + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span></span>';
    for (var d = 1; d <= daysIn(ym); d++) {
      var iso = ym + '-' + pad(d);
      h += '<button type="button" class="yd' + DCLS[topState(paysOn(iso))] + (iso === t ? ' today' : '') + (iso === C.date ? ' cur' : '') + '" data-ca="minipick" data-d="' + iso + '">' + d + '</button>';
    }
    return h + '</div></div>';
  }
  function drawerHtml() {
    return '<div class="dbk" data-ca="closedrawer"></div><aside class="drawer' + (C.drawerAnim ? ' anim' : '') + '" aria-label="Menu del calendario"><div class="dhead"><b>Calendario</b><button type="button" class="ib sm" data-ca="closedrawer" aria-label="Chiudi">✕</button></div>' +
      miniHtml() +
      '<nav class="dviews" aria-label="Vista">' + VIEWS.map(function (v) { return '<button type="button" class="dv' + (C.view === v[0] ? ' on' : '') + '" data-ca="setview" data-v="' + v[0] + '" aria-pressed="' + (C.view === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</nav>' +
      '<div class="dfilt"><h2>Come leggere i pallini</h2>' +
      '<p class="lg">' + dot('pend') + '<span><b>Da incassare</b><br><small class="muted">la scadenza non è ancora passata</small></span></p>' +
      '<p class="lg">' + dot('late') + '<span><b>Insoluto</b><br><small class="muted">scadenza passata e rata non pagata</small></span></p>' +
      '<p class="lg">' + dot('ok') + '<span><b>Incassato</b><br><small class="muted">rata pagata</small></span></p></div>' +
      '<div class="dact"><a class="btn" href="#oggi" data-ca="closedrawer">Vai a Incassi</a></div></aside>';
  }

  /* ---------- schermata ---------- */
  function ensureDate() { if (!C.date) { C.date = today(); C.sel = C.date; } }
  function body() {
    if (C.view === 'day') return dayView();
    if (C.view === 'week') return weekView();
    if (C.view === 'year') return yearView();
    if (C.view === 'agenda') return agendaView();
    return monthView();
  }
  function view() {
    ensureDate(); cache = {};
    var h = topbar() + '<div class="cbody">' + body() + '</div>';
    if (C.drawer) h += drawerHtml();
    return h;
  }
  function before() { /* niente da salvare */ }
  function after() {
    document.body.classList.toggle('noscroll', !!C.drawer);
    if (C.scrollReq) { window.scrollTo(0, 0); C.scrollReq = false; }
  }
  function rerender() { P().render(); }

  /* ---------- azioni ---------- */
  function step(dir) {
    if (C.view === 'day') C.date = addD(C.date, dir);
    else if (C.view === 'week') C.date = addD(C.date, 7 * dir);
    else if (C.view === 'month' || C.view === 'agenda') C.date = shiftMonth(C.date, dir);
    else C.date = shiftMonth(C.date, 12 * dir);
    C.sel = C.date;
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ca]'); if (!t) return;
    var a = t.getAttribute('data-ca'), d = t.getAttribute('data-d');
    if (a === 'drawer') { C.drawer = true; C.drawerAnim = true; C.mini = ymOf(C.date); rerender(); C.drawerAnim = false; }
    else if (a === 'closedrawer') { C.drawer = false; rerender(); }
    else if (a === 'prev') { step(-1); rerender(); }
    else if (a === 'next') { step(1); rerender(); }
    else if (a === 'today') { C.date = today(); C.sel = C.date; C.scrollReq = true; rerender(); }
    else if (a === 'goday') { C.date = d; C.sel = d; C.view = 'day'; C.scrollReq = true; savePrefs(); rerender(); }
    else if (a === 'setview') { C.view = t.getAttribute('data-v'); C.drawer = false; C.scrollReq = true; C.sel = C.date; savePrefs(); rerender(); }
    else if (a === 'mday') { C.sel = d; C.date = d; rerender(); }
    else if (a === 'ymonth') { C.date = d; C.sel = d; C.view = 'month'; C.scrollReq = true; savePrefs(); rerender(); }
    else if (a === 'miniprev') { C.mini = P().addM(C.mini || ymOf(C.date), -1); rerender(); }
    else if (a === 'mininext') { C.mini = P().addM(C.mini || ymOf(C.date), 1); rerender(); }
    else if (a === 'minipick') { C.date = d; C.sel = d; C.drawer = false; if (C.view === 'year') C.view = 'month'; C.scrollReq = true; savePrefs(); rerender(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && C.drawer) { C.drawer = false; rerender(); }
  });

  // Scorrimento orizzontale con il dito: periodo precedente o successivo
  var tx = null, ty = null;
  document.addEventListener('touchstart', function (e) { if (e.touches.length === 1 && !C.drawer && e.target.closest('.cbody')) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } else tx = null; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx === null) return; var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) { step(dx < 0 ? 1 : -1); rerender(); }
  }, { passive: true });

  window.PTCal = { view: view, after: after, before: before, state: C };
})();
