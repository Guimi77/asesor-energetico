import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const clean = (value) => norm(value).replace(/^[\s:;-]+/, '');

function linesFromItems(items) {
  const points = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({ str: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const groups = [];
  for (const point of points) {
    let group = groups.find((candidate) => Math.abs(candidate.y - point.y) <= 2.2);
    if (!group) {
      group = { y: point.y, items: [] };
      groups.push(group);
    }
    group.items.push(point);
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => norm(group.items.sort((a, b) => a.x - b.x).map((item) => item.str).join(' ')));
}

function firstLine(lines, regex) {
  return lines.find((line) => regex.test(line)) || '';
}

function valueAfter(line, labelRegex) {
  if (!line) return '';
  return clean(line.replace(labelRegex, ''));
}

function splitPlace(address) {
  const normalized = norm(address);
  const match = normalized.match(/,?\s*(\d{5})\s+([^()]+?)(?:\s*\(([^()]*)\))?\s*$/i);
  if (!match) return { city: '', province: '' };
  return { city: clean(match[2]), province: clean(match[3] || '') };
}

function section(lines, startRegex, endRegexes) {
  const start = lines.findIndex((line) => startRegex.test(line));
  if (start < 0) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (endRegexes.some((regex) => regex.test(lines[index]))) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end);
}

function parseHeaderFallback(lines, cups) {
  const result = {};
  const index = lines.findIndex((line) => cups && line.includes(cups));
  if (index < 0) return result;

  const before = lines.slice(Math.max(0, index - 8), index);
  const after = lines.slice(index + 1, Math.min(lines.length, index + 10));

  for (let i = before.length - 1; i >= 0; i -= 1) {
    const candidate = clean(before[i]);
    if (/^[A-ZÁÉÍÓÚÜÑ0-9 &.,'()-]{4,}$/i.test(candidate)
      && !/(RAZ[OÓ]N SOCIAL|FACTURA|FENIE|CUPS|CONTRATO|TARIFA|CIF|NIF)/i.test(candidate)) {
      result.company = candidate;
      break;
    }
  }

  for (const candidate of after) {
    if (!result.address && /\b\d{5}\b/.test(candidate) && !/(FACTURA|PERIODO|TOTAL|PAGO)/i.test(candidate)) {
      result.address = clean(candidate);
    }
    if (!result.tariff) {
      const match = candidate.match(/\b(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)\b/i);
      if (match) result.tariff = match[1].toUpperCase();
    }
    if (!result.accessContract) {
      const match = candidate.match(/\b([A-Z0-9]{8,15})\s+(?:2\.0TD|3\.0TD|6\.[1-4]TD)\b/i);
      if (match) result.accessContract = match[1];
    }
  }

  return result;
}

function parseSupply(lines) {
  const text = lines.join('\n');

  const companyLine = firstLine(lines, /Raz[oó]n Social\s*:/i);
  const taxLine = firstLine(lines, /NIF\s*\/\s*CIF\s*:/i);
  const cupsLine = firstLine(lines, /CUPS\s*:/i);
  const addressLine = firstLine(lines, /Dir\.\s*Suministro\s*:/i);
  const accessLine = firstLine(lines, /Contrato Acceso\s*:/i);
  const distributorLine = firstLine(lines, /Empresa Distribuidora\s*:/i);

  const cups = ((cupsLine.match(/\bES[A-Z0-9]{18,24}\b/i) || text.match(/\bES[A-Z0-9]{18,24}\b/i) || [])[0]) || '';
  const fallback = parseHeaderFallback(lines, cups);

  let company = valueAfter(companyLine, /.*?Raz[oó]n Social\s*:\s*/i) || fallback.company || '';
  let taxId = valueAfter(taxLine, /.*?NIF\s*\/\s*CIF\s*:\s*/i);
  let address = valueAfter(addressLine, /.*?Dir\.\s*Suministro\s*:\s*/i) || fallback.address || '';
  let distributor = valueAfter(distributorLine, /.*?Empresa Distribuidora\s*:\s*/i);

  const tariff = (((accessLine.match(/Tarifa\s*:\s*(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)
    || text.match(/Tarifa\s*:\s*(2\.0TD|3\.0TD|6\.1TD|6\.2TD|6\.3TD|6\.4TD)/i)
    || [])[1]) || fallback.tariff || '').toUpperCase();

  const accessContract = ((accessLine.match(/Contrato Acceso\s*:\s*([A-Z0-9._\/-]+)/i)
    || text.match(/Contrato Acceso\s*:\s*([A-Z0-9._\/-]+)/i)
    || [])[1]) || fallback.accessContract || '';

  if (!taxId) {
    taxId = ((text.match(/NIF\s*\/\s*CIF\s*:\s*([A-Z0-9-]{7,15})/i) || [])[1]) || '';
  }
  if (!company) {
    company = ((text.match(/Raz[oó]n Social\s*:\s*([^\n]+)/i) || [])[1]) || '';
  }
  if (!address) {
    address = ((text.match(/Dir\.\s*Suministro\s*:\s*([^\n]+)/i) || [])[1]) || '';
  }
  if (!distributor) {
    distributor = ((text.match(/Empresa Distribuidora\s*:\s*([^\n]+)/i) || [])[1]) || '';
  }

  const contract = ((text.match(/N[º°o.]?\s*de\s*Contrato\s*:\s*(CO-\d{4}-[A-Z0-9._-]+)/i)
    || text.match(/\b(CO-\d{4}-[A-Z0-9._-]+)\b/i)
    || [])[1]) || '';
  const invoiceNumber = ((text.match(/(?:N[º°o.]?\s*Factura|Factura n[º°o.]?)\s*:\s*([A-Z0-9-]+)/i) || [])[1]) || '';
  const contractType = clean(((text.match(/Tipo Contrato\s*:\s*([^\n]+)/i) || [])[1]) || '');
  const renewalDate = ((text.match(/Fecha fin del contrato de suministro\s*:\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1]) || '';
  const periodMatch = text.match(/Periodo Facturaci[oó]n\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i) || [];

  const powers = {};
  const powerLines = section(lines, /T[eé]rmino de potencia/i, [/Excesos? de Potencia/i, /Energ[ií]a reactiva/i, /Bono social/i]);
  for (let period = 1; period <= 6; period += 1) {
    const line = powerLines.find((candidate) => new RegExp(`^\\s*P${period}:?\\b`, 'i').test(candidate));
    if (!line) continue;
    const match = line.match(/([\d.]+,\d{3})\s*kW\b/i);
    if (match) powers[`p${period}`] = match[1];
  }

  const place = splitPlace(address);

  return {
    company: clean(company),
    taxId: clean(taxId),
    cups,
    tariff,
    contract,
    address: clean(address),
    city: place.city,
    province: place.province,
    distributor: clean(distributor),
    retailer: 'FENIE ENERGIA',
    accessContract,
    supplyName: clean(address),
    invoiceNumber,
    periodEnd: periodMatch[2] || '',
    contractType,
    renewalDate,
    ...powers,
  };
}

async function waitForMaster() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.EnergyMaster?.learnInvoice) return window.EnergyMaster;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('El maestro de suministros no está disponible.');
}

async function inspect(file) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const allLines = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    allLines.push(...linesFromItems(content.items));
  }

  const data = parseSupply(allLines);
  if (!data.cups) return { read: false, changed: false, data };

  const master = await waitForMaster();
  const result = master.learnInvoice(data);
  return { read: true, changed: Boolean(result?.enriched), result, data };
}

