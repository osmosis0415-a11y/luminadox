'use strict';

function paintSlideObjects(frame, objects, active, select) {
  objects.forEach((object, index) => {
    const node = document.createElement('div');
    node.className = 'canvas-object canvas-' + object.kind;
    node.style.setProperty('--object-color', '#' + object.color);
    node.style.fontSize = (object.size / 9.6) + 'cqw';
    positionSlideObject(node, object);
    if (object.kind === 'text') node.textContent = object.text;
    if (object.kind === 'image' && object.image) {
      const image = document.createElement('img');
      image.src = object.image;
      image.alt = object.text;
      image.draggable = false;
      node.append(image);
    }
    if (select) {
      node.tabIndex = 0;
      node.dataset.objectIndex = index;
      node.setAttribute('role', 'button');
      const name = object.kind === 'text' || object.kind === 'image' ? object.text.trim() : '';
      node.setAttribute('aria-label', (name || object.kind) + ', object ' + (index + 1));
      node.setAttribute('aria-pressed', String(index === active));
      node.addEventListener('focus', () => select(index));
    }
    frame.append(node);
  });
}

function positionSlideObject(node, object) {
  node.style.left = object.x + '%';
  node.style.top = object.y + '%';
  node.style.width = object.w + '%';
  node.style.height = object.h + '%';
}

