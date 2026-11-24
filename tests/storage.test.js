const test = require('node:test');
const assert = require('node:assert/strict');
const { create, mergeDocuments, outboxKey } = require('../lumina-storage.js');

test('newest document wins during sync merge', () => {
  const result = mergeDocuments(
    [{ id: 'a', updatedAt: 1, title: 'old' }],
    [{ id: 'a', updatedAt: 2, title: 'new' }, { id: 'b', updatedAt: 1 }]
  );
  assert.equal(result.length, 2);
  assert.equal(result.find(x => x.id === 'a').title, 'new');
});

test('newer tombstone removes a document', () => {
  const result = mergeDocuments(
    [{ id: 'a', updatedAt: 2, title: 'local' }],
    [{ id: 'a', updatedAt: 3, deletedAt: 3 }]
  );
  assert.deepEqual(result, []);
});

test('newer offline edit wins over an older tombstone', () => {
  const result = mergeDocuments(
    [{ id: 'a', updatedAt: 4, title: 'recovered' }],
    [{ id: 'a', updatedAt: 3, deletedAt: 3 }]
  );
  assert.equal(result[0].title, 'recovered');
});

test('outbox keys are stable per operation and document', () => {
  assert.equal(outboxKey('save', 'abc'), 'save:abc');
  assert.equal(outboxKey('delete', 'abc'), 'delete:abc');
});

test('falls back to localStorage when IndexedDB is explicitly unavailable', async () => {
  const data = new Map();
  const fallback = {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  };
  const store = create({ indexedDB: null, localStorage: fallback, legacyKey: 'docs' });
  assert.equal(await store.saveAll([{ id: 'a' }]), 'localStorage');
  assert.deepEqual(await store.load(), [{ id: 'a' }]);
});
