const fs=require('fs');
const assert=require('assert');

const index=fs.readFileSync('index.html','utf8');
const i18n=fs.readFileSync('i18n.js','utf8');
const styles=fs.readFileSync('styles.css','utf8');

assert(index.includes('data-ibt-language-select'),'language selector missing');
assert(index.includes('<option value="es">ES · Castellano</option>'),'Spanish option missing');
assert(index.includes('<option value="ca">CA · Català</option>'),'Catalan option missing');
assert(index.includes('<option value="en">EN · English</option>'),'English option missing');
assert(index.includes('i18n.js?v=20261002-i18n1'),'i18n script not loaded');

for(const lang of ["'es'","'ca'","'en'"]) assert(i18n.includes(lang),'missing language '+lang);
for(const key of ['Facturas','Clientes','Histórico','Asesor Energético','Cargar facturas','Configuración']){
  assert(i18n.includes("'"+key+"'")||i18n.includes('"'+key+'"'),'missing core translation key: '+key);
}
assert(i18n.includes("STORAGE_KEY='ibt.language'"),'language preference persistence missing');
assert(i18n.includes('MutationObserver'),'dynamic UI translation support missing');
assert(i18n.includes('Energy data, parser output and stored business data are never translated or mutated here.'),'data isolation guard comment missing');
assert(styles.includes('.language-switcher{'),'language switcher styling missing');

console.log('i18n UI regression checks passed');
