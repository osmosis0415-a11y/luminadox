'use strict';

function openResearchChart(insertChart) {
  const dialog = document.createElement('dialog');
  dialog.className = 'research-dialog';
  dialog.setAttribute('aria-label', 'Create a chart from CSV');
  dialog.innerHTML = `
    <section>
      <header><h2>Chart from CSV</h2><button type="button" data-close>Close</button></header>
      <label>CSV file <input data-csv type="file" accept=".csv,text/csv"></label>
      <p>Use a header row, one label column, and one numeric column. Charts show up to 20 values.</p>
      <div class="research-columns">
        <label>Chart title <input data-title maxlength="120" value="Research chart"></label>
        <label>Chart type <select data-style><option value="bar">Bar</option><option value="line">Line</option></select></label>
        <label>Labels <select data-label disabled></select></label>
        <label>Values <select data-value disabled></select></label>
      </div>
      <canvas data-preview hidden role="img"></canvas>
      <p data-status role="status"></p>
      <footer><button type="button" data-insert disabled>Insert chart</button>
        <button type="button" data-download disabled>Download PNG</button>
        <button type="button" data-previous hidden>Insert last chart</button></footer>
    </section>`;
  document.body.append(dialog);
  const field = name => dialog.querySelector('[data-' + name + ']');
  const preview = field('preview');
  const status = field('status');
  let csv;
  let chart;
  let generation = 0;
  field('close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { if (!dialog.open) dialog.remove(); });

  function render() {
    chart = undefined;
    preview.hidden = true;
    field('insert').disabled = field('download').disabled = true;
    if (!csv) return;
    try {
      const result = ResearchTools.chartPoints(csv.data, Number(field('label').value), Number(field('value').value));
      const title = field('title').value.trim() || 'Research chart';
      const description = (title + '. ' + result.points.map(point => point.label + ': ' + point.value).join('; ')).slice(0, 1200);
      const type = field('style').value;
      ResearchTools.drawChart(preview, result.points, title, field('value').selectedOptions[0].textContent, type);
      preview.setAttribute('aria-label', description);
      preview.hidden = false;
      chart = { title, description, png: preview.toDataURL('image/png') };
      field('insert').disabled = field('download').disabled = false;
      status.textContent = result.points.length + ' plotted.' +
        (result.skipped ? ' Skipped ' + result.skipped + ' blank or non-numeric rows.' : '') +
        (result.omitted ? ' Omitted ' + result.omitted + ' rows beyond the 20-point limit.' : '');
    } catch (error) { status.textContent = error.message; }
  }

  for (const key of ['title', 'style', 'label', 'value']) field(key).addEventListener('input', render);
  field('csv').onchange = async event => {
    const current = ++generation;
    const file = event.target.files[0];
    csv = undefined;
    status.textContent = '';
    field('label').disabled = field('value').disabled = true;
    render();
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a CSV under 1 MB.');
      const parsed = ResearchTools.parseCsv(await file.text());
      if (current !== generation) return;
      csv = parsed;
      for (const key of ['label', 'value']) {
        const select = field(key);
        select.replaceChildren(...csv.header.map((header, index) => new Option(header.trim() || 'Column ' + (index + 1), String(index))));
        select.disabled = false;
      }
      field('value').value = '1';
      render();
    } catch (error) { if (current === generation) status.textContent = error.message; }
  };

  function insert(result) {
    dialog.close();
    try {
      insertChart(result);
      return true;
    } catch (error) {
      status.textContent = error.message;
      dialog.showModal();
      return false;
    }
  }
  field('insert').onclick = () => {
    if (!chart) return;
    const result = chart;
    if (insert(result)) LuminaLibrary.put({ id: 'research:last-chart', kind: 'chart', ...result }).catch(() => {});
  };
  field('download').onclick = () => {
    if (!chart) return;
    const link = document.createElement('a');
    link.href = chart.png;
    link.download = 'research-chart.png';
    link.click();
  };
  LuminaLibrary.get('research:last-chart').then(record => {
    if (record?.kind !== 'chart' || !/^data:image\/png;base64,/.test(record.png)) return;
    field('previous').hidden = false;
    field('previous').onclick = () => insert(record);
  }).catch(() => {});
  dialog.showModal();
}

function chooseDefenseSections(sections, onCreate) {
  const dialog = document.createElement('dialog');
  dialog.className = 'research-dialog';
  dialog.setAttribute('aria-label', 'Create defense deck');
  dialog.innerHTML = `
    <form>
      <header><h2>Create defense deck</h2><button type="button" data-close>Close</button></header>
      <p>Choose up to 40 sections. The deck will use short excerpts, captions, and source citations. Review the draft before presenting.</p>
      <fieldset><legend>Sections</legend></fieldset>
      <p role="status"></p>
      <footer><button type="submit">Create deck</button></footer>
    </form>`;
  const fieldset = dialog.querySelector('fieldset');
  const checkboxes = sections.map((section, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = index < 40;
    label.append(input, document.createTextNode(section.title));
    fieldset.append(label);
    return input;
  });
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const chosen = sections.filter((section, index) => checkboxes[index].checked);
    const status = dialog.querySelector('[role=status]');
    if (!chosen.length || chosen.length > 40) { status.textContent = 'Select between 1 and 40 sections.'; return; }
    try { onCreate(chosen); dialog.close(); }
    catch (error) { status.textContent = error.message; }
  };
  document.body.append(dialog);
  dialog.showModal();
}
