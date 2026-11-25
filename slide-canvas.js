'use strict';

const SlideCanvas = (() => {
  const kinds = ['text', 'rectangle', 'ellipse', 'image'];
  const colorPattern = /^[0-9a-f]{6}$/i;
  const bound = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

  function normalizeObject(raw) {
    if (!raw || !kinds.includes(raw.kind)) return null;
    const w = bound(raw.w, 5, 100, 32);
    const h = bound(raw.h, 5, 100, 19);
    const image = typeof raw.image === 'string' && raw.image.length <= 1900000 &&
      /^data:image\/(?:png|jpeg);base64,[0-9a-z+/]+={0,2}$/i.test(raw.image) ? raw.image : '';
    return {
      kind: raw.kind,
      x: bound(raw.x, 0, 100 - w, Math.min(12, 100 - w)),
      y: bound(raw.y, 0, 100 - h, Math.min(12, 100 - h)),
      w, h,
      text: typeof raw.text === 'string' ? raw.text.slice(0, 1200) : '',
      color: typeof raw.color === 'string' && colorPattern.test(raw.color) ? raw.color : 'B8A5FF',
      size: bound(raw.size, 12, 72, 30),
      image
    };
  }

  function createObject(kind, color, image = '') {
    return normalizeObject({
      kind, color, image,
      text: kind === 'text' ? 'Type your text' : '',
      w: kind === 'text' ? 55 : 30,
      h: kind === 'image' ? 38 : 22
    });
  }

  function template(name, colors) {
    const [background, foreground, accent] = colors;
    const make = (kind, x, y, w, h, properties = {}) =>
      normalizeObject({ kind, x, y, w, h, ...properties });
    if (name === 'comparison') return [
      make('text', 8, 8, 84, 17, { text: 'Compare two ideas', size: 38, color: foreground }),
      make('rectangle', 8, 28, 40, 60, { color: accent }),
      make('rectangle', 52, 28, 40, 60, { color: accent }),
      make('text', 12, 37, 32, 40, { text: 'First idea\nAdd your points', size: 25, color: background }),
      make('text', 56, 37, 32, 40, { text: 'Second idea\nAdd your points', size: 25, color: background })
    ];
    if (name === 'quote') return [
      make('ellipse', 7, 12, 18, 30, { color: accent }),
      make('text', 10, 16, 12, 21, { text: '“', size: 60, color: background }),
      make('text', 29, 23, 62, 46, { text: 'Add a short quotation or key finding.', size: 34, color: foreground }),
      make('text', 30, 74, 60, 14, { text: 'Source or author', size: 20, color: foreground })
    ];
    return [
      make('rectangle', 8, 16, 14, 2, { h: 5, color: accent }),
      make('text', 8, 29, 84, 35, { text: 'Your presentation title', size: 47, color: foreground }),
      make('text', 8, 71, 80, 16, { text: 'Subtitle or presenter name', size: 22, color: foreground })
    ];
  }

  return { normalizeObject, createObject, template };
})();

if (typeof module !== 'undefined') module.exports = SlideCanvas;
