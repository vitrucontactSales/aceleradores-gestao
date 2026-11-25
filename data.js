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
/* Edições de registros (admin/gestor): sobrepõe campos do registro e guarda histórico (quem, quando, antes→depois, justificativa). Só neste navegador, como Trat. */
const Edic={K:'proto_edic',
  todos(){try{return JSON.parse(localStorage.getItem(this.K))||{}}catch(e){return{}}},
  aplicar(r){const e=this.todos()[r.id];return e?{...r,...e.campos,editado:true}:r},
  hist(id){return(this.todos()[id]||{}).hist||[]},
  salvar(id,antes,novos,motivo,por){const t=this.todos(),e=t[id]||{campos:{},hist:[]};e.campos={...e.campos,...novos};e.hist.push({em:new Date().toISOString(),por,motivo,antes,depois:novos});t[id]=e;localStorage.setItem(this.K,JSON.stringify(t))}};
/* Comprovante de pagamento (boleto/Pix enviado pelo candidato). Protótipo: fica só neste navegador, como Trat/Edic.
   Imagem é reduzida (JPEG até 1200px); PDF até 350 KB. Em produção: bucket privado no Supabase Storage + Supabase Auth. */
const Comp={K:'proto_comp',
  todos(){try{return JSON.parse(localStorage.getItem(this.K))||{}}catch(e){return{}}},
  get(id){return this.todos()[id]||null},
  async ler(f){
    if(f.type==='application/pdf'){if(f.size>350e3)throw Error('PDF acima de 350 KB: envie como foto ou print.');return await new Promise((ok,er)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=er;r.readAsDataURL(f)})}
    if(!f.type.startsWith('image/'))throw Error('Envie uma imagem ou um PDF.');
    const b=await createImageBitmap(f),k=Math.min(1,1200/Math.max(b.width,b.height)),c=document.createElement('canvas');c.width=Math.round(b.width*k);c.height=Math.round(b.height*k);c.getContext('2d').drawImage(b,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.7)},
  salvar(id,url,por){const t=this.todos();t[id]={url,por,em:new Date().toISOString()};try{localStorage.setItem(this.K,JSON.stringify(t))}catch(e){throw Error('Sem espaço no navegador para guardar o comprovante (protótipo).')}}};
const Dados={
  async sb(){if(!window.supabase){await new Promise((ok,er)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=ok;s.onerror=er;document.head.appendChild(s)})}return this._sb||(this._sb=window.supabase.createClient(CFG.URL,CFG.KEY))},
  mat(){try{return JSON.parse(localStorage.getItem('proto_mat'))||[]}catch(e){return[]}},
  salvarMat(a){localStorage.setItem('proto_mat',JSON.stringify(a))},
  async base(fonte){ // fonte: 'real' | 'amostra'
    if(fonte==='real'){
      try{
        const sb=await this.sb(); let tudo=[],from=0;
        while(true){const {data,error}=await sb.from('aceleradores_matriculas').select('id,consultor,candidato,registrado_em,gestor,polo,tipo_curso,data_pagamento,link_conversa').ilike('tipo_curso','Gradua%').order('id').range(from,from+999);
          if(error) throw error; tudo=tudo.concat(data||[]); if(!data||data.length<1000) break; from+=1000}
        gestorAprender(tudo.map(r=>r.gestor));return {rows:tudo.map(r=>({...r,gestor:gestorNome(r.gestor)})).filter(r=>!gestorFora(r.gestor)),fonte:'real'};
      }catch(e){return {rows:window.SAMPLE.filter(r=>!gestorFora(r.gestor)),fonte:'amostra',aviso:'Banco real indisponível ('+(e.message||e)+'). Mostrando amostra local.'}}
    }
    return {rows:window.SAMPLE.filter(r=>!gestorFora(r.gestor)),fonte:'amostra'};
  }
};
