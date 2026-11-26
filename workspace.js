'use strict';

const el = id => document.getElementById(id);
const label = { doc: 'Document', slide: 'Slide deck', pdf: 'PDF' };
const docs = LuminaStorage.create();
let rows = [];
let records = [];
let selected;

function status(message) {
  el('status').textContent = message;
}

function titleOf(title, fallback) {
  return typeof title === 'string' && title.trim() ? title.trim() : fallback;
}

function linkFor(row) {
  switch (row.kind) {
    case 'doc': return './docs.html?doc=' + encodeURIComponent(row.sourceId);
    case 'slide': return './slides.html?deck=' + encodeURIComponent(row.sourceId);
    case 'pdf': return './pdf-tools.html?file=' + encodeURIComponent(row.sourceId);
  }
}

function makeButton(name, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.onclick = () => Promise.resolve().then(action).catch(error => status(error.message));
  return button;
}

function makeLink(name, href) {
  const anchor = document.createElement('a');
  anchor.textContent = name;
  anchor.href = href;
  return anchor;
}

async function refresh() {
  const [documents, stored] = await Promise.all([docs.load(), LuminaLibrary.all()]);
  records = stored;
  rows = [
    ...documents.filter(doc => doc?.id).map(doc => ({
      key: 'doc:' + doc.id, kind: 'doc', sourceId: doc.id, title: titleOf(doc.title, 'Untitled document'), updatedAt: doc.updatedAt || 0, value: doc
    })),
    ...LuminaLibrary.readDecks(localStorage).map(({ id, deck }) => ({
      key: 'slide:' + id, kind: 'slide', sourceId: id, title: titleOf(deck.title, 'Untitled presentation'), updatedAt: deck.updatedAt || 0, value: deck
    })),
    ...stored.filter(record => record.kind === 'pdf').map(record => ({
      key: record.id, kind: 'pdf', sourceId: record.id, title: record.title, updatedAt: record.updatedAt, value: record.file
    }))
  ];
  const metadata = new Map(stored.filter(record => record.kind === 'meta').map(record => [record.fileKey, record]));
  rows.forEach(row => { row.meta = metadata.get(row.key) || {}; });
  const folders = [...new Set(rows.map(row => row.meta.folder).filter(Boolean))].sort();
  const filter = el('folder');
  const current = filter.value;
  filter.replaceChildren(new Option('All folders', ''), ...folders.map(folder => new Option(folder, folder)));
  if (folders.includes(current)) filter.value = current;
  draw();
}

function draw() {
  const query = el('search').value.trim().toLocaleLowerCase();
  const type = el('type').value;
  const folder = el('folder').value;
  const onlyFavorites = el('favorites').checked;
  const visible = rows.filter(row => {
    const searchText = [row.title, row.meta.folder, ...(row.meta.tags || [])].join(' ').toLocaleLowerCase();
    return (!type || row.kind === type) && (!folder || row.meta.folder === folder) &&
      (!onlyFavorites || row.meta.favorite) && searchText.includes(query);
  });
  visible.sort(el('sort').value === 'title' ? (a, b) => a.title.localeCompare(b.title) : (a, b) => b.updatedAt - a.updatedAt);
  const list = el('files');
  list.replaceChildren(...visible.map(row => {
    const item = document.createElement('li');
    item.dataset.kind = row.kind;
    const summary = document.createElement('div');
    const title = makeLink(row.title, linkFor(row));
    title.className = 'file-title';
    const details = document.createElement('p');
    details.className = 'details';
    details.textContent = [label[row.kind], row.meta.favorite ? 'Favorite' : '', row.meta.folder, ...(row.meta.tags || []),
      row.updatedAt ? new Date(row.updatedAt).toLocaleString() : ''].filter(Boolean).join(' · ');
    summary.append(title, details);
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    actions.append(makeButton('Organize', () => showSettings(row)));
    if (row.kind !== 'pdf') actions.append(makeButton('Versions', () => showHistory(row)));
    if (row.kind === 'pdf') actions.append(makeLink('Organize pages', './organize-pdf.html?file=' + encodeURIComponent(row.sourceId)));
    if (row.kind === 'pdf') actions.append(makeButton('Remove from library', async () => {
      if (!window.confirm('Remove the saved copy of ' + row.title + ' from this library?')) return;
      await LuminaLibrary.remove(row.key);
      await refresh();
      status('PDF removed from the library.');
    }));
    item.append(summary, actions);
    return item;
  }));
  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'library-empty';
    const title = document.createElement('strong');
    title.textContent = rows.length ? 'No matching files' : 'Your library is empty';
    const hint = document.createElement('p');
    hint.textContent = rows.length ? 'Try a different search or clear your filters.' : 'Create a document, start a thesis, or add a PDF. Saved files appear here.';
    empty.append(title, hint);
    list.append(empty);
  }
}

function showSettings(row) {
  selected = row;
  el('settings-title').textContent = 'Organize ' + row.title;
  el('edit-folder').value = row.meta.folder || '';
  el('edit-tags').value = (row.meta.tags || []).join(', ');
  el('edit-favorite').checked = Boolean(row.meta.favorite);
  el('settings').showModal();
}