async function inspectFiles(files) {
  const pdfs = [...files].filter((file) => file.name?.toLowerCase().endsWith('.pdf'));
  if (!pdfs.length) return;

  const status = document.querySelector('#masterStatus');
  if (status) status.innerHTML = `<strong>Comprobando ${pdfs.length} factura(s) contra el maestro…</strong>`;

  let read = 0;
  let changed = 0;
  let failed = 0;

  for (const file of pdfs) {
    try {
      const result = await inspect(file);
      if (result.read) read += 1;
      if (result.changed) changed += 1;
      if (!result.read || result.result?.ok === false) failed += 1;
    } catch (error) {
      failed += 1;
      console.warn('No se pudo enriquecer el maestro desde', file.name, error);
    }
  }

  if (status) {
    status.innerHTML = `<strong>${read}/${pdfs.length} facturas vinculadas al maestro · ${changed} suministro(s) completado(s)${failed ? ` · ${failed} incidencia(s)` : ''}.</strong>`;
  }
}

let queue = Promise.resolve();
function enqueue(fileList) {
  const snapshot = [...fileList];
  if (!snapshot.length) return;
  queue = queue.then(() => inspectFiles(snapshot)).catch((error) => {
    console.warn('Error en la cola de enriquecimiento', error);
  });
}

const input = document.querySelector('#fileInput');
if (input) {
  input.addEventListener('change', (event) => enqueue(event.target.files), { capture: true });
}
