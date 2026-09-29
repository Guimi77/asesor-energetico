'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('xtra-history.js','utf8');
const compactCss=fs.readFileSync('ui-compact.css','utf8');
const compactJs=fs.readFileSync('ui-compact.js','utf8');
const folderUpload=fs.readFileSync('folder-upload.js','utf8');
const bulkPerformance=fs.readFileSync('bulk-performance.js','utf8');
const appSource=fs.readFileSync('app.js','utf8');
const refreshPolicySql=fs.readFileSync('supabase/migrations/20260929074500_refresh_improved_or_rectified_invoices.sql','utf8');
const beforePdf=source.slice(0,source.indexOf('async function readPdf')).replace(/^import[^\n]*\n/gm,'').replace(/^pdfjsLib\.GlobalWorkerOptions[^\n]*\n/gm,'');
const ctx={document:{querySelector:()=>null},Number,Math,String,RegExp};
vm.createContext(ctx);
vm.runInContext(beforePdf+'\nglobalThis.api={status,euros,powerDetails,powerPriceRows,excessRows,reactiveRows,taxRows,rightsDetail,reviewReasons};',ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
test('Completeness states distinguish missing, not applicable and unreliable data',()=>{
 assert.equal(ctx.api.status('dato',false),'extracted');
 assert.equal(ctx.api.status('',false),'not_present');
 assert.equal(ctx.api.status('',true),'unreliable');
 for(const state of ['extracted','not_present','not_applicable','unreliable','needs_review'])assert(source.includes("'"+state+"'"));
});
test('Historical power parser ignores duplicate OCR period labels when all six billed amounts exist',()=>{
 const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];
 const lines=amounts.flatMap((amount,i)=>[`P${i+1}: 70,000 kW x 13 dias = ${amount} €`,`P${i+1}:`]);
 const detail=plain(ctx.api.powerDetails(lines));
 assert.equal(detail.reliable,true);
 assert.equal(detail.value,108);
});
test('FENIE power price components survive period labels split onto separate PDF lines',()=>{
 const lines=[
  '0,040918 €/kW día + 0,014909 €/kW día + 0,000000 €/kW día = 0,055827 €/kW día x 17,000 kW x 19 días = 18,03 €',
  'P1: 38,34 €',
  '0,021628 €/kW día + 0,007461 €/kW día + 0,000000 €/kW día = 0,029089 €/kW día x 17,000 kW x 19 días = 9,40 €',
  'P2:',
  '0,006858 €/kW día + 0,005421 €/kW día + 0,000000 €/kW día = 0,012279 €/kW día x 17,000 kW x 19 días = 3,97 €',
  'P3:',
  '0,005227 €/kW día + 0,005421 €/kW día + 0,000000 €/kW día = 0,010648 €/kW día x 17,000 kW x 19 días = 3,44 €',
  'P4:',
  'P5: 0,001467 €/kW día + 0,005421 €/kW día + 0,000000 €/kW día = 0,006888 €/kW día x 17,000 kW x 19 días = 2,22 €',
  'P6: 0,001467 €/kW día + 0,002485 €/kW día + 0,000000 €/kW día = 0,003952 €/kW día x 17,000 kW x 19 días = 1,28 €'
 ];
 const rows=plain(ctx.api.powerPriceRows(lines));
 assert.equal(rows.length,6);
 assert.deepEqual(rows[0],[0.040918,0.014909,0,0.055827]);
 assert.deepEqual(rows[1],[0.021628,0.007461,0,0.029089]);
 assert.deepEqual(rows[5],[0.001467,0.002485,0,0.003952]);
});

