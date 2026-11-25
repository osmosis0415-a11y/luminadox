const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'docs.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'accessibility.css'), 'utf8');

test('phone header keeps secondary actions in one accessible menu', () => {
  assert.match(html, /id="phone-actions-btn"[^>]*aria-label="More actions"[^>]*aria-expanded="false"[^>]*aria-controls="phone-actions-menu"/);
  assert.match(html, /id="phone-actions-menu"/);
  assert.match(html, /function togglePhoneActions\(event\)/);
  assert.match(html, /function closePhoneActions\(\)/);
});

test('phone CSS prioritizes core editing controls and full-width content', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /\.phone-hide,#save-badge\{display:none!important\}/);
  assert.match(html, /id="more-tools"[^>]*aria-expanded="false"/);
  assert.match(html, /<select data-more-tool hidden id="font-family"/);
  assert.match(html, /#formatting-ribbon \[hidden\]/);
  assert.match(css, /#workspace-scroll[^}]*padding:\.5rem!important/);
  assert.match(css, /#page-sheet[^}]*padding:1\.25rem 1rem!important/);
});
