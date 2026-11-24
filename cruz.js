/* Cruzamento Omnichat × Acelerador/Topo/Inscrições. Tudo roda no navegador; nada sai deste computador. */
(function (root) {
  const COLS = { id: 'chat_id', nome: 'customer_name', sob: 'customer_last_name', criado: 'created_at', contato: 'contacted_at', fim: 'finished_at',
        por: 'contacted_by', fin: 'finished_by', time: 'assigned_to_team_name', mot: 'closing_reason', orig: 'origin_token' };

  /* CSV incremental (aspas, \r\n). Aceita o arquivo do Omnichat, cuja linha de dados traz 1 campo a mais que o cabeçalho (o id). */
  function criarParser(onRow) {
        let f = [], c = '', q = false, pq = false;
    const fim = () => { f.push(c); c = ''; if (!(f.length === 1 && f[0] === '')) onRow(f); f = []; };
              return {
                push(s) {
                  let i = 0;
        if (pq) { pq = false; if (s[0] === '"') { c += '"'; i = 1; } else q = false; }
        for (; i < s.length; i++) {
          const ch = s[i];
          if (q) { if (ch === '"') { if (i + 1 < s.length) { if (s[i + 1] === '"') { c += '"'; i++; } else q = false; } else pq = true; } else c += ch; }
          else if (ch === '"') q = true;
          else if (ch === ',') { f.push(c); c = ''; }
                      else if (ch === '\n') fim();
          else if (ch !== '\r') c += ch;
        }
        },
      end() { if (c !== '' || f.length) fim(); }
        };
                      }

  function lerTexto(parser, texto) { parser.push(texto); parser.end(); }

  async function lerOmni(file, onProg) {
    const rows = [], T = new Map(), it = v => { let x = T.get(v); if (x === undefined) T.set(v, x = v); return x; }; let idx = null, nh = 0, lidos = 0;
    const p = criarParser(r => {
      if (!idx) { nh = r.length; idx = {}; r.forEach((n, i) => { idx[n.trim()] = i; }); return; }
      const g = k => { const i = idx[COLS[k]]; return i == null ? '' : (r[i] || ''); }; /* a linha de dados traz 1 campo extra no FIM; as colunas pelo nome continuam alinhadas */
              rows.push({ id: g('id'), nome: g('nome'), sob: g('sob'), contato: g('contato'), por: it(g('por')), time: it(g('time')), mot: it(g('mot')), orig: it(g('orig')) });
  });
    const rd = file.stream().pipeThrough(new TextDecoderStream('utf-8')).getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; if (lidos === 0 && value.charCodeAt(0) === 0xFEFF) p.push(value.slice(1)); else p.push(value); lidos += value.length; if (onProg) onProg(lidos); }
    p.end();
    return rows;
}

  const norm = n => String(n || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const dataOk = d => /^20(2[5-9]|3\d)-\d\d-\d\d$/.test(d || '') && !isNaN(Date.parse(d));
  const chatId = l => { const m = /chat\/([A-Za-z0-9]+)/.exec(l || ''); return m ? m[1] : ''; };
  const local = (ts, fuso) => { const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(ts || ''); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + fuso * 36e5); return { dia: d.toISOString().slice(0, 10), h: d.getUTCHours() }; };
  const difDias = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
  const mediana = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  function indexarNomes(lista) { const m = new Map(); for (const r of lista || []) { const k = norm(r.nome); if (k.split(' ').length < 2) continue; (m.get(k) || m.set(k, []).get(k)).push(r); } return m; }

  /* Regras (ver o texto na tela):
     R1 chat ↔ Acelerador pelo link_conversa; R2 "subiu" = 1º contato humano (contacted_at, convertido ao fuso);
     R3 Topo/Inscrições por nome completo normalizado, só se único; R4 pagamento = menor data válida entre Acelerador e Topo (date);
     R5 classe: antes / mesmo dia / depois / sem pagamento; R6 já inscrito = inscrição anterior ao dia do contato. */
  function cruzar({ chats, acel, topo, insc, fuso }) {
    const aMap = new Map(); let acelInvalidas = 0;
    for (const a of acel || []) { const id = chatId(a.link_conversa); if (!id) continue; if (!dataOk(a.data_pagamento)) { acelInvalidas++; continue; } const p = aMap.get(id); if (!p || a.data_pagamento < p) aMap.set(id, a.data_pagamento); }
          const tMap = indexarNomes(topo), iMap = indexarNomes(insc);
    const out = []; let ambig = 0;
    for (const c of chats) {
            const lc = local(c.contato, fuso); if (!lc) continue;
      const k = norm(c.nome + ' ' + c.sob), nomeOk = k.split(' ').length >= 2;
      let pagA = aMap.get(c.id) || null, pagT = null, ins = null, tState = 'sem nome', dq = null;
      if (nomeOk) {
        const t = tMap.get(k), i = iMap.get(k);
        if (t) { if (t.length === 1) { tState = 'ok'; if (dataOk(t[0].date)) pagT = t[0].date; if (dataOk(t[0].dq)) dq = t[0].dq; } else { tState = 'ambíguo'; ambig++; } } else tState = 'sem match';
        if (i && i.length === 1 && dataOk(i[0].date)) ins = i[0].date;
      }
      const pag = pagA && pagT ? (pagA < pagT ? pagA : pagT) : (pagA || pagT);
      const fonte = pagA && pagT ? 'Acelerador+Topo' : pagA ? 'Acelerador' : pagT ? 'Topo' : '';
      let classe = 'sem', lag = null;
      if (pag) { lag = difDias(pag, lc.dia); classe = lag < 0 ? 'antes' : lag === 0 ? 'mesmo' : 'depois'; }
      out.push({ id: c.id, por: c.por || '(sem consultor)', time: c.time || '(sem time)', orig: c.orig, mot: c.mot, ref: lc.dia, h: lc.h, pag, fonte, classe, lag, insc: ins, inscAntes: !!(ins && ins < lc.dia), dq, tState, nome: c.nome, sob: c.sob });
                  }
    return { rows: out, acelInvalidas, ambig, acelComLink: aMap.size };
}

  const CL = ['antes', 'mesmo', 'depois', 'sem'];
  function resumo(rows, chave) {
        const m = new Map();
    for (const r of rows) { const k = typeof chave === 'function' ? chave(r) : r[chave]; let g = m.get(k); if (!g) m.set(k, g = { k, n: 0, antes: 0, mesmo: 0, depois: 0, sem: 0, lags: [], inscAntes: 0 }); g.n++; g[r.classe]++; if (r.classe === 'depois') g.lags.push(r.lag); if (r.inscAntes) g.inscAntes++; }
    return [...m.values()].map(g => ({ ...g, medLag: mediana(g.lags), pagos: g.antes + g.mesmo + g.depois })).sort((a, b) => b.n - a.n);
    }
  function csvExport(rows) {
    const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const H = ['chat_id', 'consultor', 'time', 'origem', 'motivo_finalizacao', 'data_contato', 'hora_contato', 'data_pagamento', 'fonte_pagamento', 'classe', 'dias_pagamento_menos_contato', 'data_inscricao', 'situacao_topo', 'data_qualificacao'];
    const L = { antes: 'ja_pago_ao_subir', mesmo: 'mesmo_dia', depois: 'pago_depois', sem: 'sem_pagamento' };
    return String.fromCharCode(0xFEFF) + [H.join(','), ...rows.map(r => [r.id, r.por, r.time, r.orig, r.mot, r.ref, r.h, r.pag, r.fonte, L[r.classe], r.lag, r.insc, r.tState, r.dq].map(q).join(','))].join('\r\n');
  }

  const API = { criarParser, lerTexto, lerOmni, norm, dataOk, chatId, local, cruzar, resumo, csvExport, CL };
  if (typeof module !== 'undefined') module.exports = API; else root.Cruz = API;
                      })(typeof window !== 'undefined' ? window : globalThis);
