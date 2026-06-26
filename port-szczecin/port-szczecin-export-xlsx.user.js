// ==UserScript==
// @name         Port Szczecin - Export XLSX
// @namespace    port-szczecin-nakladka
// @version      1.1.0
// @match        https://dyspozytor.port.szczecin.pl/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @author       Michal Nogal
// ==/UserScript==

(function () {
  'use strict';

  const PORT_COLUMNS = [
    'PORT', 'Nabrz.', 'Agent', 'Ship', 'Cargo',
    'Quantity [t]', 'Relacja', 'Sped.', 'I', 'II', 'III', 'Uwagi'
  ];

  const WATER_COLUMNS = ['Lokalizacja', 'Stan wody', 'Data'];

  const C = {
    nabrz: 0,
    agent: 6,
    ship: 11,
    cargo: 32,
    qtyRelEnd: 62,
    sped: 62,
    tail: 67,
    II: 77,
    III: 86,
    uwagi: 96
  };

  function clean(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function htmlToText(html) {
    const tmp = document.createElement('textarea');
    tmp.innerHTML = String(html).replace(/<[^>]*>/g, '');
    return tmp.value.replace(/\u00a0/g, ' ');
  }

  function getLines() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, style, button, input').forEach(e => e.remove());

    return clone.innerHTML
      .replace(/\r/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .split('\n')
      .map(htmlToText)
      .filter(l => clean(l));
  }

  function isSeparator(line) {
    return /^[-_]{3,}$/.test(clean(line));
  }

  function isAttention(line) {
    return /^U\s*W\s*A\s*G\s*A:?\s*$/i.test(clean(line));
  }

  function looksLikeHeader(line, next) {
    const t = clean(line);
    if (!t || t.length < 3) return false;
    if (!isSeparator(next)) return false;
    if (isAttention(t)) return false;
    if (/PLAN PRACY|Nabrz\.|STAN WODY|P R O T O K Ó Ł|Uczestnicy/i.test(t)) return false;
    return t === t.toUpperCase();
  }

  function cut(line, a, b) {
    return clean(line.padEnd(180, ' ').slice(a, b));
  }

  function isShiftValue(v) {
    return /^(x|1|2|3|p|P|ew\.?1?)$/i.test(clean(v));
  }

  function parseCargoQtyRel(value) {
    const v = clean(value);
    let cargo = '';
    let qty = '';
    let relacja = '';

    let m = v.match(/^(.*?)\s*((?:ca)?\d+(?:\+\d+)?|\d+\s+(?:sam|wag)|dł\.?\s*\d+\.?\d*m)\s+([a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ/.-]+-[a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ/.-]+)$/);
    if (m) {
      return {
        cargo: clean(m[1]),
        qty: clean(m[2]),
        relacja: clean(m[3])
      };
    }

    m = v.match(/^(.*?)\s+([a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ/.-]+-[a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ/.-]+)$/);
    if (m) {
      return {
        cargo: clean(m[1]),
        qty: '',
        relacja: clean(m[2])
      };
    }

    m = v.match(/^(.*?)\s+(dł\.?\s*\d+\.?\d*m)$/i);
    if (m) {
      return {
        cargo: clean(m[1]),
        qty: clean(m[2]),
        relacja: ''
      };
    }

    cargo = v;
    return { cargo, qty, relacja };
  }

  function parseTail(line) {
    const p = line.padEnd(180, ' ');

    const first = cut(p, C.tail, C.II);
    const second = cut(p, C.II, C.III);
    const third = cut(p, C.III, C.uwagi);
    const rest = cut(p, C.uwagi, 180);
    const fullTail = cut(p, C.tail, 180);

    if (isShiftValue(first)) {
      return {
        I: first,
        II: isShiftValue(second) ? second : '',
        III: isShiftValue(third) ? third : '',
        uwagi: [
          !isShiftValue(second) ? second : '',
          !isShiftValue(third) ? third : '',
          rest
        ].filter(Boolean).join(' ')
      };
    }

    return {
      I: '',
      II: '',
      III: '',
      uwagi: fullTail
    };
  }

  function parseLine(line) {
    const p = line.padEnd(180, ' ');

    const nabrz = cut(p, C.nabrz, C.agent);
    const agent = cut(p, C.agent, C.ship);
    const ship = cut(p, C.ship, C.cargo);

    const mid = cut(p, C.cargo, C.qtyRelEnd);
    const parsedMid = parseCargoQtyRel(mid);

    const sped = cut(p, C.sped, C.tail);
    const tail = parseTail(p);

    return {
      nabrz,
      agent,
      ship,
      cargo: parsedMid.cargo,
      qty: parsedMid.qty,
      relacja: parsedMid.relacja,
      sped,
      I: tail.I,
      II: tail.II,
      III: tail.III,
      uwagi: tail.uwagi
    };
  }

  function isContinuationOnly(line) {
    const p = line.padEnd(180, ' ');
    const left = clean(p.slice(0, C.cargo));
    const mid = clean(p.slice(C.cargo, C.tail));
    const tail = clean(p.slice(C.tail));
    return !left && !mid && !!tail;
  }

  function isDataLine(line) {
    const t = clean(line);
    if (!t) return false;
    if (isSeparator(t)) return false;
    if (isAttention(t)) return false;
    if (/brak statków/i.test(t)) return false;
    if (/^(PLAN PRACY|Nabrz\.|STAN WODY|Powrót|Eksport XLSX)/i.test(t)) return false;

    const r = parseLine(line);
    return Boolean(r.nabrz || r.agent || r.ship || r.cargo || r.qty || r.relacja || r.sped || r.uwagi);
  }

  function extractDate(lines) {
    const text = lines.join('\n');
    const m =
      text.match(/PLAN PRACY DOBOWO-ZMIANOWY NA DZIEŃ\s+(\d{2}-\d{2}-\d{4})/i) ||
      text.match(/konferencji\s+dyspozytorskiej\s+z\s+dnia\s+(\d{2}-\d{2}-\d{4})/i);

    return m ? m[1] : new Date().toISOString().slice(0, 10);
  }

  function parseWater(lines, docDate) {
    const rows = [];
    const start = lines.findIndex(l => /STAN\s+WODY/i.test(l));
    if (start < 0) return rows;

    for (let i = start + 1; i < Math.min(lines.length, start + 20); i++) {
      const line = clean(lines[i]);
      const m = line.match(/^(.+?)\s*-\s*(\d{2,4})$/);

      if (m) {
        rows.push({
          'Lokalizacja': clean(m[1]),
          'Stan wody': Number(m[2]),
          'Data': docDate
        });
      }
    }

    return rows;
  }

  function getSelectedPorts() {
    return new Set(
      Array.from(document.querySelectorAll('.ps-port-check:checked'))
        .map(cb => cb.value)
    );
  }

  function parsePorts(lines) {
    const rows = [];
    const start = lines.findIndex(l => /Nabrz\./i.test(l) && /Agent/i.test(l) && /Statek/i.test(l));
    const end = lines.findIndex(l => /STAN\s+WODY/i.test(l));

    const from = start >= 0 ? start + 1 : 0;
    const to = end >= 0 ? end : lines.length;

    let currentPort = '';
    let inNotice = false;
    let lastRow = null;

    const selectedPorts = getSelectedPorts();

    for (let i = from; i < to; i++) {
      const line = lines[i];
      const next = lines[i + 1] || '';

      if (looksLikeHeader(line, next)) {
        currentPort = clean(line).toUpperCase();
        inNotice = false;
        i++;
        continue;
      }

      if (isAttention(line)) {
        inNotice = true;
        continue;
      }

      if (inNotice) continue;
      if (!currentPort) continue;
      if (selectedPorts.size && !selectedPorts.has(currentPort)) continue;

      if (isContinuationOnly(line) && lastRow) {
        lastRow['Uwagi'] = clean(lastRow['Uwagi'] + ' ' + clean(line));
        continue;
      }

      if (!isDataLine(line)) continue;

      const r = parseLine(line);

      const row = {
        'PORT': currentPort,
        'Nabrz.': r.nabrz,
        'Agent': r.agent,
        'Ship': r.ship,
        'Cargo': r.cargo,
        'Quantity [t]': r.qty,
        'Relacja': r.relacja,
        'Sped.': r.sped,
        'I': r.I,
        'II': r.II,
        'III': r.III,
        'Uwagi': r.uwagi
      };

      rows.push(row);
      lastRow = row;
    }

    return rows;
  }

  function getDetectedPorts() {
    const lines = getLines();
    const ports = [];
    const start = lines.findIndex(l => /Nabrz\./i.test(l) && /Agent/i.test(l) && /Statek/i.test(l));
    const end = lines.findIndex(l => /STAN\s+WODY/i.test(l));

    const from = start >= 0 ? start + 1 : 0;
    const to = end >= 0 ? end : lines.length;

    for (let i = from; i < to; i++) {
      const line = lines[i];
      const next = lines[i + 1] || '';

      if (looksLikeHeader(line, next)) {
        const port = clean(line).toUpperCase();
        if (!ports.includes(port)) ports.push(port);
        i++;
      }
    }

    return ports;
  }

  function autosize(ws, rows, cols) {
    ws['!cols'] = cols.map(col => ({
      wch: Math.min(
        Math.max(col.length + 2, ...rows.map(r => clean(r[col]).length + 2)),
        45
      )
    }));
  }

  function exportXlsx() {
    const lines = getLines();
    const docDate = extractDate(lines);
    const rows = parsePorts(lines);
    const waterRows = parseWater(lines, docDate);

    if (!rows.length) {
      alert('Nie znaleziono danych dla wybranych portów.');
      return;
    }

    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.json_to_sheet(rows, { header: PORT_COLUMNS });
    autosize(ws, rows, PORT_COLUMNS);
    XLSX.utils.book_append_sheet(wb, ws, 'Porty');

    if (waterRows.length) {
      const wsWater = XLSX.utils.json_to_sheet(waterRows, { header: WATER_COLUMNS });
      autosize(wsWater, waterRows, WATER_COLUMNS);
      XLSX.utils.book_append_sheet(wb, wsWater, 'Stan_wody');
    }

    const fileDate = docDate.split('-').reverse().join('-');
    XLSX.writeFile(wb, `${fileDate}_Ruch_statkow.xlsx`);
  }

  function addButton() {
    if (document.getElementById('ps-export-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'ps-export-panel';

    Object.assign(panel.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: 2147483647,
      width: '300px',
      maxHeight: '70vh',
      overflow: 'auto',
      padding: '12px',
      borderRadius: '12px',
      background: '#fff',
      color: '#000',
      font: '13px Arial, sans-serif',
      boxShadow: '0 4px 18px rgba(0,0,0,.3)'
    });

    const title = document.createElement('div');
    title.textContent = 'Eksport XLSX - wybierz porty';
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';

    const list = document.createElement('div');
    const ports = getDetectedPorts();

    ports.forEach(port => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.margin = '4px 0';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ps-port-check';
      cb.value = port;
      cb.checked = true;

      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + port));
      list.appendChild(label);
    });

    const selectAll = document.createElement('button');
    selectAll.textContent = 'Zaznacz wszystkie';
    selectAll.style.marginRight = '6px';
    selectAll.onclick = () => {
      document.querySelectorAll('.ps-port-check').forEach(cb => cb.checked = true);
    };

    const deselectAll = document.createElement('button');
    deselectAll.textContent = 'Odznacz';
    deselectAll.onclick = () => {
      document.querySelectorAll('.ps-port-check').forEach(cb => cb.checked = false);
    };

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Eksport XLSX';
    exportBtn.style.display = 'block';
    exportBtn.style.width = '100%';
    exportBtn.style.marginTop = '10px';
    exportBtn.style.padding = '10px';
    exportBtn.style.border = '0';
    exportBtn.style.borderRadius = '8px';
    exportBtn.style.background = '#0b5ed7';
    exportBtn.style.color = '#fff';
    exportBtn.style.fontWeight = '700';
    exportBtn.style.cursor = 'pointer';
    exportBtn.onclick = exportXlsx;

    panel.appendChild(title);
    panel.appendChild(list);
    panel.appendChild(selectAll);
    panel.appendChild(deselectAll);
    panel.appendChild(exportBtn);

    document.body.appendChild(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addButton);
  } else {
    addButton();
  }
})();