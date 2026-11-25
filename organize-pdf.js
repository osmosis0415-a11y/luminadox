'use strict';

function movePage(order, pageId, targetIndex) {
  const from = order.findIndex(page => page.id === pageId);
  if (from === -1 || targetIndex < 0 || targetIndex >= order.length || from === targetIndex) return order;
  const next = [...order];
  const [page] = next.splice(from, 1);
  next.splice(targetIndex, 0, page);
  return next;
}

async function exportPageOrder(pdfLibrary, bytes, order) {
  const pdf = await pdfLibrary.PDFDocument.load(bytes);
  const source = pdf.getPages();
  if (!order.length || order.length > source.length ||
      new Set(order.map(page => page.id)).size !== order.length ||
      order.some(page => !Number.isInteger(page.id) || !source[page.id] || ![0, 90, 180, 270].includes(page.rotation))) {
    throw new Error('Invalid page order.');
  }
  const output = order.length === source.length ? pdf : await pdfLibrary.PDFDocument.create();
  const pages = output === pdf ? order.map(item => source[item.id]) : await output.copyPages(pdf, order.map(item => item.id));
  if (output === pdf) {
    for (let index = source.length - 1; index >= 0; index--) pdf.removePage(index);
  }
  for (const [index, page] of pages.entries()) {
    const item = order[index];
    if (item.rotation) page.setRotation(pdfLibrary.degrees((page.getRotation().angle + item.rotation) % 360));
    output.addPage(page);
  }
  return output.save({ addDefaultPage: false, updateFieldAppearances: false });
}

if (typeof module !== 'undefined') module.exports = { movePage, exportPageOrder };

