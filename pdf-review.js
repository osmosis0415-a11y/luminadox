'use strict';

function tsvWords(tsv) {
  return String(tsv || '').split(/\r?\n/).slice(1).flatMap(line => {
    const cols = line.split('\t');
    const [x,y,w,h] = cols.slice(6,10).map(Number);
    const text = cols.slice(11).join(' ').trim();
    return cols[0] === '5' && text && [x,y,w,h].every(Number.isFinite) && w > 0 && h > 0 ? [{ x,y,w,h,text }] : [];
  });
}

async function exportReview(library, bytes, marks, scans) {
  const pdf = await library.PDFDocument.load(bytes);
  const { PDFName, PDFHexString, StandardFonts, TextRenderingMode } = library;
  const font = scans.size ? await pdf.embedFont(StandardFonts.Helvetica) : null;
  for (const [index, entries] of marks) {
    const page = pdf.getPage(index);
    for (const item of entries) {
      const { rect } = item;
      const annotation = { Type:PDFName.of('Annot'), Subtype:PDFName.of(item.kind === 'note' ? 'Text' : 'Highlight'),
        Rect:rect, P:page.ref, C:[1, .82, .13], F:4, Contents:PDFHexString.fromText(item.text || 'Highlight') };
      if (item.kind === 'note') annotation.Name = PDFName.of('Comment');
      else annotation.QuadPoints = item.quads;
      page.node.addAnnot(pdf.context.register(pdf.context.obj(annotation)));
    }
  }
  for (const [index, words] of scans) {
    const page = pdf.getPage(index);
    page.pushOperators(library.pushGraphicsState(), library.setTextRenderingMode(TextRenderingMode.Invisible));
    for (const word of words) {
      const text = word.text.replace(/[^\x20-\x7e\xa0-\xff]/g, '');
      if (!text) continue;
      const width = font.widthOfTextAtSize(text,1);
      if (!width) continue;
      const size = Math.min(word.height, word.width / width);
      if (!Number.isFinite(size) || size <= 0) continue;
      page.drawText(text, { x:word.x, y:word.y, size, font, rotate:library.degrees(word.rotation) });
    }
    page.pushOperators(library.popGraphicsState());
  }
  return pdf.save({ updateFieldAppearances:false });
}
if (typeof module !== 'undefined') module.exports = { tsvWords, exportReview };

