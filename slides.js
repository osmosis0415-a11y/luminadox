'use strict';

const themes = {
  ink: ['172044', 'F5F3FF', 'B8A5FF'],
  paper: ['FCF6E8', '25213A', '793FC5'],
  forest: ['123B35', 'F1FDF5', '89D8A7'],
  coral: ['3D233B', 'FFF0E8', 'FFAF94']
};
const layouts = ['cover', 'text', 'bullets', 'image'];
const effects = { none: '', fade: '<p:fade/>', push: '<p:push dir="l"/>', wipe: '<p:wipe dir="l"/>' };
const durations = { fast: '220ms', med: '450ms', slow: '750ms' };
const storageKey = 'lumina_slides_v1';

function newSlide() {
  return { title: '', body: '', notes: '', layout: 'text', theme: 'ink', transition: 'none', speed: 'med', image: '', imageDescription: '' };
}

function normalizeDeck(raw) {
  if (!raw || !Array.isArray(raw.slides) || raw.slides.length === 0 || raw.slides.length > 150) {
    throw new Error('Choose a Lumina Slides file with 1 to 150 slides.');
  }
  const string = (value, maxLength) => typeof value === 'string' ? value.slice(0, maxLength) : '';
  return {
    title: string(raw.title, 100),
    slides: raw.slides.map(slide => {
      if (!slide || typeof slide !== 'object') throw new Error('The presentation contains an invalid slide.');
      const image = string(slide.image, 1900000);
      return {
        title: string(slide.title, 180), body: string(slide.body, 3000), notes: string(slide.notes, 5000),
        layout: layouts.includes(slide.layout) ? slide.layout : 'text',
        theme: Object.hasOwn(themes, slide.theme) ? slide.theme : 'ink',
        transition: Object.hasOwn(effects, slide.transition) ? slide.transition : 'none',
        speed: Object.hasOwn(durations, slide.speed) ? slide.speed : 'med',
        image: /^data:image\/(png|jpeg);base64,[0-9A-Za-z+/]+={0,2}$/.test(image) ? image : '',
        imageDescription: string(slide.imageDescription, 250)
      };
    })
  };
}

function readImageSize(data) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('A slide image could not be decoded.'));
    image.src = data;
  });
}

