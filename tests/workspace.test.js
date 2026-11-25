const test = require('node:test');
const assert = require('node:assert/strict');
const { deckKey, readDecks } = require('../library-store.js');

test('workspace discovers the original deck and additional decks without reading unrelated keys', () => {
  const data = new Map([
    [deckKey('original'), JSON.stringify({ title: 'Existing', slides: [{}] })],
    [deckKey('new-deck'), JSON.stringify({ title: 'Second', slides: [{}] })],
    [deckKey('broken'), '{'],
    ['unrelated', JSON.stringify({ title: 'Ignored', slides: [{}] })]
  ]);
  const storage = { length: data.size, key: index => [...data.keys()][index], getItem: key => data.get(key) };
  assert.equal(deckKey('original'), 'lumina_slides_v1');
  assert.deepEqual(readDecks(storage).map(({ id, deck }) => [id, deck.title]), [['original', 'Existing'], ['new-deck', 'Second']]);
});
