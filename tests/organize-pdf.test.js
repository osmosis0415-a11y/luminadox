const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../vendor/pdf-lib-1.17.1.min.js');
const { movePage, exportPageOrder } = require('../organize-pdf.js');

async function fixture() {
  const pdf = await lib.PDFDocument.create();
  pdf.setTitle('Organizer fixture');
  const first = pdf.addPage([200, 300]);
  pdf.addPage([400, 300]);
  const form = pdf.getForm().createTextField('name');
  form.setText('preserved');
  form.addToPage(first);
  return pdf.save();
}

test('moving a page produces a new order and invalid moves leave the order intact', () => {
  const pages = [{ id: 0 }, { id: 1 }, { id: 2 }];
  assert.equal(movePage(pages, 0, -1), pages);
  assert.equal(movePage(pages, 8, 0), pages);
  assert.deepEqual(movePage(pages, 0, 2), [{ id: 1 }, { id: 2 }, { id: 0 }]);
  assert.deepEqual(pages.map(page => page.id), [0, 1, 2]);
});

test('reordering and rotation preserve the existing document and interactive form', async () => {
  const output = await exportPageOrder(lib, await fixture(), [{ id: 1, rotation: 90 }, { id: 0, rotation: 0 }]);
  const pdf = await lib.PDFDocument.load(output);
  assert.deepEqual(pdf.getPages().map(page => [page.getWidth(), page.getRotation().angle]), [[400, 90], [200, 0]]);
  assert.equal(pdf.getTitle(), 'Organizer fixture');
  assert.equal(pdf.getForm().getTextField('name').getText(), 'preserved');
});

test('removing pages writes the selected pages into a fresh PDF and prevents empty exports', async () => {
  const bytes = await fixture();
  const output = await exportPageOrder(lib, bytes, [{ id: 1, rotation: 0 }]);
  const pdf = await lib.PDFDocument.load(output);
  assert.deepEqual(pdf.getPages().map(page => page.getWidth()), [400]);
  await assert.rejects(exportPageOrder(lib, bytes, []), /Invalid page order/);
  await assert.rejects(exportPageOrder(lib, bytes, [{ id: 1, rotation: 0 }, { id: 1, rotation: 90 }]), /Invalid page order/);
});
