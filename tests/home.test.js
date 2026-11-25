const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { legacyEditorRoute } = require('../home.js');

test('legacy editor links keep their project path, query, and editor anchor', () => {
  assert.equal(legacyEditorRoute('https://example.com/luminadox/'), null);
  assert.equal(legacyEditorRoute('https://example.com/luminadox/index.html?utm_source=test#main'), null);
  assert.equal(legacyEditorRoute('https://example.com/luminadox/?new=blank'), 'https://example.com/luminadox/docs.html?new=blank');
  assert.equal(legacyEditorRoute('https://example.com/luminadox/index.html?doc=sample#editor'), 'https://example.com/luminadox/docs.html?doc=sample#editor');
  assert.equal(legacyEditorRoute('https://example.com/luminadox/index.html?version=sample'), 'https://example.com/luminadox/docs.html?version=sample');
});

test('homepage and Docs have separate entry points in the offline shell', () => {
  const root = path.join(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(home, /href="\.\/docs\.html\?new=blank"/);
  assert.match(home, /href="\.\/workspace\.html">Open Workspace/);
  assert.doesNotMatch(home, /contenteditable="true"/);
  assert.match(sw, /'\.\/index\.html', '\.\/docs\.html'/);
});