if (typeof document !== 'undefined') {
  const el = id => document.getElementById(id);
  const cdn = 'https://cdn.jsdelivr.net/npm/';
  const rendererUrl = cdn + 'pdfjs-dist@6.5.438/';
  const tesseractUrl = cdn + 'tesseract.js@6.0.1/';
  const preview = el('preview-page'), canvas = el('review-canvas');
  let rendererTask, pdf, bytes, name, viewport;
  let generation = 0, pageIndex = 0, renderedIndex = -1, paintId = 0, renderTask;
  let busy = false, draft, mode = false, tesseract;
  let marks = new Map(), scans = new Map();

  function status(message) { el('review-status').textContent = message; }
  function buttons() {
    const unavailable = !pdf || busy || renderedIndex !== pageIndex;
    el('review-controls').disabled = unavailable;
    el('add-note').disabled = unavailable;
    el('review-file').disabled = busy;
    el('page-before').disabled = pageIndex === 0;
    el('page-after').disabled = !pdf || pageIndex + 1 === pdf.numPages;
    el('page-counter').textContent = pdf ? (pageIndex + 1) + ' / ' + pdf.numPages : '';
    el('ocr-all').disabled = !pdf || pdf.numPages > 50;
    el('ocr-all').title = pdf?.numPages > 50 ? 'For PDFs over 50 pages, use OCR this page.' : '';
  }
  function modeOn(value) {
    mode = value;
    el('highlight-mode').setAttribute('aria-pressed', String(mode));
    preview.classList.toggle('selecting', mode);
  }

  function marker(box) {
    const node = document.createElement('span');
    node.className = 'review-highlight';
    for (const [style, key] of [['left','x'],['top','y'],['width','w'],['height','h']]) node.style[style] = box[key] * 100 + '%';
    return node;
  }
  function showMarks() {
    const entries = marks.get(pageIndex) || [];
    const notes = entries.filter(entry => entry.kind === 'note');
    const visual = entries.filter(entry => entry.kind === 'highlight').map(entry => marker(entry.box));
    if (notes.length) {
      const badge = document.createElement('span');
      badge.className = 'review-note';
      badge.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
      visual.push(badge);
    }
    if (draft) visual.push(marker(draft.box));
    el('review-marks').replaceChildren(...visual);
    el('annotation-list').replaceChildren(...entries.map((entry, index) => {
      const item = document.createElement('li');
      item.textContent = entry.text || 'Highlighted region';
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.disabled = busy;
      remove.onclick = () => { entries.splice(index,1); showMarks(); };
      item.append(remove);
      return item;
    }));
    el('recognized').value = (scans.get(pageIndex) || []).map(word => word.text).join(' ');
  }

  async function paint() {
    const currentPaint = ++paintId;
    const index = pageIndex;
    renderedIndex = -1;
    modeOn(false);
    buttons();
    try {
      const olderRender = renderTask;
      if (olderRender) {
        olderRender.cancel();
        await olderRender.promise.catch(() => {});
      }
      if (currentPaint !== paintId) return;
      const page = await pdf.getPage(index + 1);
      if (currentPaint !== paintId) return;
      const base = page.getViewport({ scale:1 });
      viewport = page.getViewport({ scale:Math.min(1.7,1500 / Math.max(base.width,base.height)) });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvas, canvasContext:canvas.getContext('2d'), viewport });
      await renderTask.promise;
      if (currentPaint !== paintId) return;
      renderedIndex = index;
      el('review-body').hidden = false;
      showMarks();
      status('');
    } catch {
      if (currentPaint === paintId) status('This page preview could not be rendered.');
    } finally { if (currentPaint === paintId) buttons(); }
  }

  async function openFile(file) {
    const current = ++generation;
    paintId++;
    if (renderTask) renderTask.cancel();
    if (rendererTask) rendererTask.destroy().catch(() => {});
    pdf = undefined;
    renderedIndex = -1;
    el('review-body').hidden = true;
    buttons();
    status('Opening PDF…');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Choose a PDF under 50 MB.');
      const input = new Uint8Array(await file.arrayBuffer());
      const renderer = await import(rendererUrl + 'build/pdf.min.mjs');
      if (current !== generation) return;
      renderer.GlobalWorkerOptions.workerSrc = rendererUrl + 'build/pdf.worker.min.mjs';
      rendererTask = renderer.getDocument({ data:input.slice(), cMapUrl:rendererUrl+'cmaps/', cMapPacked:true,
        standardFontDataUrl:rendererUrl+'standard_fonts/', wasmUrl:rendererUrl+'wasm/', isEvalSupported:false, enableXfa:false });
      const source = await rendererTask.promise;
      if (current !== generation) return;
      pdf = source; bytes = input; name = file.name;
      pageIndex = 0; marks = new Map(); scans = new Map();
      el('note-text').value = '';
      await paint();
    } catch (error) {
      if (current === generation) status(error.name === 'PasswordException'
        ? 'Unlock this PDF in PDF Tools before reviewing it.'
        : 'Could not open the PDF. Check the file and your connection.');
    }
  }
  el('review-file').onchange = event => { const file = event.target.files[0]; if (file) openFile(file); };
  const fromLibrary = new URLSearchParams(location.search).get('file');
  if (fromLibrary) LuminaLibrary.get(fromLibrary).then(record => {
    if (!generation && record?.kind === 'pdf') openFile(new File([record.file], record.title,{type:'application/pdf'}));
  }).catch(() => status('Could not open that PDF from Workspace.'));
  el('page-before').onclick = () => { if (pageIndex > 0) { pageIndex--; paint(); } };
  el('page-after').onclick = () => { if (pageIndex + 1 < pdf.numPages) { pageIndex++; paint(); } };
  el('highlight-mode').onclick = () => modeOn(!mode);

  function point(event) {
    const rect = preview.getBoundingClientRect();
    const clamp = value => Math.max(0,Math.min(1,value));
    return [clamp((event.clientX-rect.left)/rect.width),clamp((event.clientY-rect.top)/rect.height)];
  }
  function pdfPoint(x,y) { return viewport.convertToPdfPoint(x * viewport.width,y * viewport.height); }
  function bounds(points) {
    const xs = points.map(point=>point[0]), ys = points.map(point=>point[1]);
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  }
  function addMark(item) {
    if (!marks.has(pageIndex)) marks.set(pageIndex,[]);
    marks.get(pageIndex).push(item);
    showMarks();
  }
  preview.onpointerdown = event => {
    if (!mode || busy || event.button !== 0) return;
    event.preventDefault();
    const [x,y] = point(event);
    draft = { id:event.pointerId,x,y,box:{x,y,w:0,h:0} };
    preview.setPointerCapture(event.pointerId);
  };
  preview.onpointermove = event => {
    if (draft?.id !== event.pointerId) return;
    const [x,y] = point(event);
    draft.box = { x:Math.min(x,draft.x),y:Math.min(y,draft.y),w:Math.abs(x-draft.x),h:Math.abs(y-draft.y) };
    showMarks();
  };
  preview.onpointerup = event => {
    if (draft?.id !== event.pointerId) return;
    preview.onpointermove(event);
    const box = draft.box;
    draft = undefined;
    if (box.w >= .01 && box.h >= .008) {
      const corners = [pdfPoint(box.x,box.y),pdfPoint(box.x+box.w,box.y),pdfPoint(box.x,box.y+box.h),pdfPoint(box.x+box.w,box.y+box.h)];
      addMark({kind:'highlight', box, rect:bounds(corners), quads:corners.flat()});
    } else showMarks();
  };
  preview.onpointercancel = () => { draft = undefined; showMarks(); };
  el('add-note').onclick = () => {
    const text = el('note-text').value.trim();
    if (!text) { status('Enter the note first.'); return; }
    addMark({kind:'note',text,rect:bounds([pdfPoint(.02,.02),pdfPoint(.055,.06)])});
    el('note-text').value = '';
    status('Page note added.');
  };

  function loadOcr() {
    if (!tesseract) tesseract = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = tesseractUrl + 'dist/tesseract.min.js';
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => { script.remove(); tesseract = undefined; reject(new Error('OCR could not load.')); };
      document.head.append(script);
    });
    return tesseract;
  }
  async function recognize(indices) {
    if (busy || !pdf) return;
    busy = true;
    modeOn(false); buttons(); showMarks();
    let worker;
    let done = 0, skipped = 0, empty = 0;
    try {
      status('Loading English OCR…');
      const engine = await loadOcr();
      worker = await engine.createWorker('eng',1,{ workerPath:tesseractUrl+'dist/worker.min.js',
        corePath:cdn+'tesseract.js-core@6.0.0',langPath:cdn+'@tesseract.js-data/eng@1.0.0/4.0.0_best_int', cacheMethod:'write' });
      for (const index of indices) {
        status('Scanning page ' + (index + 1) + '…');
        const page = await pdf.getPage(index + 1);
        if ((await page.getTextContent()).items.some(item => item.str?.trim())) { skipped++; continue; }
        const base = page.getViewport({scale:1});
        const view = page.getViewport({scale:Math.min(2.5,2600/Math.max(base.width,base.height))});
        const surface = document.createElement('canvas');
        surface.width = Math.ceil(view.width); surface.height = Math.ceil(view.height);
        await page.render({canvas:surface,canvasContext:surface.getContext('2d'),viewport:view}).promise;
        const result = await worker.recognize(surface, {}, { tsv:true });
        const words = tsvWords(result.data.tsv).map(word => {
          const p = view.convertToPdfPoint(word.x,word.y+word.h);
          const q = view.convertToPdfPoint(word.x+word.w,word.y+word.h);
          const r = view.convertToPdfPoint(word.x,word.y);
          return { x:p[0],y:p[1],width:Math.hypot(q[0]-p[0],q[1]-p[1]),height:Math.hypot(r[0]-p[0],r[1]-p[1]),
            rotation:Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI,text:word.text };
        });
        if (words.length) { scans.set(index,words); done++; } else empty++;
      }
      status('OCR completed for ' + done + (done === 1 ? ' page.' : ' pages.') + (skipped ? ' Skipped ' + skipped + ' with selectable text.' : '') + (empty ? ' No text found on ' + empty + ' pages.' : ''));
    } catch (error) { status('OCR stopped. ' + error.message); }
    finally { await worker?.terminate().catch(() => {}); busy = false; buttons(); showMarks(); }
  }
  el('ocr-page').onclick = () => recognize([pageIndex]);
  el('ocr-all').onclick = () => recognize(Array.from({length:pdf.numPages},(_,index)=>index));
  el('review-download').onclick = async () => {
    busy = true; buttons();
    try {
      const output = await exportReview(window.PDFLib,bytes,marks,scans);
      const url = URL.createObjectURL(new Blob([output],{type:'application/pdf'}));
      const link = document.createElement('a'); link.href=url; link.download=name.replace(/\.pdf$/i,'')+'-reviewed.pdf'; link.click();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      status('PDF copy ready.');
    } catch (error) { status('Could not export the PDF. ' + error.message); }
    finally { busy=false; buttons(); }
  };
  buttons();
}
