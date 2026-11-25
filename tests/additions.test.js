const test = require('node:test');
const assert = require('node:assert/strict');
const pdf = require('../vendor/pdf-lib-1.17.1.min.js');
const { calculateValue, csvOutput } = require('../data-tools.js');
const { tsvWords, exportReview } = require('../pdf-review.js');

test('calculated CSV columns handle decimal arithmetic and invalid values', () => {
  assert.equal(calculateValue('1.1','2.2','+'),'3.3');
  assert.equal(calculateValue('-4','2','/'),'-2');
  assert.equal(calculateValue('4','0','/'),'');
  assert.equal(calculateValue('4','text','*'),'');
  assert.equal(csvOutput([['comma, cell','-4','=CMD()'], ['A','B','C']]),'"comma, cell",-4,\'=CMD()\r\nA,B,C');
});
test('recognition consumes word boxes and ignores non-word or empty rows', () => {
  const input = 'header\n4\t1\t1\t1\t1\t0\t5\t6\t7\t8\t95\tnot a word\n5\t1\t1\t1\t1\t1\t10\t20\t30\t40\t96\tLumina';
  assert.deepEqual(tsvWords(input),[{ x:10,y:20,w:30,h:40,text:'Lumina' }]);
});
test('review export writes native annotations and an invisible text layer', async () => {
  const input = await pdf.PDFDocument.create();
  input.addPage([200,300]);
  const bytes = await input.save();
  const marks = new Map([[0,[{kind:'note',rect:[5,10,25,30],text:'Review this'}, {kind:'highlight',rect:[20,40,50,60],quads:[20,60,50,60,20,40,50,40]}]]]);
  const scans = new Map([[0,[{x:40,y:80,width:80,height:20,rotation:0,text:'Searchable text'}]]]);
  const result = await pdf.PDFDocument.load(await exportReview(pdf,bytes,marks,scans));
  const page = result.getPage(0);
  const annotations = page.node.Annots();
  assert.equal(annotations.size(),2);
  assert.equal(result.context.lookup(annotations.get(0)).get(pdf.PDFName.of('Subtype')).toString(),'/Text');
  assert.equal(result.context.lookup(annotations.get(1)).get(pdf.PDFName.of('Subtype')).toString(),'/Highlight');
  const contents = page.node.Contents();
  const operators = Array.from({length:contents.size()},(_,index)=>{
    const stream = result.context.lookup(contents.get(index));
    return Buffer.from(pdf.decodePDFRawStream(stream).decode()).toString();
  }).join('\n');
  assert.match(operators,/3 Tr/);
  assert.match(operators,/53656172636861626C652074657874/i);
});
