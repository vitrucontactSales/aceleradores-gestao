/* Fonte de dados: tabelas protegidas portal_* (Supabase) com a sessão de quem está logado; o banco (RLS) decide o que cada perfil vê e altera. */
const dbe=e=>{if(e)throw new Error(e.message||String(e))};
const meId=()=>(Auth.current()||{}).id;
/* Tratativa (aprovação + CPF do aluno + matrícula): portal_tratativas. Cache em memória; set() atualiza a tela na hora e grava em fila (erro → Trat.onerr). */
const Trat={C:{},q:Promise.resolve(),onerr:null,
  async load(){const sb=await Dados.sb();this.C={};for(let o=0;;o+=1000){const{data,error}=await sb.from('portal_tratativas').select('matricula_id,cpf_aluno,matricula_aluno,status,motivo,decidido_por_nome,decidido_em').order('matricula_id').range(o,o+999);dbe(error);
    data.forEach(x=>this.C[x.matricula_id]={cpf:x.cpf_aluno||'',matricula:x.matricula_aluno||'',status:x.status,motivo:x.motivo||'',por:x.decidido_por_nome||'',em:x.decidido_em||''});if(data.length<1000)break}},
  todos(){return this.C},
  set(id,p){this.C[id]={...(this.C[id]||{}),...p};const r={matricula_id:id};
    if('cpf' in p)r.cpf_aluno=p.cpf;if('matricula' in p)r.matricula_aluno=p.matricula;if('motivo' in p)r.motivo=p.motivo;
    if('status' in p){r.status=p.status;r.decidido_por=meId();r.decidido_por_nome=p.por||null;r.decidido_em=p.em||null}
    this.q=this.q.then(async()=>{const sb=await Dados.sb();dbe((await sb.from('portal_tratativas').upsert(r,{onConflict:'matricula_id'})).error)}).catch(e=>{if(this.onerr)this.onerr('Não foi possível gravar no banco: '+e.message)})},
  cpfOk(c){c=String(c).replace(/\D/g,'');if(c.length!==11||/^(\d)\1{10}$/.test(c))return false;
    const d=n=>{let s=0;for(let i=0;i<n;i++)s+=c[i]*(n+1-i);return(s*10)%11%10};return d(9)==c[9]&&d(10)==c[10]},
  mask(c){c=String(c||'').replace(/\D/g,'').slice(0,11);return c.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')}};
/* Edições (admin/gerente/gestor/supervisor): altera o registro em portal_matriculas e guarda o histórico em portal_matriculas_hist (quem, quando, antes→depois, justificativa). */
const Edic={H:{},
  async load(){const sb=await Dados.sb();this.H={};for(let o=0;;o+=1000){const{data,error}=await sb.from('portal_matriculas_hist').select('matricula_id,em,por_nome,motivo,antes,depois').order('id').range(o,o+999);dbe(error);
    data.forEach(h=>(this.H[h.matricula_id]=this.H[h.matricula_id]||[]).push({em:h.em,por:h.por_nome,motivo:h.motivo,antes:h.antes,depois:h.depois}));if(data.length<1000)break}},
  aplicar(r){return this.H[r.id]?{...r,editado:true}:r},
  hist(id){return this.H[id]||[]},
  async salvar(id,antes,novos,motivo,por){const sb=await Dados.sb(),u={...novos};if('data_pagamento' in u&&!u.data_pagamento)u.data_pagamento=null;
    const a=await sb.from('portal_matriculas').update(u).eq('id',id).select('id');dbe(a.error);if(!a.data.length)throw new Error('Sem permissão para alterar este registro.');
    dbe((await sb.from('portal_matriculas_hist').insert({matricula_id:id,por_nome:por,motivo:motivo||null,antes,depois:novos})).error);
    (this.H[id]=this.H[id]||[]).push({em:new Date().toISOString(),por,motivo,antes,depois:novos})}};
/* Comprovante de pagamento anexado à mão: arquivo no bucket privado "comprovantes" + linha em aceleradores_comprovantes (a mesma tabela do Omnichat).
   Imagem é reduzida (JPEG até 1200px); PDF até 350 KB. */
const Comp={
  get(){return null},
  async ler(f){
    if(f.type==='application/pdf'){if(f.size>350e3)throw Error('PDF acima de 350 KB: envie como foto ou print.');return f}
    if(!f.type.startsWith('image/'))throw Error('Envie uma imagem ou um PDF.');
    const b=await createImageBitmap(f),k=Math.min(1,1200/Math.max(b.width,b.height)),c=document.createElement('canvas');c.width=Math.round(b.width*k);c.height=Math.round(b.height*k);c.getContext('2d').drawImage(b,0,0,c.width,c.height);
    return await new Promise(ok=>c.toBlob(ok,'image/jpeg',.7))},
  async salvar(id,blob,por){const sb=await Dados.sb(),pdf=blob.type==='application/pdf',path='manual/'+id+'/'+Date.now()+(pdf?'.pdf':'.jpg');
    dbe((await sb.storage.from('comprovantes').upload(path,blob,{contentType:blob.type})).error);
    const r=await sb.from('aceleradores_comprovantes').insert({registro_id:id,arquivo_nome:'manual · '+por,mime:blob.type,tamanho:blob.size,storage_path:path,atendente_omni:null}).select('registro_id,arquivo_nome,mime,storage_path,atendente_omni').single();dbe(r.error);return r.data}};
const Dados={
  async sb(){await Auth.ready;if(!Auth.client)throw new Error('Sem conexão com o Supabase.');return Auth.client},
  async lista(){const sb=await this.sb(),{data,error}=await sb.from('portal_matriculas').select('id,consultor,candidato,data_pagamento,polo,tipo_curso').is('excluido_em',null).order('registrado_em',{ascending:false}).limit(300);dbe(error);return data},
  async renomear(id,c){const sb=await this.sb(),a=await sb.from('portal_matriculas').update({candidato:c}).eq('id',id).select('id');dbe(a.error);if(!a.data.length)throw new Error('Sem permissão.')},
  async existe(c){const sb=await this.sb(),{data,error}=await sb.from('portal_matriculas').select('id').eq('candidato',c).is('excluido_em',null).limit(1);dbe(error);return data.length>0},
  async inserir(r,cpf){const sb=await this.sb(),a=await sb.from('portal_matriculas').insert(r).select('id').single();dbe(a.error);
    if(cpf){const t=await sb.from('portal_tratativas').insert({matricula_id:a.data.id,cpf_aluno:cpf});if(t.error)throw new Error('Matrícula registrada, mas o CPF não foi gravado: '+t.error.message)}return a.data.id},
  async equipe(){const sb=await this.sb(),a=await sb.rpc('portal_equipe'),g=await sb.rpc('portal_gestores');dbe(a.error);dbe(g.error);return{pares:a.data,gestores:g.data}},
  async excluir(id){const sb=await this.sb(),a=await sb.from('portal_matriculas').update({excluido_em:new Date().toISOString()}).eq('id',id).select('id');dbe(a.error);if(!a.data.length)throw new Error('Sem permissão.')},
  async base(fonte){ // fonte: 'real' | 'amostra'
    if(fonte==='real'){
      try{
        const sb=await this.sb(); let tudo=[],from=0;
        while(true){const {data,error}=await sb.from('portal_matriculas').select('id,consultor,candidato,registrado_em,gestor,polo,tipo_curso,data_pagamento,link_conversa').is('excluido_em',null).ilike('tipo_curso','Gradua%').order('id').range(from,from+999);
          if(error) throw error; tudo=tudo.concat(data||[]); if(!data||data.length<1000) break; from+=1000}
        gestorAprender(tudo.map(r=>r.gestor));return {rows:tudo.map(r=>({...r,gestor:gestorNome(r.gestor)})).filter(r=>!gestorFora(r.gestor)),fonte:'real'};
      }catch(e){return {rows:[],fonte:'real',aviso:'Não foi possível ler o banco ('+(e.message||e)+'). Entre novamente ou fale com um administrador.'}}
    }
    return {rows:[],fonte:'real'};
  }
};
