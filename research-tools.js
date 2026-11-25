'use strict';

const ResearchTools = (() => {
  function parseCsv(source) {
    const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    let afterQuote = false;
    function endField() {
      row.push(value);
      value = '';
      afterQuote = false;
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
        else if (char === '"') { quoted = false; afterQuote = true; }
        else value += char;
      } else if (char === ',' || char === '\n') {
        endField();
        if (char === '\n') {
          if (row.some(cell => cell.trim())) rows.push(row);
          row = [];
        }
      } else if (char === '"' && !value && !afterQuote) {
        quoted = true;
      } else {
        if (afterQuote || char === '"') throw new Error('Check the quotation marks in your CSV.');
        value += char;
      }
    }
    if (quoted) throw new Error('A quoted CSV field is missing its closing quotation mark.');
    endField();
    if (row.some(cell => cell.trim())) rows.push(row);
    if (rows.length < 2 || rows[0].length < 2) throw new Error('Use a CSV with a header and at least two columns.');
    const [header, ...data] = rows;
    if (data.some(record => record.length !== header.length)) throw new Error('Every CSV row needs the same number of columns.');
    return { header, data };
  }

  function chartPoints(data, labelIndex, valueIndex) {
    const points = [];
    let skipped = 0;
    for (const row of data) {
      const label = row[labelIndex]?.trim();
      const value = row[valueIndex]?.trim();
      const number = Number(value);
      if (!label || !value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
          !Number.isFinite(number) || Math.abs(number) > 1e100) {
        skipped++;
        continue;
      }
      points.push({ label, value: number });
    }
    if (!points.length) throw new Error('This value column has no numeric rows with a label.');
    return { points: points.slice(0, 20), skipped, omitted: Math.max(0, points.length - 20) };
  }

  function drawChart(canvas, points, title, valueLabel, style) {
    const ctx = canvas.getContext('2d');
    canvas.width = 1000;
    canvas.height = 550;
    const { width, height } = canvas;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const left = 115, right = 950, top = 100, bottom = 400;
    const max = Math.max(0, ...points.map(point => point.value));
    const min = Math.min(0, ...points.map(point => point.value));
    const span = max - min || 1;
    const y = value => bottom - (value - min) / span * (bottom - top);
    const step = (right - left) / points.length;
    const x = index => left + (index + 0.5) * step;
    ctx.fillStyle = '#202a45';
    ctx.font = 'bold 30px system-ui';
    ctx.fillText(title.slice(0, 120), 55, 53, 890);
    ctx.font = '17px system-ui';
    ctx.fillText(valueLabel.slice(0, 100), 55, 83, 890);
    ctx.textAlign = 'right';
    for (let tick = 0; tick <= 4; tick++) {
      const value = min + span * tick / 4;
      ctx.strokeStyle = '#dce1ed';
      ctx.beginPath();
      ctx.moveTo(left, y(value));
      ctx.lineTo(right, y(value));
      ctx.stroke();
      ctx.fillStyle = '#34415d';
      ctx.fillText(Number(value.toPrecision(4)).toString(), left - 12, y(value) + 6, 88);
    }
    ctx.strokeStyle = '#495473';
    ctx.beginPath();
    ctx.moveTo(left, y(0));
    ctx.lineTo(right, y(0));
    ctx.stroke();
    ctx.fillStyle = '#4d43b7';
    if (style === 'line') {
      ctx.strokeStyle = '#4d43b7';
      ctx.lineWidth = 4;
      ctx.beginPath();
      points.forEach((point, i) => { if (i) ctx.lineTo(x(i), y(point.value)); else ctx.moveTo(x(i), y(point.value)); });
      ctx.stroke();
      points.forEach((point, i) => { ctx.beginPath(); ctx.arc(x(i), y(point.value), 5, 0, Math.PI * 2); ctx.fill(); });
    } else {
      points.forEach((point, i) => ctx.fillRect(x(i) - step * 0.3, Math.min(y(0), y(point.value)),
        step * 0.6, Math.abs(y(point.value) - y(0))));
    }
    ctx.textAlign = 'right';
    ctx.font = '15px system-ui';
    ctx.fillStyle = '#34415d';
    points.forEach((point, i) => {
      ctx.save();
      ctx.translate(x(i), bottom + 12);
      ctx.rotate(-Math.PI / 4);
      const label = point.label.length > 20 ? point.label.slice(0, 19) + '…' : point.label;
      ctx.fillText(label, 0, 6, 130);
      ctx.restore();
    });
  }

  function excerpt(text, limit) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= limit) return clean;
    const prefix = clean.slice(0, limit);
    const lastSpace = prefix.lastIndexOf(' ');
    return prefix.slice(0, lastSpace > limit * 0.65 ? lastSpace : limit).trimEnd() + '…';
  }

  function buildDefenseDeck(title, sections, citations) {
    const draft = (title.trim() || 'Untitled thesis').slice(0, 75);
    const slides = [{ title: draft, body: 'Thesis defense draft', layout: 'cover', theme: 'ink', transition: 'fade' }];
    let extraSlides = 100;
    for (const section of sections.slice(0, 40)) {
      const body = section.paragraphs.map(text => text.trim()).filter(Boolean);
      const captions = section.captions.map(text => text.trim()).filter(Boolean);
      const abbreviated = body.length > 4 || body.slice(0, 4).some(text => excerpt(text, 130).endsWith('…'));
      const preview = body.slice(0, 4).map(text => excerpt(text, 130));
      if (!preview.length) preview.push('Add your talking points for this section.');
      const flags = [abbreviated ? 'Review and shorten the excerpts into talking points.' : '', !body.length ? 'This section has no body text.' : ''].filter(Boolean);
      slides.push({
        title: excerpt(section.title, 165), body: preview.join('\n'), layout: 'bullets', theme: 'ink',
        notes: ['Source section: ' + section.title, ...flags, ...(captions.length ? ['Captions: ' + captions.join(' | ')] : [])].join('\n').slice(0, 5000)
      });
      if (captions.length) {
        for (let offset = 0; offset < Math.min(captions.length, 10) && extraSlides > 0; offset += 4) {
          extraSlides--;
          slides.push({ title: excerpt(section.title, 145) + ' · Figures and tables', body: captions.slice(offset, Math.min(offset + 4, 10)).map(text => excerpt(text, 150)).join('\n'), layout: 'bullets', theme: 'ink' });
        }
      }
    }
    for (let offset = 0; offset < Math.min(citations.length, 40); offset += 5) {
      const body = citations.slice(offset, Math.min(offset + 5, 40)).map((citation, index) => {
        const text = [citation.author, citation.title, citation.source, citation.year, citation.url].filter(Boolean).join('. ');
        return '[' + (offset + index + 1) + '] ' + excerpt(text, 150);
      }).join('\n');
      slides.push({ title: offset ? 'References · continued' : 'References', body, layout: 'text', theme: 'ink',
        notes: 'Source bibliography. Review citation wording and formatting before presenting.' });
    }
    return { title: draft + ' · defense', slides: slides.slice(0, 150), updatedAt: Date.now() };
  }

  return { parseCsv, chartPoints, drawChart, buildDefenseDeck };
})();

if (typeof module !== 'undefined') module.exports = ResearchTools;
