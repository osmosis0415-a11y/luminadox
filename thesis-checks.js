'use strict';

function thesisChecks(editor, record, requirements) {
  const issues = [];
  const headings = [...editor.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(node => !node.closest('#lumina-toc-section'));
  const citations = new Set((record.citations || []).map(item => item.id));
  const used = [...editor.querySelectorAll('[data-cit-id]')].map(item => item.getAttribute('data-cit-id'));
  const missing = new Set(used.filter(id => !citations.has(id)));
  if (missing.size) issues.push(missing.size + ' citation link(s) have no matching reference.');
  if (used.length && !editor.querySelector('#lumina-references-section')) issues.push('Insert the bibliography before export.');
  for (let index = 1; index < headings.length; index++) {
    if (+headings[index].tagName.slice(1) > +headings[index - 1].tagName.slice(1) + 1) {
      issues.push('Heading levels skip before “' + headings[index].textContent.trim().slice(0, 90) + '”.');
    }
  }
  const counts = new Map();
  for (const caption of editor.querySelectorAll('.lumina-caption, figcaption')) {
    const match = /^(Figure|Table)\s+(\d+)\b/i.exec(caption.textContent.trim());
    if (!match) continue;
    const type = match[1].toLowerCase();
    const expected = (counts.get(type) || 0) + 1;
    if (Number(match[2]) !== expected) issues.push(match[1] + ' numbering is out of sequence. Expected ' + expected + ', found ' + match[2] + '.');
    counts.set(type, expected);
  }
  if (requirements.roman && !editor.querySelector('.lumina-section-break')) issues.push('Add a section break between Roman-numbered front matter and the main text.');
  if (requirements.margin && record.marginStyle !== requirements.margin) issues.push('Match the left margin to the selected submission requirement in Page Setup.');
  return issues;
}

if (typeof module !== 'undefined') module.exports = { thesisChecks };