test('Historical FENIE 3.0TD accepts missing OCR labels only with all six billed formulas',()=>{
 const amounts=['50,80','26,47','11,17','9,69','6,27','3,60'];
 const lines=amounts.map((amount,i)=>`${[0,1,2,5].includes(i)?`P${i+1}: `:''}70,000 kW x 13 dias = ${amount} €`);
 const detail=plain(ctx.api.powerDetails(lines,6));
 assert.equal(detail.reliable,true);assert.equal(detail.value,108);
 const missing=plain(ctx.api.powerDetails(lines.slice(0,5),6));
 assert.equal(missing.reliable,false);
 assert(source.includes('powerDetails(ps,expectedPowerPeriods)'));
 assert(source.includes('periodNo=expectedPowerPeriods?i+1'));
});
test('Period excess detail keeps measured kW, unit price and exact amount',()=>{
 const rows=plain(ctx.api.excessRows(['P1: 2,50 x 3,20 = 8,00 €','P2: 0,00 x 3,20 = 0,00 €']));
 assert.deepEqual(rows,[{period:1,excess_kw:2.5,unit_price:3.2,amount_eur:8},{period:2,excess_kw:0,unit_price:3.2,amount_eur:0}]);
});
test('Reactive detail keeps source quantities, cos phi, unit price and amount',()=>{
 const rows=plain(ctx.api.reactiveRows(['P1: 120,00 kVArh 0,95 20,00 kVArh x 0,041554 € / kVArh = 0,83 €']));
 assert.deepEqual(rows,[{period:1,reactive_kvarh:120,consumption_kvarh:120,cos_phi:.95,excess_kvarh:20,unit_price_eur_kvarh:.041554,amount_eur:.83}]);
});
test('Multiple tax lines remain separate instead of being collapsed',()=>{
 const rows=plain(ctx.api.taxRows(['IVA Reducido 10,00 % s/ 100,00 = 10,00 €','IVA 21,00 % s/ 50,00 = 10,50 €']));
 assert.equal(rows.length,2);assert.equal(rows[0].rate_pct,10);assert.equal(rows[0].taxable_base_eur,100);assert.equal(rows[0].amount_eur,10);assert.equal(rows[1].rate_pct,21);assert.equal(rows[1].amount_eur,10.5);
});
test('Monetary extraction never mistakes unit prices for billed euros',()=>{
 const values=plain(ctx.api.euros('0,123456 €/kWh 0,20 €/kWh = 15,47 €'));
 assert.deepEqual(values,[15.47]);
});
test('Distributor rights keep explicit detail and surface any unknown residual',()=>{
 const one=plain(ctx.api.rightsDetail(['Derechos Actuación Equipos Distribuidora (R.D. 1048/2013, Art. 29). 9,04 €'],9.04));
 assert.equal(one.status,'extracted');assert.equal(one.items.length,1);assert.equal(one.items[0].amount_eur,9.04);
 const truncated=plain(ctx.api.rightsDetail(['Derechos de Verificación Distribuidora (R.D. 1048/2013, Art. 29). (8,01€).Derechos de Extensión Distribuidora (R.D.','1048/2013, Art. 25). (39,09€).Derechos Actuación Equipos Distribuidora (R.D. 1048/2013, Art. 29). (9,04€).Derechos de 91,43 €'],91.43));
 assert.equal(truncated.status,'needs_review');assert.equal(truncated.items.length,4);
 assert.equal(truncated.items.at(-1).concept,'Derecho distribuidora no identificado');assert.equal(truncated.items.at(-1).amount_eur,35.29);
 assert(!source.includes('adjustments.push(...rights.items)'));
 assert(source.includes('distributor_rights:rights.status'));
});
test('Structured payload carries completeness detail and never carries PDF bytes or filenames',()=>{
 const start=source.indexOf('const payload={'),end=source.indexOf("const {data,error}=await",start);assert(start>=0&&end>start);const payload=source.slice(start,end);
 for(const required of ['issue_date:x.issueDate','source_holder_name:x.holderName','source_holder_tax_id:x.holderTaxId','source_supply_address:x.sourceSupplyAddress','access_contract_number:x.accessContract','contract_number:x.contract','contract_type:x.contractType','contract_end_date:x.contractEndDate','meter_number:x.meterNumber','completeness_assessment_status:x.assessment','source_completeness:x.completeness','energy_periods:x.energyPeriods','power_periods:x.powerPeriods','maximeters:x.maximeterRows','excess_periods:x.excessPeriods','reactive_periods:x.reactivePeriods','tax_lines:x.taxLines','distributor_rights:x.distributorRights','adjustments:x.adjustments'])assert(payload.includes(required),required);
 for(const forbidden of [/file\.name/,/arrayBuffer/,/getDocument/,/rawPages/,/filename/i])assert(!forbidden.test(payload),String(forbidden));
});
test('Existing validated invoices refresh completeness without changing core amounts',()=>{
 const start=source.indexOf('async function persistOne'),end=source.indexOf('async function renderSummary',start);const persist=source.slice(start,end);
 assert(persist.includes("supabase.rpc('enrich_xtra_invoice_completeness',{p_payload:payload})"));
 assert(persist.includes("result={...result,completeness:completenessData.completeness}"));
 assert(persist.indexOf("supabase.rpc('upsert_xtra_energy_history'")<persist.indexOf("supabase.rpc('enrich_xtra_invoice_completeness'"));
 assert(source.includes("const COMPLETENESS_VERSION='energy-2026.09.28.1'"));
});

