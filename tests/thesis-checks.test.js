const test = require('node:test');
const assert = require('node:assert/strict');
const { thesisChecks } = require('../thesis-checks.js');
test('preflight detects inconsistent captions, missing citations and page settings', () => {
  const editor = { querySelector: () => null, querySelectorAll: selector => selector.startsWith('h1') ? [
    {tagName:'H1',closest:()=>null,textContent:'Title'}, {tagName:'H3',closest:()=>null,textContent:'Methods'}
  ] : selector.startsWith('[') ? [{getAttribute:()=> 'missing'}] : [{textContent:'Figure 2: Example'}] };
  const warnings = thesisChecks(editor,{ citations:[],marginStyle:'standard' },{roman:true,margin:'binding'});
  assert.equal(warnings.length,6);
  assert.match(warnings.join(' '),/Figure numbering/);
});
