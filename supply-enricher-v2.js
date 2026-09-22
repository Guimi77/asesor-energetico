import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const clean = (value) => norm(value).replace(/^[\s:;-]+/, '');
const semantic = (value) => window.IBTPdfTextNormalizer?.repair?.(value) ?? norm(value);

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
    .map((group) => semantic(group.items.sort((a, b) => a.x - b.x).map((item) => item.str).join(' ')));
}

function firstLine(lines, regex) {
  return lines.find((line) => regex.test(line)) || '';
}

function valueAfter(line, labelRegex) {
  if (!line) return '';
  return clean(line.replace(labelRegex, ''));
}

function splitPlace(address) {
  const parsed=window.IBTFenieSupplyLocation?.parse?.(address);
  if(parsed)return{city:clean(parsed.city),province:clean(parsed.province)};
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

function endesaAddress(lines,fallback=''){
  const fromParser=clean(fallback).replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').split(/\s+(?:Su\s+comercializadora|Referencia\s+(?:de|del)\s+contrato|Contrato\s+de\s+mercado\s+libre|Potencias?\s+contratadas?|Potencia\s+contratada|CUPS|Distribuidora|Peaje|Segmento)\s*:/i)[0].replace(/\.{3,}/g,'').trim();
  const idx=lines.findIndex(l=>/Direcci[oó]n\s+de\s+suministro\s*:/i.test(l));
  if(idx<0)return fromParser;
  const stop=/\s+(?:Su\s+comercializadora|Referencia\s+(?:de|del)\s+contrato|Contrato\s+de\s+mercado\s+libre|Potencias?\s+contratadas?|Potencia\s+contratada|CUPS|Distribuidora|Peaje|Segmento)\s*:/i;
  const cut=s=>{let q=clean(s).replace(/^.*?Direcci[oó]n\s+de\s+suministro\s*:\s*/i,'').replace(/\.{3,}/g,'');const k=q.search(stop);if(k>=0)q=q.slice(0,k);return clean(q).replace(/\s*,\s*,+/g,',').replace(/[\s,;:-]+$/,'')};
  const parts=[cut(lines[idx])].filter(Boolean);
  for(let i=idx+1;i<Math.min(lines.length,idx+4);i++){
    const q=cut(lines[i]);if(!q)break;
    if(/^(?:Contrato|Referencia|Potencias?|Potencia\s+contratada|Fin\s+de\s+contrato|Permanencia|CUPS|Distribuidora|Peaje|Segmento|DESTINO|INFORMACI[ÓO]N)/i.test(q))break;
    if(/\b\d{5}\b/.test(q)||/^[A-ZÁÉÍÓÚÜÑ .,'()-]{2,45}$/i.test(q))parts.push(q);else break;
  }
  let address=parts[0]||'';
  for(const part of parts.slice(1))address+=/^[A-ZÁÉÍÓÚÜÑ .'-]{2,30}$/.test(part)&&/\b\d{5}\b/.test(address)?`, ${part}`:` ${part}`;
  return clean(address)||fromParser;
}
function splitEndesaPlace(address){
  const normalized=norm(address),match=normalized.match(/\b(\d{5})\s+([^,]+?)(?:,\s*([^,]+?))?\s*$/i);
  return match?{city:clean(match[2]),province:clean(match[3]||'')}:{city:'',province:''};
}
function parseEndesaSupply(pages,file){
  const lines=(pages||[]).flat(),text=lines.join('\n'),formats=window.IBTInvoiceFormats;
  const row=formats?.parseEndesa?.({pages,text},file,{readingClassifier:window.IBTReadingStatus?.classify});
  if(!row||row.unsupported||!row.cups)return{};
  const address=endesaAddress(lines,row.supplyAddress),place={city:clean(row.supplyCity)||splitEndesaPlace(address).city,province:clean(row.supplyProvince)||splitEndesaPlace(address).province};
  const contract=clean(row.contract||row.contractNumber),accessContract=clean(row.accessContract),distributor=clean(row.distributor),renewalDate=clean(row.renewalDate);
  const periodEnd=(String(row.period||'').match(/-\s*(\d{2}\/\d{2}\/\d{4})/)||[])[1]||'';
  const powers={};for(let p=1;p<=6;p++)if(Object.prototype.hasOwnProperty.call(row.contracted||{},`P${p}`))powers[`p${p}`]=row.contracted[`P${p}`];
  return{company:row.company,taxId:row.taxId||'',cups:row.cups,tariff:row.tariff,contract,address,city:place.city,province:place.province,distributor,retailer:'Endesa Energía S.A.U.',accessContract,supplyName:address,invoiceNumber:row.invoiceNumber,periodEnd,contractType:row.contractType||'',renewalDate,...powers};
}

function parseIberdrolaSupply(data,file){
  const parser=window.IBTIberdrolaParser;
  const row=parser?.parse?.(data,file,{parserVersion:window.IBT_PARSER_VERSION||'IBERDROLA',readingClassifier:window.IBTReadingStatus?.classify});
  if(!row||row.unsupported||!row.cups)return{};
  const address=clean(row.supplyAddress),contract=clean(row.contract||row.contractNumber),accessContract=clean(row.accessContract),distributor=clean(row.distributor),renewalDate=clean(row.renewalDate);
  const periodEnd=(String(row.period||'').match(/-\s*(\d{2}\/\d{2}\/\d{4})/)||[])[1]||'';
  const powers={};for(let p=1;p<=6;p++)if(Object.prototype.hasOwnProperty.call(row.contracted||{},`P${p}`))powers[`p${p}`]=row.contracted[`P${p}`];
  return{company:row.company,taxId:row.taxId||'',cups:row.cups,tariff:row.tariff,contract,address,city:clean(row.supplyCity),province:clean(row.supplyProvince),distributor,retailer:row.retailer||'IBERDROLA CLIENTES, S.A.U.',accessContract,supplyName:address,invoiceNumber:row.invoiceNumber,periodEnd,contractType:row.contractType||'',renewalDate,...powers};
}

function parseRepsolSupply(data,file){
  const parser=window.IBTRepsolParser;
  const row=parser?.parse?.(data,file,{parserVersion:window.IBT_PARSER_VERSION||'REPSOL',readingClassifier:window.IBTReadingStatus?.classify});
  if(!row||row.unsupported||!row.cups)return{};
  const address=clean(row.supplyAddress),contract=clean(row.contract||row.contractNumber),accessContract=clean(row.accessContract),distributor=clean(row.distributor),renewalDate=clean(row.renewalDate);
  const periodEnd=(String(row.period||'').match(/-\s*(\d{2}\/\d{2}\/\d{4})/)||[])[1]||'';
  const powers={};for(let p=1;p<=6;p++)if(Object.prototype.hasOwnProperty.call(row.contracted||{},`P${p}`))powers[`p${p}`]=row.contracted[`P${p}`];
  return{company:row.company,taxId:row.taxId||'',cups:row.cups,tariff:row.tariff,contract,address,city:clean(row.supplyCity),province:clean(row.supplyProvince),distributor,retailer:row.retailer||'Repsol Comercializadora de Electricidad y Gas, S.L.U.',accessContract,supplyName:address,invoiceNumber:row.invoiceNumber,periodEnd,contractType:row.contractType||'',renewalDate,...powers};
}

function parseNaturgySupply(data,file){
  const parser=window.IBTNaturgyParser;
  const row=parser?.parse?.(data,file,{parserVersion:window.IBT_PARSER_VERSION||'NATURGY',readingClassifier:window.IBTReadingStatus?.classify});
  if(!row||row.unsupported||!row.cups)return{};
  const address=clean(row.supplyAddress),contract=clean(row.contract||row.contractNumber),accessContract=clean(row.accessContract),distributor=clean(row.distributor),renewalDate=clean(row.renewalDate);
  const periodEnd=(String(row.period||'').match(/-\s*(\d{2}\/\d{2}\/\d{4})/)||[])[1]||'';
  const powers={};for(let p=1;p<=6;p++)if(Object.prototype.hasOwnProperty.call(row.contracted||{},`P${p}`))powers[`p${p}`]=row.contracted[`P${p}`];
  return{company:row.company,taxId:row.taxId||'',cups:row.cups,tariff:row.tariff,contract,address,city:clean(row.supplyCity),province:clean(row.supplyProvince),distributor,retailer:row.retailer||'Naturgy Clientes, S.A.U.',accessContract,supplyName:address,invoiceNumber:row.invoiceNumber,periodEnd,contractType:row.contractType||'',renewalDate,...powers};
}

async function waitForMaster() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.EnergyMaster?.learnInvoice) return window.EnergyMaster;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('El maestro de suministros no está disponible.');
}

async function inspect(file) {
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pages = [],rawPages = [];
  try {
    const pdf = await task.promise;
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      rawPages.push(content.items);pages.push(linesFromItems(content.items));
    }
  } finally {
    await task.destroy();
  }
  let pdfData={pages,rawPages,text:pages.flat().join('\n')};
  pdfData=window.IBTPdfTextNormalizer?.normalizeData?.(pdfData)??pdfData;
  const allLines=pdfData.pages.flat(),text=pdfData.text,iberdrola=window.IBTIberdrolaParser,repsol=window.IBTRepsolParser,naturgy=window.IBTNaturgyParser,formats=window.IBTInvoiceFormats;
  const isIberdrola=!!iberdrola?.detect?.(pdfData),isRepsol=!!repsol?.detect?.(pdfData),isNaturgy=!!naturgy?.detect?.(pdfData);
  if(!isIberdrola&&!isRepsol&&!isNaturgy&&!formats?.detect)return{read:false,changed:false,data:{},reason:'Detector de formato no disponible'};
  const format=isIberdrola?'iberdrola':isRepsol?'repsol':isNaturgy?'naturgy':formats.detect(text);
  const data=format==='iberdrola'?parseIberdrolaSupply(pdfData,file):format==='repsol'?parseRepsolSupply(pdfData,file):format==='naturgy'?parseNaturgySupply(pdfData,file):format==='fenie'?parseSupply(allLines):format==='endesa'?parseEndesaSupply(pdfData.pages,file):{};
  if (!data.cups) return { read: false, changed: false, data, reason:format==='unknown'?'Formato no compatible todavía':'CUPS no identificado' };
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