test('Automatic history write cannot bypass the validated main parser row',()=>{
 const start=source.indexOf('async function persistOne'),end=source.indexOf('async function renderSummary',start);const persist=source.slice(start,end);assert(start>=0&&end>start);
 for(const check of ["/Correcta/i.test(ui.status)","ui.balance==='OK'","same(ui.kwh,x.kwh,.02)","same(ui.energy,x.energy)","same(ui.power,x.power)","same(ui.excess,x.excess)","same(ui.reactive,x.reactive)","same(ui.total,x.total)"])assert(persist.includes(check),check);
 assert(persist.indexOf('if(!validated)return')<persist.indexOf("supabase.rpc('upsert_xtra_energy_history'"));
});
test('2.0TD reactive absence is not fabricated as zero measured reactive detail',()=>{
 assert(source.includes("const reactiveApplicable=!/^2\\.0TD$/i.test(tariff);"));
 assert(source.includes("reactiveApplicable?'unreliable':'not_applicable'"));
});
test('Endesa usa el modelo portable solo con paridad total y conserva fallback legacy',()=>{
 assert(source.includes('const ENDESA_HISTORY_SHADOW=new Map()'));
 assert(source.includes('function endesaHistoryFromNormalized(model,file)'));
 assert(source.includes('function extractEndesaLegacy(d,file,rowOverride=null)'));
 assert(source.includes('const row=formats.parseEndesa(d,file,options),legacy=extractEndesaLegacy(d,file,row)'));
 assert(source.includes('formats.normalizeEndesaRow(row,options),portable=endesaHistoryFromNormalized(model,file),comparison=compareFenieHistoryModels(legacy,portable)'));
 assert(source.includes('recordEndesaHistoryShadow(legacy,portable)'));
 assert(source.includes('return comparison.ok?portable:legacy;'));
 assert(source.includes("recordEndesaHistoryShadow(legacy,null,new Error('normalizeEndesaRow no disponible'));return legacy"));
 assert(source.includes('catch(error){recordEndesaHistoryShadow(legacy,null,error);return legacy}'));
 assert(source.includes("el.textContent='ENDESA portable: '+summary.matched+'/'+summary.checked+' coinciden · '+summary.mismatches+' diferencias'"));
 assert(source.includes('endesaShadowSummary:endesaHistoryShadowSummary'));
});

test('Historical persistence routes Endesa through the validated shared parser',()=>{
 assert(source.includes('function extractEndesa(d,file)'));
 assert(source.includes("formats.parseEndesa(d,file,{parserVersion:window.IBT_PARSER_VERSION||'ENDESA'"));
 assert(source.includes("if(format==='endesa')return extractEndesa(d,file)"));
 assert(source.includes("if(fenie?.detect?.(d))return extractFenie(d,file)"));
 assert(source.includes('powerReliable:row.readOk&&Number.isFinite(Number(row.power))'));
});

