/* Presentational ordering and safe sheet labels for Excel Cliente.
   No invoice data, persistence or energy calculations live here. */
(function(root) {
  'use strict';

  const RESERVED = ['RESUMEN TOTAL', 'SUMINISTROS', 'PERIODOS', 'DETALLE P1-P6', 'AJUSTES', 'RECOMENDACIONES'];

  function clean(value) {
    return String(value == null ? '' : value).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function titleCase(value) {
    const words = value.toLocaleLowerCase('es-ES').split(' ');
    return words.map((word, index) => {
      if (index && /^(de|del|la|las|el|los|y|en|a)$/.test(word)) return word;
      return word.replace(/(^|['’-])(\p{L})/gu, (all, before, letter) => before + letter.toLocaleUpperCase('es-ES'));
    }).join(' ');
  }

  function streetAndNumber(address) {
    let line = String(address == null ? '' : address).split(/[\r\n]/).find(x => x.trim()) || '';
    line = line.replace(/\b\d{5}\b.*$/u, '');
    line = line.replace(/\s+(?:ESC(?:ALERA)?|PLANTA|PISO|PUERTA|PT|PORTAL|BLOQUE|BL|BAJO|BAJ|LOCAL|LOC|APARTAMENTO|APRT|APTO|P\.?\s*K\.?)\b.*$/i, '');
    line = clean(line.replace(/[,;]+/g, ' '));
    line = line.replace(/^(?:C\/|C\.)\s*/i, '');
    line = line.replace(/^(?:CALLE|CARRER|CL\.?|AVENIDA|AVINGUDA|AVDA\.?|AV\.?|PASEO|PASSEIG|PS\.?|PLAZA|PLAÇA|PZA\.?|CARRETERA|CTRA\.?|CAMINO|CAM[IÍ]|POL[IÍ]GONO|POLIG|TRAVES[IÍ]A|TRAVESSERA|RONDA)\s+/i, '');
    line = clean(line.replace(/\b(?:N[º°.]|N[ÚU]M(?:ERO)?\.?)\s+(?=\d)/gi, ''));
    if (!line) return '';

    const numbers = [...line.matchAll(/\b\d{1,4}\b/g)];
    let label = line;
    if (numbers.length) {
      // Numbered street names begin with a number; the house number follows it.
      const chooseSecond = numbers.length > 1 && (/^\d/.test(line) || /^CN\s+\d+\s+\d+\b/i.test(line));
      const number = numbers[chooseSecond ? 1 : 0];
      label = line.slice(0, number.index + number[0].length);
      const suffix = line.slice(number.index + number[0].length).match(/^\s+(BIS|TER|[A-Z])(?=\s|$)/i);
      if (suffix) label += ' ' + suffix[1];
    } else {
      label = line.replace(/\s+S\s*\/\s*N\b.*$/i, ' S/N');
    }
    label = clean(label);
    if (label === label.toLocaleUpperCase('es-ES')) label = titleCase(label);
    return label;
  }

  function legalName(value) {
    return clean(value).replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim();
  }

  function supplySheetName(supply, used) {
    const label = legalName(streetAndNumber(supply?.address)) ||
      legalName(supply?.name) ||
      (clean(supply?.cups) ? 'CUPS ' + clean(supply.cups).slice(-6) : 'SUMINISTRO');
    const unavailable = new Set([...RESERVED, ...(used || [])].map(s => String(s).toLocaleLowerCase('es-ES')));
    let n = 1, candidate;
    do {
      const suffix = n === 1 ? '' : ' (' + n + ')';
      candidate = label.slice(0, 31 - suffix.length).trim() + suffix;
      n++;
    } while (unavailable.has(candidate.toLocaleLowerCase('es-ES')));
    if (used) used.add(candidate);
    return candidate;
  }

  function arrange(wb, supplyNames) {
    if (!wb || !wb.getWorksheet || !wb.getWorksheet('RESUMEN TOTAL')) {
      throw new Error('Falta la hoja RESUMEN TOTAL del Excel Cliente.');
    }
    const preferred = ['RESUMEN TOTAL', ...(supplyNames || []), 'SUMINISTROS', 'PERIODOS',
      'DETALLE P1-P6', 'AJUSTES', 'RECOMENDACIONES'];
    const seen = new Set();
    const names = [];
    for (const name of [...preferred, ...wb.worksheets.map(ws => ws.name)]) {
      if (seen.has(name) || !wb.getWorksheet(name)) continue;
      seen.add(name);
      names.push(name);
    }
    names.forEach((name, index) => { wb.getWorksheet(name).orderNo = index + 1; });
    wb.views = [{firstSheet: 0, activeTab: 0, visibility: 'visible'}];
    return names;
  }

  const api = Object.freeze({streetAndNumber, supplySheetName, arrange});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IBTClientWorkbookLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
