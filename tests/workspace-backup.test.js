const test = require('node:test');
const assert = require('node:assert/strict');
const Zip = require('../vendor/jszip-3.10.1.min.js');
const { pack, unpack, restore } = require('../workspace-backup.js');

test('backup round trip restores new file IDs, PDFs, tags and checkpoints', async () => {
  const original = { id:'doc_old',title:'Thesis',content:'<h1>Thesis</h1>' };
  const pdf = { id:'pdf:original',kind:'pdf',title:'Proof.pdf',file:new Blob(['%PDF-1.7\nSample']) };
  const bytes = await pack(Zip,[original],[{id:'original',deck:{title:'Defense',slides:[{}]}}],[
    pdf,{id:'meta:pdf:original',kind:'meta',fileKey:pdf.id,tags:['Proof'],favorite:true},
    {id:'version:1',kind:'version',fileKey:'doc:doc_old',fileType:'doc',name:'Draft',value:original}
  ]);
  let n=0;
  const result = await unpack(Zip,bytes,()=>String(++n));
  assert.equal(result.documents[0].id,'doc_1');
  assert.equal(result.decks[0].id,'2');
  assert.equal(await result.records.find(item=>item.kind==='pdf').file.text(),'%PDF-1.7\nSample');
  assert.equal(result.records.find(item=>item.kind==='meta').fileKey,'pdf:3');
  assert.equal(result.records.find(item=>item.kind==='version').fileKey,'doc:doc_1');
});

test('failed restore removes the newly written copies', async () => {
  const saved = new Map([['existing','original']]);
  const storage = {getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  let removed;
  const library = {deckKey:id=>id,addMany:async()=>{},removeMany:async ids=>{removed=ids}};
  await assert.rejects(restore({documents:[{}],decks:[{id:'fresh',deck:{}}],records:[{id:'pdf:new'}]},
    {storage,library,documents:{addCopies:async()=>{throw new Error('quota')}}}),/quota/);
  assert.deepEqual([...saved],[['existing','original']]);
  assert.deepEqual(removed,['pdf:new']);
});
