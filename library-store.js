'use strict';

const LuminaLibrary = (() => {
  const deckPrefix = 'lumina_slides_v1';
  let connection;

  function database() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('lumina_file_library', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
    });
    return connection;
  }

  async function transact(mode, action) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', mode);
      const request = action(transaction.objectStore('files'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error('Library transaction was interrupted.'));
    });
  }

  function deckKey(id) {
    return id === 'original' ? deckPrefix : deckPrefix + ':' + id;
  }

  function readDecks(storage) {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter(key => key === deckPrefix || /^lumina_slides_v1:[a-zA-Z0-9_-]+$/.test(key))
      .flatMap(key => {
        try {
          const deck = JSON.parse(storage.getItem(key));
          if (!Array.isArray(deck?.slides) || !deck.slides.length) return [];
          const id = key === deckPrefix ? 'original' : key.slice(deckPrefix.length + 1);
          return [{ id, deck }];
        } catch {
          return [];
        }
      });
  }

  return {
    deckKey,
    readDecks,
    get: id => transact('readonly', store => store.get(id)),
    all: () => transact('readonly', store => store.getAll()),
    addMany: records => transact('readwrite', store => records.map(record => store.add(record)).at(-1)),
    removeMany: ids => transact('readwrite', store => ids.map(id => store.delete(id)).at(-1)),
    put: record => transact('readwrite', store => store.put(record)),
    remove: id => transact('readwrite', store => store.delete(id))
  };
})();

if (typeof module !== 'undefined') module.exports = LuminaLibrary;
