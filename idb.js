/* Cópia local (IndexedDB) do que foi importado neste computador; Atendimentos (telefone/CPF) só existem aqui, nunca vão ao banco. */
const IDB={_o(){return this._p||(this._p=new Promise((ok,er)=>{const r=indexedDB.open('painel',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>ok(r.result);r.onerror=()=>er(r.error)}))},
 async get(k){const d=await this._o();return new Promise((ok,er)=>{const q=d.transaction('k').objectStore('k').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>er(q.error)})},
 async set(k,v){const d=await this._o();return new Promise((ok,er)=>{const t=d.transaction('k','readwrite');t.objectStore('k').put(v,k);t.oncomplete=ok;t.onerror=()=>er(t.error)})}};
