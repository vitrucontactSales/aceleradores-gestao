/* Processos de vendas (51–54): UMA fonte da verdade = datas cadastradas no Painel de Vendas.
   Ordem de leitura: parâmetros publicados no banco (portal_painel_dados) → datas salvas no painel deste navegador → padrão.
   Ano do processo = ano em que ele TERMINA (51 de 27/10/2026 a 22/03/2027 → "51.2027"). */
const Proc={
  COD:[51,52,53,54], DEF:{'51.2027':['2026-10-27','2027-03-22'],'52.2026':['2026-03-24','2026-06-01'],'53.2026':['2026-06-02','2026-08-17'],'54.2026':['2026-08-18','2026-10-26']}, C:[],
  async carregar(){
    let loc={},sh={};
    try{loc=JSON.parse(localStorage.getItem('vendas_ciclos_v2')||'{}')}catch(e){}
    try{const sb=await Dados.sb();const {data}=await sb.from('portal_painel_dados').select('valor').eq('chave','config').maybeSingle();sh=(data&&data.valor&&data.valor.ciclos)||{}}catch(e){}
    const D=/^\d{4}-\d{2}-\d{2}$/,ok=v=>Array.isArray(v)&&D.test(v[0])&&D.test(v[1])&&v[0]<=v[1];
    const all={},add=src=>Object.entries(src||{}).forEach(([k,v])=>{if(!ok(v))return;const id=/\./.test(k)?k:k+'.'+v[1].slice(0,4);if(!all[id])all[id]=v});
    add(sh);if(!Object.keys(all).length)add(loc);if(!Object.keys(all).length)add(this.DEF);   // lista dinâmica: cada processo = número.ano, cadastrada na Base de dados
    this.C=Object.entries(all).map(([id,v])=>({n:parseInt(id,10),id,ini:v[0],fim:v[1],ano:v[1].slice(0,4),rot:id})).sort((x,y)=>x.ini<y.ini?-1:1);
    return this.C},
  de(d){return this.C.find(c=>d>=c.ini&&d<=c.fim)||null},
  atual(){const h=hojeIso();return this.de(h)||this.C.filter(c=>c.ini<=h).pop()||this.C[0]||null},
  prefixo(c){return c?c.ano+c.n:''}   // início esperado do nº do candidato, ex.: 202751
};
