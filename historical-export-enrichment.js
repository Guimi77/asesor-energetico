/* Adds the same consolidated Historical recommendations to the Facturas exports.
 * Read-only: it queries only RLS-authorized structured history, never PDFs.
 * If history cannot be checked, the workbook says so explicitly instead of silently omitting it.
 */
(function (root) {
  'use strict';

  const REPORT_NAME = 'Informe_Energetico_Instalacions_BT.xlsx';
  const clean = v => String(v ?? '').trim();
  const cupsKey = v => {
    const x = clean(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return x.startsWith('ES') && x.length >= 20 ? x.slice(0, 20) : x;
  };
  const dateES = v => /^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v).split('-').reverse().join('/') : '—';
  const money = v => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2});
  const palette = () => Object.assign({navy:'#061B38',blue:'#1834B8',amber:'#EFAB29',red:'#B42318',light:'#F4F7FB',text:'#10233F',muted:'#65758A'}, root.IBT_REPORT_TEMPLATE?.palette || {});
  const argb = c => 'FF' + String(c || '#000000').replace('#', '');
  const unique = values => [...new Set(values.filter(Boolean))];

  function workbookRows(wb) {
    const ws = wb?.Sheets?.Resumen;
    if (!ws || !root.XLSX?.utils?.sheet_to_json) return [];
    return root.XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:''}).slice(3).filter(r => clean(r?.[1]));
  }
  function workbookCups(wb) { return unique(workbookRows(wb).map(r => clean(r[3])).filter(v => cupsKey(v).startsWith('ES'))); }
  function workbookCompanyCount(wb) { return Math.max(1, unique(workbookRows(wb).map(r => clean(r[2]) || 'SIN EMPRESA')).length); }

  function itemRange(item) {
    const starts = (item?.sources || []).map(s => clean(s.start)).filter(Boolean).sort();
    const ends = (item?.sources || []).map(s => clean(s.end)).filter(Boolean).sort();
    return starts.length && ends.length ? `${dateES(starts[0])} - ${dateES(ends.at(-1))}` : '—';
  }
  function sourceText(item) {
    return (item?.sources || []).map(s => `${clean(s.invoice) || 'Sin referencia'} · ${dateES(s.start)}-${dateES(s.end)}`).join('\n') || '—';
  }
  function measurementText(item) {
    const rows = item?.measurements || [];
    if (!rows.length) return '—';
    if (item.detailKind === 'power') return rows.map(x => `P${x.period}: ${Number(x.contracted).toLocaleString('es-ES',{minimumFractionDigits:3,maximumFractionDigits:3})} kW contratados · máximo ${Number(x.maximum).toLocaleString('es-ES',{minimumFractionDigits:3,maximumFractionDigits:3})} kW · ${Number(x.ratio*100).toLocaleString('es-ES',{minimumFractionDigits:1,maximumFractionDigits:1})} %`).join('\n');
    if (item.detailKind === 'excess') return rows.map(x => `P${x.period}: ${x.invoices} factura(s) · máximo exceso ${Number(x.maximumExcessKw || 0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} kW · ${money(x.amount)} €`).join('\n');
    if (item.detailKind === 'reactive') return rows.map(x => `P${x.period}: ${x.invoices} factura(s) · ${money(x.amount)} €`).join('\n');
    return '—';
  }
  function typeLabel(type) {
    return ({power:'Potencia',excess:'Excesos de potencia',reactive:'Energía reactiva','zero-consumption':'Consumo cero','reading-quality':'Calidad de lectura'})[type] || clean(type) || 'Revisión';
  }

  function itemsForCups(snapshot, cups) {
    const keys = new Set((cups || []).map(cupsKey).filter(Boolean));
    return (snapshot?.items || []).filter(item => keys.has(cupsKey(item.cups)));
  }
  function missingForCups(snapshot, cups) {
    const keys = new Set((cups || []).map(cupsKey).filter(Boolean));
    return (snapshot?.missingCups || []).filter(c => keys.has(cupsKey(c)));
  }
  function recommendationTableRows(snapshot, cups) {
    return itemsForCups(snapshot, cups).map(item => [
      item.holderName || '—', item.cups || '—', item.supplyName || '—', typeLabel(item.type), itemRange(item),
      item.sources?.length || 0, item.amount == null ? '' : Number(item.amount), item.evidence || '', measurementText(item),
      item.action || '', item.caveat || '', sourceText(item)
    ]);
  }

  function errorSnapshot(cups, error) {
    return {checked:false, error:clean(error?.message || error || 'Histórico no disponible'), requestedCups:[...(cups || [])], matchedCups:[], missingCups:[...(cups || [])], items:[], used:0, excluded:0, duplicates:0, supplies:0, records:0};
  }

  async function fetchAllInvoices(supabase, supplyIds) {
    const select = `
      id,supply_id,invoice_number,billing_start,billing_end,billing_days,tariff,retailer,distributor,
      consumption_kwh,energy_cost_eur,power_cost_eur,excess_cost_eur,reactive_cost_eur,compensation_eur,
      social_bonus_eur,meter_rental_eur,distributor_charges_eur,electricity_tax_eur,vat_eur,igic_eur,
      other_cost_eur,total_eur,accounted_eur,difference_eur,average_total_eur_kwh,validation_status,validation_message,reading_status,reading_source_label,
      invoice_energy_periods(period,consumption_kwh,energy_cost_eur,unit_price_eur_kwh),
      invoice_power_periods(period,contracted_kw,billed_power_eur,unit_price_eur_kw_day),
      invoice_maximeters(period,maximeter_kw,reliable,source),
      invoice_excesses(period,excess_kw,amount_eur),
      invoice_reactive(period,reactive_kvarh,amount_eur),
      invoice_adjustments(concept,amount_eur,category)
    `;
    const out = [];
    for (let from = 0; ; from += 1000) {
      const {data, error} = await supabase.from('invoices').select(select).in('supply_id', supplyIds).order('billing_start', {ascending:true}).range(from, from + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
      if (out.length > 20000) throw Error('El histórico supera 20.000 periodos para esta exportación. Acota la selección.');
    }
    return out;
  }

  async function fetchSnapshot(wb) {
    const requestedCups = workbookCups(wb);
    if (!requestedCups.length) return {checked:true, error:null, requestedCups:[], matchedCups:[], missingCups:[], items:[], used:0, excluded:0, duplicates:0, supplies:0, records:0};
    const supabase = root.ibtSupabase;
    const recommendations = root.IBTHistoryRecommendations;
    if (!supabase || !recommendations?.build) return errorSnapshot(requestedCups, 'No se ha cargado la conexión al histórico o el motor de recomendaciones.');

    try {
      const selectSupply = 'id,holder_id,cups,supply_name,address,city,province,status';
      const exact = await supabase.from('supplies').select(selectSupply).in('cups', requestedCups);
      if (exact.error) throw exact.error;
      const byId = new Map((exact.data || []).map(s => [s.id, s]));
      const requestedKeys = new Set(requestedCups.map(cupsKey));
      const foundKeys = new Set([...byId.values()].map(s => cupsKey(s.cups)));
      if ([...requestedKeys].some(k => !foundKeys.has(k))) {
        const fallback = await supabase.from('supplies').select(selectSupply);
        if (fallback.error) throw fallback.error;
        for (const s of fallback.data || []) if (requestedKeys.has(cupsKey(s.cups))) byId.set(s.id, s);
      }
      const supplies = [...byId.values()].filter(s => requestedKeys.has(cupsKey(s.cups)));
      const matchedKeys = new Set(supplies.map(s => cupsKey(s.cups)));
      const missingCups = requestedCups.filter(c => !matchedKeys.has(cupsKey(c)));
      if (!supplies.length) return {checked:true,error:null,requestedCups,matchedCups:[],missingCups,items:[],used:0,excluded:0,duplicates:0,supplies:0,records:0};

      const holderIds = unique(supplies.map(s => s.holder_id));
      const holderQuery = await supabase.from('holders').select('id,client_id,legal_name,tax_id,status').in('id', holderIds);
      if (holderQuery.error) throw holderQuery.error;
      const holders = holderQuery.data || [];
      const holderById = new Map(holders.map(h => [h.id, h]));
      const supplyById = new Map(supplies.map(s => [s.id, s]));
      const records = await fetchAllInvoices(supabase, supplies.map(s => s.id));
      const result = recommendations.build({records, supplies});
      const items = result.items.map(item => {
        const supply = supplyById.get(item.supplyId) || {};
        const holder = holderById.get(supply.holder_id) || {};
        return Object.assign({}, item, {
          cups:supply.cups || '',
          supplyName:supply.supply_name || supply.address || '',
          holderName:holder.legal_name || '',
        });
      });
      return {
        checked:true, error:null, requestedCups,
        matchedCups:supplies.map(s => s.cups), missingCups, items,
        used:result.used, excluded:result.excluded, duplicates:result.duplicates, supplies:result.supplies, records:records.length,
      };
    } catch (error) {
      console.error('No se pudo incorporar el histórico al Excel', error);
      return errorSnapshot(requestedCups, error);
    }
  }

  function styleSheetJs(ws, rowsCount, cols) {
    const p = palette();
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:cols-1}},{s:{r:1,c:0},e:{r:1,c:cols-1}}];
    ws['!cols'] = [24,28,30,20,24,14,18,55,46,55,55,58].slice(0, cols).map(w => ({wch:w}));
    ws['!freeze'] = {xSplit:0,ySplit:3,topLeftCell:'A4',activePane:'bottomLeft',state:'frozen'};
    ws['!views'] = [{showGridLines:false}];
    const title = ws.A1, subtitle = ws.A2;
    if (title) title.s = {font:{bold:true,color:{rgb:'FFFFFF'},sz:18},fill:{fgColor:{rgb:p.navy.replace('#','')}},alignment:{vertical:'center'}};
    if (subtitle) subtitle.s = {font:{italic:true,color:{rgb:p.muted.replace('#','')}},fill:{fgColor:{rgb:p.light.replace('#','')}},alignment:{vertical:'center',wrapText:true}};
    for (let c=0;c<cols;c++) {
      const cell = ws[root.XLSX.utils.encode_cell({r:2,c})];
      if (cell) cell.s = {font:{bold:true,color:{rgb:'FFFFFF'},sz:10},fill:{fgColor:{rgb:p.blue.replace('#','')}},alignment:{horizontal:'center',vertical:'center',wrapText:true}};
    }
    for (let r=3;r<rowsCount;r++) for (let c=0;c<cols;c++) {
      const cell = ws[root.XLSX.utils.encode_cell({r,c})];
      if (cell) cell.s = {font:{color:{rgb:p.text.replace('#','')},sz:9},fill:{fgColor:{rgb:r%2?'FFFFFF':p.light.replace('#','')}},alignment:{vertical:'top',wrapText:true}};
    }
  }

  function addSheetJsRecommendations(wb, snapshot) {
    if (!root.XLSX?.utils || !wb || wb.SheetNames?.includes('Recomendaciones histórico')) return;
    const headers = ['Titular','CUPS','Suministro','Tipo','Rango analizado','Registros origen','Importe registrado €','Por qué aparece','Mediciones','Qué revisar','Cautela','Facturas de origen'];
    const subtitle = snapshot.checked
      ? `Motor de Histórico · ${snapshot.used} registro(s) validados usados · ${snapshot.matchedCups.length} CUPS localizado(s)${snapshot.missingCups.length ? ` · ${snapshot.missingCups.length} CUPS sin histórico central` : ''}. Ahorro estimado: pendiente de estudio.`
      : `HISTÓRICO NO VERIFICADO: ${snapshot.error}. El resto del informe procede de las facturas cargadas, pero esta hoja no debe interpretarse como revisión histórica completa.`;
    const rows = recommendationTableRows(snapshot, snapshot.requestedCups);
    const body = rows.length ? rows : [[snapshot.checked ? 'Sin recomendaciones consolidadas con el histórico disponible.' : 'Histórico no verificado','','','','','','','','','','','']];
    const ws = root.XLSX.utils.aoa_to_sheet([
      ['INSTAL·LACIONS BT · RECOMENDACIONES DEL HISTÓRICO'],
      [subtitle], headers, ...body
    ]);
    styleSheetJs(ws, body.length + 3, headers.length);
    root.XLSX.utils.book_append_sheet(wb, ws, 'Recomendaciones histórico');
  }

  function appendSheetJsPoints(wb, snapshot) {
    const ws = wb?.Sheets?.['Puntos a revisar'];
    if (!ws || ws.__ibtHistoryAdded || !root.XLSX?.utils?.sheet_add_aoa) return;
    ws.__ibtHistoryAdded = true;
    const rows = itemsForCups(snapshot, snapshot.requestedCups).map(item => [
      'HISTÓRICO', item.holderName || '—', item.cups || '—', itemRange(item), '',
      item.type === 'excess' && item.amount != null ? Number(item.amount) : '',
      item.type === 'reactive' && item.amount != null ? Number(item.amount) : '',
      `${item.title}. ${item.evidence} Qué revisar: ${item.action}`
    ]);
    if (!snapshot.checked) rows.push(['HISTÓRICO NO VERIFICADO','','','','','','',snapshot.error]);
    if (rows.length) root.XLSX.utils.sheet_add_aoa(ws, rows, {origin:-1});
  }

  function recordsForCups(snapshot, cups) {
    const keys = new Set((cups || []).map(cupsKey).filter(Boolean));
    if (!keys.size) return 0;
    const ids = new Set();
    for (const item of itemsForCups(snapshot, cups)) for (const source of item?.sources || []) if (source?.id) ids.add(source.id);
    if (ids.size) return ids.size;
    if ((snapshot?.matchedCups || []).length === 1 && keys.has(cupsKey(snapshot.matchedCups[0]))) return Number(snapshot.used) || 0;
    return 0;
  }
  function clientSheetStatus(snapshot, cups) {
    const items = itemsForCups(snapshot, cups), missing = missingForCups(snapshot, cups);
    if (!snapshot?.checked) return {items, missing, message:`Histórico no verificado: ${snapshot?.error || 'sin detalle'}.`};
    if (!items.length) return {items, missing, message:missing.length ? `Sin recomendaciones calculables. ${missing.length} CUPS del libro no se localizaron en el histórico central.` : 'Sin recomendaciones consolidadas con el histórico disponible.'};
    return {items, missing, message:''};
  }

  function addExcelJsRecommendations(wb, snapshot, cups, rawAddWorksheet) {
    if (!wb || wb.getWorksheet?.('RECOMENDACIONES')) return;
    const add = rawAddWorksheet || wb.addWorksheet;
    const ws = add.call(wb, 'RECOMENDACIONES', {views:[{state:'frozen',ySplit:4,showGridLines:false}]});
    const p = palette(), status = clientSheetStatus(snapshot, cups);
    const headers = ['Titular','CUPS','Suministro','Tipo','Rango analizado','Registros','Importe €','Por qué aparece','Mediciones','Qué revisar','Facturas origen'];
    ws.mergeCells(1,1,1,headers.length); ws.mergeCells(2,1,2,headers.length);
    ws.getCell(1,1).value = 'RECOMENDACIONES DEL HISTÓRICO';
    ws.getCell(1,1).font = {bold:true,size:18,color:{argb:'FFFFFFFF'}};
    ws.getCell(1,1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:argb(p.navy)}};
    const localUsed = recordsForCups(snapshot, cups);
    ws.getCell(2,1).value = snapshot?.checked
      ? `Revisión consolidada del histórico autorizado · ${localUsed} registro(s) validados de este libro. No son cambios aprobados ni ahorros garantizados.`
      : `HISTÓRICO NO VERIFICADO: ${snapshot?.error || 'sin detalle'}.`;
    ws.getCell(2,1).font = {italic:true,size:10,color:{argb:argb(p.muted)}};
    ws.getCell(2,1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:argb(p.light)}};
    ws.getCell(2,1).alignment = {wrapText:true,vertical:'middle'};
    ws.getRow(4).values = headers;
    ws.getRow(4).eachCell(c => {c.font={bold:true,color:{argb:'FFFFFFFF'},size:9};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:argb(p.blue)}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
    const rows = status.items.map(item => [item.holderName||'—',item.cups||'—',item.supplyName||'—',typeLabel(item.type),itemRange(item),item.sources?.length||0,item.amount==null?'':Number(item.amount),item.evidence||'',measurementText(item),item.action||'',sourceText(item)]);
    if (!rows.length) rows.push([status.message,'','','','','','','','','','']);
    for (const values of rows) {
      const row = ws.addRow(values); row.height = 42;
      row.eachCell({includeEmpty:true}, c => {c.font={size:9,color:{argb:argb(p.text)}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:row.number%2?'FFFFFFFF':argb(p.light)}};c.alignment={vertical:'top',wrapText:true};});
    }
    [24,27,30,20,24,12,16,55,46,55,58].forEach((w,i)=>ws.getColumn(i+1).width=w);
    ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  }

  let pendingClient = null;
  let exportToken = 0;
  let clientRequested = false;

  function installExcelJsHook() {
    const proto = root.ExcelJS?.Workbook?.prototype;
    if (!proto || proto.__ibtHistoricalExportHook) return;
    const raw = proto.addWorksheet;
    Object.defineProperty(proto, '__ibtHistoricalExportHook', {value:true, configurable:true});
    proto.addWorksheet = function(name, options) {
      const ws = raw.call(this, name, options);
      const pending = pendingClient;
      if (pending && pending.remaining > 0 && name === 'RESUMEN TOTAL') {
        try {
          const master = this.getWorksheet?.('SUMINISTROS'), cups = [];
          if (master) master.eachRow((row, number) => { if (number >= 5) { const value = clean(row.getCell(2).value); if (value) cups.push(value); } });
          addExcelJsRecommendations(this, pending.snapshot, cups, raw);
        } catch (error) {
          console.error('No se pudo añadir recomendaciones al Excel cliente', error);
        } finally {
          pending.remaining--;
          if (pending.remaining <= 0 && pendingClient?.token === pending.token) pendingClient = null;
        }
      }
      return ws;
    };
  }

  function installWriteHook() {
    if (!root.XLSX?.writeFile || root.XLSX.__ibtHistoricalExportHook) return;
    const previous = root.XLSX.writeFile.bind(root.XLSX);
    root.XLSX.__ibtHistoricalExportHook = true;
    root.XLSX.writeFile = function(wb, name, options) {
      if (name !== REPORT_NAME) return previous(wb, name, options);
      const isClient = clientRequested;
      clientRequested = false;
      const token = ++exportToken;
      Promise.resolve(fetchSnapshot(wb)).then(snapshot => {
        wb.__ibtHistoricalRecommendations = snapshot;
        addSheetJsRecommendations(wb, snapshot);
        appendSheetJsPoints(wb, snapshot);
        if (isClient) {
          pendingClient = {token, snapshot, remaining:workbookCompanyCount(wb)};
          setTimeout(() => { if (pendingClient?.token === token) pendingClient = null; }, 60000);
        }
        return previous(wb, name, options);
      }).catch(error => {
        const snapshot = errorSnapshot(workbookCups(wb), error);
        wb.__ibtHistoricalRecommendations = snapshot;
        addSheetJsRecommendations(wb, snapshot);
        appendSheetJsPoints(wb, snapshot);
        if (isClient) pendingClient = {token, snapshot, remaining:workbookCompanyCount(wb)};
        return previous(wb, name, options);
      });
      return undefined;
    };
  }

  function install() {
    installExcelJsHook();
    installWriteHook();
    root.document?.addEventListener?.('click', event => { if (event?.target?.id === 'exportClientExcel') clientRequested = true; }, true);
  }

  const api = Object.freeze({workbookCups, itemRange, sourceText, measurementText, typeLabel, itemsForCups, missingForCups, recordsForCups, recommendationTableRows, errorSnapshot, fetchSnapshot, addSheetJsRecommendations, appendSheetJsPoints, addExcelJsRecommendations, clientSheetStatus, install});
  root.IBTHistoricalExportEnrichment = api;
  install();
})(typeof globalThis !== 'undefined' ? globalThis : this);
