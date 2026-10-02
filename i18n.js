(function(root){
  'use strict';

  const STORAGE_KEY='ibt.language';
  const SUPPORTED=Object.freeze(['es','ca','en']);
  const LOCALES=Object.freeze({es:'es-ES',ca:'ca-ES',en:'en-GB'});

  // UI-only catalogue. Energy data, parser output and stored business data are never translated or mutated here.
  const CATALOG={
    'Idioma':{ca:'Idioma',en:'Language'},
    'Mantenimiento':{ca:'Manteniment',en:'Maintenance'},
    'Asesor Energético':{ca:'Assessor Energètic',en:'Energy Advisor'},
    'Estamos realizando tareas de mantenimiento y mejoras. El servicio volverá a estar disponible lo antes posible.':{ca:'Estem fent tasques de manteniment i millores. El servei tornarà a estar disponible tan aviat com sigui possible.',en:'We are carrying out maintenance and improvements. The service will be available again as soon as possible.'},
    'Acceso administrador':{ca:"Accés d'administrador",en:'Administrator access'},
    'Acceso privado':{ca:'Accés privat',en:'Private access'},
    'Inicia sesión para acceder a clientes, suministros e histórico energético.':{ca:"Inicia sessió per accedir a clients, subministraments i històric energètic.",en:'Sign in to access clients, supply points and energy history.'},
    'Correo electrónico':{ca:'Correu electrònic',en:'Email'},
    'Contraseña':{ca:'Contrasenya',en:'Password'},
    'Entrar':{ca:'Entrar',en:'Sign in'},
    'He olvidado mi contraseña':{ca:'He oblidat la contrasenya',en:'I forgot my password'},
    '¿Es tu primera vez?':{ca:'És la primera vegada?',en:'First time here?'},
    'Crear cuenta / Solicitar acceso':{ca:'Crear compte / Sol·licitar accés',en:'Create account / Request access'},
    'Solicitud de acceso':{ca:"Sol·licitud d'accés",en:'Access request'},
    'Crear cuenta':{ca:'Crear compte',en:'Create account'},
    'Introduce tus datos. Instal·lacions BT revisará la solicitud y te avisará cuando tu cuenta esté vinculada con tu cliente.':{ca:"Introdueix les teves dades. Instal·lacions BT revisarà la sol·licitud i t'avisarà quan el teu compte estigui vinculat amb el teu client.",en:'Enter your details. Instal·lacions BT will review the request and notify you when your account is linked to your client.'},
    'Nombre':{ca:'Nom',en:'Name'},
    'Enviar solicitud':{ca:'Enviar sol·licitud',en:'Submit request'},
    'Volver al inicio de sesión':{ca:"Tornar a l'inici de sessió",en:'Back to sign in'},
    'Solicitud enviada':{ca:'Sol·licitud enviada',en:'Request sent'},
    'Petición recibida':{ca:'Sol·licitud rebuda',en:'Request received'},
    'Hemos recibido tu solicitud de acceso. Instal·lacions BT revisará tus datos, vinculará tu cuenta con el cliente correspondiente y te avisará cuando puedas entrar.':{ca:"Hem rebut la teva sol·licitud d'accés. Instal·lacions BT revisarà les teves dades, vincularà el teu compte amb el client corresponent i t'avisarà quan hi puguis entrar.",en:'We have received your access request. Instal·lacions BT will review your details, link your account to the relevant client and notify you when you can sign in.'},
    'Volver al inicio':{ca:"Tornar a l'inici",en:'Back to start'},
    'Recuperar acceso':{ca:"Recuperar l'accés",en:'Recover access'},
    'Nueva contraseña':{ca:'Contrasenya nova',en:'New password'},
    'Introduce una nueva contraseña para tu cuenta.':{ca:'Introdueix una contrasenya nova per al teu compte.',en:'Enter a new password for your account.'},
    'Repetir contraseña':{ca:'Repeteix la contrasenya',en:'Repeat password'},
    'Guardar nueva contraseña':{ca:'Desa la contrasenya nova',en:'Save new password'},

    'Facturas':{ca:'Factures',en:'Invoices'},
    'Clientes':{ca:'Clients',en:'Clients'},
    'Histórico':{ca:'Històric',en:'History'},
    'Análisis':{ca:'Anàlisi',en:'Analysis'},
    'Alertas':{ca:'Alertes',en:'Alerts'},
    'Usuarios':{ca:'Usuaris',en:'Users'},
    'Configuración':{ca:'Configuració',en:'Settings'},
    'Panel de análisis energético':{ca:"Panell d'anàlisi energètica",en:'Energy analysis dashboard'},
    'Facturas procesadas':{ca:'Factures processades',en:'Processed invoices'},
    'Carga, valida y analiza las facturas eléctricas de tus clientes.':{ca:'Carrega, valida i analitza les factures elèctriques dels teus clients.',en:"Upload, validate and analyse your clients' electricity invoices."},
    'Sin sesión':{ca:'Sense sessió',en:'Signed out'},
    'Salir':{ca:'Sortir',en:'Sign out'},
    'Este análisis':{ca:'Aquesta anàlisi',en:'This analysis'},
    'Lecturas correctas':{ca:'Lectures correctes',en:'Correct readings'},
    'Facturas validadas':{ca:'Factures validades',en:'Validated invoices'},
    'Con incidencias':{ca:'Amb incidències',en:'With issues'},
    'Requieren revisión':{ca:'Requereixen revisió',en:'Review required'},
    'Consumo total':{ca:'Consum total',en:'Total consumption'},
    'Energía facturada':{ca:'Energia facturada',en:'Billed energy'},
    'Importe total':{ca:'Import total',en:'Total amount'},
    'Facturación analizada':{ca:'Facturació analitzada',en:'Analysed billing'},
    'Cargar facturas':{ca:'Carregar factures',en:'Upload invoices'},
    'Arrastra aquí los PDF o selecciónalos. Los documentos se procesan únicamente en este navegador y no se almacenan.':{ca:"Arrossega aquí els PDF o selecciona'ls. Els documents es processen únicament en aquest navegador i no s'emmagatzemen.",en:'Drag the PDFs here or select them. Documents are processed only in this browser and are not stored.'},
    'Cargar facturas PDF':{ca:'Carregar factures PDF',en:'Upload PDF invoices'},
    'Exportar informe Excel':{ca:'Exportar informe Excel',en:'Export Excel report'},
    'Limpiar análisis':{ca:"Netejar l'anàlisi",en:'Clear analysis'},
    '● Procesado local · los PDF no salen de tu equipo ni se almacenan':{ca:"● Processament local · els PDF no surten del teu equip ni s'emmagatzemen",en:'● Local processing · PDFs never leave your device and are not stored'},
    'Detalle':{ca:'Detall',en:'Detail'},
    'Facturas analizadas':{ca:'Factures analitzades',en:'Analysed invoices'},
    'Lectura y avisos se muestran por separado':{ca:'La lectura i els avisos es mostren per separat',en:'Reading status and alerts are shown separately'},
    'Lectura':{ca:'Lectura',en:'Reading'},
    'Empresa / titular':{ca:'Empresa / titular',en:'Company / account holder'},
    'Periodo':{ca:'Període',en:'Period'},
    'Tarifa':{ca:'Tarifa',en:'Tariff'},
    'Energía €':{ca:'Energia €',en:'Energy €'},
    'Potencia €':{ca:'Potència €',en:'Power €'},
    'Excesos €':{ca:'Excessos €',en:'Excess power €'},
    'Reactiva €':{ca:'Reactiva €',en:'Reactive energy €'},
    'Otros / descuentos €':{ca:'Altres / descomptes €',en:'Other / discounts €'},
    'Impuestos €':{ca:'Impostos €',en:'Taxes €'},
    'Total €':{ca:'Total €',en:'Total €'},
    'Cuadre':{ca:'Quadratura',en:'Reconciliation'},
    'Qué revisar':{ca:'Què revisar',en:'What to review'},
    'Carga las primeras facturas para comenzar el análisis.':{ca:"Carrega les primeres factures per començar l'anàlisi.",en:'Upload the first invoices to start the analysis.'},
    'Aún no hay facturas procesadas.':{ca:'Encara no hi ha factures processades.',en:'No invoices have been processed yet.'},
    'No compatible':{ca:'No compatible',en:'Unsupported'},
    'Sustituida':{ca:'Substituïda',en:'Replaced'},
    'Correcta':{ca:'Correcta',en:'Correct'},
    'Error':{ca:'Error',en:'Error'},
    'Sin alertas':{ca:'Sense alertes',en:'No alerts'},
    'Real confirmada':{ca:'Real confirmada',en:'Confirmed actual'},
    'Estimada':{ca:'Estimada',en:'Estimated'},
    'Sin lectura distribuidora':{ca:'Sense lectura de distribuïdora',en:'No distributor reading'},
    'No determinada':{ca:'No determinada',en:'Undetermined'},

    'Cartera de clientes':{ca:'Cartera de clients',en:'Client portfolio'},
    'Clientes y suministros':{ca:'Clients i subministraments',en:'Clients and supply points'},
    'Cada cliente tiene su ficha lógica con sus titulares y CUPS. Las facturas nuevas verifican los datos existentes, actualizan condiciones vigentes y señalan discrepancias.':{ca:'Cada client té la seva fitxa lògica amb els titulars i CUPS. Les factures noves verifiquen les dades existents, actualitzen les condicions vigents i assenyalen discrepàncies.',en:'Each client has a logical record with its account holders and CUPS. New invoices verify existing data, update current conditions and flag discrepancies.'},
    '+ Nuevo cliente':{ca:'+ Nou client',en:'+ New client'},
    'Importar / actualizar maestro':{ca:'Importar / actualitzar mestre',en:'Import / update master data'},
    'Buscar':{ca:'Cercar',en:'Search'},
    'Filtrar clientes y suministros':{ca:'Filtrar clients i subministraments',en:'Filter clients and supply points'},
    'Ficha editable':{ca:'Fitxa editable',en:'Editable record'},
    'Cliente y punto de suministro':{ca:'Client i punt de subministrament',en:'Client and supply point'},
    'Cerrar':{ca:'Tancar',en:'Close'},
    'Tipo de cliente':{ca:'Tipus de client',en:'Client type'},
    'Particular':{ca:'Particular',en:'Individual'},
    'Empresa':{ca:'Empresa',en:'Company'},
    'Grupo empresarial':{ca:'Grup empresarial',en:'Business group'},
    'Pendiente de clasificar':{ca:'Pendent de classificar',en:'Pending classification'},
    'Cliente':{ca:'Client',en:'Client'},
    'Alias cliente':{ca:'Àlies del client',en:'Client alias'},
    'NIF / CIF cliente':{ca:'NIF / CIF del client',en:'Client tax ID'},
    'Alias suministro':{ca:'Àlies del subministrament',en:'Supply alias'},
    'Nombre suministro':{ca:'Nom del subministrament',en:'Supply name'},
    'Dirección suministro':{ca:'Adreça del subministrament',en:'Supply address'},
    'Localidad':{ca:'Localitat',en:'Town / city'},
    'Provincia':{ca:'Província',en:'Province'},
    'Nº contrato':{ca:'Núm. contracte',en:'Contract no.'},
    'Guardar sin duplicar':{ca:'Desar sense duplicar',en:'Save without duplicates'},
    'Cargando maestro central…':{ca:'Carregant el mestre central…',en:'Loading central master data…'},
    'Maestro':{ca:'Mestre',en:'Master data'},
    'Suministros / CUPS':{ca:'Subministraments / CUPS',en:'Supply points / CUPS'},
    'Estado':{ca:'Estat',en:'Status'},
    'Dirección suministro':{ca:'Adreça del subministrament',en:'Supply address'},
    'Acción':{ca:'Acció',en:'Action'},
    'Añade un cliente o importa el maestro.':{ca:'Afegeix un client o importa el mestre.',en:'Add a client or import the master data.'},

    'Histórico energético':{ca:'Històric energètic',en:'Energy history'},
    'Aquí se conservan únicamente datos estructurados por CUPS y periodo. Los PDF se procesan localmente y no se almacenan.':{ca:"Aquí només es conserven dades estructurades per CUPS i període. Els PDF es processen localment i no s'emmagatzemen.",en:'Only structured data by CUPS and period is kept here. PDFs are processed locally and are not stored.'},
    'Cargando histórico estructurado…':{ca:"Carregant l'històric estructurat…",en:'Loading structured history…'},

    'Administración':{ca:'Administració',en:'Administration'},
    'Modo mantenimiento':{ca:'Mode de manteniment',en:'Maintenance mode'},
    'Bloquea temporalmente el acceso de clientes y personal. Los administradores pueden seguir entrando.':{ca:"Bloqueja temporalment l'accés de clients i personal. Els administradors poden continuar entrant.",en:'Temporarily blocks access for clients and staff. Administrators can still sign in.'},
    'DESACTIVADO':{ca:'DESACTIVAT',en:'OFF'},
    'ACTIVADO':{ca:'ACTIVAT',en:'ON'},
    'Mostrar pantalla de mantenimiento':{ca:'Mostra la pantalla de manteniment',en:'Show maintenance screen'},
    'El cambio se aplica sin desplegar una nueva versión.':{ca:"El canvi s'aplica sense desplegar una versió nova.",en:'The change applies without deploying a new version.'},
    'Mensaje para los clientes':{ca:'Missatge per als clients',en:'Message for clients'},
    'Guardar configuración':{ca:'Desar la configuració',en:'Save settings'},
    'Usuarios y permisos':{ca:'Usuaris i permisos',en:'Users and permissions'},
    'Solo visible para administradores. Aquí puedes definir Administrador, Personal interno o Cliente.':{ca:"Només visible per a administradors. Aquí pots definir Administrador, Personal intern o Client.",en:'Visible to administrators only. Here you can set Administrator, Internal staff or Client.'},
    'Usuario':{ca:'Usuari',en:'User'},
    'Tipo de cuenta':{ca:'Tipus de compte',en:'Account type'},
    'Clientes asignados':{ca:'Clients assignats',en:'Assigned clients'},
    'Todavía no hay usuarios.':{ca:'Encara no hi ha usuaris.',en:'There are no users yet.'},
    'Cargando usuarios…':{ca:'Carregant usuaris…',en:'Loading users…'},
    'No se pudieron cargar usuarios y permisos.':{ca:'No s’han pogut carregar els usuaris i permisos.',en:'Users and permissions could not be loaded.'},
    'Administrador':{ca:'Administrador',en:'Administrator'},
    'Personal interno':{ca:'Personal intern',en:'Internal staff'},
    'Tú':{ca:'Tu',en:'You'},
    'Sin correo':{ca:'Sense correu',en:'No email'},
    'Acceso interno · todos':{ca:'Accés intern · tots',en:'Internal access · all'},
    'Sin cliente asignado':{ca:'Sense client assignat',en:'No client assigned'},
    'Quitar acceso':{ca:"Treure l'accés",en:'Remove access'},
    '+ Asignar cliente…':{ca:'+ Assignar client…',en:'+ Assign client…'},
    'Pendiente':{ca:'Pendent',en:'Pending'},
    'Activo':{ca:'Actiu',en:'Active'},
    'Desactivado':{ca:'Desactivat',en:'Disabled'},
    'Asignar cliente para aprobar':{ca:'Assigna un client per aprovar',en:'Assign a client to approve'},
    'Restablecer acceso':{ca:"Restablir l'accés",en:'Reset access'},

    'Por qué importa':{ca:'Per què importa',en:'Why it matters'},
    'Qué conviene revisar':{ca:'Què convé revisar',en:'What should be reviewed'},
    'Ver datos y cálculo':{ca:'Veure dades i càlcul',en:'View data and calculation'},
    'Qué cambio se ha detectado:':{ca:"Quin canvi s'ha detectat:",en:'Detected change:'},
    'Criterio de revisión:':{ca:'Criteri de revisió:',en:'Review criterion:'},
    'Trazabilidad:':{ca:'Traçabilitat:',en:'Traceability:'},
    'Resumen':{ca:'Resum',en:'Summary'},
    'Costes detectados':{ca:'Costos detectats',en:'Detected costs'},
    'Excesos y reactiva registrados':{ca:'Excessos i reactiva registrats',en:'Recorded excess power and reactive energy'},
    'Potencia a revisar':{ca:'Potència a revisar',en:'Power to review'},
    'Consumo diario':{ca:'Consum diari',en:'Daily consumption'},
    'Lecturas a comprobar':{ca:'Lectures per comprovar',en:'Readings to check'},
    'Avisos':{ca:'Avisos',en:'Notices'},
    'Cambios de consumo':{ca:'Canvis de consum',en:'Consumption changes'},
    'Factura':{ca:'Factura',en:'Invoice'},
    'Periodo facturado':{ca:'Període facturat',en:'Billed period'},
    'Importe del concepto':{ca:'Import del concepte',en:'Item amount'},
    'Facturas con exceso':{ca:'Factures amb excés',en:'Invoices with excess'},
    'Máximo exceso':{ca:'Excés màxim',en:'Maximum excess'},
    'Coste registrado':{ca:'Cost registrat',en:'Recorded cost'},
    'Facturas con cargo':{ca:'Factures amb càrrec',en:'Invoices with charge'},
    'Reactiva registrada':{ca:'Reactiva registrada',en:'Recorded reactive energy'},
    'Máximo por factura':{ca:'Màxim per factura',en:'Maximum per invoice'},
    'Contratada':{ca:'Contractada',en:'Contracted'},
    'Máximo observado':{ca:'Màxim observat',en:'Observed maximum'},
    'Utilización máxima':{ca:'Utilització màxima',en:'Maximum utilisation'},
    'Facturas comparadas':{ca:'Factures comparades',en:'Invoices compared'},
    'Grupo':{ca:'Grup',en:'Group'},
    'Días':{ca:'Dies',en:'Days'},
    'Consumo':{ca:'Consum',en:'Consumption'},
    'Referencia':{ca:'Referència',en:'Reference'},
    'Reciente':{ca:'Recent',en:'Recent'},
    'Ver detalle técnico':{ca:'Veure detall tècnic',en:'View technical detail'},

    'Alpha de análisis energético de suministros eléctricos':{ca:"Alpha d'anàlisi energètica de subministraments elèctrics",en:'Alpha energy analysis for electricity supply points'}
  };

  const ATTRIBUTE_CATALOG={
    placeholder:{
      'Buscar cliente, titular, CUPS, localidad, tarifa o contrato…':{ca:'Cercar client, titular, CUPS, localitat, tarifa o contracte…',en:'Search client, account holder, CUPS, town, tariff or contract…'},
      'Nombre del cliente o grupo':{ca:'Nom del client o grup',en:'Client or group name'},
      'Ej. Bar Pepe, Casa madre, Nave 2':{ca:'Ex. Bar Pepe, Casa mare, Nau 2',en:'E.g. Bar Pepe, Main house, Unit 2'},
      'Opcional, recomendado':{ca:'Opcional, recomanat',en:'Optional, recommended'},
      'Si es particular puede ser el mismo nombre':{ca:'Si és particular pot ser el mateix nom',en:'For an individual it can be the same name'},
      'Ej. Tienda centro, Parking, Oficina':{ca:'Ex. Botiga centre, Pàrquing, Oficina',en:'E.g. City shop, Parking, Office'},
      'Vivienda, local, nave...':{ca:'Habitatge, local, nau...',en:'Home, premises, unit...'},
      'Dirección':{ca:'Adreça',en:'Address'},
      '2.0TD / 3.0TD...':{ca:'2.0TD / 3.0TD...',en:'2.0TD / 3.0TD...'},
      'Buscar cliente, titular, CUPS, dirección o tarifa…':{ca:'Cercar client, titular, CUPS, adreça o tarifa…',en:'Search client, account holder, CUPS, address or tariff…'},
      'Buscar cliente para asignar…':{ca:'Cercar client per assignar…',en:'Search client to assign…'},
      'Buscar usuario, correo, tipo de cuenta o cliente asignado…':{ca:'Cercar usuari, correu, tipus de compte o client assignat…',en:'Search user, email, account type or assigned client…'}
    },
    'aria-label':{
      'Idioma':{ca:'Idioma',en:'Language'},
      'Buscar cliente para asignar':{ca:'Cercar client per assignar',en:'Search client to assign'},
      'Buscar usuarios':{ca:'Cercar usuaris',en:'Search users'}
    }
  };

  let current='es';
  let observer=null;
  let reverseText=new Map();
  const reverseAttr={placeholder:new Map(),'aria-label':new Map(),title:new Map()};

  function safeStored(){
    try{
      const v=root.localStorage?.getItem(STORAGE_KEY);
      return SUPPORTED.includes(v)?v:null;
    }catch{return null;}
  }
  function safeStore(v){
    try{root.localStorage?.setItem(STORAGE_KEY,v);}catch{}
  }
  function rebuildReverse(){
    reverseText=new Map();
    for(const [source,translations] of Object.entries(CATALOG)){
      const all={es:source,...translations};
      for(const lang of SUPPORTED){
        const value=String(all[lang]??source);
        if(value&&!reverseText.has(value))reverseText.set(value,source);
      }
    }
    for(const attr of Object.keys(reverseAttr)){
      reverseAttr[attr]=new Map();
      const sourceMap=ATTRIBUTE_CATALOG[attr]||{};
      for(const [source,translations] of Object.entries(sourceMap)){
        const all={es:source,...translations};
        for(const lang of SUPPORTED){
          const value=String(all[lang]??source);
          if(value&&!reverseAttr[attr].has(value))reverseAttr[attr].set(value,source);
        }
      }
    }
  }
  rebuildReverse();

  function textFor(source,lang=current){
    const key=Object.prototype.hasOwnProperty.call(CATALOG,source)?source:reverseText.get(String(source));
    if(!key)return String(source??'');
    if(lang==='es')return key;
    return String(CATALOG[key]?.[lang]??key);
  }
  function attrFor(attr,value,lang=current){
    const sourceMap=ATTRIBUTE_CATALOG[attr]||{};
    const key=Object.prototype.hasOwnProperty.call(sourceMap,value)?value:reverseAttr[attr]?.get(String(value));
    if(!key)return String(value??'');
    if(lang==='es')return key;
    return String(sourceMap[key]?.[lang]??key);
  }
  function translateTextNode(node){
    if(!node||node.nodeType!==3)return;
    const parent=node.parentElement;
    if(!parent||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(parent.tagName))return;
    const raw=node.nodeValue||'',trimmed=raw.trim();
    if(!trimmed)return;
    const source=reverseText.get(trimmed);
    if(!source)return;
    const translated=textFor(source,current);
    if(translated===trimmed)return;
    const lead=raw.slice(0,raw.indexOf(trimmed));
    const tail=raw.slice(raw.indexOf(trimmed)+trimmed.length);
    node.nodeValue=lead+translated+tail;
  }
  function translateAttributes(el){
    if(!el||el.nodeType!==1)return;
    for(const attr of ['placeholder','aria-label','title']){
      if(!el.hasAttribute(attr))continue;
      const value=el.getAttribute(attr)||'';
      const map=reverseAttr[attr];
      if(!map?.has(value))continue;
      el.setAttribute(attr,attrFor(attr,value,current));
    }
  }
  function translateTree(rootNode){
    if(!rootNode)return;
    if(rootNode.nodeType===3){translateTextNode(rootNode);return;}
    if(rootNode.nodeType!==1&&rootNode.nodeType!==9&&rootNode.nodeType!==11)return;
    if(rootNode.nodeType===1)translateAttributes(rootNode);
    const doc=root.document;
    if(!doc?.createTreeWalker)return;
    const walker=doc.createTreeWalker(rootNode,root.NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode()))translateTextNode(n);
    if(rootNode.querySelectorAll)rootNode.querySelectorAll('[placeholder],[aria-label],[title]').forEach(translateAttributes);
  }
  function syncSelectors(){
    root.document?.querySelectorAll('[data-ibt-language-select]').forEach(el=>{
      if(el.value!==current)el.value=current;
    });
  }
  function applyLanguage(lang,{persist=true,emit=true}={}){
    const next=SUPPORTED.includes(lang)?lang:'es';
    current=next;
    if(persist)safeStore(next);
    if(root.document?.documentElement)root.document.documentElement.lang=next;
    syncSelectors();
    translateTree(root.document?.body);
    if(emit&&root.dispatchEvent)root.dispatchEvent(new CustomEvent('ibt:languagechange',{detail:{language:next,locale:LOCALES[next]}}));
    return next;
  }
  function bindSelectors(){
    root.document?.querySelectorAll('[data-ibt-language-select]').forEach(el=>{
      if(el.dataset.ibtLanguageBound==='1')return;
      el.dataset.ibtLanguageBound='1';
      el.addEventListener('change',()=>applyLanguage(el.value));
    });
    syncSelectors();
  }
  function startObserver(){
    if(observer||!root.MutationObserver||!root.document?.body)return;
    observer=new MutationObserver(records=>{
      for(const record of records){
        record.addedNodes?.forEach(translateTree);
      }
      bindSelectors();
    });
    observer.observe(root.document.body,{childList:true,subtree:true});
  }
  function init(){
    current=safeStored()||'es';
    bindSelectors();
    applyLanguage(current,{persist:false,emit:false});
    startObserver();
  }

  root.IBTI18n=Object.freeze({
    supported:SUPPORTED,
    locales:LOCALES,
    get language(){return current;},
    get locale(){return LOCALES[current];},
    setLanguage:applyLanguage,
    t:textFor,
    translateTree,
    register(entries={}){
      Object.assign(CATALOG,entries);
      rebuildReverse();
      translateTree(root.document?.body);
    }
  });

  if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(typeof globalThis!=='undefined'?globalThis:this);
