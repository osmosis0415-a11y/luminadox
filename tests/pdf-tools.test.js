const test = require('node:test');
const assert = require('node:assert/strict');
const { selectPages } = require('../pdf-tools.js');

test('page selection supports all pages and preserves entered order', () => {
  assert.deepEqual(selectPages('', 4), [0, 1, 2, 3]);
  assert.deepEqual(selectPages('4, 1-3, 2', 4), [3, 0, 1, 2]);
});

test('page selection rejects invalid and out-of-bounds ranges', () => {
  for (const value of ['2-1', '0', '5', '1,', '2.5', '1-99999999999999']) {
    assert.throws(() => selectPages(value, 4));
  }
});

const library = require('../vendor/pdf-lib-1.17.1.min.js');
const JSZip = require('../vendor/jszip-3.10.1.min.js');
const { buildPdfResult } = require('../pdf-tools.js');
const bytesFile = (bytes, name = 'test.pdf') => ({ name, arrayBuffer: async () => bytes.slice().buffer });

async function samplePdf(withForm = false) {
  const pdf = await library.PDFDocument.create();
  const first = pdf.addPage([200, 300]);
  pdf.addPage([250, 300]);
  pdf.addPage([350, 300]);
  if (withForm) {
    const field = pdf.getForm().createTextField('name');
    field.setText('Lumina');
    field.addToPage(first, { x: 20, y: 20, width: 100, height: 20 });
  }
  return bytesFile(await pdf.save());
}

async function processPdf(operation, files, options = {}) {
  return buildPdfResult(library, JSZip, operation, files, { pages: '', ...options });
}

test('merge, reorder, remove, and split create valid PDFs in the requested order', async () => {
  const file = await samplePdf();
  const widths = async bytes => (await library.PDFDocument.load(bytes)).getPages().map(page => page.getWidth());
  assert.deepEqual(await widths((await processPdf('merge', [file, file])).bytes), [200, 250, 350, 200, 250, 350]);
  assert.deepEqual(await widths((await processPdf('extract', [file], { pages: '3, 1' })).bytes), [350, 200]);
  assert.deepEqual(await widths((await processPdf('remove', [file], { pages: '2' })).bytes), [200, 350]);
  await assert.rejects(processPdf('remove', [file], { pages: '1-3' }), /Keep at least one page/);
  const split = await processPdf('split', [file], { pages: '2-3' });
  const zip = await JSZip.loadAsync(split.bytes);
  assert.deepEqual(Object.keys(zip.files), ['page-2.pdf', 'page-3.pdf']);
  assert.deepEqual(await widths(await zip.file('page-3.pdf').async('uint8array')), [350]);
});

test('rotate and crop update the selected pages', async () => {
  const file = await samplePdf();
  const rotated = await library.PDFDocument.load((await processPdf('rotate', [file], { pages: '2', angle: 90 })).bytes);
  assert.deepEqual(rotated.getPages().map(page => page.getRotation().angle), [0, 90, 0]);
  const cropped = await library.PDFDocument.load((await processPdf('crop', [file], { pages: '1', margin: 10 })).bytes);
  assert.deepEqual(cropped.getPage(0).getCropBox(), { x: 10, y: 10, width: 180, height: 280 });
  assert.equal(cropped.getPage(1).getCropBox().width, 250);
});

test('watermark and numbering add content, and flatten removes interactive fields', async () => {
  const file = await samplePdf(true);
  for (const operation of ['number', 'watermark']) {
    const result = await processPdf(operation, [file], { watermark: 'DRAFT', pages: '2' });
    const pdf = await library.PDFDocument.load(result.bytes);
    assert.ok(pdf.getPage(1).node.Contents());
    assert.equal(pdf.getPageCount(), 3);
  }
  const flattened = await processPdf('flatten', [file]);
  const pdf = await library.PDFDocument.load(flattened.bytes);
  assert.equal(pdf.getForm().getFields().length, 0);
});

test('PNG and paginated plain text produce readable PDF containers', async () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT3sAAAAASUVORK5CYII=', 'base64'));
  const images = await processPdf('images', [bytesFile(png), bytesFile(png)]);
  assert.equal((await library.PDFDocument.load(images.bytes)).getPageCount(), 2);
  const text = await processPdf('text', [{ text: async () => 'Sample line\n'.repeat(90) }]);
  assert.equal((await library.PDFDocument.load(text.bytes)).getPageCount(), 2);
});
