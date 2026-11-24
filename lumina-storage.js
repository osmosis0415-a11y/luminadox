(function(root,factory){ const api=factory(); if(typeof module==='object'&&module.exports) module.exports=api; else root.LuminaStorage=api; })(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DB_NAME='lumina_docs'; const DB_VERSION=1; const DOCS='documents'; const META='meta'; const OUTBOX='outbox';
  const request = req => new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  function openDb(indexedDBRef){ return new Promise((resolve,reject)=>{ const req=indexedDBRef.open(DB_NAME,DB_VERSION); req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS,{keyPath:'id'}); if(!db.objectStoreNames.contains(META)) db.createObjectStore(META); if(!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX,{keyPath:'id'}); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
  function mergeDocuments(localDocs,remoteDocs){ const byId=new Map(); for(const doc of [...(localDocs||[]),...(remoteDocs||[])]){ if(!doc?.id) continue; const old=byId.get(doc.id); if(!old||Number(doc.updatedAt||0)>Number(old.updatedAt||0)) byId.set(doc.id,doc); } return [...byId.values()].sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0)); }
  function create(options={}){
    const idb=options.indexedDB || (typeof indexedDB!=='undefined'?indexedDB:null); const fallback=options.localStorage || (typeof localStorage!=='undefined'?localStorage:null); const legacyKey=options.legacyKey||'lumina_docs_workspace_v1'; let dbPromise=null;
    const db=()=>{ if(!idb) return Promise.resolve(null); return dbPromise||(dbPromise=openDb(idb).catch(()=>null)); };
    async function load(){ const conn=await db(); if(conn){ const docs=await request(conn.transaction(DOCS,'readonly').objectStore(DOCS).getAll()); if(docs.length) return docs; } try{return JSON.parse(fallback?.getItem(legacyKey)||'[]')}catch{return[]} }
    async function saveAll(docs){ const conn=await db(); if(conn){ await new Promise((resolve,reject)=>{const tx=conn.transaction([DOCS,META],'readwrite'); const store=tx.objectStore(DOCS); store.clear(); (docs||[]).forEach(d=>store.put(d)); tx.objectStore(META).put(Date.now(),'lastSavedAt'); tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); try{fallback?.removeItem(legacyKey)}catch{} return 'indexeddb'; } try{fallback?.setItem(legacyKey,JSON.stringify(docs||[]));return 'localStorage'}catch{return 'memory'} }
    async function enqueue(op){ const conn=await db(); if(!conn) return false; await request(conn.transaction(OUTBOX,'readwrite').objectStore(OUTBOX).put({...op,id:op.id||`${op.type}:${op.docId||op.document?.id}:${Date.now()}`})); return true; }
    async function pending(){ const conn=await db(); return conn?request(conn.transaction(OUTBOX,'readonly').objectStore(OUTBOX).getAll()):[]; }
    async function acknowledge(id){ const conn=await db(); if(conn) await request(conn.transaction(OUTBOX,'readwrite').objectStore(OUTBOX).delete(id)); }
    return {load,saveAll,enqueue,pending,acknowledge};
  }
  return {create,mergeDocuments};
});