test('Limpiar análisis elimina estados transitorios del cargador y permite el siguiente lote',()=>{
 assert(source.includes("const clearData=$('#clearData');if(clearData)clearData.addEventListener('click',clearHistoryUploadUi,{capture:true});"));
 assert(source.includes("el.hidden=false;el.style.display='';el.textContent=text"));
 assert(source.includes("for(const selector of ['#historyUploadStatus','#historyReviewDetails','#fenieShadowStatus','#endesaShadowStatus'])"));
 assert(folderUpload.includes("clearData.addEventListener('click',()=>{clearFolderStatus(true);setFileMode();},{capture:true})"));
 assert(folderUpload.includes("if (input.dataset.folderMode !== '1') { clearFolderStatus(); return; }"));
 assert(folderUpload.includes("if (!entries.some(entry => entry.isDirectory)) { clearFolderStatus(); return; }"));
 assert(bulkPerformance.includes("if (total < BULK_MIN)"));
 assert(bulkPerformance.includes("if(!bulkActive)hideStatus();"));
});

test('El estado de histórico es legible y ocupa su propia fila en el cargador',()=>{
 assert(source.includes("flex-basis:100%;width:100%;min-width:0"));
 assert(source.includes('Histórico: ${done}/${list.length} · ✓ ${saved} guardadas'));
 assert(source.includes('${complete} completas · ${review} a revisar · ${failed} errores'));
 assert(!source.includes('Histórico terminado: ${done}/${list.length}'));
});


