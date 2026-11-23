/* cabeçalho/menus por perfil */
function topo(u,ativa){const L={admin:[['index.html','Início'],['formulario.html','Formulário'],['dashboard.html','Dashboard'],['painel.html','Painel de Vendas'],['base.html','Base de dados'],['tratativas.html','Aprovações'],['admin.html','Usuários']],
 gestor:[['index.html','Início'],['formulario.html','Formulário'],['dashboard.html','Dashboard'],['painel.html','Painel de Vendas'],['base.html','Base de dados'],['tratativas.html','Aprovações'],['admin.html','Consultores']],consultor:[['index.html','Início'],['formulario.html','Registrar matrícula']]}[u.perfil];
 document.body.insertAdjacentHTML('afterbegin',`<div class="proto">PROTÓTIPO — dados reais só para leitura · contas e novos registros ficam apenas neste navegador</div><header class="menu"><b>Portal Aceleradores</b>${L.map(([h,t])=>`<a href="${h}" class="${h===ativa?'on':''}">${t}</a>`).join('')}<span class="sp"></span><span class="mut">${u.nome}</span><span class="tag">${u.perfil}</span><a href="#" id="sair">Sair</a></header>`);
 document.getElementById('sair').onclick=e=>{e.preventDefault();Auth.signOut();location.href='login.html'}}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hojeIso=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const brD=s=>s?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'';
const CANDIDATO_OK=v=>/^20(2[6-9]|[3-9]\d)/.test(v);
/* mesmo gestor escrito de formas diferentes no banco -> um nome só (sempre o nome completo) */
const GESTOR_ALIAS={'Clayton Santos':'Clayton Eugenio Ramos dos Santos','Rafael Pereira':'Rafael Marcos Pereira','Jhonatan Dias':'Jhonatan Erik Ribeiro Dias'};
const gestorNome=n=>GESTOR_ALIAS[String(n||'').trim()]||n;
