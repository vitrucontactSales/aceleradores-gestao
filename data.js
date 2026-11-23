/* Fonte de dados: banco real (SOMENTE LEITURA, chave pública) com queda para amostra local.
   Registros novos/edições do protótipo ficam em localStorage e nunca vão ao banco. */
/* Tratativa (aprovação + CPF do aluno + matrícula): NÃO existe no banco real — no protótipo fica só neste navegador,
   separada da tabela de matrículas (mesmo desenho da tabela aceleradores_tratativas proposta em sql/acesso.sql). */
const Trat={K:'proto_trat',
  todos(){try{return JSON.parse(localStorage.getItem(this.K))||{}}catch(e){return{}}},
  set(id,patch){const t=this.todos();t[id]={...(t[id]||{}),...patch};localStorage.setItem(this.K,JSON.stringify(t))},
  cpfOk(c){c=String(c).replace(/\D/g,'');if(c.length!==11||/^(\d)\1{10}$/.test(c))return false;
    const d=n=>{let s=0;for(let i=0;i<n;i++)s+=c[i]*(n+1-i);return(s*10)%11%10};return d(9)==c[9]&&d(10)==c[10]},
  mask(c){c=String(c||'').replace(/\D/g,'').slice(0,11);return c.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')}};
const Dados={
  async sb(){if(!window.supabase){await new Promise((ok,er)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=ok;s.onerror=er;document.head.appendChild(s)})}return this._sb||(this._sb=window.supabase.createClient(CFG.URL,CFG.KEY))},
  mat(){try{return JSON.parse(localStorage.getItem('proto_mat'))||[]}catch(e){return[]}},
  salvarMat(a){localStorage.setItem('proto_mat',JSON.stringify(a))},
  async base(fonte){ // fonte: 'real' | 'amostra'
    if(fonte==='real'){
      try{
        const sb=await this.sb(); let tudo=[],from=0;
        while(true){const {data,error}=await sb.from('aceleradores_matriculas').select('id,consultor,candidato,registrado_em,gestor,polo,tipo_curso,data_pagamento,link_conversa').order('id').range(from,from+999);
          if(error) throw error; tudo=tudo.concat(data||[]); if(!data||data.length<1000) break; from+=1000}
        return {rows:tudo,fonte:'real'};
      }catch(e){return {rows:window.SAMPLE,fonte:'amostra',aviso:'Banco real indisponível ('+(e.message||e)+'). Mostrando amostra local.'}}
    }
    return {rows:window.SAMPLE,fonte:'amostra'};
  }
};
