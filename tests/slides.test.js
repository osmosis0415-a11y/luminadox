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

test('freeform export keeps text, native shapes, and image objects editable', async () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT3sAAAAASUVORK5CYII=';
  const deck = normalizeDeck({ title: 'Canvas', slides: [{ layout: 'freeform', theme: 'ink', transition: 'fade',
    objects: [{ kind: 'text', text: 'Editable canvas text', x: 12, y: 25, w: 40, h: 20, size: 23 },
      { kind: 'ellipse', color: 'FF1100' }, { kind: 'image', text: 'Diagram', image },
      { kind: 'rectangle', color: '00FF00', x: 120 }, { kind: 'unknown' }] }] });
  assert.equal(deck.slides[0].objects.length, 4);
  assert.equal(deck.slides[0].objects[3].x, 68);
  const archive = await JSZip.loadAsync(await exportDeck(deck, PowerPoint, JSZip, async () => ({ width: 1, height: 1 })));
  const xml = await archive.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml, /Editable canvas text/);
  assert.match(xml, /prst="ellipse"/);
  assert.match(xml, /prst="rect"/);
  assert.match(xml, /Diagram/);
  assert.match(xml, /<p:fade\/>/);
  assert.equal((xml.match(/<p:sp>/g) || []).length, 3);
});

test('freeform templates consist of positioned, editable objects', () => {
  const { template } = require('../slide-canvas.js');
  const objects = template('comparison', ['111111', 'EEEEEE', '55CCAA']);
  assert.equal(objects.filter(object => object.kind === 'rectangle').length, 2);
  assert.ok(objects.every(object => object.x + object.w <= 100 && object.y + object.h <= 100));
});
