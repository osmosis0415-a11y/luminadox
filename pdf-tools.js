'use strict';

function selectPages(value, count) {
  if (!value.trim()) return Array.from({ length: count }, (_, index) => index);
  const selected = new Set();
  for (const part of value.split(',')) {
    const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part.trim());
    if (!match) throw new Error('Enter page numbers and ranges separated by commas.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last < first || last > count) {
      throw new Error('Use ascending ranges and page numbers from 1 to ' + count + '.');
    }
    for (let number = first; number <= last; number++) selected.add(number - 1);
  }
  return [...selected];
}

async function buildPdfResult(library, zipLibrary, operation, files, options) {
  const type = 'application/pdf';

  if (operation === 'view') {
    const file = files[0];
    return { bytes: await file.arrayBuffer(), type, filename: file.name };
  }

  const { PDFDocument, StandardFonts, degrees, rgb } = library;
  const load = async file => PDFDocument.load(await file.arrayBuffer());
  const finish = async pdf => ({ bytes: await pdf.save(), type, filename: operation + '.pdf' });

  if (operation === 'merge') {
    if (files.length < 2) throw new Error('Select at least two PDFs to merge.');
    const result = await PDFDocument.create();
    for (const file of files) {
      const source = await load(file);
      for (const page of await result.copyPages(source, source.getPageIndices())) result.addPage(page);
    }
    return finish(result);
  }

  if (operation === 'images') {
    const result = await PDFDocument.create();
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isJpeg = bytes[0] === 255 && bytes[1] === 216;
      const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      if (!isJpeg && !isPng) throw new Error('Choose JPG or PNG images.');
      const image = isJpeg ? await result.embedJpg(bytes) : await result.embedPng(bytes);
      const size = image.scaleToFit(547, 794);
      const page = result.addPage([595, 842]);
      page.drawImage(image, { ...size, x: (595 - size.width) / 2, y: (842 - size.height) / 2 });
    }
    return finish(result);
  }

  if (operation === 'text') {
    const text = (await files[0].text()).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    if (!text.trim()) throw new Error('Choose a text file with content.');
    const result = await PDFDocument.create();
    const font = await result.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    let page = result.addPage([595, 842]);
    let y = 794;
    const drawLine = line => {
      if (y < 48) {
        page = result.addPage([595, 842]);
        y = 794;
      }
      if (line) page.drawText(line, { x: 48, y, font, size: fontSize });
      y -= 15;
    };
    try {
      for (const paragraph of text.split('\n')) {
        let line = '';
        for (const character of paragraph) {
          if (font.widthOfTextAtSize(line + character, fontSize) > 499) {
            const breakAt = line.lastIndexOf(' ');
            if (breakAt > 0 && character !== ' ') {
              drawLine(line.slice(0, breakAt));
              line = line.slice(breakAt + 1) + character;
            } else {
              drawLine(line.trimEnd());
              line = character === ' ' ? '' : character;
            }
          } else {
            line += character;
          }
        }
        drawLine(line);
      }
    } catch (error) {
      if (/WinAnsi cannot encode/.test(error.message)) {
        throw new Error('Plain text conversion supports Western European characters. Other scripts need an embedded font.');
      }
      throw error;
    }
    return finish(result);
  }

  const pdf = await load(files[0]);
  const pageCount = pdf.getPageCount();
  if (!pageCount) throw new Error('This PDF has no pages.');
  if (operation === 'flatten') {
    const form = pdf.getForm();
    if (!form.getFields().length) throw new Error('This PDF has no interactive form fields.');
    form.flatten();
    return finish(pdf);
  }
  if (operation === 'remove' && !options.pages.trim()) throw new Error('Enter the pages to delete.');
  const selected = selectPages(options.pages, pageCount);

  if (operation === 'extract') {
    const result = await PDFDocument.create();
    for (const page of await result.copyPages(pdf, selected)) result.addPage(page);
    return finish(result);
  }
  if (operation === 'split') {
    if (!zipLibrary) throw new Error('The ZIP library could not load. Reload PDF Tools and try again.');
    const zip = new zipLibrary();
    for (const index of selected) {
      const result = await PDFDocument.create();
      const [page] = await result.copyPages(pdf, [index]);
      result.addPage(page);
      zip.file('page-' + String(index + 1).padStart(String(pageCount).length, '0') + '.pdf', await result.save());
    }
    return { bytes: await zip.generateAsync({ type: 'uint8array' }), type: 'application/zip', filename: 'pdf-pages.zip' };
  }
  if (operation === 'remove') {
    if (selected.length === pageCount) throw new Error('Keep at least one page in the PDF.');
    for (const index of selected.sort((a, b) => b - a)) pdf.removePage(index);
    return finish(pdf);
  }

  const font = operation === 'number' || operation === 'watermark' ? await pdf.embedFont(StandardFonts.Helvetica) : null;
  for (const index of selected) {
    const page = pdf.getPage(index);
    const { x, y, width, height } = page.getCropBox();
    if (operation === 'rotate') {
      page.setRotation(degrees((page.getRotation().angle + options.angle) % 360));
    } else if (operation === 'crop') {
      const margin = options.margin;
      if (!Number.isFinite(margin) || margin <= 0 || margin * 2 >= Math.min(width, height)) {
        throw new Error('The trim is too large for page ' + (index + 1) + '.');
      }
      page.setCropBox(x + margin, y + margin, width - 2 * margin, height - 2 * margin);
    } else {
      const watermark = operation === 'watermark';
      const text = watermark ? options.watermark.trim() : String(index + 1);
      if (!text) throw new Error('Enter watermark text.');
      let textWidth;
      try { textWidth = font.widthOfTextAtSize(text, 1); }
      catch { throw new Error('Use Western European characters in the watermark.'); }
      const size = Math.min(watermark ? 38 : 10, width * 0.8 / textWidth, height / 4);
      page.drawText(text, {
        x: x + (width - size * textWidth) / 2,
        y: y + (watermark ? (height - size) / 2 : Math.min(18, height / 8)),
        size,
        font,
        color: rgb(0.18, 0.2, 0.26),
        opacity: watermark ? 0.28 : 1
      });
    }
  }
  return finish(pdf);
}

