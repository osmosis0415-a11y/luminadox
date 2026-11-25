const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('../vendor/jszip-3.10.1.min.js');
const { normalizeDeck, exportDeck, newSlide } = require('../slides.js');
const vendor = fs.readFileSync(path.join(__dirname, '../vendor/pptxgen-3.12.0.min.js'), 'utf8');
const PowerPoint = Function('JSZip', vendor + '\nreturn PptxGenJS;')(JSZip);

test('editable presentation validation normalizes unknown settings and external images', () => {
  const slide = normalizeDeck({ slides: [{ ...newSlide(), layout: 'invalid', theme: 'constructor', image: 'https://example.com/logo.png' }] }).slides[0];
  assert.equal(slide.layout, 'text');
  assert.equal(slide.theme, 'ink');
  assert.equal(slide.image, '');
  assert.throws(() => normalizeDeck({ slides: [] }));
});

test('PowerPoint export has editable text, images, speaker notes, and per-slide transitions', async () => {
  const deck = normalizeDeck({ title: 'Thesis defense', slides: [
    { ...newSlide(), title: 'Thesis defense', body: 'Methods & results', layout: 'cover', transition: 'fade', speed: 'slow', notes: 'Explain the study design' },
    { ...newSlide(), title: 'Outcomes', body: 'Primary endpoint\nSecondary endpoint', layout: 'bullets', transition: 'push' },
    { ...newSlide(), title: 'Figure', layout: 'image', transition: 'wipe', imageDescription: 'Sample chart', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT3sAAAAASUVORK5CYII=' },
    { ...newSlide(), title: 'Questions' }
  ] });
  const archive = await JSZip.loadAsync(await exportDeck(deck, PowerPoint, JSZip, async () => ({ width: 1, height: 1 })));
  const xml = name => archive.file(name).async('string');
  const first = await xml('ppt/slides/slide1.xml');
  const second = await xml('ppt/slides/slide2.xml');
  const third = await xml('ppt/slides/slide3.xml');
  assert.match(first, /Methods &amp; results/);
  assert.match(first, /<p:transition spd="slow" advClick="1"><p:fade\/><\/p:transition>/);
  assert.match(second, /<p:push dir="l"\/>/);
  assert.match(second, /<a:buChar/);
  assert.match(third, /<p:wipe dir="l"\/>/);
  assert.match(third, /Sample chart/);
  assert.doesNotMatch(await xml('ppt/slides/slide4.xml'), /<p:transition/);
  assert.match(await xml('ppt/notesSlides/notesSlide1.xml'), /Explain the study design/);
  assert.ok(Object.keys(archive.files).some(name => /^ppt\/media\/.*\.png$/.test(name)));
});
