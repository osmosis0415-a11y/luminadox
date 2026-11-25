const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, chartPoints, buildDefenseDeck } = require('../research-tools.js');

test('CSV handles BOM, quoted commas, escaped quotes, and multiline cells', () => {
  const csv = parseCsv('\uFEFFLabel,Value\r\n"Item, A",1.5\r\n"Two\nliness", -2\r\n"Quote ""here""",3');
  assert.deepEqual(csv.header, ['Label', 'Value']);
  assert.deepEqual(csv.data, [['Item, A', '1.5'], ['Two\nliness', ' -2'], ['Quote "here"', '3']]);
  assert.throws(() => parseCsv('a,b\nx,2,3'), /same number/);
  assert.throws(() => parseCsv('a,b\n"open,1'), /closing quotation/);
});

test('chart points handle negatives, skip invalid data, and report their display limit', () => {
  const result = chartPoints([['A', ' -2.5'], ['B', ''], ['C', 'Infinity'], ['D', '=3'], ...Array.from({ length: 21 }, (_, i) => ['Row ' + i, String(i)])], 0, 1);
  assert.deepEqual(result.points[0], { label: 'A', value: -2.5 });
  assert.equal(result.points.length, 20);
  assert.equal(result.skipped, 3);
  assert.equal(result.omitted, 2);
});

test('defense deck carries selected headings, captions and citations with review cues', () => {
  const result = buildDefenseDeck('My thesis', [{ title: 'Methods', paragraphs: ['A long passage '.repeat(18)], captions: ['Figure 1: Workflow'] },
    { title: 'Results', paragraphs: [], captions: [] }], [{ author: 'A', title: 'Reference title', year: '2020' }]);
  assert.deepEqual(result.slides.map(slide => slide.title), ['My thesis', 'Methods', 'Methods · Figures and tables', 'Results', 'References']);
  assert.match(result.slides[1].notes, /Review and shorten/);
  assert.match(result.slides[2].body, /Figure 1: Workflow/);
  assert.match(result.slides[3].notes, /no body text/);
  assert.match(result.slides[4].body, /\[1\] A\. Reference title\. 2020/);
});