function setupCanvasEditor({ getSlide, getColors, save, draw, report }) {
  const el = id => document.getElementById(id);
  const canvas = el('canvas');
  let selected = -1;
  let dragging;

  function select(index) {
    selected = index;
    for (const node of canvas.querySelectorAll('[data-object-index]')) {
      node.setAttribute('aria-pressed', String(Number(node.dataset.objectIndex) === index));
    }
    updateFields();
  }

  function updateFields() {
    const slide = getSlide();
    const freeform = slide.layout === 'freeform';
    el('freeform-controls').hidden = !freeform;
    el('body-controls').hidden = freeform;
    const item = slide.objects[selected];
    const picker = el('object-picker');
    el('object-picker-label').hidden = !freeform || !slide.objects.length;
    picker.replaceChildren(new Option('Choose an object', ''), ...slide.objects.map((object, index) => {
      const name = object.text.trim().replace(/\s+/g, ' ').slice(0, 40);
      return new Option((index + 1) + '. ' + (name || object.kind), String(index));
    }));
    picker.value = item ? String(selected) : '';
    el('object-fields').hidden = !item || !freeform;
    const full = slide.objects.length >= 40;
    for (const button of el('object-additions').querySelectorAll('button, input')) button.disabled = full;
    if (!item || !freeform) return;
    el('object-description').hidden = !['text', 'image'].includes(item.kind);
    el('object-text-label').textContent = item.kind === 'image' ? 'Image description' : 'Text';
    el('object-text').value = item.text;
    el('object-color-label').hidden = item.kind === 'image';
    el('object-size-label').hidden = item.kind !== 'text';
    el('object-color').value = '#' + item.color;
    el('object-size').value = item.size;
    el('object-front').disabled = selected === slide.objects.length - 1;
    el('object-back').disabled = selected === 0;
    el('object-copy').disabled = full;
    for (const axis of ['x', 'y', 'w', 'h']) {
      el('object-' + axis).value = Math.round(item[axis] * 10) / 10;
    }
  }

  function repaint(focus = false) {
    draw();
    updateFields();
    if (focus) canvas.querySelector('[data-object-index="' + selected + '"]')?.focus();
  }

  function apply(property, value, refreshFields = true) {
    const slide = getSlide();
    const item = slide.objects[selected];
    if (!item) return;
    slide.objects[selected] = SlideCanvas.normalizeObject({ ...item, [property]: value });
    save();
    if (refreshFields) repaint();
    else draw();
  }

  function add(item) {
    const slide = getSlide();
    if (slide.layout !== 'freeform' || slide.objects.length >= 40 || !item) return;
    slide.objects.push(item);
    selected = slide.objects.length - 1;
    save();
    repaint(true);
  }

  for (const [id, kind] of [['add-text', 'text'], ['add-rectangle', 'rectangle'], ['add-ellipse', 'ellipse']]) {
    el(id).onclick = () => {
      const [, foreground, accent] = getColors();
      add(SlideCanvas.createObject(kind, kind === 'text' ? foreground : accent));
    };
  }

  el('add-object-image').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const origin = getSlide().objects;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1400000) {
      report('Choose a JPG or PNG up to 1.4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (getSlide().objects !== origin) return;
      const item = SlideCanvas.createObject('image', '', reader.result);
      item.text = file.name.slice(0, 1200);
      add(item);
    };
    reader.onerror = () => report('The image could not be read.');
    reader.readAsDataURL(file);
  });

  el('object-text').oninput = event => {
    const item = getSlide().objects[selected];
    if (!item) return;
    item.text = event.target.value;
    save();
    draw();
    const option = el('object-picker').selectedOptions[0];
    if (option) option.textContent = (selected + 1) + '. ' + (item.text.trim().replace(/\s+/g, ' ').slice(0, 40) || item.kind);
  };
  el('object-color').oninput = event => apply('color', event.target.value.slice(1));
  for (const axis of ['x', 'y', 'w', 'h', 'size']) {
    const input = el('object-' + axis);
    input.oninput = () => {
      if (Number.isFinite(input.valueAsNumber)) apply(axis, input.valueAsNumber, false);
    };
    input.onblur = updateFields;
  }
  el('object-picker').onchange = event => select(event.target.value === '' ? -1 : Number(event.target.value));

  function shiftLayer(direction) {
    const items = getSlide().objects;
    const next = selected + direction;
    if (!items[selected] || next < 0 || next >= items.length) return;
    [items[selected], items[next]] = [items[next], items[selected]];
    selected = next;
    save();
    repaint(true);
  }
  el('object-front').onclick = () => shiftLayer(1);
  el('object-back').onclick = () => shiftLayer(-1);
  el('object-copy').onclick = () => {
    const item = getSlide().objects[selected];
    if (item) add(SlideCanvas.normalizeObject({ ...item, x: item.x + 4, y: item.y + 4 }));
  };
  function remove() {
    const items = getSlide().objects;
    if (!items[selected]) return;
    items.splice(selected, 1);
    selected = Math.min(selected, items.length - 1);
    save();
    repaint(true);
    if (selected < 0) el('add-text').focus();
  }
  el('object-delete').onclick = remove;

  canvas.addEventListener('pointerdown', event => {
    const node = event.target.closest('[data-object-index]');
    if (!node || event.button !== 0) return;
    const index = Number(node.dataset.objectIndex);
    const item = getSlide().objects[index];
    if (!item) return;
    event.preventDefault();
    node.focus({ preventScroll: true });
    const bounds = canvas.getBoundingClientRect();
    dragging = { id: event.pointerId, node, item, bounds, x: event.clientX, y: event.clientY, initialX: item.x, initialY: item.y };
    node.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (dragging?.id !== event.pointerId) return;
    const { item, bounds, initialX, initialY, node, x, y } = dragging;
    item.x = Math.max(0, Math.min(100 - item.w, initialX + (event.clientX - x) / bounds.width * 100));
    item.y = Math.max(0, Math.min(100 - item.h, initialY + (event.clientY - y) / bounds.height * 100));
    positionSlideObject(node, item);
  });
  function endDrag(event) {
    if (dragging?.id !== event.pointerId) return;
    const changed = dragging.item.x !== dragging.initialX || dragging.item.y !== dragging.initialY;
    dragging = undefined;
    if (changed) save();
    updateFields();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('keydown', event => {
    if (event.target.dataset.objectIndex === undefined) return;
    if (event.key === 'Delete') {
      event.preventDefault();
      remove();
      return;
    }
    const moves = { ArrowLeft: ['x', -1], ArrowRight: ['x', 1], ArrowUp: ['y', -1], ArrowDown: ['y', 1] };
    if (!moves[event.key]) return;
    event.preventDefault();
    const item = getSlide().objects[selected];
    if (!item) return;
    const [axis, direction] = moves[event.key];
    apply(axis, item[axis] + direction * (event.shiftKey ? 5 : 1));
    canvas.querySelector('[data-object-index="' + selected + '"]')?.focus();
  });

  return { selected: () => selected, select, reset: () => { selected = -1; }, updateFields };
}
