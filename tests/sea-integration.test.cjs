'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=file=>fs.readFileSync(file,'utf8');

test('SEA se carga antes de sus consumidores de runtime',()=>{
  const html=source('index.html');
  const parser=html.indexOf('sea-parser.js?v=');
  const app=html.indexOf('app.js?v=');
  const master=html.indexOf('supply-enricher-v2.js?v=');
  assert(parser>=0,'falta sea-parser.js en index.html');
  assert(app>parser,'app.js debe cargarse despues de SEA');
  assert(master>parser,'supply-enricher debe cargarse despues de SEA');
});

test('SEA tiene su propia etiqueta script cerrada y ejecutable',()=>{
  const html=source('index.html');
  const naturgyOpen=html.indexOf('<script src="naturgy-parser.js?v=');
  const naturgyClose=html.indexOf('</script>',naturgyOpen);
  const seaOpen=html.indexOf('<script src="sea-parser.js?v=');
  const seaClose=html.indexOf('</script>',seaOpen);
  const nested=html.indexOf('<script',seaOpen+1);
  assert(naturgyOpen>=0&&naturgyClose>naturgyOpen,'Naturgy debe tener etiqueta script cerrada');
  assert(seaOpen>naturgyClose,'SEA debe abrirse despues de cerrar Naturgy');
  assert.equal(html.slice(naturgyClose+'</script>'.length,seaOpen).trim(),'','no debe quedar contenido entre el cierre de Naturgy y SEA');
  assert(seaClose>seaOpen,'SEA debe tener etiqueta script cerrada');
  assert(nested<0||nested>seaClose,'no puede haber otro <script> antes de cerrar SEA');
});

test('el parser principal enruta SEA antes del fallback OCR FENIE',()=>{
  const app=source('app.js');
  assert(app.includes('const sea=window.IBTSeaParser'));
  assert(app.includes('sea?.detect?.(d))return sea.parse'));
  assert(app.includes('window.IBTSeaParser?.detect?.(original)'));
  const direct=app.indexOf('window.IBTSeaParser?.detect?.(original)');
  const ocr=app.indexOf('const fallback=window.IBTFenieOcrFallback');
  assert(direct>=0&&ocr>direct);
});

test('maestro e historico reutilizan el parser SEA portable',()=>{
  const master=source('supply-enricher-v2.js'),history=source('xtra-history.js');
  assert(master.includes('function parseSeaSupply(data,file)'));
  assert(master.includes("format==='sea'?parseSeaSupply(pdfData,file)"));
  assert(master.includes("retailer:row.retailer||'Servicios Energéticos Avanzados, S.L.'"));
  assert(history.includes('function extractSea(d,file)'));
  assert(history.includes('window.IBTSeaParser'));
  assert(history.includes('sea?.detect?.(d))return extractSea(d,file)'));
  assert(history.includes('sea?.detect?.(source)'));
  assert(history.includes("category:'system_adjustment'")||source('sea-parser.js').includes("category:'system_adjustment'"));
});

test('SEA conserva fail-closed historico tras el cruce con la fila principal',()=>{
  const history=source('xtra-history.js');
  const start=history.indexOf('async function persistOne');
  const end=history.indexOf('async function renderSummary',start);
  const persist=history.slice(start,end);
  const crosscheck=persist.indexOf("const validated=/Correcta/i.test(ui.status)&&ui.balance==='OK'");
  const reject=persist.indexOf("if(!validated)return {skipped:true,reason:'crosscheck_failed'}");
  const write=persist.indexOf("supabase.rpc('upsert_xtra_energy_history_v3'");
  assert(crosscheck>=0&&reject>crosscheck&&write>reject);
  for(const token of ['same(ui.kwh,x.kwh,.02)','same(ui.energy,x.energy)','same(ui.power,x.power)','same(ui.total,x.total)'])assert(persist.includes(token),token);
});
