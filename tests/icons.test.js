const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const iconLibrary = path.join(root, 'vendor', 'lucide-1.79.0.min.js');

test('icons use a locally hosted pinned library', () => {
  assert.equal(fs.existsSync(iconLibrary), true);
  assert.match(fs.readFileSync(iconLibrary, 'utf8'), /@license lucide v1\.79\.0/);
  assert.match(html, /<script src="\.\/vendor\/lucide-1\.79\.0\.min\.js"><\/script>/);
  assert.doesNotMatch(html, /unpkg\.com\/lucide/);
});

test('the offline shell caches the local icon library', () => {
  assert.match(serviceWorker, /lumina-docs-shell-v7/);
  assert.match(serviceWorker, /\.\/vendor\/lucide-1\.79\.0\.min\.js/);
  assert.doesNotMatch(serviceWorker, /unpkg\.com\/lucide/);
  assert.match(serviceWorker, /request\.mode === 'navigate'[\s\S]*?await fetch\(request\)[\s\S]*?caches\.match\('\.\/index\.html'\)/);
});
