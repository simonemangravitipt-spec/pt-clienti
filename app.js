(function () {
  'use strict';

  /* ================= Dati (salvati sul telefono, in localStorage) ================= */
  var KEY = 'ptapp.v1';
  var storageOk = true;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        d.clients = Array.isArray(d.clients) ? d.clients : [];
        delete d.events;
        d.meta = d.meta || {};
        return d;
      }
    } catch (e) { storageOk = false; }
    return { clients: [], meta: {} };
  }
  var db = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); storageOk = true; }
    catch (e) { storageOk = false; toast('Non riesco a salvare: il browser blocca la memoria. I dati andranno persi alla chiusura.'); }
  }

  /* ================= Utilità ================= */
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
  function eur(n) { return nf.format(n) + '€'; }
  function isoOf(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function todayISO() { return isoOf(new Date()); }
  function curYM() { return todayISO().slice(0, 7); }
  function pd(iso) { var p = iso.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function fmtD(iso) { if (!iso) return ''; var p = pd(iso); return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
  function addM(ym, n) { var p = ym.split('-').map(Number); var d = new Date(p[0], p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function lab(ym) { var p = ym.split('-').map(Number); return MESI[p[1] - 1] + ' ' + p[0]; }
  function labShort(ym) { var p = ym.split('-').map(Number); return MESI[p[1] - 1].slice(0, 3) + ' ' + String(p[0]).slice(2); }
  // Fine abbonamento = inizio + N mesi - 1 giorno (come EDATE di Excel)
  function endDate(iso, n) {
    var p = pd(iso); var last = new Date(p.y, p.m - 1 + n + 1, 0).getDate(); var d = Math.min(p.d, last);
    return isoOf(new Date(p.y, p.m - 1 + n, d - 1));
  }
  function addDaysISO(iso, n) { var p = pd(iso); return isoOf(new Date(p.y, p.m - 1, p.d + n)); }
  function daysSince(iso) { var p = pd(iso); var t = new Date(); return Math.floor((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(p.y, p.m - 1, p.d)) / 86400000); }
  function waNum(phone) {
    var d = String(phone || '').replace(/[^\d+]/g, '');
    if (d.charAt(0) === '+') d = d.slice(1); else if (d.indexOf('00') === 0) d = d.slice(2); else if (d.indexOf('39') !== 0) d = '39' + d;
    return d;
  }

  /* ================= Abbonamenti ================= */
  function sched(p) { var a = [], s = p.startDate.slice(0, 7); for (var i = 0; i < p.months; i++) a.push(addM(s, i)); return a; }
  function isPaid(p, ym) { return !!(p.paid && p.paid[ym]); }
  function planEnd(p) { return endDate(p.startDate, p.months); }
  function paidCount(p) { return sched(p).filter(function (ym) { return isPaid(p, ym); }).length; }
  function plansOf(c) { return (c.plans || []).slice().sort(function (a, b) { return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0; }); }
  function getClient(id) { return db.clients.filter(function (c) { return c.id === id; })[0]; }
  function getPlan(c, id) { return (c.plans || []).filter(function (p) { return p.id === id; })[0]; }

  // Rate non pagate la cui scadenza è già passata (insoluti)
  function lateItems() {
    var out = [];
    db.clients.forEach(function (c) {
      plansOf(c).forEach(function (p) {
        sched(p).forEach(function (ym) { if (isLate(p, ym)) out.push({ c: c, p: p, ym: ym, due: dueISO(p, ym), paid: false }); });
      });
    });
    out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.c.name.localeCompare(b.c.name); });
    return out;
  }
  // Clienti il cui ultimo abbonamento sta per finire o è finito, senza un abbonamento successivo
  function renewItems() {
    var out = [], now = curYM(), nxt = addM(now, 1), today = todayISO();
    db.clients.forEach(function (c) {
      var ps = plansOf(c); if (!ps.length) return;
      var lp = ps[ps.length - 1]; var s = sched(lp); var last = s[s.length - 1];
      var ended = planEnd(lp) < today;
      if (last === now || last === nxt || ended) out.push({ c: c, p: lp, ended: ended });
    });
    out.sort(function (a, b) { return planEnd(a.p) < planEnd(b.p) ? -1 : 1; });
    return out;
  }
  function statusOf(c) {
    var ps = plansOf(c);
    if (!ps.length) return { t: 'Senza abbonamento', cls: '' };
    var late = 0;
    ps.forEach(function (p) { sched(p).forEach(function (ym) { if (isLate(p, ym)) late++; }); });
    if (late) return { t: late === 1 ? '1 rata scaduta' : late + ' rate scadute', cls: 'late' };
    var lp = ps[ps.length - 1]; var s = sched(lp); var last = s[s.length - 1];
    if (planEnd(lp) < todayISO()) return { t: 'Da rinnovare', cls: 'warn' };
    if (last === curYM() || last === addM(curYM(), 1)) return { t: 'In scadenza', cls: 'warn' };
    if (lp.startDate > todayISO()) return { t: 'Parte il ' + fmtD(lp.startDate), cls: 'acc' };
    return { t: 'In corso', cls: 'ok' };
  }

  /* ================= Stato dell'interfaccia ================= */
  var S = { viewYM: null, search: '', form: null, armed: null, importData: null, keepForm: false };
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var viewEl = document.getElementById('view');
  var toastTimer = null;

  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function route() {
    var h = (location.hash || '').replace(/^#/, '') || 'calendario';
    var p = h.split('/');
    return { name: p[0], id: p[1], sub: p[2] };
  }

  /* ================= Scadenze delle rate ================= */
  function daysIn(ym) { var p = ym.split('-').map(Number); return new Date(p[0], p[1], 0).getDate(); }
  // Scadenza della rata del mese ym: il giorno scelto per l'abbonamento (o il giorno di inizio),
  // ridotto se il mese è più corto. Nel primo mese non può essere prima dell'inizio.
  function dueISO(p, ym) {
    var day = Number(p.dueDay) >= 1 ? Math.min(31, Number(p.dueDay)) : pd(p.startDate).d;
    var iso = ym + '-' + pad(Math.min(day, daysIn(ym)));
    if (ym === p.startDate.slice(0, 7) && iso < p.startDate) iso = p.startDate;
    return iso;
  }
  function isLate(p, ym) { return !isPaid(p, ym) && dueISO(p, ym) < todayISO(); }
  // 'ok' = incassato, 'late' = insoluto (scadenza passata), 'pend' = da incassare
  function payState(p, ym) { return isPaid(p, ym) ? 'ok' : (isLate(p, ym) ? 'late' : 'pend'); }
  var STLAB = { ok: 'incassato', late: 'insoluto', pend: 'da incassare' };
  function monthPays(ym) {
    var out = [];
    db.clients.forEach(function (c) { plansOf(c).forEach(function (p) { if (sched(p).indexOf(ym) >= 0) out.push({ c: c, p: p, ym: ym, due: dueISO(p, ym), paid: isPaid(p, ym) }); }); });
    out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.c.name.localeCompare(b.c.name); });
    return out;
  }

  /* ================= Schermata: Incassi ================= */
  function payRow(x, showMonth) {
    var idx = sched(x.p).indexOf(x.ym) + 1, paid = isPaid(x.p, x.ym), st = payState(x.p, x.ym), due = fmtD(dueISO(x.p, x.ym)).slice(0, 5);
    return '<li class="row' + (paid ? ' paid' : '') + (st === 'late' ? ' overdue' : '') + '">' +
      '<button type="button" class="chk" data-act="pay" data-c="' + x.c.id + '" data-p="' + x.p.id + '" data-ym="' + x.ym + '" aria-pressed="' + paid + '" aria-label="Pagato: ' + esc(x.c.name) + ', ' + lab(x.ym) + '">' + CHECK + '</button>' +
      '<div class="who"><b><i class="pdot ' + st + '" role="img" aria-label="' + STLAB[st] + '"></i><a href="#cliente/' + x.c.id + '/abb">' + esc(x.c.name) + '</a></b><span>' + (showMonth ? lab(x.ym) + ' · ' : '') + 'scadenza ' + due + ' · rata ' + idx + ' di ' + x.p.months + '</span></div>' +
      '<span class="amt num">' + eur(x.p.amount) + '</span></li>';
  }

  function vOggi() {
    var vym = S.viewYM || curYM(), t = todayISO();
    var rows = monthPays(vym);
    var expected = 0, got = 0, missing = 0;
    rows.forEach(function (x) { expected += x.p.amount; if (x.paid) got += x.p.amount; else missing++; });
    var pct = expected ? Math.round(got / expected * 100) : 0;
    var late = lateItems(), renew = renewItems();
    var todo = rows.filter(function (x) { return !x.paid && x.due >= t; });
    var done = rows.filter(function (x) { return x.paid; });

    var h = '<header class="top"><h1>Incassi</h1><div class="monthnav" role="group" aria-label="Mese visualizzato">' +
      '<button type="button" data-act="mprev" aria-label="Mese precedente">‹</button><span class="lbl">' + lab(vym) + '</span>' +
      '<button type="button" data-act="mnext" aria-label="Mese successivo">›</button></div></header>';
    if (vym !== curYM()) h += '<div><button type="button" class="btn sm" data-act="mnow">Torna a ' + lab(curYM()) + '</button></div>';

    if (db.clients.length && (!db.meta.lastBackup || daysSince(db.meta.lastBackup) > 30)) {
      h += '<div class="note">' + (db.meta.lastBackup ? 'Ultimo backup ' + daysSince(db.meta.lastBackup) + ' giorni fa. ' : 'Non hai ancora fatto un backup. ') +
        'I dati stanno solo su questo telefono: <a href="#impostazioni">scarica una copia</a>.</div>';
    }

    h += '<div class="summary"><div class="sumrow"><div><div class="lab">Incassato a ' + lab(vym) + '</div><div class="big num">' + eur(got) + ' <small>su ' + eur(expected) + '</small></div></div>' +
      '<div><div class="lab">Ancora da incassare</div><div class="big num">' + eur(expected - got) + ' <small>' + missing + (missing === 1 ? ' cliente' : ' clienti') + '</small></div></div></div>' +
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div></div>';

    if (late.length) {
      h += '<section class="late"><div class="sechead"><h2><i class="pdot late"></i> Insoluti</h2><span class="muted small">Scadenza passata, non ancora pagati</span></div><ul class="rows">' +
        late.map(function (x) { return payRow(x, true); }).join('') + '</ul></section>';
    }

    h += '<section><div class="sechead"><h2><i class="pdot pend"></i> Da incassare a ' + lab(vym) + '</h2><span class="muted small">Tocca il quadrato quando arriva il pagamento</span></div><ul class="rows">';
    if (!db.clients.length) h += '<li class="empty">Nessun cliente ancora. Vai su <a href="#clienti">Clienti</a> per aggiungere il primo.</li>';
    else if (!rows.length) h += '<li class="empty">Nessun pagamento previsto a ' + lab(vym) + '.</li>';
    else if (!todo.length) h += '<li class="empty">Niente da incassare con scadenza ancora da venire.</li>';
    else h += todo.map(function (x) { return payRow(x, false); }).join('');
    h += '</ul></section>';

    if (done.length) {
      h += '<section><div class="sechead"><h2><i class="pdot ok"></i> Incassati a ' + lab(vym) + '</h2><span class="muted small">Tocca di nuovo per togliere la spunta</span></div><ul class="rows">' +
        done.map(function (x) { return payRow(x, false); }).join('') + '</ul></section>';
    }

    if (renew.length) {
      h += '<section><div class="sechead"><h2>Da rinnovare</h2><span class="muted small">Abbonamenti in scadenza o finiti</span></div><ul class="rows">' +
        renew.map(function (x) {
          return '<li class="row link" role="button" tabindex="0" data-act="renew" data-c="' + x.c.id + '"><div class="who"><b>' + esc(x.c.name) + '</b><span>' + (x.ended ? 'Finito il ' : 'Finisce il ') + fmtD(planEnd(x.p)) + '</span></div><span class="badge ' + (x.ended ? 'warn' : 'acc') + '">Rinnova</span></li>';
        }).join('') + '</ul></section>';
    }
    return h;
  }

  /* ================= Schermata: Clienti ================= */
  function clientRows() {
    var q = S.search.trim().toLowerCase();
    var list = db.clients.filter(function (c) { return !q || (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) return '<li class="empty">' + (db.clients.length ? 'Nessun cliente corrisponde alla ricerca.' : 'Nessun cliente ancora. Usa “Nuovo cliente” per inserire il primo.') + '</li>';
    return list.map(function (c) {
      var st = statusOf(c); var ps = plansOf(c); var lp = ps[ps.length - 1];
      var sub = lp ? fmtD(lp.startDate) + ' → ' + fmtD(planEnd(lp)) + ' · ' + eur(lp.amount) + '/mese' : (c.phone || 'Nessun abbonamento');
      return '<li class="row link" role="link" tabindex="0" data-act="open" data-c="' + c.id + '"><div class="who"><b>' + esc(c.name) + '</b><span>' + esc(sub) + '</span></div><span class="badge ' + st.cls + '">' + esc(st.t) + '</span></li>';
    }).join('');
  }
  function vClienti() {
    if (S.form && S.form.type === 'client' && !S.form.id) return clientForm();
    return '<header class="top"><h1>Clienti</h1><button type="button" class="btn primary" data-act="newclient">Nuovo cliente</button></header>' +
      '<input type="search" id="q" placeholder="Cerca per nome o telefono" value="' + esc(S.search) + '" autocomplete="off" aria-label="Cerca cliente">' +
      '<ul class="rows" id="clist">' + clientRows() + '</ul>';
  }

  function clientForm() {
    var c = S.form.id ? getClient(S.form.id) : null; c = c || {};
    return '<a class="back" href="' + (c.id ? '#cliente/' + c.id + '/abb' : '#clienti') + '">‹ Annulla</a><h1>' + (c.id ? 'Modifica cliente' : 'Nuovo cliente') + '</h1>' +
      '<form class="f" data-form="client">' +
      '<label class="l full">Nome e cognome<input type="text" name="name" required maxlength="80" value="' + esc(c.name) + '" autocomplete="off"></label>' +
      '<label class="l">Telefono<input type="tel" name="phone" maxlength="30" value="' + esc(c.phone) + '"></label>' +
      '<label class="l">Email<input type="email" name="email" maxlength="80" value="' + esc(c.email) + '"></label>' +
      '<label class="l">Data di nascita<input type="date" name="birth" value="' + esc(c.birth) + '"></label>' +
      '<label class="l">Obiettivo<input type="text" name="goal" maxlength="120" value="' + esc(c.goal) + '"></label>' +
      '<label class="l full">Note<textarea name="notes" maxlength="1000">' + esc(c.notes) + '</textarea></label>' +
      '<div class="full formbtns"><button type="submit" class="btn primary">Salva cliente</button><a class="btn" href="' + (c.id ? '#cliente/' + c.id + '/abb' : '#clienti') + '">Annulla</a></div></form>';
  }

  /* ================= Schermata: scheda cliente ================= */
  function planForm(c) {
    var f = S.form; var p = f.planId ? getPlan(c, f.planId) : null; var d = p || f.defaults || {};
    return '<form class="f" data-form="plan">' +
      '<label class="l">Mesi di percorso<input type="number" name="months" min="1" max="36" step="1" required inputmode="numeric" value="' + esc(d.months) + '"></label>' +
      '<label class="l">Rata mensile (€)<input type="number" name="amount" min="0" step="5" required inputmode="decimal" value="' + esc(d.amount) + '"></label>' +
      '<label class="l">Data di inizio<input type="date" name="startDate" required value="' + esc(d.startDate || todayISO()) + '"></label>' +
      '<label class="l">Scade il giorno (facoltativo)<input type="number" name="dueDay" min="1" max="31" step="1" inputmode="numeric" placeholder="come l\'inizio" value="' + esc(d.dueDay) + '"></label>' +
      '<div class="full muted small" id="planpreview"></div>' +
      '<div class="full formbtns"><button type="submit" class="btn primary">' + (p ? 'Salva modifiche' : 'Salva abbonamento') + '</button><button type="button" class="btn" data-act="cancelform">Annulla</button></div></form>';
  }
  function planCard(c, p) {
    var s = sched(p), n = paidCount(p), arm = S.armed === 'delplan:' + p.id;
    var chips = s.map(function (ym) {
      var cls = 'chip'; if (isPaid(p, ym)) cls += ' paid'; else if (isLate(p, ym)) cls += ' late'; if (ym === curYM()) cls += ' now';
      return '<button type="button" class="' + cls + '" data-act="pay" data-c="' + c.id + '" data-p="' + p.id + '" data-ym="' + ym + '" aria-pressed="' + isPaid(p, ym) + '" aria-label="' + lab(ym) + ': ' + STLAB[payState(p, ym)] + '">' + labShort(ym) + '</button>';
    }).join('');
    return '<article class="card"><div class="head"><div><b class="num">' + eur(p.amount) + ' × ' + p.months + ' mesi = ' + eur(p.amount * p.months) + '</b>' +
      '<div class="muted small num">Dal ' + fmtD(p.startDate) + ' al ' + fmtD(planEnd(p)) + '</div><div class="muted small">Rata in scadenza il giorno ' + (Number(p.dueDay) >= 1 ? p.dueDay : pd(p.startDate).d) + ' di ogni mese</div></div>' +
      (n === p.months ? '<span class="badge ok">Saldato</span>' : '') + '</div>' +
      '<div class="muted small">Pagati ' + n + ' di ' + p.months + ' · incassato ' + eur(n * p.amount) + '</div><div class="chips">' + chips + '</div>' +
      '<div class="actions"><button type="button" class="btn sm" data-act="editplan" data-c="' + c.id + '" data-p="' + p.id + '">Modifica</button>' +
      '<button type="button" class="btn sm danger' + (arm ? ' armed' : '') + '" data-arm="1" data-act="delplan" data-c="' + c.id + '" data-p="' + p.id + '">' + (arm ? 'Conferma eliminazione' : 'Elimina') + '</button></div></article>';
  }

  var AN = [
    ['obiettivo', 'Obiettivo principale', 'area'],
    ['esperienza', 'Esperienza di allenamento', 'select', ['', 'Nessuna', 'Principiante', 'Intermedio', 'Avanzato']],
    ['frequenza', 'Giorni a settimana disponibili', 'select', ['', '1', '2', '3', '4', '5 o più']],
    ['lavoro', 'Lavoro e attività quotidiana', 'text'],
    ['infortuni', 'Infortuni, dolori o interventi', 'area'],
    ['patologie', 'Patologie o condizioni mediche', 'area'],
    ['farmaci', 'Farmaci', 'text'],
    ['sonno', 'Sonno (ore per notte)', 'text'],
    ['alimentazione', 'Alimentazione e abitudini', 'area'],
    ['certificato', 'Certificato medico valido fino al', 'date'],
    ['note', 'Altre note', 'area']
  ];
  function anamnesiHtml(c) {
    var a = c.anamnesi || {};
    var h = '<form class="f" data-form="anam" onsubmit="return false">';
    AN.forEach(function (f) {
      var key = f[0], v = a[key] || '';
      var full = f[2] === 'area' ? ' full' : '';
      if (f[2] === 'area') h += '<label class="l' + full + '">' + f[1] + '<textarea data-an="' + key + '">' + esc(v) + '</textarea></label>';
      else if (f[2] === 'select') h += '<label class="l">' + f[1] + '<select data-an="' + key + '">' + f[3].map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>';
      else h += '<label class="l">' + f[1] + '<input type="' + (f[2] === 'date' ? 'date' : 'text') + '" data-an="' + key + '" value="' + esc(v) + '"></label>';
    });
    h += '<label class="l check full"><input type="checkbox" data-an="consenso"' + (a.consenso ? ' checked' : '') + '> Ha firmato informativa privacy e consenso al trattamento dei dati sulla salute</label>' +
      '<div class="full muted small" id="consdate">' + (a.consensoData ? 'Consenso registrato il ' + fmtD(a.consensoData) + '.' : '') + ' Le risposte si salvano da sole.</div></form>';
    return h;
  }
  function diaryHtml(c) {
    var list = (c.diario || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); });
    var h = '<form class="f" data-form="diary"><label class="l full">Nuova nota<textarea name="text" id="dnew" maxlength="1000" placeholder="Com\'è andata la seduta, carichi, sensazioni…"></textarea></label>' +
      '<label class="l">Data<input type="date" name="date" value="' + todayISO() + '"></label><div class="formbtns" style="align-self:end"><button type="submit" class="btn primary">Aggiungi nota</button></div></form>';
    h += '<div class="diary">' + (list.length ? list.map(function (e) {
      var arm = S.armed === 'deldiary:' + e.id;
      return '<div class="entry"><div class="sechead"><b class="num small">' + fmtD(e.date) + '</b><button type="button" class="btn sm danger' + (arm ? ' armed' : '') + '" data-arm="1" data-act="deldiary" data-c="' + c.id + '" data-e="' + e.id + '">' + (arm ? 'Conferma' : 'Elimina') + '</button></div><p>' + esc(e.text) + '</p></div>';
    }).join('') : '<div class="empty">Nessuna nota. Qui puoi annotare sedute, progressi e promemoria su questo cliente.</div>') + '</div>';
    return h;
  }
  function vCliente(r) {
    var c = getClient(r.id);
    if (!c) return '<div class="empty">Cliente non trovato.</div><a class="btn" href="#clienti">Torna ai clienti</a>';
    if (S.form && S.form.type === 'client' && S.form.id === c.id) return clientForm();
    var sub = r.sub || 'abb', st = statusOf(c), arm = S.armed === 'delclient:' + c.id;
    var h = '<a class="back" href="#clienti">‹ Clienti</a><header class="top"><h1>' + esc(c.name) + '</h1><span class="badge ' + st.cls + '">' + esc(st.t) + '</span></header>';
    var kv = [];
    if (c.phone) kv.push(['Telefono', esc(c.phone)]);
    if (c.email) kv.push(['Email', esc(c.email)]);
    if (c.birth) kv.push(['Nato il', fmtD(c.birth)]);
    if (c.goal) kv.push(['Obiettivo', esc(c.goal)]);
    if (c.notes) kv.push(['Note', esc(c.notes)]);
    if (kv.length) h += '<dl class="kv">' + kv.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>';
    h += '<div class="actions">' + (c.phone ? '<a class="btn sm" href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">Chiama</a><a class="btn sm" href="https://wa.me/' + waNum(c.phone) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      '<button type="button" class="btn sm" data-act="editclient" data-c="' + c.id + '">Modifica dati</button>' +
      '<button type="button" class="btn sm danger' + (arm ? ' armed' : '') + '" data-arm="1" data-act="delclient" data-c="' + c.id + '">' + (arm ? 'Conferma eliminazione cliente' : 'Elimina cliente') + '</button></div>';
    h += '<nav class="seg" aria-label="Sezioni cliente">' + [['abb', 'Abbonamenti'], ['anam', 'Anamnesi'], ['diario', 'Diario']].map(function (t) {
      return '<a href="#cliente/' + c.id + '/' + t[0] + '"' + (sub === t[0] ? ' class="on"' : '') + '>' + t[1] + '</a>';
    }).join('') + '</nav>';
    if (sub === 'anam') h += anamnesiHtml(c);
    else if (sub === 'diario') h += diaryHtml(c);
    else {
      var ps = plansOf(c);
      if (S.form && S.form.type === 'plan') h += planForm(c);
      else h += '<div><button type="button" class="btn primary" data-act="newplan" data-c="' + c.id + '">' + (ps.length ? 'Rinnova / nuovo abbonamento' : 'Nuovo abbonamento') + '</button></div>';
      h += ps.length ? ps.slice().reverse().map(function (p) { return planCard(c, p); }).join('') : '<div class="empty">Nessun abbonamento. Aggiungine uno con mesi, rata e data di inizio.</div>';
    }
    return h;
  }

  /* ================= Schermata: Dati / Impostazioni ================= */
  function vImpost() {
    var n = db.clients.length, wipe = S.armed === 'wipe:';
    var h = '<h1>Dati e backup</h1>';
    if (!storageOk) h += '<div class="note">Il browser non permette di salvare i dati: quello che inserisci andrà perso alla chiusura. Apri l\'app dal browser normale (non in navigazione privata).</div>';
    h += '<div class="card"><b>' + n + (n === 1 ? ' cliente salvato' : ' clienti salvati') + '</b><div class="muted small">I dati restano solo su questo telefono. ' +
      (db.meta.lastBackup ? 'Ultimo backup: ' + fmtD(db.meta.lastBackup) + '.' : 'Non hai ancora fatto un backup.') + '</div></div>';
    h += '<section><h2>Backup</h2><div class="actions"><button type="button" class="btn primary" data-act="export">Scarica backup</button><button type="button" class="btn" data-act="copybackup">Copia backup negli appunti</button></div>' +
      '<p class="muted small" style="margin:0">Se cambi telefono o cancelli i dati del browser li perdi: fai un backup ogni tanto e conservalo su Drive, iCloud o via email.</p></section>';
    if (S.importData) {
      h += '<div class="card"><b>Il file contiene ' + S.importData.clients.length + ' clienti.</b><div class="muted small">Sostituirà tutti i dati attuali di questa app.</div>' +
        '<div class="actions"><button type="button" class="btn danger armed" data-act="importok">Sostituisci i dati</button><button type="button" class="btn" data-act="importno">Annulla</button></div></div>';
    } else {
      h += '<section><h2>Ripristina da backup</h2><label class="btn" for="impfile" style="cursor:pointer">Scegli il file di backup</label><input type="file" id="impfile" accept=".json,application/json" hidden></section>';
    }
    h += '<section><h2>Installazione</h2><p class="muted small" style="margin:0">iPhone: apri la pagina in Safari, tocca Condividi e scegli “Aggiungi alla schermata Home”. Android: dal menu di Chrome scegli “Installa app” o “Aggiungi a schermata Home”. Dopo la prima apertura funziona anche senza internet.</p></section>';
    h += '<section><h2>Zona delicata</h2><div><button type="button" class="btn danger' + (wipe ? ' armed' : '') + '" data-arm="1" data-act="wipe">' + (wipe ? 'Conferma: cancella tutto' : 'Cancella tutti i dati') + '</button></div></section>';
    return h;
  }

  /* ================= Disegno ================= */
  function render(top) {
    var r = route(); var y = top ? 0 : window.scrollY;
    if (r.name === 'calendario' && window.PTCal && window.PTCal.before) window.PTCal.before();
    document.body.classList.toggle('calmode', r.name === 'calendario');
    var tabs = document.querySelectorAll('.tabbar a');
    var active = r.name === 'cliente' ? 'clienti' : r.name;
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === active);
    var html;
    if (r.name === 'clienti') html = vClienti();
    else if (r.name === 'cliente') html = vCliente(r);
    else if (r.name === 'impostazioni') html = vImpost();
    else if (r.name === 'oggi') html = vOggi();
    else html = window.PTCal ? window.PTCal.view() : '';
    viewEl.innerHTML = html;
    updPlanPreview();
    window.scrollTo(0, y);
    if (r.name === 'calendario' && window.PTCal) window.PTCal.after(); else document.body.classList.remove('noscroll');
  }
  function updPlanPreview() {
    var f = viewEl.querySelector('form[data-form="plan"]'); var box = document.getElementById('planpreview');
    if (!f || !box) return;
    var fe = f.elements; var m = Number(fe.namedItem('months').value), a = Number(fe.namedItem('amount').value), s = fe.namedItem('startDate').value, t = '';
    if (m > 0 && a >= 0 && fe.namedItem('amount').value !== '') t = 'Totale ' + eur(m * a);
    if (m > 0 && s) t += (t ? ' · ' : '') + 'dal ' + fmtD(s) + ' al ' + fmtD(endDate(s, m)) + ' (un pagamento per ogni mese di calendario)';
    box.textContent = t;
  }

  /* ================= Azioni ================= */
  function disarm() { if (S.armed) { S.armed = null; return true; } return false; }

  function exportJson() {
    var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup-pt-clienti-' + todayISO() + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    db.meta.lastBackup = todayISO(); save(); render(); toast('Backup scaricato');
  }
  function copyBackup() {
    var txt = JSON.stringify(db);
    var done = function () { db.meta.lastBackup = todayISO(); save(); render(); toast('Backup copiato: incollalo in una nota o in una mail'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { toast('Copia non riuscita: usa “Scarica backup”'); });
    else toast('Copia non disponibile: usa “Scarica backup”');
  }
  function sanitize(obj) {
    if (!obj || !Array.isArray(obj.clients)) return null;
    var re = /^\d{4}-\d{2}-\d{2}$/;
    var clients = obj.clients.filter(function (c) { return c && typeof c.name === 'string' && c.name; }).map(function (c) {
      c.id = c.id || uid();
      c.plans = (Array.isArray(c.plans) ? c.plans : []).filter(function (p) { return p && re.test(p.startDate || '') && Number(p.months) > 0; })
        .map(function (p) { p.id = p.id || uid(); p.months = Number(p.months); p.amount = Number(p.amount) || 0; p.paid = p.paid || {}; p.dueDay = Number(p.dueDay) >= 1 && Number(p.dueDay) <= 31 ? Math.round(Number(p.dueDay)) : ''; return p; });
      c.anamnesi = c.anamnesi || {}; c.diario = Array.isArray(c.diario) ? c.diario : [];
      return c;
    });
    return { clients: clients, meta: obj.meta || {} };
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) { if (disarm()) render(); return; }
    var act = t.getAttribute('data-act'), cid = t.getAttribute('data-c'), pid = t.getAttribute('data-p');
    var c = cid ? getClient(cid) : null;
    var needsArm = t.hasAttribute('data-arm');
    if (needsArm) { var key = act + ':' + (pid || t.getAttribute('data-e') || cid || ''); if (S.armed !== key) { S.armed = key; render(); return; } S.armed = null; }
    else if (S.armed) S.armed = null;

    if (act === 'pay') {
      var p = c && getPlan(c, pid); if (!p) return;
      p.paid = p.paid || {}; p.paid[t.getAttribute('data-ym')] = !isPaid(p, t.getAttribute('data-ym'));
      save(); render();
    } else if (act === 'mprev') { S.viewYM = addM(S.viewYM || curYM(), -1); render(); }
    else if (act === 'mnext') { S.viewYM = addM(S.viewYM || curYM(), 1); render(); }
    else if (act === 'mnow') { S.viewYM = null; render(); }
    else if (act === 'open') { location.hash = '#cliente/' + cid + '/abb'; }
    else if (act === 'renew') {
      var ps = plansOf(c), lp = ps[ps.length - 1];
      var start = addDaysISO(planEnd(lp), 1); if (start < todayISO()) start = todayISO();
      S.form = { type: 'plan', planId: null, defaults: { months: lp.months, amount: lp.amount, startDate: start, dueDay: lp.dueDay } };
      var target = '#cliente/' + cid + '/abb';
      if (location.hash !== target) { S.keepForm = true; location.hash = target; } else render();
    }
    else if (act === 'newclient') { S.form = { type: 'client', id: null }; render(); }
    else if (act === 'editclient') { S.form = { type: 'client', id: cid }; render(); }
    else if (act === 'delclient') { db.clients = db.clients.filter(function (x) { return x.id !== cid; }); save(); location.hash = '#clienti'; render(); toast('Cliente eliminato'); }
    else if (act === 'newplan') {
      var pl = plansOf(c), last = pl[pl.length - 1], d = {};
      if (last) { d.months = last.months; d.amount = last.amount; d.dueDay = last.dueDay; var s2 = addDaysISO(planEnd(last), 1); d.startDate = s2 < todayISO() ? todayISO() : s2; }
      S.form = { type: 'plan', planId: null, defaults: d }; render();
    }
    else if (act === 'editplan') { S.form = { type: 'plan', planId: pid }; render(); }
    else if (act === 'delplan') { c.plans = c.plans.filter(function (x) { return x.id !== pid; }); save(); render(); toast('Abbonamento eliminato'); }
    else if (act === 'cancelform') { S.form = null; render(); }
    else if (act === 'deldiary') { var eid = t.getAttribute('data-e'); c.diario = c.diario.filter(function (x) { return x.id !== eid; }); save(); render(); }
    else if (act === 'export') exportJson();
    else if (act === 'copybackup') copyBackup();
    else if (act === 'importok') { db = S.importData; S.importData = null; save(); render(); toast('Dati ripristinati'); }
    else if (act === 'importno') { S.importData = null; render(); }
    else if (act === 'wipe') { db = { clients: [], meta: {} }; save(); render(); toast('Tutti i dati sono stati cancellati'); }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target; var kind = f.getAttribute('data-form'); if (!kind) return;
    e.preventDefault();
    var r = route();
    if (kind === 'client') {
      var el = f.elements; var name = el.namedItem('name').value.trim(); if (!name) return;
      var data = { name: name, phone: el.namedItem('phone').value.trim(), email: el.namedItem('email').value.trim(), birth: el.namedItem('birth').value, goal: el.namedItem('goal').value.trim(), notes: el.namedItem('notes').value.trim() };
      if (S.form && S.form.id) { Object.assign(getClient(S.form.id), data); S.form = null; save(); render(); toast('Salvato'); }
      else {
        var nc = Object.assign({ id: uid(), plans: [], anamnesi: {}, diario: [], createdAt: todayISO() }, data);
        db.clients.push(nc); S.form = null; save(); location.hash = '#cliente/' + nc.id + '/abb'; if (location.hash.indexOf(nc.id) < 0) render();
      }
    } else if (kind === 'plan') {
      var c = getClient(r.id); if (!c) return;
      var pe = f.elements; var months = Math.max(1, Math.min(36, Math.round(Number(pe.namedItem('months').value)))), amount = Number(pe.namedItem('amount').value), start = pe.namedItem('startDate').value;
      var dd = Math.round(Number(pe.namedItem('dueDay').value)); dd = dd >= 1 && dd <= 31 ? dd : '';
      if (!start || !(amount >= 0)) return;
      if (S.form && S.form.planId) { var p = getPlan(c, S.form.planId); p.months = months; p.amount = amount; p.startDate = start; p.dueDay = dd; }
      else c.plans.push({ id: uid(), months: months, amount: amount, startDate: start, dueDay: dd, paid: {} });
      S.form = null; save(); render(); toast('Abbonamento salvato');
    } else if (kind === 'diary') {
      var de = f.elements; var c2 = getClient(r.id); var text = de.namedItem('text').value.trim(); if (!c2 || !text) return;
      c2.diario.push({ id: uid(), date: de.namedItem('date').value || todayISO(), text: text }); save(); render();
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { S.search = t.value; var l = document.getElementById('clist'); if (l) l.innerHTML = clientRows(); return; }
    if (t.closest && t.closest('form[data-form="plan"]')) { updPlanPreview(); return; }
    var key = t.getAttribute && t.getAttribute('data-an');
    if (key) {
      var c = getClient(route().id); if (!c) return;
      c.anamnesi = c.anamnesi || {};
      if (t.type === 'checkbox') {
        c.anamnesi[key] = t.checked;
        if (key === 'consenso') { c.anamnesi.consensoData = t.checked ? todayISO() : ''; var cd = document.getElementById('consdate'); if (cd) cd.textContent = (t.checked ? 'Consenso registrato il ' + fmtD(todayISO()) + '.' : '') + ' Le risposte si salvano da sole.'; }
      } else c.anamnesi[key] = t.value;
      save();
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'impfile' && t.files && t.files[0]) {
      var rd = new FileReader();
      rd.onload = function () {
        try { var obj = sanitize(JSON.parse(rd.result)); if (!obj) throw new Error('formato'); S.importData = obj; render(); }
        catch (err) { toast('Il file non è un backup valido'); }
      };
      rd.readAsText(t.files[0]);
    } else if (t.getAttribute && t.getAttribute('data-an') && t.type !== 'checkbox') {
      // select e date: già salvati dall'evento input
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('li.row.link[data-act]')) e.target.click();
  });

  window.addEventListener('hashchange', function () {
    if (S.keepForm) S.keepForm = false; else S.form = null;
    S.armed = null; S.importData = null; render(true);
  });

  // Chiede al browser di non cancellare i dati in caso di poco spazio
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
  // Se l'app resta aperta oltre la mezzanotte, ridisegna quando torni sulla pagina
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !S.form) render(); });

  window.PT = {
    db: function () { return db; }, save: save, render: function () { render(); }, toast: toast,
    pd: pd, pad: pad, esc: esc, todayISO: todayISO, addDaysISO: addDaysISO, fmtD: fmtD, addM: addM, daysIn: daysIn, MESI: MESI,
    getClient: getClient, getPlan: getPlan, isPaid: isPaid, payRow: payRow, monthPays: monthPays, dueISO: dueISO, payState: payState, STLAB: STLAB
  };
  render();
})();