test('Los estados de carga e histórico no pueden compartir la misma fila estrecha',()=>{
 assert.match(compactCss,/\.uploader\{[\s\S]*flex-wrap:wrap/);
 assert.match(compactCss,/#historyUploadStatus,\s*#bulkProcessingStatus\{[\s\S]*flex:1 0 100%!important/);
 assert.match(compactCss,/width:100%!important/);
 assert.match(compactCss,/max-width:100%!important/);
 assert.match(compactCss,/white-space:normal!important/);
 assert.match(compactCss,/overflow:visible!important/);
 assert.doesNotMatch(compactCss,/max-width:430px!important/);
});

test('El toast reconoce el nuevo formato final del histórico',()=>{
 assert.match(compactJs,/Histórico:\\s\*\\d\+\\s\*\\\/\\s\*\\d\+\\s\*·\\s\*✓/);
});


test('El estado del cargador y el estado de la vista Histórico usan IDs distintos',()=>{
 assert(source.includes("let el=$('#historyUploadStatus');"));
 assert(source.includes("el.id='historyUploadStatus'"));
 assert(source.includes('id="historySyncStatus"'));
 assert(!source.includes("let el=$('#historySyncStatus');"));
});

test('El progreso masivo no incrusta el texto del histórico en su propio estado',()=>{
 const bulk=fs.readFileSync('bulk-performance.js','utf8');
 assert(!bulk.includes('if (historyText) lines.push(historyText)'));
 assert(bulk.includes("document.querySelector('#historyUploadStatus')"));
});


test('Los motivos de no guardado del histórico se muestran en español claro',()=>{
 assert(source.includes("existing_invoice_differs:'diferencias con el histórico que requieren revisión'"));
 assert(source.includes('no guardadas${skipSummary(skipReasons)}'));
 assert(!source.includes('omitidas${skipSummary(skipReasons)}'));
});

test('El histórico refresca lecturas mejoradas sin depender de la comercializadora',()=>{
 assert(appSource.includes("const PARSER_VERSION='2026.09.29.1';"));
 assert(refreshPolicySql.includes("private.parser_version_is_newer"));
 assert(refreshPolicySql.includes("v_refresh_reason := 'better_completeness'"));
 assert(refreshPolicySql.includes("v_refresh_reason := 'newer_issue_date'"));
 assert(refreshPolicySql.includes("v_refresh_reason := 'newer_parser'"));
 assert(refreshPolicySql.includes("v_result := public.upsert_xtra_energy_history_legacy(p_payload)"));
 assert(refreshPolicySql.includes("'invoice_refreshed'"));
 assert(refreshPolicySql.includes("'mode','existing_refreshed'"));
});

test('Una factura rectificada posterior puede sustituir la anterior aunque cambie el consumo',()=>{
 assert(refreshPolicySql.includes("v_supersession_reason := 'same_supply_period_later_issue_date'"));
 assert(refreshPolicySql.includes("v_issue_date > i.issue_date"));
 assert(refreshPolicySql.includes("i.billing_start=v_billing_start"));
 assert(refreshPolicySql.includes("i.billing_end=v_billing_end"));
 assert(refreshPolicySql.includes("superseded_by=v_new_invoice"));
 assert(refreshPolicySql.includes("'invoice_superseded'"));
});

test('Los motivos de revisión histórica se traducen a lenguaje útil',()=>{
 const reasons=plain(ctx.api.reviewReasons({
  power_price_components:'unreliable',
  distributor_rights:'needs_review',
  energy_periods:'extracted',
  compensation:'not_present'
 }));
 assert.deepEqual(reasons,['Precio de potencia: incompleto/no fiable','Derechos de distribuidora: revisar']);
});

test('El cargador muestra el detalle de las facturas históricas a revisar',()=>{
 assert(source.includes("box.id='historyReviewDetails'"));
 assert(source.includes('Detalle a revisar (${items.length})'));
 assert(source.includes("item.reasons.join(' · ')"));
 assert(source.includes('historyReviewDetails(reviewItems)'));
 assert(source.includes('reviewItems.push(r.historyReview)'));
 assert(source.includes("historyReview:x.assessment==='needs_review'"));
});

test('FENIE usa el modelo portable solo con paridad total y conserva fallback legacy',()=>{
 assert(source.includes('const FENIE_HISTORY_SHADOW=new Map()'));
 assert(source.includes('function fenieHistoryFromNormalized(model,file)'));
 assert(source.includes('function compareFenieHistoryModels(legacy,portable)'));
 assert(source.includes('function extractFenieLegacy(d,file)'));
 assert(source.includes('parser.parseNormalized(d,file'));
 assert(source.includes('const portable=fenieHistoryFromNormalized(model,file),comparison=compareFenieHistoryModels(legacy,portable);'));
 assert(source.includes('recordFenieHistoryShadow(legacy,portable);'));
 assert(source.includes('return comparison.ok?portable:legacy;'));
 assert(source.includes("recordFenieHistoryShadow(legacy,null,new Error('parseNormalized no disponible'));return legacy"));
 assert(source.includes('catch(error){recordFenieHistoryShadow(legacy,null,error);return legacy}'));
 assert(source.includes("el.textContent='FENIE portable: '+summary.matched+'/'+summary.checked+' coinciden · '+summary.mismatches+' diferencias'"));
});

test('La comparación FENIE se cuenta por factura y periodo únicos',()=>{
 assert(source.includes("const key=[legacy?.invoiceNumber||portable?.invoiceNumber||'sin-factura'"));
 assert(source.includes("legacy?.period?.start||portable?.period?.start||''"));
 assert(source.includes('FENIE_HISTORY_SHADOW.set(key'));
 assert(source.includes('resetFenieHistoryShadow()'));
 assert(source.includes('fenieShadowStatus()'));
});

test('El adaptador portable FENIE cubre el contrato completo del histórico',()=>{
 const start=source.indexOf('function fenieHistoryFromNormalized'),end=source.indexOf('function fenieParityCanonical',start);
 const adapter=source.slice(start,end);
 for(const required of ['supply.cups','billing.start','billing.end','energy.totalKwh','energy.totalEur','power.totalEur','excess.totalEur','reactive.totalEur','costs.totalEur','energy.periods','power.periods','power.maximeters','model?.taxLines','model?.distributorRights','validation.completeness','validation.assessment'])assert(adapter.includes(required),required);
});


test('El shadow FENIE agrupa diferencias por campo y tarifa',()=>{
 assert(source.includes('fieldCounts={}'));
 assert(source.includes('tariffCounts={}'));
 assert(source.includes("fieldCounts[field]=(fieldCounts[field]||0)+1"));
 assert(source.includes("tariffCounts[row.tariff||'sin tarifa']"));
 assert(source.includes("' · Campos: '+fieldText"));
 assert(source.includes("' · Tarifas: '+tariffText"));
});
