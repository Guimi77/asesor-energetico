const fs=require('fs');
const assert=require('assert');
const crypto=require('crypto');

const index=fs.readFileSync('index.html','utf8');
const i18n=fs.readFileSync('i18n.js','utf8');
const styles=fs.readFileSync('styles.css','utf8');
const authBootstrap=fs.readFileSync('auth-bootstrap.js','utf8');
const alertsUi=fs.readFileSync('alerts-ui.js','utf8');

function blobSha(file){
  const buf=fs.readFileSync(file);
  return crypto.createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex').slice(0,12);
}

assert(index.includes('data-ibt-language-select'),'language selector missing');
assert(index.includes('<option value="es">ES · Español</option>'),'Spanish option missing');
assert(index.includes('<option value="ca">CA · Català</option>'),'Catalan option missing');
assert(index.includes('<option value="en">EN · English</option>'),'English option missing');
assert(index.includes('i18n.js?v='+blobSha('i18n.js')),'i18n cache token is stale');
assert(index.includes('styles.css?v='+blobSha('styles.css')),'styles cache token is stale');

for(const lang of ["'es'","'ca'","'en'"]) assert(i18n.includes(lang),'missing language '+lang);
for(const key of [
  'Facturas','Clientes','Histórico','Asesor Energético','Cargar facturas','Configuración',
  'Cargar carpeta completa','Exportar informe interno','Exportar Excel cliente','✓ Auditar parser',
  'Periodos históricos','Diagnóstico energético','Alertas en seguimiento','Administrar clientes',
  'Usuarios y permisos','Modo mantenimiento'
]){
  assert(i18n.includes("'"+key+"'")||i18n.includes('"'+key+'"'),'missing UI translation key: '+key);
}

assert(i18n.includes("STORAGE_KEY='ibt.language'"),'language preference persistence missing');
assert(i18n.includes('characterData:true'),'dynamic text mutation translation missing');
assert(i18n.includes("attributeFilter:['placeholder','aria-label','title']"),'dynamic attribute translation missing');
assert(i18n.includes('sourceText:sourceTextOf'),'language-neutral source text API missing');
assert(i18n.includes('documentElement.dataset.language=next'),'active language styling hook missing');

assert(styles.includes('.language-switcher{'),'language switcher styling missing');
assert(styles.includes('linear-gradient(to bottom,#aa151b'),'Spanish flag styling missing');
assert(styles.includes('html[data-language="ca"] .language-flag'),'Catalan flag styling missing');
assert(styles.includes('html[data-language="en"] .language-flag'),'English flag styling missing');
assert(index.includes('class="language-flag"'),'language flag missing');
assert(index.includes('class="secondary logout-btn hidden"'),'logout styling hook missing');
assert(index.includes('class="logout-icon"'),'logout icon missing');

assert(index.includes('data-view="analisis">⌁ Análisis</a>'),'analysis nav lacks stable view id');
assert(index.includes('data-view="alertas">◇ Alertas</a>'),'alerts nav lacks stable view id');
assert(alertsUi.includes('window.IBTI18n?.sourceText?.(element)'),'alerts must use source-language analysis payloads');

assert(authBootstrap.includes('analysis-ui.js?v='+blobSha('analysis-ui.js')),'analysis UI cache token is stale');
assert(authBootstrap.includes('alerts-ui.js?v='+blobSha('alerts-ui.js')),'alerts UI cache token is stale');

console.log('i18n UI regression checks passed');