if (typeof document !== 'undefined') {
  const el = id => document.getElementById(id);
  const fileInput = el('source-file');
  const grid = el('pages');
  const cdn = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/';
  let generation = 0;
  let sourceBytes;
  let sourceName;
  let order = [];
  let selected = new Set();
  let undoStack = [];
  let dragging;
  let loadingTask;
  let thumbnailDocument;
  const cards = new Map();
  const pending = new Set();
  let rendering = 0;

  function status(message) { el('status').textContent = message; }

  const viewportObserver = new IntersectionObserver(changes => {
    for (const { target, isIntersecting } of changes) {
      const item = cards.get(Number(target.dataset.pageId));
      if (!item) continue;
      item.visible = isIntersecting;
      if (isIntersecting) pending.add(item);
      else pending.delete(item);
    }
    renderVisible();
  }, { rootMargin: '180px' });

  async function renderThumbnail(item, document, rotation) {
    const page = await document.getPage(item.id + 1);
    const angle = (page.rotate + rotation) % 360;
    const base = page.getViewport({ scale: 1, rotation: angle });
    const viewport = page.getViewport({ scale: Math.min(220 / base.width, 270 / base.height), rotation: angle });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  }

  function renderVisible() {
    while (thumbnailDocument && rendering < 2 && pending.size) {
      const item = pending.values().next().value;
      pending.delete(item);
      if (item.inFlight || item.rendered === item.rotation || !item.node.isConnected) continue;
      const current = generation;
      const rotation = item.rotation;
      item.inFlight = true;
      rendering++;
      renderThumbnail(item, thumbnailDocument, rotation).then(canvas => {
        if (current === generation && item.rotation === rotation) item.preview.replaceChildren(canvas);
      }).catch(() => {
        if (current === generation && !item.preview.querySelector('canvas')) item.preview.textContent = 'Preview unavailable';
      }).finally(() => {
        item.inFlight = false;
        item.rendered = rotation;
        if (current === generation && item.visible && item.rotation !== rotation) pending.add(item);
        rendering--;
        renderVisible();
      });
    }
  }

  async function loadThumbnails(bytes, current) {
    try {
      const engine = await import(cdn + 'build/pdf.min.mjs');
      if (current !== generation) return;
      engine.GlobalWorkerOptions.workerSrc = cdn + 'build/pdf.worker.min.mjs';
      const task = engine.getDocument({
        data: bytes.slice(),
        cMapUrl: cdn + 'cmaps/', cMapPacked: true,
        standardFontDataUrl: cdn + 'standard_fonts/', wasmUrl: cdn + 'wasm/',
        isEvalSupported: false, enableXfa: false
      });
      loadingTask = task;
      const opened = await task.promise;
      if (current !== generation) return;
      thumbnailDocument = opened;
      renderVisible();
    } catch {
      if (current !== generation) return;
      for (const card of cards.values()) card.preview.textContent = 'Preview unavailable';
      status('Thumbnails could not load. You can still edit and export using the page numbers.');
    }
  }

  function setButtonStates() {
    el('controls').disabled = !order.length;
    el('rotate').disabled = selected.size === 0;
    el('delete').disabled = selected.size === 0 || selected.size === order.length;
    el('undo').disabled = undoStack.length === 0;
    el('select-all').textContent = selected.size === order.length && order.length ? 'Clear selection' : 'Select all';
  }

  function makeCard(page) {
    const id = page.id;
    const number = id + 1;
    const node = document.createElement('li');
    node.className = 'page';
    node.dataset.pageId = id;
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.draggable = true;
    preview.textContent = 'Page ' + number;
    const label = document.createElement('label');
    const choice = document.createElement('input');
    choice.type = 'checkbox';
    const text = document.createElement('span');
    label.append(choice, text);
    choice.addEventListener('change', () => {
      if (choice.checked) selected.add(id);
      else selected.delete(id);
      setButtonStates();
    });

    const buttons = document.createElement('div');
    buttons.className = 'page-buttons';
    const makeMove = (direction, name, glyph) => {
      const button = document.createElement('button');
      button.textContent = glyph;
      button.setAttribute('aria-label', 'Move page ' + number + ' ' + name);
      button.title = 'Move ' + name;
      button.onclick = () => relocate(id, order.findIndex(current => current.id === id) + direction, choice);
      buttons.append(button);
      return button;
    };
    const earlier = makeMove(-1, 'earlier', '←');
    const later = makeMove(1, 'later', '→');
    preview.addEventListener('dragstart', event => {
      dragging = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(number));
    });
    preview.addEventListener('dragend', () => {
      dragging = undefined;
      grid.querySelectorAll('.drop-target').forEach(card => card.classList.remove('drop-target'));
    });
    node.addEventListener('dragover', event => {
      if (dragging === undefined || dragging === id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      node.classList.add('drop-target');
    });
    node.addEventListener('dragleave', event => {
      if (!node.contains(event.relatedTarget)) node.classList.remove('drop-target');
    });
    node.addEventListener('drop', event => {
      if (dragging === undefined) return;
      event.preventDefault();
      node.classList.remove('drop-target');
      relocate(dragging, order.findIndex(current => current.id === id));
      dragging = undefined;
    });
    node.append(preview, label, buttons);
    return { id, node, preview, text, choice, earlier, later };
  }

  function draw() {
    const wanted = new Set(order.map(page => page.id));
    for (const [id, item] of cards) {
      if (wanted.has(id)) continue;
      viewportObserver.unobserve(item.node);
      pending.delete(item);
      item.node.remove();
      cards.delete(id);
    }
    order.forEach((page, index) => {
      let item = cards.get(page.id);
      if (!item) {
        item = makeCard(page);
        cards.set(page.id, item);
        viewportObserver.observe(item.node);
      }
      item.rotation = page.rotation;
      item.choice.checked = selected.has(page.id);
      item.text.textContent = 'Page ' + (page.id + 1) + (page.rotation ? ' · ' + page.rotation + '°' : '');
      item.earlier.disabled = index === 0;
      item.later.disabled = index === order.length - 1;
      if (grid.children[index] !== item.node) grid.insertBefore(item.node, grid.children[index] || null);
      if (item.visible) pending.add(item);
    });
    setButtonStates();
    renderVisible();
  }

  function change(next, message) {
    if (next === order) return false;
    undoStack.push(order);
    if (undoStack.length > 30) undoStack.shift();
    order = next;
    const remaining = new Set(order.map(page => page.id));
    selected = new Set([...selected].filter(id => remaining.has(id)));
    draw();
    status(message);
    return true;
  }

  function relocate(id, index, focusTarget) {
    if (change(movePage(order, id, index), 'Page ' + (id + 1) + ' moved to position ' + (index + 1) + '.')) {
      focusTarget?.focus({ preventScroll: true });
    }
  }

  async function openFile(file) {
    const current = ++generation;
    const previousTask = loadingTask;
    loadingTask = undefined;
    thumbnailDocument = undefined;
    if (previousTask) previousTask.destroy().catch(() => {});
    sourceBytes = undefined;
    sourceName = undefined;
    dragging = undefined;
    order = [];
    selected = new Set();
    undoStack = [];
    draw();
    el('document-name').textContent = file.name;
    status('Opening the PDF…');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a PDF under 50 MB.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const count = (await window.PDFLib.PDFDocument.load(bytes)).getPageCount();
      if (current !== generation) return;
      if (count < 1 || count > 500) throw new Error('Choose a PDF with 1 to 500 pages.');
      sourceBytes = bytes;
      sourceName = file.name;
      order = Array.from({ length: count }, (_, id) => ({ id, rotation: 0 }));
      draw();
      status(count + (count === 1 ? ' page loaded.' : ' pages loaded.'));
      loadThumbnails(bytes, current);
    } catch (error) {
      if (current !== generation) return;
      status(/encrypted/i.test(error.message)
        ? 'This PDF is password-protected. Use Remove PDF password in PDF Tools first.'
        : 'Could not open this PDF. ' + error.message);
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) openFile(file);
  });
  el('select-all').onclick = () => {
    selected = selected.size === order.length ? new Set() : new Set(order.map(page => page.id));
    draw();
  };
  el('rotate').onclick = () => {
    change(order.map(page => selected.has(page.id) ? { ...page, rotation: (page.rotation + 90) % 360 } : page),
      'Selected pages rotated clockwise.');
  };
  el('delete').onclick = () => {
    const next = order.filter(page => !selected.has(page.id));
    if (next.length) change(next, 'Selected pages removed. Use Undo to restore them.');
  };
  el('undo').onclick = () => {
    if (!undoStack.length) return;
    order = undoStack.pop();
    selected = new Set();
    draw();
    status('Last page change undone.');
  };
  el('export').onclick = async () => {
    const source = sourceBytes;
    const name = sourceName;
    const current = generation;
    const button = el('export');
    button.disabled = true;
    try {
      const bytes = await exportPageOrder(window.PDFLib, source, order);
      if (current !== generation) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name.replace(/\.pdf$/i, '') + '-organized.pdf';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status('Organized PDF downloaded.');
    } catch (error) {
      if (current === generation) status('Could not export this PDF. ' + error.message);
    } finally {
      button.disabled = false;
    }
  };

  const savedFile = new URLSearchParams(location.search).get('file');
  if (savedFile) {
    LuminaLibrary.get(savedFile).then(record => {
      if (generation) return;
      if (record?.kind !== 'pdf' || !(record.file instanceof Blob)) throw new Error('File missing.');
      return openFile(new File([record.file], record.title, { type: 'application/pdf' }));
    }).catch(() => status('Could not find that PDF in the workspace.'));
  }
}
