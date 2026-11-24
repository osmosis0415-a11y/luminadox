(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LuminaStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DB_NAME = 'lumina_docs';
  const DB_VERSION = 2;
  const DOCS = 'documents';
  const META = 'meta';
  const OUTBOX = 'outbox';

  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const transactionDone = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });

  function openDb(indexedDBRef) {
    return new Promise((resolve, reject) => {
      const req = indexedDBRef.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function outboxKey(type, docId) {
    return `${type === 'delete' ? 'delete' : 'save'}:${String(docId || '')}`;
  }

  function mergeDocuments(localDocs, remoteDocs) {
    const byId = new Map();
    for (const entry of [...(localDocs || []), ...(remoteDocs || [])]) {
      if (!entry?.id) continue;
      const previous = byId.get(entry.id);
      const entryTime = Number(entry.deletedAt || entry.updatedAt || 0);
      const previousTime = Number(previous?.deletedAt || previous?.updatedAt || 0);
      if (!previous || entryTime > previousTime || (entryTime === previousTime && entry.deletedAt)) {
        byId.set(entry.id, entry);
      }
    }
    return [...byId.values()]
      .filter(entry => !entry.deletedAt)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }

  function create(options = {}) {
    const idb = options.indexedDB === undefined
      ? (typeof indexedDB !== 'undefined' ? indexedDB : null)
      : options.indexedDB;
    const fallback = options.localStorage === undefined
      ? (typeof localStorage !== 'undefined' ? localStorage : null)
      : options.localStorage;
    const legacyKey = options.legacyKey || 'lumina_docs_workspace_v1';
    let dbPromise = null;
    const db = () => {
      if (!idb) return Promise.resolve(null);
      return dbPromise || (dbPromise = openDb(idb).catch(() => null));
    };

    async function load() {
      const conn = await db();
      if (conn) {
        const docs = await request(conn.transaction(DOCS, 'readonly').objectStore(DOCS).getAll());
        if (docs.length) return docs;
      }
      try { return JSON.parse(fallback?.getItem(legacyKey) || '[]'); }
      catch { return []; }
    }

    async function saveAll(docs) {
      const conn = await db();
      if (conn) {
        const tx = conn.transaction([DOCS, META], 'readwrite');
        const store = tx.objectStore(DOCS);
        store.clear();
        (docs || []).forEach(doc => store.put(doc));
        tx.objectStore(META).put(Date.now(), 'lastSavedAt');
        await transactionDone(tx);
        try { fallback?.removeItem(legacyKey); } catch {}
        return 'indexeddb';
      }
      try { fallback?.setItem(legacyKey, JSON.stringify(docs || [])); return 'localStorage'; }
      catch { return 'memory'; }
    }

    async function enqueue(op) {
      const docId = op?.docId || op?.document?.id;
      if (!docId) return false;
      const conn = await db();
      if (!conn) return false;
      const type = op.type === 'delete' ? 'delete' : 'save';
      const tx = conn.transaction(OUTBOX, 'readwrite');
      const store = tx.objectStore(OUTBOX);
      store.delete(outboxKey(type === 'delete' ? 'save' : 'delete', docId));
      store.put({ ...op, type, docId, id: outboxKey(type, docId), updatedAt: Number(op.updatedAt) || Date.now() });
      await transactionDone(tx);
      return true;
    }

    async function pending() {
      const conn = await db();
      if (!conn) return [];
      const items = await request(conn.transaction(OUTBOX, 'readonly').objectStore(OUTBOX).getAll());
      const latestByDocument = new Map();
      for (const item of items) {
        const docId = item.docId || item.document?.id;
        if (!docId) continue;
        const previous = latestByDocument.get(docId);
        if (!previous || Number(item.updatedAt || 0) >= Number(previous.updatedAt || 0)) {
          latestByDocument.set(docId, { ...item, docId, id: outboxKey(item.type, docId) });
        }
      }
      const compacted = [...latestByDocument.values()]
        .sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0));
      if (items.length !== compacted.length || items.some(item => item.id !== outboxKey(item.type, item.docId || item.document?.id))) {
        const tx = conn.transaction(OUTBOX, 'readwrite');
        const store = tx.objectStore(OUTBOX);
        store.clear();
        compacted.forEach(item => store.put(item));
        await transactionDone(tx);
      }
      return compacted;
    }

    async function acknowledge(id) {
      const conn = await db();
      if (!conn) return;
      const tx = conn.transaction(OUTBOX, 'readwrite');
      tx.objectStore(OUTBOX).delete(id);
      await transactionDone(tx);
    }

    return { load, saveAll, enqueue, pending, acknowledge };
  }

  return { create, mergeDocuments, outboxKey };
});
