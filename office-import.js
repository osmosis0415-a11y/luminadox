'use strict';

const OfficeImport = (() => {
  const xmlType = 'application/xml';
  const relNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const children = (node, name) => Array.from(node?.children || []).filter(child => child.localName === name);
  const first = (node, name) => children(node, name)[0];
  const descendants = (node, name) => Array.from(node?.getElementsByTagNameNS('*', name) || []);
  const attr = (node, name) => Array.from(node?.attributes || []).find(item => item.localName === name)?.value;
  const element = (document, name, text) => {
    const output = document.createElement(name);
    if (text !== undefined) output.textContent = text;
    return output;
  };

  async function open(file, Zip, Parser) {
    if (file.size > 30 * 1024 * 1024) throw new Error('Choose an Office file under 30 MB.');
    const zip = await Zip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files);
    if (names.length > 5000) throw new Error('This Office file contains too many parts.');
    let readSize = 0;

    async function read(name, format, required = false) {
      const entry = zip.file(name);
      if (!entry) {
        if (required) throw new Error('The expected Office document parts are missing.');
        return null;
      }
      const size = entry._data.uncompressedSize;
      if (!Number.isFinite(size) || size > 12 * 1024 * 1024 || readSize + size > 45 * 1024 * 1024) {
        throw new Error('The uncompressed Office file is too large.');
      }
      readSize += size;
      return entry.async(format);
    }

    async function xml(name, required = false) {
      const source = await read(name, 'string', required);
      if (!source) return null;
      if (/<!DOCTYPE/i.test(source)) throw new Error('Unsupported Office XML.');
      const tree = new Parser().parseFromString(source, xmlType);
      if (tree.querySelector('parsererror')) throw new Error('The Office file contains invalid XML.');
      return tree.documentElement;
    }

    async function relationships(part) {
      const slash = part.lastIndexOf('/');
      const base = part.slice(0, slash + 1);
      const list = await xml(base + '_rels/' + part.slice(slash + 1) + '.rels');
      const result = new Map();
      for (const relation of children(list, 'Relationship')) {
        if (relation.getAttribute('TargetMode') === 'External') continue;
        const value = relation.getAttribute('Target');
        if (!value) continue;
        const url = new URL(value, 'https://office.invalid/' + part);
        if (url.origin === 'https://office.invalid' && !url.search && !url.hash) {
          result.set(relation.getAttribute('Id'), { path: decodeURIComponent(url.pathname.slice(1)), type: relation.getAttribute('Type') });
        }
      }
      return result;
    }

    async function image(part, limit = 1300000) {
      const extension = part?.split('.').pop().toLowerCase();
      if (!['png', 'jpg', 'jpeg'].includes(extension) ||
          (zip.file(part)?._data.uncompressedSize || Infinity) > limit) return '';
      const data = await read(part, 'base64');
      return data ? 'data:image/' + (extension === 'png' ? 'png' : 'jpeg') + ';base64,' + data : '';
    }
    return { xml, relationships, image };
  }

  async function word(file, Zip, Parser, document) {
    const archive = await open(file, Zip, Parser);
    const part = 'word/document.xml';
    const root = await archive.xml(part, true);
    const body = first(root, 'body');
    if (!body) throw new Error('This file has no Word document body.');
    const relationships = await archive.relationships(part);
    const result = element(document, 'div');
    async function paragraph(node) {
      const style = attr(first(first(node, 'pPr'), 'pStyle'), 'val') || '';
      const heading = /^heading\s*([1-3])$/i.exec(style);
      const block = element(document, heading ? 'h' + heading[1] : /^title$/i.test(style) ? 'h1' : 'p');
      for (const run of descendants(node, 'r')) {
        const properties = first(run, 'rPr');
        const formatted = ['b', 'i', 'u'].filter(key => {
          const value = first(properties, key);
          return value && !['0', 'false', 'none', 'off'].includes(attr(value, 'val'));
        });
        let output = block;
        for (const [name, tag] of [['b','strong'], ['i','em'], ['u','u']]) {
          if (!formatted.includes(name)) continue;
          const wrapper = element(document, tag);
          output.append(wrapper);
          output = wrapper;
        }
        for (const item of run.children) {
          if (item.localName === 't') output.append(document.createTextNode(item.textContent));
          if (item.localName === 'tab') output.append(document.createTextNode('    '));
          if (item.localName === 'br' || item.localName === 'cr') output.append(element(document, 'br'));
          if (item.localName === 'drawing') {
            const ref = attr(descendants(item, 'blip')[0], 'embed');
            const data = await archive.image(relationships.get(ref)?.path);
            if (data) {
              const image = element(document, 'img');
              image.src = data;
              image.alt = attr(descendants(item, 'docPr')[0], 'descr') || '';
              output.append(image);
            }
          }
        }
      }
      if (!block.childNodes.length) block.append(element(document, 'br'));
      return block;
    }
    for (const node of body.children) {
      if (node.localName === 'p') result.append(await paragraph(node));
      if (node.localName !== 'tbl') continue;
      const table = element(document, 'table');
      for (const row of children(node, 'tr')) {
        const tr = element(document, 'tr');
        for (const cell of children(row, 'tc')) {
          const td = element(document, 'td');
          for (const block of children(cell, 'p')) td.append(await paragraph(block));
          tr.append(td);
        }
        table.append(tr);
      }
      result.append(table);
    }
    return result.innerHTML;
  }

  function shapeText(shape) {
    return children(first(shape, 'txBody'), 'p').map(paragraph => {
      return Array.from(paragraph.children).map(run =>
        run.localName === 'br' ? '\n' : first(run, 't')?.textContent || '').join('');
    }).join('\n').trim();
  }

  async function powerpoint(file, Zip, Parser) {
    const archive = await open(file, Zip, Parser);
    const part = 'ppt/presentation.xml';
    const root = await archive.xml(part, true);
    const list = children(first(root, 'sldIdLst'), 'sldId');
    if (!list.length || list.length > 150) throw new Error('Choose a presentation with 1 to 150 slides.');
    const paths = await archive.relationships(part);
    const size = first(root, 'sldSz');
    const width = Number(attr(size, 'cx')) || 12192000;
    const height = Number(attr(size, 'cy')) || 6858000;
    const slides = [];
    for (const entry of list) {
      const ref = entry.getAttributeNS(relNS, 'id');
      const slidePart = paths.get(ref)?.path;
      if (!slidePart) throw new Error('A slide is missing from the presentation.');
      const source = await archive.xml(slidePart, true);
      const resources = await archive.relationships(slidePart);
      const notesPart = [...resources.values()].find(resource => resource.type?.endsWith('/notesSlide'));
      const notesRoot = notesPart ? await archive.xml(notesPart.path) : null;
      const notes = descendants(notesRoot, 'sp').filter(shape => {
        const type = attr(descendants(shape, 'ph')[0], 'type');
        return !type || type === 'body';
      }).map(shapeText).filter(Boolean).join('\n').slice(0, 5000);
      const objects = [];
      const colorMap = { '172044':'ink', 'FCF6E8':'paper', '123B35':'forest', '3D233B':'coral' };
      const background = (attr(descendants(first(first(source,'cSld'),'bg'), 'srgbClr')[0], 'val') || '').toUpperCase();
      const channels = background.match(/.{2}/g)?.map(value => parseInt(value,16)) || [];
      const isDark = channels.length === 3 && (channels[0]*.299+channels[1]*.587+channels[2]*.114 < 115);
      const theme = colorMap[background] || (isDark ? 'ink' : 'paper');
      let title = '';
      for (const shape of first(first(source, 'cSld'), 'spTree')?.children || []) {
        if (objects.length >= 40) break;
        if (!['sp','pic'].includes(shape.localName)) continue;
        const text = shapeText(shape);
        const props = first(shape, 'spPr');
        const offset = first(first(props, 'xfrm'), 'off');
        const extent = first(first(props, 'xfrm'), 'ext');
        const isTitle = ['title','ctrTitle'].includes(attr(descendants(shape,'ph')[0], 'type'));
        const color = attr(first(first(props, 'solidFill'), 'srgbClr'), 'val');
        const position = {
          x: offset ? Number(attr(offset,'x')) / width * 100 : 8,
          y: offset ? Number(attr(offset,'y')) / height * 100 : isTitle ? 7 : Math.min(75, 25 + objects.length * 14),
          w: extent ? Number(attr(extent,'cx')) / width * 100 : 84,
          h: extent ? Number(attr(extent,'cy')) / height * 100 : isTitle ? 15 : 24
        };
        if (shape.localName === 'pic') {
          const relation = attr(descendants(shape,'blip')[0], 'embed');
          const image = await archive.image(resources.get(relation)?.path);
          if (image) objects.push({ ...position, kind:'image', image, text:attr(descendants(shape,'cNvPr')[0],'descr') || 'Imported image' });
        } else {
          const geometry = attr(first(props,'prstGeom'),'prst');
          if (['rect', 'roundRect', 'ellipse'].includes(geometry) && (!text || color)) {
            objects.push({ ...position, kind: geometry === 'ellipse' ? 'ellipse' : 'rectangle', color: color || 'E3E1FC' });
          }
          if (text && objects.length < 40) {
            if (!title || isTitle) title = text.split('\n')[0].slice(0, 180);
            const run = descendants(first(shape, 'txBody'), 'rPr')[0];
            const fontColor = attr(first(first(run, 'solidFill'), 'srgbClr'), 'val');
            const size = Number(attr(run, 'sz')) / 100;
            objects.push({ ...position, kind:'text', text, color:fontColor || (isDark ? 'F5F3FF' : '25213A'), size:size || (isTitle ? 35 : 24) });
          }
        }
      }
      const transition = first(source, 'transition');
      const effect = Array.from(transition?.children || []).find(child => ['fade','push','wipe'].includes(child.localName));
      slides.push({ title: title || ('Slide ' + (slides.length + 1)), layout:'freeform', theme,
        transition:effect?.localName || 'none', speed:attr(transition,'spd') || 'med', notes, objects });
    }
    return slides;
  }
  return { word, powerpoint };
})();

if (typeof module !== 'undefined') module.exports = OfficeImport;
