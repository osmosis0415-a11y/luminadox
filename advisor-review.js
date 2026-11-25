'use strict';
const field = id => document.getElementById(id);
let packet;
field('review-copy').onchange = async event => {
  const file = event.target.files[0];
  packet = undefined;
  field('review-content').hidden = true;
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw Error('Choose a review file under 4 MB.');
    const item = JSON.parse(await file.text());
    if (item.kind !== 'lumina-review-v1' || typeof item.text !== 'string' || typeof item.id !== 'string') throw Error('This is not a Lumina review copy.');
    packet = item;
    field('review-title').textContent = item.title;
    field('review-text').value = item.text;
    field('review-state').textContent = '';
    field('review-feedback').hidden = item.mode !== 'comment';
    field('review-content').hidden = false;
  } catch (error) { field('review-state').textContent = error.message; }
};
field('review-feedback').onsubmit = event => {
  event.preventDefault();
  if (packet?.mode !== 'comment') return;
  const author = field('reviewer').value.trim(), text = field('feedback').value.trim();
  if (!author || !text) return;
  const blob = new Blob([JSON.stringify({ kind:'lumina-feedback-v1', id:packet.id, revision:packet.revision, author, text, response:crypto.randomUUID() })],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'advisor-feedback.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  field('review-state').textContent = 'Feedback downloaded.';
};