async function exportDeck(deck, PowerPoint, Zip, measureImage = readImageSize) {
  const pptx = new PowerPoint();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title.trim() || 'Untitled presentation';
  for (const item of deck.slides) {
    const slide = pptx.addSlide();
    const [background, color, accent] = themes[item.theme];
    slide.background = { color: background };
    const top = item.layout === 'cover' ? 2.25 : 0.8;
    const imageLayout = item.layout === 'image';
    slide.addShape(pptx.ShapeType.rect, { x: 0.9, y: top, w: 1.4, h: 0.07, line: { color: accent, transparency: 100 }, fill: { color: accent } });
    if (item.title) slide.addText(item.title, {
      x: 0.9, y: top + 0.22, w: 11.5, h: 1.1, color, bold: true, fontSize: 34, margin: 0, fit: 'shrink', valign: 'mid'
    });
    if (item.body) {
      const list = item.layout === 'bullets';
      const text = list ? item.body.split('\n').filter(line => line.trim()).map((line, index, lines) => ({
        text: line, options: { bullet: true, breakLine: index + 1 < lines.length }
      })) : item.body;
      slide.addText(text, {
        x: 0.9, y: top + 1.45, w: imageLayout ? 5.45 : 11.5, h: 6.67 - (top + 1.45),
        color, fontSize: 22, margin: 0, fit: 'shrink', valign: 'top'
      });
    }
    if (imageLayout && item.image) {
      const { width, height } = await measureImage(item.image);
      const scale = Math.min(5.55 / width, 4.4 / height);
      const w = width * scale;
      const h = height * scale;
      slide.addImage({ data: item.image, x: 6.85 + (5.55 - w) / 2, y: 2.25 + (4.4 - h) / 2, w, h, altText: item.imageDescription });
    }
    if (item.notes) slide.addNotes(item.notes);
  }

  const zip = await Zip.loadAsync(await pptx.write({ outputType: 'arraybuffer' }));
  for (const [index, slide] of deck.slides.entries()) {
    if (!effects[slide.transition]) continue;
    const file = 'ppt/slides/slide' + (index + 1) + '.xml';
    const xml = await zip.file(file).async('string');
    const transition = '<p:transition spd="' + slide.speed + '" advClick="1">' + effects[slide.transition] + '</p:transition>';
    zip.file(file, xml.replace(/<\/p:sld>/, transition + '</p:sld>'));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

if (typeof module !== 'undefined') module.exports = { normalizeDeck, exportDeck, newSlide };

if (typeof document !== 'undefined') {
  const el = id => document.getElementById(id);
  const dialog = el('show');
  let deck = {
    title: 'Untitled presentation',
    slides: [{ ...newSlide(), title: 'Your presentation starts here', body: 'Add a title, pick a theme, and make it yours.', layout: 'cover' }]
  };
  let active = 0;
  let presenting = 0;
  let message = 'Stored in this browser';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) deck = normalizeDeck(JSON.parse(saved));
  } catch {
    message = 'Could not restore your stored presentation.';
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(deck));
      el('save-status').textContent = 'Saved on this device';
    } catch {
      el('save-status').textContent = 'Device storage is full or unavailable. Save an editable copy to keep your changes.';
    }
  }

  function applyColors(node, theme) {
    const [background, foreground, accent] = themes[theme];
    node.style.setProperty('--bg', '#' + background);
    node.style.setProperty('--fg', '#' + foreground);
    node.style.setProperty('--mark', '#' + accent);
  }

  function paint(node, slide, animate = false) {
    node.dataset.layout = slide.layout;
    node.dataset.effect = animate ? slide.transition : 'none';
    node.style.setProperty('--duration', durations[slide.speed]);
    applyColors(node, slide.theme);

    const frame = document.createElement('div');
    frame.className = 'slide-inner';
    const accent = document.createElement('div');
    accent.className = 'accent';
    accent.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h2');
    title.textContent = slide.title || (animate ? '' : 'Untitled slide');
    frame.append(accent, title);
    const content = document.createElement('div');
    content.className = 'slide-content';
    if (slide.layout === 'bullets') {
      const list = document.createElement('ul');
      for (const line of slide.body.split('\n').filter(line => line.trim())) {
        const item = document.createElement('li');
        item.textContent = line;
        list.append(item);
      }
      content.append(list);
    } else {
      const body = document.createElement('p');
      body.className = 'slide-text';
      body.textContent = slide.body;
      content.append(body);
    }
    if (slide.layout === 'image' && slide.image) {
      const image = document.createElement('img');
      image.src = slide.image;
      image.alt = slide.imageDescription;
      content.append(image);
    } else if (slide.layout === 'image' && !animate) {
      const placeholder = document.createElement('span');
      placeholder.className = 'image-placeholder';
      placeholder.textContent = 'Add an image';
      content.append(placeholder);
    }
    frame.append(content);
    node.replaceChildren(frame);
  }

  function renderList() {
    const list = el('slide-list');
    const focusedSlide = Number(document.activeElement?.dataset.slideIndex);
    const buttons = deck.slides.map((slide, index) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'thumb';
      button.type = 'button';
      button.dataset.slideIndex = index;
      button.setAttribute('aria-current', String(index === active));
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      const thumb = document.createElement('span');
      thumb.className = 'mini';
      thumb.textContent = slide.title || 'Untitled slide';
      applyColors(thumb, slide.theme);
      button.append(number, thumb);
      button.addEventListener('click', () => {
        active = index;
        render();
        el('slide-list').querySelector('[aria-current=true]')?.focus();
      });
      row.append(button);
      return row;
    });
    list.replaceChildren(...buttons);
    if (Number.isInteger(focusedSlide)) list.querySelector('[data-slide-index="' + active + '"]')?.focus();
  }

  const fields = {
    'slide-title': 'title', 'slide-body': 'body', notes: 'notes', theme: 'theme',
    layout: 'layout', transition: 'transition', speed: 'speed', 'image-description': 'imageDescription'
  };
  function render() {
    const slide = deck.slides[active];
    el('deck-title').value = deck.title;
    for (const [id, property] of Object.entries(fields)) el(id).value = slide[property];
    el('image-controls').hidden = slide.layout !== 'image';
    el('image-file').value = '';
    el('clear-image').disabled = !slide.image;
    el('up').disabled = active === 0;
    el('down').disabled = active === deck.slides.length - 1;
    el('remove').disabled = deck.slides.length <= 1;
    el('add').disabled = el('duplicate').disabled = deck.slides.length >= 150;
    el('speed').disabled = slide.transition === 'none';
    paint(el('canvas'), slide);
    renderList();
  }

  for (const [id, property] of Object.entries(fields)) {
    const node = el(id);
    node.addEventListener(node.tagName === 'SELECT' ? 'change' : 'input', () => {
      const slide = deck.slides[active];
      slide[property] = node.value;
      save();
      if (id === 'layout' || id === 'transition') render();
      else if (id !== 'notes') {
        paint(el('canvas'), slide);
        if (id === 'slide-title' || id === 'theme') renderList();
      }
    });
  }

  el('deck-title').addEventListener('input', event => { deck.title = event.target.value; save(); });
  function insert(slide) {
    active++;
    deck.slides.splice(active, 0, slide);
    save();
    render();
    el('slide-title').focus();
  }
  el('add').onclick = () => insert({ ...newSlide(), theme: deck.slides[active].theme });
  el('duplicate').onclick = () => insert({ ...deck.slides[active] });
  el('remove').onclick = () => {
    const name = deck.slides[active].title || 'this untitled slide';
    if (!window.confirm('Delete ' + name + '?')) return;
    deck.slides.splice(active, 1);
    active = Math.min(active, deck.slides.length - 1);
    save();
    render();
    el('slide-list').querySelector('[aria-current=true]')?.focus();
  };

  function move(offset) {
    const next = active + offset;
    if (next < 0 || next >= deck.slides.length) return;
    const [slide] = deck.slides.splice(active, 1);
    deck.slides.splice(next, 0, slide);
    active = next;
    save();
    render();
    el('slide-list').querySelector('[aria-current=true]')?.focus();
  }
  el('up').onclick = () => move(-1);
  el('down').onclick = () => move(1);
  el('apply-theme').onclick = () => {
    const theme = deck.slides[active].theme;
    deck.slides.forEach(slide => { slide.theme = theme; });
    save();
    render();
  };

  el('image-file').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1400000) {
      el('save-status').textContent = 'Choose a JPG or PNG up to 1.4 MB.';
      event.target.value = '';
      return;
    }
    const destination = deck.slides[active];
    const reader = new FileReader();
    reader.onload = () => {
      if (!deck.slides.includes(destination)) return;
      destination.image = reader.result;
      save();
      render();
    };
    reader.onerror = () => { el('save-status').textContent = 'The image could not be read.'; };
    reader.readAsDataURL(file);
  });
  el('clear-image').onclick = () => {
    deck.slides[active].image = '';
    save();
    render();
  };

  function showSlide(index) {
    if (index < 0 || index >= deck.slides.length) return;
    presenting = index;
    paint(el('show-slide'), deck.slides[index], true);
    el('counter').textContent = (index + 1) + ' / ' + deck.slides.length;
    el('previous').disabled = index === 0;
    el('next').disabled = index === deck.slides.length - 1;
    el('present-notes').textContent = deck.slides[index].notes || 'No notes for this slide.';
  }
  el('present').onclick = () => {
    el('present-notes').hidden = true;
    el('toggle-notes').setAttribute('aria-expanded', 'false');
    dialog.showModal();
    showSlide(active);
    el('exit').focus();
  };
  el('previous').onclick = () => showSlide(presenting - 1);
  el('next').onclick = () => showSlide(presenting + 1);
  el('exit').onclick = () => dialog.close();
  el('toggle-notes').onclick = () => {
    const notes = el('present-notes');
    notes.hidden = !notes.hidden;
    el('toggle-notes').setAttribute('aria-expanded', String(!notes.hidden));
  };
  dialog.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') showSlide(0);
    else if (event.key === 'End') showSlide(deck.slides.length - 1);
    else showSlide(presenting + (['ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1));
  });

  function download(bytes, type, extension) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement('a');
    const name = deck.title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80);
    link.href = url;
    link.download = (name || 'presentation') + extension;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  el('backup').onclick = () => download(JSON.stringify(deck), 'application/json', '.lumina-slides.json');
  el('restore').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 30000000) throw new Error('Editable copies must be under 30 MB.');
      const restored = normalizeDeck(JSON.parse(await file.text()));
      if (!window.confirm('Replace the open presentation with this copy?')) return;
      deck = restored;
      active = 0;
      save();
      render();
    } catch (error) {
      el('save-status').textContent = 'Could not open the copy. ' + error.message;
    } finally {
      event.target.value = '';
    }
  });
  el('export').onclick = async () => {
    const button = el('export');
    button.disabled = true;
    el('save-status').textContent = 'Creating PowerPoint…';
    try {
      const snapshot = normalizeDeck(deck);
      const bytes = await exportDeck(snapshot, window.PptxGenJS, window.JSZip);
      download(bytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx');
      el('save-status').textContent = 'PowerPoint file ready.';
    } catch (error) {
      el('save-status').textContent = 'Could not export PowerPoint. ' + error.message;
    } finally {
      button.disabled = false;
    }
  };

  render();
  el('save-status').textContent = message;
}