function decryptPdf(bytes, password) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./pdf-unlock-worker.js');
    const finish = (error, output) => {
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(new Error(error));
      else resolve(output);
    };
    const timeout = setTimeout(() => finish('Password removal timed out. Check your connection and try again.'), 45000);
    worker.onmessage = ({ data }) => finish(data.error, data.output);
    worker.onerror = () => finish('Could not start the PDF password tool.');
    try {
      worker.postMessage({ bytes, password }, [bytes]);
    } catch {
      finish('Could not read the selected PDF.');
    }
  });
}

if (typeof module !== 'undefined') module.exports = { selectPages, buildPdfResult };

if (typeof document !== 'undefined') {
  const field = id => document.getElementById(id);
  const operation = field('operation');
  const files = field('files');
  const pages = field('pages');
  const status = field('status');
  const form = field('pdf-form');
  let resultUrl;
  let savedPdf;

  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = undefined;
    field('result').hidden = true;
    status.textContent = '';
  }

  function showFileOrder() {
    const order = field('file-order');
    order.hidden = !files.multiple || !files.files.length;
    order.textContent = 'File order · ' + Array.from(files.files, file => file.name).join(' → ');
  }

  function updateControls() {
    const tool = operation.value;
    const images = tool === 'images';
    const text = tool === 'text';
    files.value = '';
    files.multiple = tool === 'merge' || images;
    files.accept = images ? '.jpg,.jpeg,.png,image/jpeg,image/png' : text ? '.txt,text/plain' : '.pdf,application/pdf';
    field('file-caption').textContent = images ? 'JPG or PNG images' : text ? 'Text file' : files.multiple ? 'PDF files' : 'PDF file';
    field('page-controls').hidden = !['extract', 'split', 'remove', 'rotate', 'crop', 'watermark', 'number'].includes(tool);
    pages.required = tool === 'remove';
    field('page-help').textContent = tool === 'remove' ? 'Enter the pages to delete.' : tool === 'extract' ? 'Pages are copied in the order you enter. Leave blank for all pages.' : 'Leave blank to use every page.';
    field('rotate-controls').hidden = tool !== 'rotate';
    field('crop-controls').hidden = tool !== 'crop';
    field('margin').disabled = tool !== 'crop';
    field('watermark-controls').hidden = tool !== 'watermark';
    field('watermark').required = tool === 'watermark';
    field('password-controls').hidden = tool !== 'unlock';
    field('password').required = tool === 'unlock';
    field('password').value = '';
    if (savedPdf && !images && !text) {
      const transfer = new DataTransfer();
      transfer.items.add(savedPdf);
      files.files = transfer.files;
    }
    showFileOrder();
    clearResult();
  }

  operation.addEventListener('change', updateControls);
  files.addEventListener('change', () => {
    savedPdf = undefined;
    clearResult();
    showFileOrder();
  });
  form.addEventListener('input', event => {
    if (event.target !== files && event.target !== operation) clearResult();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearResult();
    const selectedFiles = [...files.files];
    const tool = operation.value;
    if (!['view', 'unlock'].includes(tool) && !window.PDFLib) {
      status.textContent = 'The PDF library could not load. Reload PDF Tools and try again.';
      return;
    }
    const options = {
      pages: pages.value,
      angle: Number(field('angle').value),
      margin: Number(field('margin').value),
      watermark: field('watermark').value
    };
    const controls = [...form.querySelectorAll('input, select, button')].filter(control => !control.disabled);
    controls.forEach(control => { control.disabled = true; });
    status.textContent = 'Processing files…';
    try {
      let result;
      if (tool === 'unlock') {
        const password = field('password').value;
        field('password').value = '';
        result = {
          bytes: await decryptPdf(await selectedFiles[0].arrayBuffer(), password),
          type: 'application/pdf',
          filename: selectedFiles[0].name.replace(/\.pdf$/i, '') + '-unlocked.pdf'
        };
      } else {
        result = await buildPdfResult(window.PDFLib, window.JSZip, tool, selectedFiles, options);
      }
      resultUrl = URL.createObjectURL(new Blob([result.bytes], { type: result.type }));
      const download = field('download');
      download.href = resultUrl;
      download.download = result.filename;
      const open = field('open');
      open.href = resultUrl;
      open.hidden = result.type !== 'application/pdf';
      field('result').hidden = false;
      status.textContent = 'Your file is ready.';
    } catch (error) {
      status.textContent = /encrypted/i.test(error.message)
        ? 'This PDF is encrypted. Use an unprotected copy you are authorized to edit.'
        : 'Could not process the file. ' + (error.message || 'Check the selected file and try again.');
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  });

  updateControls();
  const libraryFile = new URLSearchParams(location.search).get('file');
  if (libraryFile) {
    el('page-organizer').href = './organize-pdf.html?file=' + encodeURIComponent(libraryFile);
    el('pdf-review-link').href = './pdf-review.html?file=' + encodeURIComponent(libraryFile);
    LuminaLibrary.get(libraryFile).then(record => {
      if (record?.kind !== 'pdf' || !(record.file instanceof Blob)) throw new Error('File missing.');
      savedPdf = new File([record.file], record.title, { type: 'application/pdf' });
      operation.value = 'view';
      updateControls();
      status.textContent = record.title + ' selected. Process the file to open it.';
    }).catch(() => { status.textContent = 'Could not open the saved PDF.'; });
  }
}
