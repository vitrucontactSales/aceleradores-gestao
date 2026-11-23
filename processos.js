/* Processos de vendas (51–54): UMA fonte da verdade = datas cadastradas no Painel de Vendas.
   Ordem de leitura: parâmetros publicados no banco (painel_dados) → datas salvas no painel deste navegador → padrão.
   Ano do processo = ano em que ele TERMINA (51 de 27/10/2026 a 22/03/2027 → "51.2027"). */
const Proc={
  COD:[51,52,53,54], DEF:{51:['2026-10-27','2027-03-22']}, C:[],
  async carregar(){
    let loc={},sh={};
    try{loc=JSON.parse(localStorage.getItem('vendas_ciclos_v2')||'{}')}catch(e){}
    try{const sb=await Dados.sb();const {data}=await sb.from('painel_dados').select('valor').eq('chave','config').maybeSingle();sh=(data&&data.valor&&data.valor.ciclos)||{}}catch(e){}
    const D=/^\d{4}-\d{2}-\d{2}$/,ok=v=>Array.isArray(v)&&D.test(v[0])&&D.test(v[1])&&v[0]<=v[1];
    this.C=this.COD.map(n=>{const v=[sh[n],loc[n],this.DEF[n]].find(ok);return v?{n,ini:v[0],fim:v[1],ano:v[1].slice(0,4),rot:n+'.'+v[1].slice(0,4)}:null}).filter(Boolean);
    return this.C},
  de(d){return this.C.find(c=>d>=c.ini&&d<=c.fim)||null},
  atual(){const h=hojeIso();return this.de(h)||this.C.filter(c=>c.ini<=h).pop()||this.C[0]||null},
  prefixo(c){return c?c.ano+c.n:''}   // início esperado do nº do candidato, ex.: 202751
};
