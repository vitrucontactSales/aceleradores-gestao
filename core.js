/* Núcleo de cálculo (sem DOM): parse dos arquivos + consolidação. Testável em Node. */
const Core = (() => {
  const pad = n => String(n).padStart(2, '0');
  const mk = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const toT = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromT = t => { const x = new Date(t); return mk(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
  const addDays = (k, n) => fromT(toT(k) + n * 864e5);
  const dow = k => new Date(toT(k)).getUTCDay(); // 0 = domingo
  const serialToKey = n => fromT(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5);
  const ddmm = k => k.slice(8) + '/' + k.slice(5, 7);
  const isKey = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

  /* "Registrado Em": sufixo Z = UTC -> horário de Brasília (-3h); demais já são locais */
  function regToKey(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return serialToKey(v);
    if (v instanceof Date) return mk(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      if (/Z$/.test(s)) return fromT(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 3 * 36e5);
      return mk(m[1], m[2], m[3]);
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return mk(m[1], m[2], m[3]);
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return mk(m[3], m[2], m[1]);
    return null;
  }

  /* Acelerador em .txt (tab). Reconstrói registros quebrados em várias linhas (Observações com \n/\t). */
  function parseAceleradorTxt(text) {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\t/i;
    const recs = [];
    for (const l of text.replace(/\r/g, '').split('\n')) {
      if (UUID.test(l)) recs.push(l);
      else if (recs.length && l.trim()) recs[recs.length - 1] += ' ' + l;
    }
    const rows = []; let bad = 0;
    for (const r of recs) {
      const p = r.split('\t');
      if (p.length < 10) { bad++; continue; }
      rows.push({ consultor: p[1], reg: p[p.length - 3], gestor: (p[p.length - 1] || '').trim() });
    }
    return finishAcel(rows, bad);
  }
  /* Acelerador em .xlsx/.csv (linhas já como objetos por cabeçalho) */
  function parseAceleradorObjs(objs) {
    const rows = []; let bad = 0;
    for (const o of objs) {
      const c = o['CONSULTOR(A)'] ?? o['CONSULTOR'] ?? o['CONSULTOR (A)'];
      if (!c) { bad++; continue; }
      rows.push({ consultor: c, reg: o['REGISTRADO EM'], gestor: String(o['GESTOR'] ?? '').trim() });
    }
    return finishAcel(rows, bad);
  }
  function finishAcel(rows, bad) {
    const out = [];
    for (const r of rows) {
      const date = regToKey(r.reg);
      if (!date) { bad++; continue; }
      out.push({ chave: norm(r.consultor), date, gestor: r.gestor });
    }
    return { rows: out, bad };
  }

  /* Identificação pelo CONTEÚDO (colunas), nunca pelo nome do arquivo */
  const UUIDROW = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\t/i;
  const isAceleradorTxt = text => text.split('\n', 80).some(l => UUIDROW.test(l.replace(/^\uFEFF/, '')));
  function detectMatrix(mx) {
    for (let i = 0; i < Math.min(mx.length, 15); i++) {
      const H = (mx[i] || []).map(norm), has = s => H.some(x => x.startsWith(s));
      if (H.includes('PRIORIDADE') && has('IDENTIFICADOR') && has('TELEFONE') && has('NOME COMPLETO')) return { tipo: 'atend', h: i };
      if (H.includes('CANDIDATO') && H.includes('DATA INSCRICAO') && has('INSCRITO POR')) return { tipo: 'insc', h: i };
      if (H.includes('CANDIDATO') && has('QUALIFICADO') && has('MATRICULA')) return { tipo: 'topo', h: i };
      if (has('CONSULTOR') && has('REGISTRADO EM')) return { tipo: 'acel', h: i };
    }
    return null;
  }
  function matrixToObjs(mx, h) {
    const H = mx[h].map(norm);
    return mx.slice(h + 1).filter(r => r && r.some(v => v != null && v !== '')).map(r => { const o = {}; H.forEach((k, i) => { o[k] = r[i]; }); return o; });
  }

  const dateKey = d => { let k = null; if (typeof d === 'number') k = serialToKey(d); else if (typeof d === 'string') { const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) k = mk(m[3], m[2], m[1]); else k = regToKey(d); } else if (d instanceof Date) k = mk(d.getFullYear(), d.getMonth() + 1, d.getDate()); return k; };
  /* Inscritos (relatório de inscrições): uma linha por candidato; "Inscrito Por" = "<código> NOME", DIGITAL ou Não Registrado. CPF é descartado. */
  function parseInsc(mx, h) {
    const H = mx[h].map(norm), ic = H.indexOf('CANDIDATO'), id = H.indexOf('DATA INSCRICAO'), ip = H.findIndex(x => x.startsWith('INSCRITO POR')), seen = new Set(), rows = [];
    for (const r of mx.slice(h + 1)) {
      if (!r || r[ic] == null || r[ic] === '' || seen.has(String(r[ic]))) continue; seen.add(String(r[ic]));
      const d = dateKey(r[id]); if (!d) continue;
      const por = norm(String(r[ip] ?? '').replace(/^\s*\d+\s+/, '')); rows.push({ id: String(r[ic]), date: d, nome: por === 'NAO REGISTRADO' || por === '' ? 'NAO REGISTRADO' : por });
    }
    return rows;
  }
  /* Topo: matriz (array de arrays) lida do Excel com raw:true. CPF é descartado. */
  function parseTopoMatrix(mx) {
    let h = mx.findIndex(r => r && r.some(c => norm(c) === 'CANDIDATO'));
    if (h < 0) throw new Error('Cabeçalho do Topo não encontrado (coluna "Candidato").');
    const H = mx[h].map(norm);
    const col = f => H.findIndex(f);
    const ic = col(x => x === 'CANDIDATO'), inm = col(x => x.startsWith('NOME')), iq = col(x => x === 'QUALIFICADO'),
          im = col(x => x.startsWith('MATRICULA')), id = col(x => x.startsWith('DATA PAGO')), idq = col(x => x === 'DATA QUALIFICADO');
    if ([inm, iq, im, id].some(i => i < 0)) throw new Error('Colunas esperadas no Topo: Nome Usuário, Qualificado, Matrícula, Data Pago RA.');
    const rows = [];
    for (const r of mx.slice(h + 1)) {
      if (!r || r[ic] == null || r[ic] === '') continue; // pula linha de totais/vazias
      rows.push({ id: String(r[ic]), nome: norm(r[inm]), qual: Number(r[iq]) === 1, mat: Number(r[im]) === 1, date: dateKey(r[id]), dq: idq >= 0 ? dateKey(r[idq]) : null });
    }
    return { rows, temDq: idq >= 0 };
  }

  function summarize(rows, semCons) {
    const totals = { ac: 0, tp: 0, tot: 0, qual: 0, qp: 0, pot: 0, ativo: 0, meta: 0 };
    for (const r of rows) for (const k in totals) totals[k] += r[k];
    totals.falta = rows.reduce((a, r) => a + r.falta, 0); totals.pct = totals.meta ? totals.tot / totals.meta : null;
    totals.pctPot = totals.meta ? totals.pot / totals.meta : null; totals.faltaPot = rows.reduce((a, r) => a + r.faltaPot, 0);
    totals.foraDiasUteis = totals.tot - rows.reduce((a, r) => a + r.day.reduce((p, q) => p + q, 0), 0);
    totals.semCons = semCons;

    const G = new Map();
    for (const r of rows) {
      const g = r.gestor || '(Sem gestor)'; if (!G.has(g)) G.set(g, { gestor: g, tot: 0, ac: 0, tp: 0, qual: 0, qp: 0, ativos: 0, meta: 0 });
      const x = G.get(g); x.tot += r.tot; x.ac += r.ac; x.tp += r.tp; x.qual += r.qual; x.qp += r.qp; x.ativos += r.ativo; x.meta += r.meta;
    }
    const gestores = [...G.values()].map(g => ({ ...g, pct: g.meta ? g.tot / g.meta : null, falta: Math.max(0, g.meta - g.tot) })).sort((a, b) => b.tot - a.tot);
    return { totals, gestores };
  }
  /* Consolidação. P: {acel, topo, ini, fim, metaDia, feriados:[keys], ho, folga, semanaInicio(0-6), alias:{NOME:CHAVE}} */
  /* Listagem de atendimentos (leads a distribuir). CPF só serve para agrupar o mesmo aluno; nunca é copiado para a saída. */
  const dOnly = v => { if (v == null || v === '') return ''; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  const digits = v => v == null ? '' : String(v).replace(/\.0+$/, '').replace(/\D/g, '');
  function parseAtend(mx, h) {
    const rows = [];
    for (const o of matrixToObjs(mx, h)) {
      const id = o['IDENTIFICADOR']; if (id == null || id === '') continue;
      const cpf = digits(o['CPF']), tel = digits(o['TELEFONE']);
      rows.push({ id: String(id), prio: String(o['PRIORIDADE'] ?? '').trim() || '(sem prioridade)', nome: String(o['NOME COMPLETO'] ?? '').trim(), tel, email: String(o['E-MAIL'] ?? '').trim(),
        curso: String(o['CURSO'] ?? '').trim(), polo: String(o['POLO'] ?? '').trim(), dtUlt: dOnly(o['DT. ULT. ATENDIMENTO']), dtRet: dOnly(o['DT. RETORNO']), inter: Number(o['INTERACOES']) || 0,
        status: String(o['STATUS'] ?? '').trim(), origem: String(o['ORIGEM'] ?? '').trim(), resp: String(o['RESP. ULTIMO ATENDIMENTO'] ?? '').trim(), _g: cpf ? 'c' + cpf : tel ? 't' + tel : 'i' + id });
    }
    return rows;
  }
  /* Divide os leads por igual entre os consultores (dif. máx. = maior grupo de CPF). Cada prioridade também fica equilibrada.
     cons = [{chave, gestor}] -> Map(chave -> leads[]). Determinístico. */
  function distribuir(leads, cons, mesmoAluno) {
    const out = new Map(cons.map(c => [c.chave, []])); if (!cons.length) return out;
    const G = new Map(); leads.forEach((l, i) => { const k = mesmoAluno ? l._g : 'i' + i; (G.get(k) || G.set(k, []).get(k)).push(l); });
    const gs = [...G.values()].sort((a, b) => a[0].prio < b[0].prio ? -1 : a[0].prio > b[0].prio ? 1 : b.length - a.length);
    const tot = cons.map(() => 0), byP = cons.map(() => ({}));
    for (const g of gs) {
      const p = g[0].prio; let best = 0;
      for (let i = 1; i < cons.length; i++) if (tot[i] < tot[best] || (tot[i] === tot[best] && (byP[i][p] || 0) < (byP[best][p] || 0))) best = i;
      out.get(cons[best].chave).push(...g); tot[best] += g.length; byP[best][p] = (byP[best][p] || 0) + g.length;
    }
    return out;
  }

  /* Jornada: "NOME ; ENTRADA ; SAÍDA" (separador ; ou TAB, dá para colar do Excel). Map(NOME normalizado -> {ent, sai}) em HH:MM. */
  const equipe = j => !j ? '' : j.ent < '12:00' ? 'Manhã' : j.ent < '18:00' ? 'Tarde' : 'Noite';
  function parseJornada(txt) {
    const m = new Map(), hm = s => { const x = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})/); return x ? x[1].padStart(2, '0') + ':' + x[2] : ''; };
    for (const l of String(txt || '').split('\n')) { const p = l.split(/[;\t]/), k = norm(p[0]), ent = hm(p[1]), sai = hm(p[2]); if (k && ent && sai) m.set(k, { ent, sai }); }
    return m;
  }
  function compute(P) {
    const fer = new Set(P.feriados || []);
    const work = k => dow(k) !== 0 && !fer.has(k);
    const inP = k => k >= P.ini && k <= P.fim;
    const workDays = (a, b) => { let n = 0; for (let k = a; k <= b; k = addDays(k, 1)) if (work(k)) n++; return n; };
    const days = []; for (let k = P.ini; k <= P.fim; k = addDays(k, 1)) if (work(k)) days.push(k);

    const C = new Map();
    const get = k => { if (!C.has(k)) C.set(k, { chave: k, ac: new Map(), tp: new Map(), qual: 0, qp: new Map(), g: new Map() }); return C.get(k); };
    const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    for (const r of P.acel) { const c = get(r.chave); if (inP(r.date)) { inc(c.ac, r.date); if (r.gestor) inc(c.g, r.gestor); } if (r.gestor && (!c.last || r.date > c.last.d)) c.last = { d: r.date, g: r.gestor }; }
    let semConsAtivas = 0, semConsPend = 0;
    for (const r of P.topo) {
      const k = P.alias[r.nome] || r.nome;
      if (k === '-' || k === '') { if (r.mat && r.date && inP(r.date)) semConsAtivas++; if (r.qual && !r.mat) semConsPend++; continue; }
      const c = get(k);
      if (r.mat && r.date && inP(r.date)) inc(c.tp, r.date);
      if (r.qual && !r.mat) c.qual++;
      if (r.qual && r.dq && inP(r.dq)) inc(c.qp, r.dq); // qualificado no período (pela Data Qualificado), pago ou não
    }
    const J = P.jornada || new Map(); for (const k of J.keys()) get(k); // quem está na jornada existe mesmo sem nenhum dado
    const sum = (m, a, b) => { let n = 0; for (const [d, v] of m) if (d >= a && d <= b) n += v; return n; };
    const nDays = days.length, metaPer = nDays * P.metaDia;

    const rows = [];
    for (const c of C.values()) {
      const ac = sum(c.ac, P.ini, P.fim), tp = sum(c.tp, P.ini, P.fim), tot = ac + tp;
      const qp = sum(c.qp, P.ini, P.fim);
      const fg = (P.forcar && P.forcar.has(c.chave)) || J.has(c.chave);
      if (tot === 0 && c.qual === 0 && qp === 0 && !fg) continue;
      const ativo = tot > 0 ? 1 : 0, meta = ativo * metaPer;
      let gestor = ''; let best = 0; for (const [g, n] of c.g) if (n > best) { best = n; gestor = g; }
      if (!gestor && c.last) gestor = c.last.g; // sem venda no Acelerador no período: usa o gestor do registro mais recente dele
      rows.push({ chave: c.chave, gestor, ac, tp, tot, qual: c.qual, qp, pot: tot + c.qual, ativo, meta, j: J.get(c.chave) || null, eq: equipe(J.get(c.chave)), rost: J.has(c.chave), semDados: tot === 0 && c.qual === 0 && qp === 0,
        pct: meta ? tot / meta : null, falta: Math.max(0, meta - tot), pctPot: meta ? (tot + c.qual) / meta : null,
        faltaPot: Math.max(0, meta - tot - c.qual), _c: c });
    }
    rows.sort((a, b) => b.tot - a.tot || b.qual - a.qual || a.chave.localeCompare(b.chave));

    /* semanas (início configurável; padrão terça; domingo nunca conta) */
    let s = addDays(P.ini, -((dow(P.ini) - P.semanaInicio + 7) % 7));
    if (workDays(s < P.ini ? P.ini : s, addDays(s, 6)) === 0) s = addDays(s, 7);
    const weeks = [];
    for (; s <= P.fim && weeks.length < 8; s = addDays(s, 7)) {
      const a = s < P.ini ? P.ini : s, e = addDays(s, 6), b = e > P.fim ? P.fim : e;
      weeks.push({ ini: a, fim: b, wd: workDays(a, b) });
    }
    for (const r of rows) {
      r.weeks = weeks.map(w => {
        const ac = sum(r._c.ac, w.ini, w.fim), tp = sum(r._c.tp, w.ini, w.fim), qp = sum(r._c.qp, w.ini, w.fim), tot = ac + tp, meta = r.ativo * w.wd * P.metaDia;
        return { ac, tp, qp, tot, meta, pct: meta ? tot / meta : null, falta: Math.max(0, meta - tot),
          ho: r.ativo || r.rost ? (tot >= P.ho ? 0 : P.ho - tot) : null, fo: r.ativo || r.rost ? (tot >= P.folga ? 0 : P.folga - tot) : null };
      });
      r.day = days.map(d => (r._c.ac.get(d) || 0) + (r._c.tp.get(d) || 0));
    }
    const { totals, gestores } = summarize(rows, { vendas: semConsAtivas, qual: semConsPend });

    const acelNames = new Set(P.acel.map(r => r.chave));
    const un = new Map();
    for (const r of P.topo) { const k = P.alias[r.nome] || r.nome; if (k !== '-' && !acelNames.has(k)) un.set(k, (un.get(k) || 0) + 1); }
    const soTopo = [...un].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n);

    const vistos = new Set([...acelNames, ...P.topo.map(r => P.alias[r.nome] || r.nome)]), semArquivo = [...J.keys()].filter(k => !vistos.has(k)).sort();
    return { rows, totals, weeks, days, nDays, metaPer, gestores, soTopo, semArquivo };
  }
  /* Filtro por gestor e/ou consultor: recalcula totais e resumo por gestor só com as linhas visíveis */
  function view(res, fg, fc, hideNoG, fe) {
    const rows = res.rows.filter(r => (!hideNoG || r.gestor || r.rost) && (!fg || (r.gestor || '(Sem gestor)') === fg) && (!fc || r.chave === fc) && (!fe || r.eq === fe));
    const ex = hideNoG ? res.rows.filter(r => !r.gestor && !r.rost) : [];
    return { ...res, rows, ...summarize(rows, res.totals.semCons), excl: { n: ex.length, vendas: ex.reduce((a, r) => a + r.tot, 0), qual: ex.reduce((a, r) => a + r.qual, 0) } };
  }

  return { equipe, parseJornada, parseInsc, parseAtend, distribuir, detectMatrix, matrixToObjs, isAceleradorTxt, norm, regToKey, parseAceleradorTxt, parseAceleradorObjs, parseTopoMatrix, compute, view, addDays, dow, ddmm, isKey, mk, toT };
})();
if (typeof module !== 'undefined') module.exports = Core;
