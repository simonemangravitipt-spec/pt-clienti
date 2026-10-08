/* Calendario di lavoro: giorno, 3 giorni, settimana, mese, anno, programma.
   Usa i dati e le funzioni di app.js tramite window.PT (impostato da app.js). */
(function () {
  'use strict';
  function P() { return window.PT; }

  var GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var GGL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var HOUR = 52;
  var COLORS = [['#D94F00', 'Arancio'], ['#2F6FDB', 'Blu'], ['#0E8F7E', 'Verde acqua'], ['#8A4FD6', 'Viola'], ['#C2307A', 'Rosa'], ['#5C6670', 'Grigio']];
  var VIEWS = [['day', 'Giorno'], ['3days', '3 giorni'], ['week', 'Settimana'], ['month', 'Mese'], ['year', 'Anno'], ['agenda', 'Programma']];
  var PREF = 'ptapp.cal';
  var BLANKREP = function () { return { freq: 'none', interval: 1, days: [], until: '' }; };

  var C = { view: 'week', date: null, drawer: false, drawerAnim: false, mini: null, sel: null, filt: { ev: true, rem: true, pay: true },
    sheet: null, draft: null, armed: null, agendaN: 30, scrollReq: true, scrollHour: null, ss: 0 };
  var payCache = {};

  try {
    var pr = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (pr) {
      if (VIEWS.some(function (v) { return v[0] === pr.view; })) C.view = pr.view;
      if (pr.filt) C.filt = { ev: pr.filt.ev !== false, rem: pr.filt.rem !== false, pay: pr.filt.pay !== false };
    }
  } catch (e) { /* le preferenze sono solo una comodità */ }
  function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify({ view: C.view, filt: C.filt })); } catch (e) { /* ok */ } }

  /* ---------- date ---------- */
  function pd(iso) { return P().pd(iso); }
  function pad(n) { return P().pad(n); }
  function esc(s) { return P().esc(s); }
  function today() { return P().todayISO(); }
  function addD(iso, n) { return P().addDaysISO(iso, n); }
  function wd(iso) { var p = pd(iso); return new Date(p.y, p.m - 1, p.d).getDay(); }
  function mon(iso) { return addD(iso, -((wd(iso) + 6) % 7)); }
  function diffDays(a, b) { var x = pd(a), y = pd(b); return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 864e5); }
  function ymOf(iso) { return iso.slice(0, 7); }
  function daysIn(ym) { return P().daysIn(ym); }
  function shiftMonth(iso, n) { var ym = P().addM(ymOf(iso), n); return ym + '-' + pad(Math.min(pd(iso).d, daysIn(ym))); }
  function toMin(t) { var a = String(t || '0:0').split(':'); return (+a[0]) * 60 + (+a[1] || 0); }
  function fromMin(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function dayShort(iso) { var p = pd(iso); return GG[wd(iso)] + ' ' + p.d + ' ' + P().MESI[p.m - 1].slice(0, 3); }
  function dayLong(iso) { var p = pd(iso); return GGL[wd(iso)] + ' ' + p.d + ' ' + P().MESI[p.m - 1] + ' ' + p.y; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function isTime(s) { return /^\d{2}:\d{2}$/.test(s || ''); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  /* ---------- ripetizioni ---------- */
  function occurs(ev, iso) {
    var b = ev.date; if (iso < b) return false;
    if (ev.ex && ev.ex.indexOf(iso) >= 0) return false;
    var r = ev.rep;
    if (!r || r.freq === 'none') return iso === b;
    if (r.until && iso > r.until) return false;
    var k = Math.max(1, r.interval || 1), bd = pd(b), id = pd(iso);
    if (r.freq === 'daily') return diffDays(b, iso) % k === 0;
    if (r.freq === 'weekly') {
      var wk = Math.floor(diffDays(mon(b), mon(iso)) / 7); if (wk % k) return false;
      var days = r.days && r.days.length ? r.days : [wd(b)];
      return days.indexOf(wd(iso)) >= 0;
    }
    if (r.freq === 'monthly') return ((id.y - bd.y) * 12 + id.m - bd.m) % k === 0 && id.d === bd.d;
    if (r.freq === 'yearly') return (id.y - bd.y) % k === 0 && id.m === bd.m && id.d === bd.d;
    return false;
  }
  function isRecurring(ev) { return !!(ev.rep && ev.rep.freq && ev.rep.freq !== 'none'); }
  function repText(r) {
    if (!r || r.freq === 'none') return 'Non si ripete';
    var k = r.interval || 1, t;
    var u = { daily: ['giorno', 'giorni'], weekly: ['settimana', 'settimane'], monthly: ['mese', 'mesi'], yearly: ['anno', 'anni'] }[r.freq];
    t = k === 1 ? 'Ogni ' + u[0] : 'Ogni ' + k + ' ' + u[1];
    if (r.freq === 'weekly' && r.days && r.days.length) t += ' (' + r.days.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return GG[d]; }).join(', ') + ')';
    if (r.until) t += ', fino al ' + P().fmtD(r.until);
    return t;
  }

  /* ---------- dati del giorno ---------- */
  function events() { return P().db().events; }
  function getEv(id) { return events().filter(function (e) { return e.id === id; })[0]; }
  function evTitle(ev) { var c = ev.clientId && P().getClient(ev.clientId); return ev.title || (c ? c.name : (ev.type === 'rem' ? 'Promemoria' : 'Appuntamento')); }
  function isDone(ev, iso) { return !!(ev.doneDates && ev.doneDates.indexOf(iso) >= 0); }
  function dayItems(iso) {
    var out = [];
    events().forEach(function (ev) {
      if (!C.filt[ev.type === 'rem' ? 'rem' : 'ev']) return;
      if (occurs(ev, iso)) out.push(ev);
    });
    out.sort(function (a, b) { if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; var x = a.start || '', y = b.start || ''; return x < y ? -1 : x > y ? 1 : 0; });
    return out;
  }
  function paysOn(iso) {
    if (!C.filt.pay) return [];
    var ym = ymOf(iso);
    if (!payCache[ym]) payCache[ym] = P().monthPays(ym);
    return payCache[ym].filter(function (x) { return x.due === iso; });
  }
  function payState(x) { return x.paid ? 'ok' : (x.due < today() ? 'late' : 'pend'); }
  function timeText(ev) { return ev.allDay ? 'Tutto il giorno' : (ev.type === 'rem' || !ev.end ? ev.start : ev.start + '–' + ev.end); }

  /* ---------- barra in alto ---------- */
  function title() {
    var p = pd(C.date), M = P().MESI;
    if (C.view === 'year') return String(p.y);
    if (C.view === 'day') return p.d + ' ' + M[p.m - 1] + ' ' + p.y;
    if (C.view === 'week' || C.view === '3days') {
      var s = C.view === 'week' ? mon(C.date) : C.date, e = addD(s, C.view === 'week' ? 6 : 2), a = pd(s), b = pd(e);
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

  /* ---------- blocchi e chip ---------- */
  function colorOf(ev) { return ev.color || COLORS[0][0]; }
  function payChip(x, cls) {
    return '<button type="button" class="pchip ' + payState(x) + (cls ? ' ' + cls : '') + '" data-ca="openpay" data-c="' + x.c.id + '" data-p="' + x.p.id + '" data-ym="' + x.ym + '">€ ' + esc(x.c.name.split(' ')[0]) + '</button>';
  }
  function allDayChip(ev, iso) {
    return '<button type="button" class="achip' + (isDone(ev, iso) ? ' done' : '') + '" style="background:' + colorOf(ev) + '" data-ca="openev" data-id="' + ev.id + '" data-d="' + iso + '">' + esc(evTitle(ev)) + '</button>';
  }

  function layoutCols(items) {
    items.sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var cols = [], cluster = [], end = -1;
    function flush() { var n = cols.length; cluster.forEach(function (i) { i.n = n; }); cols = []; cluster = []; end = -1; }
    items.forEach(function (it) {
      if (cluster.length && it.s >= end) flush();
      var placed = false;
      for (var c = 0; c < cols.length; c++) { if (cols[c] <= it.s) { cols[c] = it.e; it.c = c; placed = true; break; } }
      if (!placed) { it.c = cols.length; cols.push(it.e); }
      cluster.push(it); end = Math.max(end, it.e);
    });
    flush();
  }

  function colHtml(iso) {
    var items = dayItems(iso).filter(function (ev) { return !ev.allDay; }).map(function (ev) {
      var s = toMin(ev.start), e = ev.type === 'rem' || !ev.end ? s + 30 : toMin(ev.end);
      return { ev: ev, s: s, e: Math.max(e, s + 30) , realE: e };
    });
    layoutCols(items);
    var t = today();
    var h = '<div class="col' + (iso === t ? ' today' : '') + '" data-d="' + iso + '">';
    items.forEach(function (it) {
      var ev = it.ev, top = it.s / 60 * HOUR, ht = Math.max((it.realE - it.s) / 60 * HOUR, 24);
      if (ev.type === 'rem') ht = 26;
      h += '<button type="button" class="ev' + (ev.type === 'rem' ? ' rem' : '') + (isDone(ev, iso) ? ' done' : '') + '" data-ca="openev" data-id="' + ev.id + '" data-d="' + iso + '" ' +
        'style="top:' + top + 'px;height:' + ht + 'px;left:calc(' + it.c + ' * 100% / ' + it.n + ' + 1px);width:calc(100% / ' + it.n + ' - 2px);background:' + colorOf(ev) + '">' +
        '<b>' + (ev.type === 'rem' ? '🔔 ' : '') + esc(evTitle(ev)) + '</b>' + (ht >= 38 ? '<span>' + timeText(ev) + '</span>' : '') + '</button>';
    });
    if (iso === t) h += '<i class="now" style="top:' + (nowMin() / 60 * HOUR) + 'px"></i>';
    return h + '</div>';
  }

  /* ---------- vista a griglia oraria ---------- */
  function gridView(n) {
    var start = C.view === 'week' ? mon(C.date) : C.date, days = [], i, t = today();
    for (i = 0; i < n; i++) days.push(addD(start, i));
    var h = '<div class="cwrap" style="--n:' + n + '"><div class="cstick"><div class="chead cgrid"><span></span>' + days.map(function (d) {
      return '<button type="button" class="dh' + (d === t ? ' today' : '') + '" data-ca="goday" data-d="' + d + '" aria-label="' + dayLong(d) + '"><span>' + GG[wd(d)] + '</span><b>' + pd(d).d + '</b></button>';
    }).join('') + '</div>';
    var any = false;
    var band = days.map(function (d) {
      var chips = [];
      dayItems(d).filter(function (ev) { return ev.allDay; }).forEach(function (ev) { chips.push(allDayChip(ev, d)); });
      paysOn(d).forEach(function (x) { chips.push(payChip(x)); });
      if (chips.length) any = true;
      var shown = chips.slice(0, n > 3 ? 2 : 4), extra = chips.length - shown.length;
      return '<div class="adc">' + shown.join('') + (extra > 0 ? '<button type="button" class="more" data-ca="goday" data-d="' + d + '">+' + extra + '</button>' : '') + '</div>';
    }).join('');
    if (any) h += '<div class="allday cgrid"><span class="gut">tutto il giorno</span>' + band + '</div>';
    h += '</div><div class="tgrid cgrid" style="height:' + (24 * HOUR) + 'px;--hh:' + HOUR + 'px"><div class="hours">';
    for (i = 1; i < 24; i++) h += '<span style="top:' + (i * HOUR - 7) + 'px">' + pad(i) + ':00</span>';
    h += '</div>' + days.map(colHtml).join('') + '</div></div>';
    return h;
  }

  /* ---------- elenco di un giorno (usato da mese e programma) ---------- */
  function evRow(ev, iso) {
    var c = ev.clientId && P().getClient(ev.clientId);
    return '<li class="erow' + (isDone(ev, iso) ? ' done' : '') + '" role="button" tabindex="0" data-ca="openev" data-id="' + ev.id + '" data-d="' + iso + '"><i class="bar" style="background:' + colorOf(ev) + '"></i>' +
      '<div class="who"><b>' + (ev.type === 'rem' ? '🔔 ' : '') + esc(evTitle(ev)) + '</b><span>' + timeText(ev) + (c && ev.title ? ' · ' + esc(c.name) : '') + (ev.location ? ' · ' + esc(ev.location) : '') + '</span></div></li>';
  }
  function dayRows(iso) {
    var rows = dayItems(iso).map(function (ev) { return evRow(ev, iso); }).join('') + paysOn(iso).map(function (x) { return P().payRow(x, false); }).join('');
    return rows;
  }

  /* ---------- mese ---------- */
  function monthView() {
    var ym = ymOf(C.date), first = ym + '-01', off = (wd(first) + 6) % 7, rows = Math.ceil((off + daysIn(ym)) / 7), start = mon(first), t = today();
    var sel = C.sel || C.date;
    var h = '<div class="mhead">' + ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(function (g) { return '<span>' + g + '</span>'; }).join('') + '</div><div class="mgrid">';
    for (var i = 0; i < rows * 7; i++) {
      var d = addD(start, i), chips = [];
      dayItems(d).forEach(function (ev) { chips.push('<i class="mchip' + (isDone(ev, d) ? ' done' : '') + '" style="background:' + colorOf(ev) + '">' + esc(evTitle(ev)) + '</i>'); });
      paysOn(d).forEach(function (x) { chips.push('<i class="mchip pay ' + payState(x) + '">€ ' + esc(x.c.name.split(' ')[0]) + '</i>'); });
      var shown = chips.slice(0, 3), extra = chips.length - shown.length;
      h += '<button type="button" class="mc' + (ymOf(d) === ym ? '' : ' out') + (d === t ? ' today' : '') + (d === sel ? ' sel' : '') + '" data-ca="mday" data-d="' + d + '" aria-label="' + dayLong(d) + (chips.length ? ', ' + chips.length + ' impegni' : '') + '"><b>' + pd(d).d + '</b>' + shown.join('') + (extra > 0 ? '<i class="mmore">+' + extra + '</i>' : '') + '</button>';
    }
    h += '</div><section class="daysec"><div class="sechead"><h2>' + dayLong(sel) + '</h2><button type="button" class="btn sm" data-ca="goday" data-d="' + sel + '">Apri giornata</button></div>';
    var rws = dayRows(sel);
    h += '<ul class="rows">' + (rws || '<li class="empty">Nessun impegno. Tocca + per aggiungerne uno.</li>') + '</ul></section>';
    return h;
  }

  /* ---------- anno ---------- */
  function yearView() {
    var y = pd(C.date).y, t = today(), h = '<div class="ygrid">';
    for (var m = 1; m <= 12; m++) {
      var ym = y + '-' + pad(m), first = ym + '-01', off = (wd(first) + 6) % 7;
      h += '<div class="ym"><button type="button" class="ymt" data-ca="ymonth" data-d="' + first + '">' + P().MESI[m - 1] + '</button><div class="ymg">';
      ['L', 'M', 'M', 'G', 'V', 'S', 'D'].forEach(function (g) { h += '<span class="yw">' + g + '</span>'; });
      for (var i = 0; i < off; i++) h += '<span></span>';
      for (var d = 1; d <= daysIn(ym); d++) {
        var iso = ym + '-' + pad(d), cls = '', ps = paysOn(iso), its = dayItems(iso);
        if (ps.some(function (x) { return payState(x) === 'late'; })) cls = ' plate';
        else if (its.length) cls = ' pev';
        else if (ps.length) cls = ' pok';
        h += '<button type="button" class="yd' + cls + (iso === t ? ' today' : '') + '" data-ca="goday" data-d="' + iso + '" aria-label="' + dayLong(iso) + '">' + d + '</button>';
      }
      h += '</div></div>';
    }
    return h + '</div>';
  }

  /* ---------- programma ---------- */
  function agendaView() {
    var h = '<div class="agenda">', n = 0, t = today();
    for (var i = 0; i < C.agendaN; i++) {
      var d = addD(C.date, i), rws = dayRows(d);
      if (!rws) continue;
      n++;
      h += '<section class="daysec"><div class="sechead"><h2 class="' + (d === t ? 'tod' : '') + '">' + dayLong(d) + (d === t ? ' · oggi' : '') + '</h2></div><ul class="rows">' + rws + '</ul></section>';
    }
    if (!n) h += '<div class="empty">Nessun impegno nei prossimi ' + C.agendaN + ' giorni da ' + P().fmtD(C.date) + '.</div>';
    h += '<div><button type="button" class="btn" data-ca="more">Mostra altri 30 giorni</button></div></div>';
    return h;
  }

  /* ---------- menu laterale ---------- */
  function miniHtml() {
    var ym = C.mini || ymOf(C.date), first = ym + '-01', off = (wd(first) + 6) % 7, t = today(), h;
    h = '<div class="mini"><div class="minihead"><b>' + P().MESI[pd(first).m - 1] + ' ' + pd(first).y + '</b><span><button type="button" class="ib sm" data-ca="miniprev" aria-label="Mese precedente">‹</button><button type="button" class="ib sm" data-ca="mininext" aria-label="Mese successivo">›</button></span></div><div class="minig">';
    ['L', 'M', 'M', 'G', 'V', 'S', 'D'].forEach(function (g) { h += '<span class="yw">' + g + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span></span>';
    for (var d = 1; d <= daysIn(ym); d++) {
      var iso = ym + '-' + pad(d), has = dayItems(iso).length || paysOn(iso).length;
      h += '<button type="button" class="yd' + (has ? ' has' : '') + (iso === t ? ' today' : '') + (iso === C.date ? ' cur' : '') + '" data-ca="minipick" data-d="' + iso + '">' + d + '</button>';
    }
    return h + '</div></div>';
  }
  function drawerHtml() {
    var h = '<div class="dbk" data-ca="closedrawer"></div><aside class="drawer' + (C.drawerAnim ? ' anim' : '') + '" aria-label="Menu del calendario"><div class="dhead"><b>Calendario</b><button type="button" class="ib sm" data-ca="closedrawer" aria-label="Chiudi">✕</button></div>';
    h += miniHtml();
    h += '<nav class="dviews" aria-label="Vista">' + VIEWS.map(function (v) { return '<button type="button" class="dv' + (C.view === v[0] ? ' on' : '') + '" data-ca="setview" data-v="' + v[0] + '" aria-pressed="' + (C.view === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</nav>';
    h += '<div class="dfilt"><h2>I miei calendari</h2>' +
      [['ev', 'Appuntamenti', COLORS[0][0]], ['rem', 'Promemoria', COLORS[1][0]], ['pay', 'Pagamenti', '#4CD08A']].map(function (f) {
        return '<label class="l check"><input type="checkbox" data-cafilter="' + f[0] + '"' + (C.filt[f[0]] ? ' checked' : '') + '><i class="sw2" style="background:' + f[2] + '"></i>' + f[1] + '</label>';
      }).join('') + '</div>';
    h += '<div class="dact"><a class="btn" href="#oggi" data-ca="closedrawer">Vai a Incassi</a></div></aside>';
    return h;
  }

  /* ---------- schede (appuntamento, modifica, pagamento) ---------- */
  function sheetWrap(label, inner) {
    return '<div class="sbk" data-ca="closesheet"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(label) + '"><div class="sbody">' + inner + '</div></section>';
  }
  function detailSheet() {
    var ev = getEv(C.sheet.id); if (!ev) { C.sheet = null; return ''; }
    var iso = C.sheet.d || ev.date, c = ev.clientId && P().getClient(ev.clientId), rec = isRecurring(ev), A = C.armed;
    var h = '<div class="dtitle"><i class="dot" style="background:' + colorOf(ev) + '"></i><h1>' + (ev.type === 'rem' ? '🔔 ' : '') + esc(evTitle(ev)) + '</h1></div>';
    h += '<dl class="kv"><dt>Quando</dt><dd>' + dayLong(iso) + '<br>' + timeText(ev) + '</dd><dt>Ripetizione</dt><dd>' + esc(repText(ev.rep)) + '</dd>';
    if (c) h += '<dt>Cliente</dt><dd>' + esc(c.name) + '</dd>';
    if (ev.location) h += '<dt>Luogo</dt><dd>' + esc(ev.location) + '</dd>';
    if (ev.notes) h += '<dt>Note</dt><dd style="white-space:pre-wrap">' + esc(ev.notes) + '</dd>';
    h += '</dl><div class="actions">';
    if (ev.type === 'rem') h += '<button type="button" class="btn primary" data-ca="done">' + (isDone(ev, iso) ? 'Segna da fare' : 'Segna come fatto') + '</button>';
    h += '<button type="button" class="btn" data-ca="edit">Modifica</button>' + (c ? '<a class="btn" href="#cliente/' + c.id + '/abb" data-ca="closesheet">Scheda cliente</a>' : '') + '</div>';
    h += '<div class="actions">';
    if (rec) {
      h += '<button type="button" class="btn danger' + (A === 'del1' ? ' armed' : '') + '" data-ca="del1">' + (A === 'del1' ? 'Conferma: solo questo giorno' : 'Elimina solo questo giorno') + '</button>' +
        '<button type="button" class="btn danger' + (A === 'delall' ? ' armed' : '') + '" data-ca="delall">' + (A === 'delall' ? 'Conferma: tutta la serie' : 'Elimina tutta la serie') + '</button>';
    } else h += '<button type="button" class="btn danger' + (A === 'delall' ? ' armed' : '') + '" data-ca="delall">' + (A === 'delall' ? 'Conferma eliminazione' : 'Elimina') + '</button>';
    h += '<button type="button" class="btn" data-ca="closesheet">Chiudi</button></div>';
    return sheetWrap('Dettaglio ' + evTitle(ev), h);
  }

  function paySheet() {
    var s = C.sheet, c = P().getClient(s.c), p = c && P().getPlan(c, s.p);
    if (!p) { C.sheet = null; return ''; }
    var x = { c: c, p: p, ym: s.ym, due: P().dueISO(p, s.ym), paid: P().isPaid(p, s.ym) };
    var h = '<div class="dtitle"><i class="dot" style="background:#4CD08A"></i><h1>Pagamento</h1></div><p class="muted" style="margin:0">Scadenza ' + dayLong(x.due) + '. Tocca il quadrato quando arriva.</p>' +
      '<ul class="rows">' + P().payRow(x, false) + '</ul><div class="actions"><a class="btn" href="#cliente/' + c.id + '/abb" data-ca="closesheet">Scheda cliente</a><button type="button" class="btn" data-ca="closesheet">Chiudi</button></div>';
    return sheetWrap('Pagamento di ' + c.name, h);
  }

  function editorSheet() {
    var d = C.draft, clients = P().db().clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }), isRem = d.type === 'rem';
    var h = '<h1>' + (d.id ? 'Modifica' : 'Nuovo') + '</h1>';
    h += '<form class="f" data-caform="1" novalidate>';
    h += '<div class="full seg2" role="group" aria-label="Tipo">' + [['app', 'Appuntamento'], ['rem', 'Promemoria']].map(function (t) { return '<button type="button" class="' + (d.type === t[0] ? 'on' : '') + '" data-ca="etype" data-t="' + t[0] + '" aria-pressed="' + (d.type === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<label class="l full">Titolo<input type="text" name="title" maxlength="100" value="' + esc(d.title) + '" placeholder="Es. Seduta di allenamento" autocomplete="off"></label>';
    h += '<label class="l full">Cliente (facoltativo)<select name="clientId"><option value="">Nessun cliente</option>' + clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === d.clientId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>';
    h += '<label class="l">Data<input type="date" name="date" required value="' + esc(d.date) + '"></label>';
    h += '<label class="l check"><input type="checkbox" name="allDay"' + (d.allDay ? ' checked' : '') + '> Tutto il giorno</label>';
    h += '<label class="l tf">Inizio<input type="time" name="start" step="300" value="' + esc(d.start) + '"></label>';
    h += '<label class="l tf ef">Fine<input type="time" name="end" step="300" value="' + esc(d.end) + '"></label>';
    h += '<label class="l">Si ripete<select name="freq">' + [['none', 'Non si ripete'], ['daily', 'Ogni giorno'], ['weekly', 'Ogni settimana'], ['monthly', 'Ogni mese'], ['yearly', 'Ogni anno']].map(function (o) { return '<option value="' + o[0] + '"' + (d.rep.freq === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
    h += '<label class="l rf">Ogni quanti<input type="number" name="interval" min="1" max="30" inputmode="numeric" value="' + (d.rep.interval || 1) + '"></label>';
    h += '<div class="full wd rf wf" role="group" aria-label="Giorni della settimana">' + [1, 2, 3, 4, 5, 6, 0].map(function (n) { return '<button type="button" class="cchip' + (d.rep.days.indexOf(n) >= 0 ? ' on' : '') + '" data-ca="ewd" data-n="' + n + '" aria-pressed="' + (d.rep.days.indexOf(n) >= 0) + '">' + GG[n] + '</button>'; }).join('') + '</div>';
    h += '<label class="l full rf">Fino al (facoltativo)<input type="date" name="until" value="' + esc(d.rep.until) + '"></label>';
    h += '<label class="l full">Luogo<input type="text" name="location" maxlength="100" value="' + esc(d.location) + '" autocomplete="off"></label>';
    h += '<label class="l full">Note<textarea name="notes" maxlength="1000">' + esc(d.notes) + '</textarea></label>';
    h += '<div class="full"><div class="lab2">Colore</div><div class="chips" role="group" aria-label="Colore">' + COLORS.map(function (c) { return '<button type="button" class="swb' + (d.color === c[0] ? ' on' : '') + '" style="background:' + c[0] + '" data-ca="ecolor" data-c="' + c[0] + '" aria-label="' + c[1] + '" aria-pressed="' + (d.color === c[0]) + '"></button>'; }).join('') + '</div></div>';
    if (d.id && isRecurring(d)) h += '<p class="full muted small" style="margin:0">Le modifiche valgono per tutta la serie.</p>';
    h += '<div class="full formbtns"><button type="submit" class="btn primary">Salva</button><button type="button" class="btn" data-ca="closesheet">Annulla</button></div></form>';
    return sheetWrap(d.id ? 'Modifica evento' : 'Nuovo evento', h);
  }

  /* ---------- schermata ---------- */
  function ensureDate() { if (!C.date) { C.date = today(); C.sel = C.date; } }
  function body() {
    if (C.view === 'day') return gridView(1);
    if (C.view === '3days') return gridView(3);
    if (C.view === 'week') return gridView(7);
    if (C.view === 'month') return monthView();
    if (C.view === 'year') return yearView();
    return agendaView();
  }
  function view() {
    ensureDate(); payCache = {};
    var h = topbar() + '<div class="cbody">' + body() + '</div>' +
      '<button type="button" class="fab" data-ca="new" aria-label="Nuovo appuntamento">+</button>';
    if (C.drawer) h += drawerHtml();
    if (C.sheet) {
      var sh = C.sheet.type === 'ev' ? detailSheet() : C.sheet.type === 'pay' ? paySheet() : C.sheet.type === 'edit' ? editorSheet() : '';
      h += sh;
    }
    return h;
  }
  function before() { var s = document.querySelector('.sbody'); C.ss = s ? s.scrollTop : 0; }
  function syncEditor() {
    var f = document.querySelector('form[data-caform]'); if (!f || !C.draft) return;
    var d = C.draft, rep = d.rep.freq !== 'none';
    Array.prototype.forEach.call(f.querySelectorAll('.tf'), function (el) { el.hidden = !!d.allDay; });
    var ef = f.querySelector('.ef'); if (ef) ef.hidden = !!d.allDay || d.type === 'rem';
    Array.prototype.forEach.call(f.querySelectorAll('.rf'), function (el) { el.hidden = !rep; });
    var wf = f.querySelector('.wf'); if (wf) wf.hidden = !rep || d.rep.freq !== 'weekly';
    var iv = f.querySelector('[name=interval]'); if (iv) { var u = { daily: 'giorni', weekly: 'settimane', monthly: 'mesi', yearly: 'anni' }[d.rep.freq]; if (iv.parentNode) iv.parentNode.firstChild.nodeValue = u ? 'Ogni quanti ' + u : 'Ogni quanti'; }
  }
  function after() {
    document.body.classList.toggle('noscroll', !!(C.sheet || C.drawer));
    var sb = document.querySelector('.sbody'); if (sb && C.ss) sb.scrollTop = C.ss;
    syncEditor();
    if (C.scrollReq || C.scrollHour !== null) {
      var g = document.querySelector('.tgrid');
      if (g) {
        var top = g.getBoundingClientRect().top + window.scrollY, stick = 0, a = document.querySelector('.ctop'), b = document.querySelector('.cstick');
        if (a) stick += a.offsetHeight; if (b) stick += b.offsetHeight;
        var hr = C.scrollHour !== null ? Math.max(0, C.scrollHour - 1) : (C.date === today() ? Math.max(0, new Date().getHours() - 1) : 7);
        window.scrollTo(0, Math.max(0, top + hr * HOUR - stick));
      } else window.scrollTo(0, 0);
      C.scrollReq = false; C.scrollHour = null;
    }
  }
  function rerender() { before(); P().render(); }

  /* ---------- azioni ---------- */
  function step(dir) {
    var v = C.view;
    if (v === 'day') C.date = addD(C.date, dir);
    else if (v === '3days') C.date = addD(C.date, 3 * dir);
    else if (v === 'week') C.date = addD(C.date, 7 * dir);
    else if (v === 'month') { C.date = shiftMonth(C.date, dir); C.sel = C.date; }
    else if (v === 'year') C.date = shiftMonth(C.date, 12 * dir);
    else C.date = addD(C.date, 30 * dir);
    C.sel = C.date;
  }
  function newDraft(date, startMin) {
    var s = Math.min(startMin, 1380), e = Math.min(s + 60, 1439);
    return { id: null, type: 'app', title: '', clientId: '', date: date, allDay: false, start: fromMin(s), end: fromMin(e), rep: BLANKREP(), reminders: [60], location: '', notes: '', color: COLORS[0][0], ex: [], doneDates: [] };
  }
  function openNew(date, startMin) {
    if (startMin === undefined) {
      if (date === today()) { startMin = Math.ceil((nowMin() + 1) / 30) * 30; if (startMin > 1380) startMin = 540; } else startMin = 540;
    }
    C.draft = newDraft(date, startMin); C.sheet = { type: 'edit' }; C.ss = 0; rerender();
  }
  function copyEv(ev) {
    var r = ev.rep || BLANKREP();
    return { id: ev.id, type: ev.type || 'app', title: ev.title || '', clientId: ev.clientId || '', date: ev.date, allDay: !!ev.allDay, start: ev.start || '09:00', end: ev.end || fromMin(Math.min(toMin(ev.start || '09:00') + 60, 1439)),
      rep: { freq: r.freq || 'none', interval: r.interval || 1, days: (r.days || []).slice(), until: r.until || '' }, reminders: (ev.reminders || []).slice(), location: ev.location || '', notes: ev.notes || '', color: ev.color || COLORS[0][0], ex: (ev.ex || []).slice(), doneDates: (ev.doneDates || []).slice() };
  }
  function uidc() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

  function saveDraft() {
    var d = C.draft, T = P().toast;
    if (!isDate(d.date)) { T('Scegli la data'); return; }
    if (!d.allDay) {
      if (!isTime(d.start)) { T('Scegli l\'ora di inizio'); return; }
      if (d.type === 'app') { if (!isTime(d.end) || toMin(d.end) <= toMin(d.start)) { T('L\'ora di fine deve essere dopo l\'inizio'); return; } }
    }
    var rep = { freq: d.rep.freq, interval: Math.max(1, Math.min(30, Math.round(Number(d.rep.interval)) || 1)), days: [], until: '' };
    var date = d.date;
    if (rep.freq !== 'none') {
      if (d.rep.until) { if (!isDate(d.rep.until) || d.rep.until < date) { T('La data finale è prima dell\'inizio'); return; } rep.until = d.rep.until; }
      if (rep.freq === 'weekly') {
        rep.days = d.rep.days.slice();
        if (!rep.days.length) rep.days = [wd(date)];
        if (rep.days.indexOf(wd(date)) < 0) { for (var i = 1; i < 8; i++) { if (rep.days.indexOf(wd(addD(date, i))) >= 0) { date = addD(date, i); break; } } }
      }
    } else rep = BLANKREP();
    var o = { type: d.type, title: d.title.trim(), clientId: d.clientId || '', date: date, allDay: !!d.allDay, start: d.allDay ? '' : d.start, end: d.allDay || d.type === 'rem' ? '' : d.end,
      rep: rep, reminders: d.reminders.slice().sort(function (a, b) { return a - b; }), location: d.location.trim(), notes: d.notes.trim(), color: d.color, ex: d.ex || [], doneDates: d.doneDates || [], updatedAt: Date.now() };
    var ev;
    if (d.id) { ev = getEv(d.id); if (!ev) return; Object.assign(ev, o); }
    else { ev = Object.assign({ id: uidc(), createdAt: today() }, o); events().push(ev); }
    P().save();
    C.sheet = null; C.draft = null; C.armed = null; C.ss = 0;
    C.date = date; C.sel = date;
    if (C.view === 'year') C.view = 'month';
    C.scrollHour = d.allDay ? null : Math.floor(toMin(d.start) / 60);
    P().toast('Salvato'); rerender();
  }

  function onFieldInput(e) {
    var t = e.target, f = t.form; if (!f || !f.hasAttribute('data-caform') || !C.draft) return;
    var d = C.draft, n = t.name;
    if (n === 'title') d.title = t.value;
    else if (n === 'clientId') d.clientId = t.value;
    else if (n === 'date') d.date = t.value;
    else if (n === 'allDay') { d.allDay = t.checked; syncEditor(); }
    else if (n === 'start') { d.start = t.value; if (isTime(t.value) && d.type === 'app' && (!isTime(d.end) || toMin(d.end) <= toMin(t.value))) { d.end = fromMin(Math.min(toMin(t.value) + 60, 1439)); var ee = f.elements.namedItem('end'); if (ee) ee.value = d.end; } }
    else if (n === 'end') d.end = t.value;
    else if (n === 'freq') { d.rep.freq = t.value; if (t.value === 'weekly' && !d.rep.days.length && isDate(d.date)) { d.rep.days = [wd(d.date)]; markDays(); } syncEditor(); }
    else if (n === 'interval') d.rep.interval = t.value;
    else if (n === 'until') d.rep.until = t.value;
    else if (n === 'location') d.location = t.value;
    else if (n === 'notes') d.notes = t.value;
  }
  function markDays() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ca=ewd]'), function (b) { var on = C.draft.rep.days.indexOf(Number(b.getAttribute('data-n'))) >= 0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-ca]');
    if (!t) {
      var col = e.target.closest('.col');
      if (col && !C.sheet && !C.drawer) {
        var y = e.clientY - col.getBoundingClientRect().top, m = Math.max(0, Math.min(1410, Math.floor(y / HOUR * 2) * 30));
        openNew(col.getAttribute('data-d'), m);
      }
      return;
    }
    var a = t.getAttribute('data-ca'), d = t.getAttribute('data-d');
    if (C.armed && a !== 'del1' && a !== 'delall') C.armed = null;

    if (a === 'drawer') { C.drawer = true; C.drawerAnim = true; C.mini = ymOf(C.date); rerender(); C.drawerAnim = false; }
    else if (a === 'closedrawer') { C.drawer = false; rerender(); }
    else if (a === 'prev') { step(-1); C.scrollReq = false; rerender(); }
    else if (a === 'next') { step(1); C.scrollReq = false; rerender(); }
    else if (a === 'today') { C.date = today(); C.sel = C.date; C.scrollReq = true; rerender(); }
    else if (a === 'goday') { C.date = d; C.sel = d; if (C.view !== 'day') C.view = 'day'; C.scrollReq = true; savePrefs(); rerender(); }
    else if (a === 'setview') { C.view = t.getAttribute('data-v'); C.drawer = false; C.scrollReq = true; if (C.view === 'month') C.sel = C.date; savePrefs(); rerender(); }
    else if (a === 'mday') { if (C.sel === d) { C.date = d; C.view = 'day'; C.scrollReq = true; savePrefs(); } else { C.sel = d; C.date = d; } rerender(); }
    else if (a === 'ymonth') { C.date = d; C.sel = d; C.view = 'month'; C.scrollReq = true; savePrefs(); rerender(); }
    else if (a === 'miniprev') { C.mini = P().addM(C.mini || ymOf(C.date), -1); rerender(); }
    else if (a === 'mininext') { C.mini = P().addM(C.mini || ymOf(C.date), 1); rerender(); }
    else if (a === 'minipick') { C.date = d; C.sel = d; C.drawer = false; if (C.view === 'year') C.view = 'month'; C.scrollReq = true; savePrefs(); rerender(); }
    else if (a === 'more') { C.agendaN += 30; C.scrollReq = false; rerender(); }
    else if (a === 'new') { var base = C.view === 'month' ? (C.sel || C.date) : C.date; openNew(base); }
    else if (a === 'openev') { C.sheet = { type: 'ev', id: t.getAttribute('data-id'), d: d }; C.ss = 0; C.armed = null; rerender(); }
    else if (a === 'openpay') { C.sheet = { type: 'pay', c: t.getAttribute('data-c'), p: t.getAttribute('data-p'), ym: t.getAttribute('data-ym') }; C.ss = 0; rerender(); }
    else if (a === 'closesheet') { C.sheet = null; C.draft = null; C.armed = null; C.ss = 0; rerender(); }
    else if (a === 'edit') { var ev = getEv(C.sheet.id); if (ev) { C.draft = copyEv(ev); C.sheet = { type: 'edit', id: ev.id, d: C.sheet.d }; C.ss = 0; rerender(); } }
    else if (a === 'etype') {
      C.draft.type = t.getAttribute('data-t');
      if (C.draft.type === 'rem') { C.draft.color = C.draft.color === COLORS[0][0] ? COLORS[1][0] : C.draft.color; C.draft.reminders = C.draft.reminders.length ? C.draft.reminders : [0]; }
      before(); rerender();
    }
    else if (a === 'ewd') {
      var n = Number(t.getAttribute('data-n')), j = C.draft.rep.days.indexOf(n);
      if (j >= 0) C.draft.rep.days.splice(j, 1); else C.draft.rep.days.push(n);
      markDays();
    }
    else if (a === 'ecolor') {
      C.draft.color = t.getAttribute('data-c');
      Array.prototype.forEach.call(document.querySelectorAll('[data-ca=ecolor]'), function (b) { var on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    }
    else if (a === 'done') {
      var ev2 = getEv(C.sheet.id), iso = C.sheet.d || ev2.date; ev2.doneDates = ev2.doneDates || [];
      var k = ev2.doneDates.indexOf(iso); if (k >= 0) ev2.doneDates.splice(k, 1); else ev2.doneDates.push(iso);
      ev2.updatedAt = Date.now(); P().save(); rerender();
    }
    else if (a === 'del1' || a === 'delall') {
      if (C.armed !== a) { C.armed = a; before(); rerender(); return; }
      var ev3 = getEv(C.sheet.id), iso3 = C.sheet.d || (ev3 && ev3.date);
      if (ev3) {
        if (a === 'delall') { P().db().events = events().filter(function (x) { return x.id !== ev3.id; }); }
        else { ev3.ex = ev3.ex || []; if (ev3.ex.indexOf(iso3) < 0) ev3.ex.push(iso3); ev3.updatedAt = Date.now(); }
        P().save();
      }
      C.sheet = null; C.armed = null; P().toast('Eliminato'); rerender();
    }
  });

  document.addEventListener('submit', function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute('data-caform')) { e.preventDefault(); saveDraft(); }
  });
  document.addEventListener('input', onFieldInput);
  document.addEventListener('change', function (e) {
    onFieldInput(e);
    var f = e.target.getAttribute && e.target.getAttribute('data-cafilter');
    if (f) { C.filt[f] = e.target.checked; savePrefs(); rerender(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[role=button][data-ca]')) e.target.click();
    if (e.key === 'Escape' && (C.sheet || C.drawer)) { C.sheet = null; C.draft = null; C.drawer = false; C.armed = null; rerender(); }
  });

  // Scorrimento orizzontale con il dito: giorno/settimana/mese precedente o successivo
  var tx = null, ty = null;
  document.addEventListener('touchstart', function (e) { if (e.touches.length === 1 && !C.sheet && !C.drawer && e.target.closest('.cbody')) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } else tx = null; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx === null) return; var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) { step(dx < 0 ? 1 : -1); C.scrollReq = false; rerender(); }
  }, { passive: true });

  window.PTCal = { view: view, after: after, before: before, state: C };
})();
