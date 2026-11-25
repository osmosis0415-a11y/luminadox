'use strict';

function numberCell(value) {
  const text = String(value ?? '').trim();
  const number = Number(text);
  return text && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) && Number.isFinite(number) ? number : null;
}
function calculateValue(left, right, operator) {
  const a = numberCell(left), b = numberCell(right);
  if (a === null || b === null || (operator === '/' && b === 0)) return '';
  const value = ({ '+': () => a + b, '-': () => a - b, '*': () => a * b, '/': () => a / b })[operator]?.();
  return Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '';
}
function csvOutput(rows) {
  return rows.map(row => row.map(value => {
    let text = String(value);
    if (/^\s*[=+@-]/.test(text) && numberCell(text) === null) text = "'" + text;
    return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }).join(',')).join('\r\n');
}

if (typeof module !== 'undefined') module.exports = { calculateValue, csvOutput };

if (typeof document !== 'undefined') {
  const el = id => document.getElementById(id);
  let dataset;
  let page = 0;
  let displayed = [];
  let loaded = 0;
  const size = 25;
  function status(text) { el('data-status').textContent = text; }

  function columns() {
    for (const id of ['sort-column','first-column','second-column']) {
      const select = el(id);
      const value = select.value;
      select.replaceChildren(...(id === 'sort-column' ? [new Option('Original order', '')] : []),
        ...dataset.header.map((name, i) => new Option(name || 'Column ' + (i + 1), String(i))));
      if ([...select.options].some(option => option.value === value)) select.value = value;
    }
  }

  function rows() {
    const query = el('filter').value.trim().toLocaleLowerCase();
    const index = el('sort-column').value;
    const direction = el('sort-direction').value === 'desc' ? -1 : 1;
    displayed = dataset.data.filter(row => !query || row.some(value => value.toLocaleLowerCase().includes(query)));
    if (index !== '') displayed.sort((a, b) => {
      const x = numberCell(a[index]), y = numberCell(b[index]);
      return direction * (x !== null && y !== null ? x - y : a[index].localeCompare(b[index], undefined, { numeric:true }));
    });
    page = Math.max(0, Math.min(page, Math.ceil(displayed.length / size) - 1));
    draw();
  }

  function rowWith(tag, values) {
    const row = document.createElement('tr');
    values.forEach(value => {
      const cell = document.createElement(tag);
      cell.textContent = value;
      if (tag === 'th') cell.scope = 'col';
      row.append(cell);
    });
    return row;
  }
  function draw() {
    el('head').replaceChildren(rowWith('th', dataset.header));
    const start = page * size;
    const visible = displayed.slice(start, start + size);
    el('rows').replaceChildren(...visible.map(row => rowWith('td', row)));
    el('previous').disabled = page === 0;
    el('next').disabled = start + size >= displayed.length;
    el('row-info').textContent = visible.length ? (start + 1) + '–' + (start + visible.length) + ' of ' + displayed.length + ' matching rows.' : 'No matching rows.';
  }
  function save() { LuminaLibrary.put({ id:'data:current',kind:'dataset', ...dataset }).catch(() => status('Device storage is unavailable. Download a copy to keep your changes.')); }
  function open(value) {
    dataset = value;
    page = 0;
    el('name').textContent = value.name;
    el('data-panel').hidden = false;
    el('chart').disabled = el('download-data').disabled = false;
    columns();
    rows();
  }

  el('csv').onchange = async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const current = ++loaded;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a CSV under 1 MB.');
      const parsed = ResearchTools.parseCsv(await file.text());
      if (current !== loaded) return;
      if (parsed.header.length > 80 || parsed.data.length > 20000) throw new Error('Use at most 80 columns and 20,000 rows.');
      el('filter').value = '';
      el('sort-column').value = '';
      open({ ...parsed, name:file.name });
      status('CSV opened.');
      save();
    } catch (error) { if (current === loaded) status(error.message); }
  };
  LuminaLibrary.get('data:current').then(value => {
    if (!loaded && value?.kind === 'dataset') open({ name:value.name, header:value.header, data:value.data });
  }).catch(() => {});
  for (const id of ['filter','sort-column','sort-direction']) el(id).oninput = () => { page = 0; rows(); };
  el('previous').onclick = () => { page--; draw(); };
  el('next').onclick = () => { page++; draw(); };

  el('calculation').onsubmit = event => {
    event.preventDefault();
    if (!dataset || dataset.header.length >= 80) { status('The table already has 80 columns.'); return; }
    const title = el('column-name').value.trim();
    if (!title || dataset.header.some(name => name.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) {
      status('Enter a new column name.'); return;
    }
    const a = Number(el('first-column').value), b = Number(el('second-column').value), operator = el('math').value;
    let skipped = 0;
    dataset.header.push(title);
    for (const row of dataset.data) {
      const value = calculateValue(row[a], row[b], operator);
      if (!value) skipped++;
      row.push(value);
    }
    el('column-name').value = '';
    columns();
    rows();
    status('Calculated column added.' + (skipped ? ' ' + skipped + ' rows had missing or invalid calculations.' : ''));
    save();
  };

  el('download-data').onclick = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF',csvOutput([dataset.header, ...displayed])], { type:'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = dataset.name.replace(/\.csv$/i, '') + '-view.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  el('chart').onclick = () => openResearchChart(() => status('Chart saved. Use Insert last chart in Docs or Slides.'), { header:dataset.header, data:displayed }, 'Save for Docs and Slides');
}
