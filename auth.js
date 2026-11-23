/* Auth do protótipo (mock em localStorage). A interface espelha o Supabase Auth + tabela perfis,
   para trocar o miolo depois sem mexer nas telas. NADA aqui chama o Supabase. */
(function(){
const K={u:'proto_users',s:'proto_sess'}, PERFIS=['admin','gestor','consultor'];
const ler=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const gravar=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
async function hash(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('proto:'+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function seed(){ // contas FICTÍCIAS de demonstração (só neste navegador)
  if(ler(K.u,null)) return;
  const mk=async(email,nome,perfil,senha)=>({id:crypto.randomUUID(),email,nome,perfil,status:'ativo',perfil_solicitado:perfil,senha:await hash(senha),criado_em:new Date().toISOString()});
  gravar(K.u,[await mk('admin@proto.local','Admin Demo','admin','Admin#demo1'),await mk('gestor@proto.local','Rafael Marcos Pereira','gestor','Gestor#demo1'),await mk('consultor@proto.local','Thayssa Victoria Da Silva Pereira','consultor','Consul#demo1')]);
}
const limpo=u=>u&&({id:u.id,email:u.email,nome:u.nome,perfil:u.perfil,status:u.status,perfil_solicitado:u.perfil_solicitado,criado_em:u.criado_em});
const Auth={
  ready:seed(),
  async signUp({email,senha,nome,perfilSolicitado}){
    await this.ready; email=(email||'').trim().toLowerCase(); nome=(nome||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
    if(!nome) throw new Error('Informe o nome completo.');
    if((senha||'').length<8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
    const us=ler(K.u,[]); if(us.some(u=>u.email===email)) throw new Error('Este e-mail já está cadastrado.');
    // regra do servidor: todo cadastro nasce consultor/pendente; o perfil pedido é só um pedido
    us.push({id:crypto.randomUUID(),email,nome,perfil:'consultor',status:'pendente',perfil_solicitado:PERFIS.includes(perfilSolicitado)?perfilSolicitado:null,senha:await hash(senha),criado_em:new Date().toISOString()});
    gravar(K.u,us); return {pendente:true};
  },
  async signIn(email,senha){
    await this.ready; email=(email||'').trim().toLowerCase();
    const u=ler(K.u,[]).find(x=>x.email===email);
    if(!u||u.senha!==await hash(senha)) throw new Error('E-mail ou senha incorretos.');
    if(u.status==='pendente') throw new Error('Cadastro aguardando aprovação de um administrador.');
    if(u.status==='bloqueado') throw new Error('Acesso bloqueado. Fale com um administrador.');
    gravar(K.s,{id:u.id}); try{ if(u.perfil!=='consultor') sessionStorage.setItem('dash_auth','1'); else sessionStorage.removeItem('dash_auth'); sessionStorage.setItem('painel_nome',u.nome);}catch(e){}
    return limpo(u);
  },
  signOut(){localStorage.removeItem(K.s);try{sessionStorage.removeItem('dash_auth')}catch(e){}},
  current(){const s=ler(K.s,null); if(!s) return null; const u=ler(K.u,[]).find(x=>x.id===s.id); return u&&u.status==='ativo'?limpo(u):null},
  // guarda de rota: sem sessão → login; perfil errado → início
  require(perfis){const u=this.current(); if(!u){location.replace('login.html');throw new Error('sem sessão')}
    if(perfis&&!perfis.includes(u.perfil)){location.replace('index.html');throw new Error('sem permissão')} return u},
  // administração (no Supabase: policies exigem perfil admin)
  // quem gerencia quem: admin → gestor e consultor; gestor → só consultor; consultor → ninguém (no Supabase: RLS/Edge Function com a mesma regra)
  gerencia(me,alvo){return !!me&&((me.perfil==='admin'&&alvo!=='admin')||(me.perfil==='gestor'&&alvo==='consultor'))},
  listUsers(){const me=this.current(); if(!me||!['admin','gestor'].includes(me.perfil)) throw new Error('Sem permissão.');
    return ler(K.u,[]).filter(u=>me.perfil==='admin'||(u.perfil==='consultor'&&u.status!=='pendente')).map(limpo)},
  async createUser({nome,email,senha,perfil}){const me=this.current(); if(!this.gerencia(me,perfil)) throw new Error('Seu perfil não pode cadastrar '+perfil+'.');
    email=(email||'').trim().toLowerCase(); nome=(nome||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.'); if(!nome) throw new Error('Informe o nome completo.');
    if((senha||'').length<8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
    const us=ler(K.u,[]); if(us.some(u=>u.email===email)) throw new Error('Este e-mail já está cadastrado.');
    us.push({id:crypto.randomUUID(),email,nome,perfil,status:'ativo',perfil_solicitado:perfil,senha:await hash(senha),criado_em:new Date().toISOString()}); gravar(K.u,us)},
  deleteUser(id){const me=this.current(),us=ler(K.u,[]),u=us.find(x=>x.id===id); if(!u) throw new Error('Usuário não encontrado.');
    if(id===me.id) throw new Error('Você não pode excluir a si mesmo.'); if(!this.gerencia(me,u.perfil)) throw new Error('Seu perfil não pode excluir '+u.perfil+'.');
    gravar(K.u,us.filter(x=>x.id!==id))},
  setUser(id,{perfil,status,nome}){const me=this.current(); if(!me||me.perfil!=='admin') throw new Error('Somente administrador.');
    const us=ler(K.u,[]),u=us.find(x=>x.id===id); if(!u) throw new Error('Usuário não encontrado.');
    if(id===me.id&&((perfil&&perfil!=='admin')||(status&&status!=='ativo'))) throw new Error('Você não pode remover o próprio acesso de administrador.');
    if(perfil&&PERFIS.includes(perfil)) u.perfil=perfil; if(status&&['pendente','ativo','bloqueado'].includes(status)) u.status=status; if(nome&&nome.trim()) u.nome=nome.trim();
    gravar(K.u,us)},
  reset(){localStorage.removeItem(K.u);localStorage.removeItem(K.s);localStorage.removeItem('proto_mat')}
};
window.Auth=Auth;
})();
