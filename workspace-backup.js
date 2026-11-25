'use strict';

const WorkspaceBackup = (() => {
  const maxBytes = 256 * 1024 * 1024;
  const manifestLimit = 24 * 1024 * 1024;
  const format = 'lumina-workspace-v1';
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,180}$/.test(value);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);

  async function pack(Zip, documents, decks, records) {
    const zip = new Zip();
    const saved = [];
    let total = 0;
    for (const record of records) {
      if (record.kind === 'pdf' && record.file instanceof Blob) {
        total += record.file.size;
        if (total > maxBytes) throw new Error('This workspace exceeds the 256 MB backup limit.');
        const {file,...item} = record;
        const entry = 'pdf/' + saved.length + '.pdf';
        zip.file(entry, await file.arrayBuffer());
        saved.push({...item,entry});
      } else if (['meta','version'].includes(record.kind)) {
        saved.push(record);
      }
    }
    const manifest = JSON.stringify({format, exportedAt:Date.now(), documents,decks,records:saved});
    const manifestSize = new TextEncoder().encode(manifest).length;
    if (manifestSize > manifestLimit || total + manifestSize > maxBytes) throw new Error('This workspace exceeds the backup size limit.');
    zip.file('workspace.json',manifest);
    return zip.generateAsync({type:'uint8array',compression:'STORE'});
  }

  async function unpack(Zip, bytes, createId) {
    if (bytes.byteLength > maxBytes + 1024 * 1024) throw new Error('Choose a Lumina backup under 257 MB.');
    const zip = await Zip.loadAsync(bytes);
    const entries = Object.values(zip.files).filter(item => !item.dir);
    let total = 0;
    if (entries.length > 3001) throw new Error('This backup contains too many files.');
    for (const item of entries) {
      const size = item._data?.uncompressedSize;
      if (!Number.isSafeInteger(size) || size < 0 || (total += size) > maxBytes) throw new Error('This backup exceeds the unpacked size limit.');
    }
    const manifest = zip.file('workspace.json');
    if (!manifest || manifest._data.uncompressedSize > manifestLimit) throw new Error('The workspace manifest is missing or too large.');
    const data = JSON.parse(await manifest.async('string'));
    if (data?.format !== format || !['documents','decks','records'].every(key => Array.isArray(data[key])) ||
        data.documents.length + data.decks.length + data.records.length > 10000) throw new Error('This is not a supported Lumina workspace backup.');
    const maps = new Map();
    function addKey(old, fresh) {
      if (maps.has(old)) throw new Error('The backup has duplicate file IDs.');
      maps.set(old,fresh);
    }
    const documents = data.documents.map(item => {
      if (!object(item) || !validId(item.id) || typeof item.content !== 'string') throw new Error('The backup contains an invalid document.');
      const id = 'doc_' + createId();
      addKey('doc:' + item.id,'doc:' + id);
      return {...item,id,lastEditedByDevice:''};
    });
    const validDeck = deck => object(deck) && Array.isArray(deck.slides) && deck.slides.length > 0 && deck.slides.length <= 150;
    const decks = data.decks.map(item => {
      if (!object(item) || !validId(item.id) || !validDeck(item.deck)) throw new Error('The backup contains an invalid presentation.');
      const id = createId();
      addKey('slide:' + item.id,'slide:' + id);
      return {id,deck:item.deck};
    });
    const records = [];
    for (const item of data.records) {
      if (!object(item) || !validId(item.id)) throw new Error('The backup contains an invalid library entry.');
      if (item.kind !== 'pdf') continue;
      const entry = typeof item.entry === 'string' && /^pdf\/\d+\.pdf$/.test(item.entry) ? zip.file(item.entry) : null;
      if (!entry || entry._data.uncompressedSize > 50 * 1024 * 1024) throw new Error('A saved PDF is missing or too large.');
      const content = await entry.async('uint8array');
      if (!new TextDecoder().decode(content.subarray(0,1024)).includes('%PDF-')) throw new Error('A backup attachment is not a PDF.');
      const id = 'pdf:' + createId();
      addKey(item.id,id);
      records.push({id,kind:'pdf',title:String(item.title || 'Untitled.pdf').slice(0,300),updatedAt:Number(item.updatedAt)||0,file:new Blob([content],{type:'application/pdf'})});
    }
    const orphanVersions = new Map();
    for (const item of data.records) {
      let fileKey = maps.get(item.fileKey);
      if (item.kind === 'meta' && fileKey) {
        records.push({id:'meta:'+fileKey,kind:'meta',fileKey,folder:String(item.folder || '').slice(0,100),
          tags:Array.isArray(item.tags)?item.tags.slice(0,30).map(tag=>String(tag).slice(0,100)):[],favorite:item.favorite===true});
      }
      if (item.kind === 'version') {
        const docVersion = item.fileType === 'doc' && object(item.value) && typeof item.value.content === 'string';
        if (!docVersion && !(item.fileType === 'slide' && validDeck(item.value))) continue;
        if (!fileKey && validId(item.fileKey)) {
          fileKey = orphanVersions.get(item.fileKey);
          if (!fileKey) {
            const id = (docVersion?'doc_':'') + createId();
            fileKey = (docVersion?'doc:':'slide:') + id;
            orphanVersions.set(item.fileKey,fileKey);
            if (docVersion) documents.push({...item.value,id,lastEditedByDevice:''});
            else decks.push({id,deck:item.value});
          }
        }
        if (!fileKey || !fileKey.startsWith(item.fileType + ':')) continue;
        records.push({id:'version:'+createId(),kind:'version',fileKey,fileType:item.fileType,name:String(item.name || 'Checkpoint').slice(0,80),
          updatedAt:Number(item.updatedAt)||0,value:item.value});
      }
    }
    return {documents,decks,records};
  }

  async function restore(plan,{documents,library,storage}) {
    const written = [];
    let librarySaved = false;
    try {
      for (const {id,deck} of plan.decks) {
        const key = library.deckKey(id);
        if (storage.getItem(key) !== null) throw new Error('A restored deck ID already exists.');
        storage.setItem(key,JSON.stringify(deck));
        written.push(key);
      }
      if (plan.records.length) {
        await library.addMany(plan.records);
        librarySaved = true;
      }
      if (plan.documents.length) await documents.addCopies(plan.documents);
    } catch (error) {
      try {
        if (librarySaved) await library.removeMany(plan.records.map(item=>item.id));
        for (const key of written) storage.removeItem(key);
      } catch {
        throw new Error('Restore was interrupted. Some restored copies may still appear in Workspace.');
      }
      throw error;
    }
  }
  return {pack,unpack,restore};
})();

if (typeof module !== 'undefined') module.exports = WorkspaceBackup;