el('settings-form').onsubmit = async event => {
  event.preventDefault();
  try {
    await LuminaLibrary.put({
      id: 'meta:' + selected.key, kind: 'meta', fileKey: selected.key,
      folder: el('edit-folder').value.trim(),
      tags: [...new Set(el('edit-tags').value.split(',').map(tag => tag.trim()).filter(Boolean))],
      favorite: el('edit-favorite').checked
    });
    el('settings').close();
    await refresh();
    status('File details saved.');
  } catch (error) {
    el('settings').close();
    status('Could not save file details. ' + error.message);
  }
};

function drawVersions() {
  const versions = records.filter(record => record.kind === 'version' && record.fileKey === selected.key)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const list = el('versions');
  list.replaceChildren(...versions.map(record => {
    const item = document.createElement('li');
    const description = document.createElement('span');
    description.textContent = record.name + ' · ' + new Date(record.updatedAt).toLocaleString();
    const path = record.fileType === 'doc' ? './docs.html' : './slides.html';
    item.append(description, makeLink('Open as new copy', path + '?version=' + encodeURIComponent(record.id)));
    return item;
  }));
}

function showHistory(row) {
  selected = row;
  el('version-name').value = '';
  drawVersions();
  el('history').showModal();
}

el('version-form').onsubmit = async event => {
  event.preventDefault();
  const name = el('version-name').value.trim();
  if (!name) return;
  try {
    const record = {
      id: 'version:' + crypto.randomUUID(), kind: 'version', fileKey: selected.key, fileType: selected.kind,
      name, updatedAt: Date.now(), value: selected.value
    };
    await LuminaLibrary.put(record);
    records.push(record);
    drawVersions();
    el('version-name').value = '';
    status('Checkpoint saved.');
  } catch (error) {
    el('history').close();
    status('Could not save the checkpoint. ' + error.message);
  }
};

el('new-deck').onclick = () => { location.href = './slides.html?deck=' + crypto.randomUUID(); };
el('cancel-settings').onclick = () => el('settings').close();
el('close-history').onclick = () => el('history').close();
for (const id of ['search', 'type', 'folder', 'sort', 'favorites']) el(id).addEventListener('input', draw);

el('pdfs').onchange = async event => {
  let added = 0;
  let skipped = 0;
  try {
    for (const file of event.target.files) {
      const header = await file.slice(0, 1024).text();
      if (!header.includes('%PDF-') || file.size > 50 * 1024 * 1024) {
        skipped++;
        continue;
      }
      await LuminaLibrary.put({ id: 'pdf:' + crypto.randomUUID(), kind: 'pdf', title: file.name, file, updatedAt: Date.now() });
      added++;
    }
    status(added + ' added.' + (skipped ? ' Skipped ' + skipped + ' invalid PDFs or files over 50 MB.' : ''));
  } catch (error) {
    status(added + ' added. Could not save the remaining PDFs. ' + error.message);
  } finally {
    event.target.value = '';
    await refresh().catch(error => status(error.message));
  }
};

refresh().catch(error => status('Could not load the workspace. ' + error.message));
window.addEventListener('pageshow', event => {
  if (event.persisted) refresh().catch(error => status(error.message));
});

function backupBusy(active) {
  el('backup-workspace').disabled = active;
  el('restore-workspace').disabled = active;
}
el('backup-workspace').onclick = async () => {
  backupBusy(true);
  status('Creating workspace backup…');
  try {
    const [documents, library] = await Promise.all([docs.load(), LuminaLibrary.all()]);
    const bytes = await WorkspaceBackup.pack(window.JSZip, documents, LuminaLibrary.readDecks(localStorage), library);
    const url = URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lumina-workspace-' + new Date().toISOString().slice(0,10) + '.zip';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),30000);
    status('Backup ready. It contains a copy of your saved files and checkpoints.');
  } catch (error) { status('Could not create backup. ' + error.message); }
  finally { backupBusy(false); }
};
el('restore-workspace').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  backupBusy(true);
  status('Checking the backup…');
  try {
    if (file.size > 257 * 1024 * 1024) throw Error('Choose a Lumina backup under 257 MB.');
    const plan = await WorkspaceBackup.unpack(window.JSZip, await file.arrayBuffer(), () => crypto.randomUUID());
    const pdfs = plan.records.filter(item=>item.kind==='pdf').length;
    const versions = plan.records.filter(item=>item.kind==='version').length;
    const summary = plan.documents.length + ' documents, ' + plan.decks.length + ' decks, ' + pdfs + ' PDFs, and ' + versions + ' checkpoints';
    if (!window.confirm('Restore ' + summary + ' as new copies on this device?')) {
      status('Restore canceled.');
      return;
    }
    await WorkspaceBackup.restore(plan,{documents:docs,library:LuminaLibrary,storage:localStorage});
    await refresh();
    status('Restored ' + summary + '.');
  } catch (error) { status('Could not restore backup. ' + error.message); }
  finally { backupBusy(false); }
};
