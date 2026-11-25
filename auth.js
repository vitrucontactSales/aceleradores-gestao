/* Auth real (Supabase Auth + tabela portal_perfis). Quem pode o quê é decidido pelo BANCO (RLS);
   o perfil guardado no navegador só serve para montar a tela. A chave abaixo é a pública (publishable). */
(function(){
const URL='https://wfequjtoutpqvfyjdrvo.supabase.co',KEY='sb_publishable_NYXnlMO9SZc4Sg3zxPCZtw_Uto0gecQ',SK='sb-'+URL.split('//')[1].split('.')[0]+'-auth-token',CK='portal_me',CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  PERFIS=['admin','gerente','gestor','supervisor','analista','consultor'],
  // perfil efetivo nas telas: supervisor=gestor (equipe própria), gerente=admin (sem criar admin), analista=admin só leitura (ro)
  EFET={supervisor:'gestor',gerente:'admin',analista:'admin'},
  GER={admin:['gerente','gestor','supervisor','analista','consultor'],gerente:['gestor','supervisor','analista','consultor'],gestor:['consultor'],supervisor:['consultor']};
const ler=k=>{try{return JSON.parse(localStorage.getItem(k))}catch(e){return null}};
let C;
const lib=()=>window.supabase?Promise.resolve():new Promise((ok,er)=>{const s=document.createElement('script');s.src=CDN;s.onload=ok;s.onerror=()=>er(new Error('Sem acesso ao Supabase.'));document.head.appendChild(s)});
const novo=o=>window.supabase.createClient(URL,KEY,o),cli=()=>C||(window.supabase?(C=novo({auth:{persistSession:true,autoRefreshToken:true}})):undefined);
const msg=e=>{const t=String(e&&e.message||e);return /Invalid login/i.test(t)?'E-mail ou senha incorretos.':/already registered/i.test(t)?'Este e-mail já está cadastrado.':/Password should/i.test(t)?'A senha precisa de pelo menos 8 caracteres.':/rate limit/i.test(t)?'Muitas tentativas. Aguarde alguns minutos.':t};
const limpo=(u,raw)=>u&&({id:u.id,email:u.email,nome:u.nome,perfil:raw?u.perfil:(EFET[u.perfil]||u.perfil),cargo:u.perfil,ro:u.perfil==='analista',status:u.status,perfil_solicitado:u.perfil_solicitado,criado_em:u.criado_em});
async function carregaPerfil(id){const {data,error}=await C.from('portal_perfis').select('id,email,nome,perfil,status,perfil_solicitado,criado_em').eq('id',id).maybeSingle();if(error)throw error;return data}
const limparCache=()=>{localStorage.removeItem(CK);try{sessionStorage.removeItem('dash_auth')}catch(e){}};
const Auth={
  get client(){return cli()},
  ready:(async()=>{
    try{await lib();cli();
      const {data:{session}}=await C.auth.getSession();
      if(!session){limparCache();return}
      const p=await carregaPerfil(session.user.id);
      if(!p||p.status!=='ativo'){limparCache();localStorage.removeItem(SK);return}
      localStorage.setItem(CK,JSON.stringify(p))}
    catch(e){console.warn('auth',e)} // offline: mantém o cache só para desenhar a tela; o banco continua barrando
  })(),
  async signUp({email,senha,nome,perfilSolicitado}){
    await this.ready; email=(email||'').trim().toLowerCase(); nome=(nome||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if(!nome) throw new Error('Informe o nome completo.');
    if((senha||'').length<8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
    // todo cadastro nasce consultor/pendente (trigger no banco); o perfil pedido é só um pedido
    const {error}=await C.auth.signUp({email,password:senha,options:{data:{nome,perfil_solicitado:PERFIS.includes(perfilSolicitado)?perfilSolicitado:null}}});
    if(error) throw new Error(msg(error));
    localStorage.removeItem(SK);try{await C.auth.signOut({scope:'local'})}catch(e){} limparCache(); return {pendente:true}
  },
  async signIn(email,senha){
    await this.ready;
    const {data,error}=await C.auth.signInWithPassword({email:(email||'').trim().toLowerCase(),password:senha||''});
    if(error) throw new Error(msg(error));
    const p=await carregaPerfil(data.user.id).catch(()=>null);
    if(!p||p.status!=='ativo'){const st=p&&p.status;await C.auth.signOut({scope:'local'});limparCache();
      throw new Error(st==='bloqueado'?'Acesso bloqueado. Fale com um administrador.':'Cadastro aguardando aprovação de um administrador.')}
    localStorage.setItem(CK,JSON.stringify(p));
    try{if(p.perfil!=='consultor')sessionStorage.setItem('dash_auth','1');else sessionStorage.removeItem('dash_auth');sessionStorage.setItem('painel_nome',p.nome)}catch(e){}
    return limpo(p)
  },
  signOut(){localStorage.removeItem(SK);limparCache();try{sessionStorage.removeItem('painel_nome')}catch(e){}if(C)C.auth.signOut({scope:'local'}).catch(()=>{})},
  // síncrono (cache do perfil): as páginas desenham a tela com ele; os dados em si só saem do banco com sessão válida
  current(){if(!localStorage.getItem(SK))return null;const p=ler(CK);return p&&p.status==='ativo'?limpo(p):null},
  // guarda de rota: sem sessão → login; perfil errado → início
  require(perfis){const u=this.current(); if(!u){location.replace('login.html');throw new Error('sem sessão')}
    if(perfis&&!perfis.includes(u.perfil)||u.ro&&!/(\/|index\.html|dashboard\.html|painel\.html|tratativas\.html)$/.test(location.pathname)){location.replace('index.html');throw new Error('sem permissão')} return u},
  // quem gerencia quem (o banco aplica a mesma regra em portal_set_user / portal_del_user)
  gerencia(me,alvo){return !!me&&(GER[me.cargo]||[]).includes(alvo)},
  async listUsers(){await this.ready;const me=this.current(); if(!me||me.ro||!['admin','gestor'].includes(me.perfil)) throw new Error('Sem permissão.');
    const {data,error}=await C.from('portal_perfis').select('id,email,nome,perfil,status,perfil_solicitado,criado_em').order('nome');if(error)throw new Error(msg(error));return data.map(u=>limpo(u,true))},
  async createUser({nome,email,senha,perfil}){await this.ready;const me=this.current(); if(!this.gerencia(me,perfil)) throw new Error('Seu perfil não pode cadastrar '+perfil+'.');
    email=(email||'').trim().toLowerCase(); nome=(nome||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.'); if(!nome) throw new Error('Informe o nome completo.');
    if((senha||'').length<8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
    const c2=novo({auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'portal_tmp'}}); // 2º cliente: não troca a sessão de quem está logado
    const {data,error}=await c2.auth.signUp({email,password:senha,options:{data:{nome,perfil_solicitado:perfil}}});
    if(error) throw new Error(msg(error)); if(!data.user||!(data.user.identities||[]).length) throw new Error('Este e-mail já está cadastrado.');
    const r=await C.rpc('portal_set_user',{p_id:data.user.id,p_perfil:perfil,p_status:'ativo',p_nome:nome}); if(r.error) throw new Error(msg(r.error))},
  async deleteUser(id){await this.ready;const r=await C.rpc('portal_del_user',{p_id:id}); if(r.error) throw new Error(msg(r.error))},
  async setUser(id,{perfil,status,nome}){await this.ready;const r=await C.rpc('portal_set_user',{p_id:id,p_perfil:perfil||null,p_status:status||null,p_nome:nome||null}); if(r.error) throw new Error(msg(r.error))}
};
window.Auth=Auth;
})();
