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
    '▣ Facturas':{ca:'▣ Factures',en:'▣ Invoices'},
    'Clientes':{ca:'Clients',en:'Clients'},
    '▦ Clientes':{ca:'▦ Clients',en:'▦ Clients'},
    'Histórico':{ca:'Històric',en:'History'},
    '◷ Histórico':{ca:'◷ Històric',en:'◷ History'},
    'Análisis':{ca:'Anàlisi',en:'Analysis'},
    '⌁ Análisis':{ca:'⌁ Anàlisi',en:'⌁ Analysis'},
    'Alertas':{ca:'Alertes',en:'Alerts'},
    '◇ Alertas':{ca:'◇ Alertes',en:'◇ Alerts'},
    'Usuarios':{ca:'Usuaris',en:'Users'},
    '♙ Usuarios':{ca:'♙ Usuaris',en:'♙ Users'},
    'Configuración':{ca:'Configuració',en:'Settings'},
    '⚙ Configuración':{ca:'⚙ Configuració',en:'⚙ Settings'},
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
    '▤ Exportar informe Excel':{ca:'▤ Exportar informe Excel',en:'▤ Export Excel report'},
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


  Object.assign(CATALOG,{
    'Instal·lacions BT · Asesor Energético Alpha':{ca:'Instal·lacions BT · Assessor Energètic Alpha',en:'Instal·lacions BT · Energy Advisor Alpha'},

    'Facturas únicas procesadas':{ca:'Factures úniques processades',en:'Unique invoices processed'},
    'Los PDF duplicados no cuentan':{ca:'Els PDF duplicats no compten',en:'Duplicate PDFs are not counted'},
    'Cargar carpeta completa':{ca:'Carregar carpeta completa',en:'Upload full folder'},
    'Exportar informe interno':{ca:'Exportar informe intern',en:'Export internal report'},
    '▤ Exportar informe interno':{ca:'▤ Exportar informe intern',en:'▤ Export internal report'},
    'Exportar Excel cliente':{ca:'Exportar Excel client',en:'Export client Excel'},
    '▤ Exportar Excel cliente':{ca:'▤ Exportar Excel client',en:'▤ Export client Excel'},
    'Auditar parser':{ca:'Auditar parser',en:'Audit parser'},
    '✓ Auditar parser':{ca:'✓ Auditar parser',en:'✓ Audit parser'},
    'Información':{ca:'Informació',en:'Information'},
    'Más información':{ca:'Més informació',en:'More information'},
    'Análisis terminado':{ca:'Anàlisi acabada',en:'Analysis complete'},
    'Acciones del análisis':{ca:"Accions de l'anàlisi",en:'Analysis actions'},
    'Carpeta leída':{ca:'Carpeta llegida',en:'Folder read'},
    'Carpeta seleccionada':{ca:'Carpeta seleccionada',en:'Folder selected'},
    'Leyendo la carpeta y buscando facturas PDF…':{ca:'Llegint la carpeta i cercant factures PDF…',en:'Reading the folder and looking for PDF invoices…'},
    'La carpeta no contiene facturas PDF.':{ca:'La carpeta no conté factures PDF.',en:'The folder contains no PDF invoices.'},
    'No se ha podido leer la carpeta arrastrada. Prueba con el botón “Cargar carpeta completa”.':{ca:"No s'ha pogut llegir la carpeta arrossegada. Prova amb el botó «Carregar carpeta completa».",en:'The dropped folder could not be read. Try the “Upload full folder” button.'},
    'Este navegador no permite seleccionar una carpeta completa. Usa Chrome o Edge.':{ca:'Aquest navegador no permet seleccionar una carpeta completa. Utilitza Chrome o Edge.',en:'This browser does not allow selecting a full folder. Use Chrome or Edge.'},
    'Selecciona una carpeta y se leerán todos los PDF que contenga, también dentro de subcarpetas.':{ca:"Selecciona una carpeta i es llegiran tots els PDF que contingui, també dins de subcarpetes.",en:'Select a folder and all PDFs inside it, including subfolders, will be read.'},
    'Histórico: iniciando validación y guardado…':{ca:"Històric: iniciant validació i desament…",en:'History: starting validation and save…'},
    'Histórico: no se pudo iniciar el guardado.':{ca:"Històric: no s'ha pogut iniciar el desament.",en:'History: save could not be started.'},
    'Histórico: esperando a que termine la lectura principal…':{ca:"Històric: esperant que acabi la lectura principal…",en:'History: waiting for the main reading process to finish…'},
    'Lectura detenida o incompleta':{ca:'Lectura aturada o incompleta',en:'Reading stopped or incomplete'},
    'Procesando':{ca:'Processant',en:'Processing'},
    'Lote recibido':{ca:'Lot rebut',en:'Batch received'},
    'Factura sin número':{ca:'Factura sense número',en:'Invoice without number'},
    'Revisar diferencias con el histórico':{ca:"Revisar diferències amb l'històric",en:'Review differences against history'},
    'Errores de lectura':{ca:'Errors de lectura',en:'Reading errors'},

    'No hay datos de maestro disponibles en la caché de este navegador.':{ca:"No hi ha dades mestres disponibles a la memòria cau d'aquest navegador.",en:'No master data is available in this browser cache.'},
    'disponibles en la caché local. Fuente principal: Supabase.':{ca:'disponibles a la memòria cau local. Font principal: Supabase.',en:'available in the local cache. Main source: Supabase.'},
    'Sin titular':{ca:'Sense titular',en:'No account holder'},
    'Suministro':{ca:'Subministrament',en:'Supply point'},
    'Localidad pendiente':{ca:'Localitat pendent',en:'Town / city pending'},
    'Tarifa pendiente':{ca:'Tarifa pendent',en:'Tariff pending'},
    'Contrato pendiente':{ca:'Contracte pendent',en:'Contract pending'},
    'Sin NIF/CIF':{ca:'Sense NIF/CIF',en:'No tax ID'},
    'Editar':{ca:'Editar',en:'Edit'},
    '+ Nuevo titular / suministro':{ca:'+ Nou titular / subministrament',en:'+ New account holder / supply point'},
    '+ Nuevo suministro':{ca:'+ Nou subministrament',en:'+ New supply point'},
    'Nuevo titular / suministro':{ca:'Nou titular / subministrament',en:'New account holder / supply point'},
    'Actualización automática desde factura':{ca:'Actualització automàtica des de factura',en:'Automatic update from invoice'},
    'Guardando en la base central…':{ca:'Desant a la base central…',en:'Saving to the central database…'},
    'Suministro actualizado':{ca:'Subministrament actualitzat',en:'Supply point updated'},
    'Cliente/suministro añadido':{ca:'Client/subministrament afegit',en:'Client/supply point added'},
    'Los datos principales están guardados; los alias internos quedan pendientes.':{ca:'Les dades principals estan desades; els àlies interns queden pendents.',en:'The main data is saved; internal aliases remain pending.'},
    'El suministro se guardó en Supabase, pero la caché local estaba desactualizada. Recargando…':{ca:"El subministrament s'ha desat a Supabase, però la memòria cau local estava desactualitzada. Recarregant…",en:'The supply point was saved to Supabase, but the local cache was out of date. Reloading…'},
    'El cambio está guardado en Supabase. Se ha recargado la caché local para evitar inconsistencias.':{ca:"El canvi està desat a Supabase. S'ha recarregat la memòria cau local per evitar inconsistències.",en:'The change is saved in Supabase. The local cache has been reloaded to avoid inconsistencies.'},
    'Maestro enriquecido:':{ca:'Mestre enriquit:',en:'Master data enriched:'},
    'Maestro importado en Supabase:':{ca:'Mestre importat a Supabase:',en:'Master data imported into Supabase:'},
    'ACTIVO':{ca:'ACTIU',en:'ACTIVE'},
    'PENDIENTE':{ca:'PENDENT',en:'PENDING'},
    'GRUPO':{ca:'GRUP',en:'GROUP'},
    'GRUPO CLIENTE':{ca:'GRUP CLIENT',en:'CLIENT GROUP'},

    'Titular':{ca:'Titular',en:'Account holder'},
    'Todos los titulares':{ca:'Tots els titulars',en:'All account holders'},
    'Todos los CUPS':{ca:'Tots els CUPS',en:'All CUPS'},
    'Desde':{ca:'Des de',en:'From'},
    'Hasta':{ca:'Fins a',en:'To'},
    'Excel cliente':{ca:'Excel client',en:'Client Excel'},
    '▤ Excel cliente':{ca:'▤ Excel client',en:'▤ Client Excel'},
    'Cargando histórico…':{ca:"Carregant l'històric…",en:'Loading history…'},
    'Generando Excel de la selección...':{ca:"Generant l'Excel de la selecció...",en:'Generating Excel for the selection...'},
    'No se ha cargado el exportador. Recarga la página.':{ca:"No s'ha carregat l'exportador. Recarrega la pàgina.",en:'The exporter has not loaded. Reload the page.'},
    'No se pudo generar el Excel.':{ca:"No s'ha pogut generar l'Excel.",en:'The Excel file could not be generated.'},
    'Escribe un nombre de cliente y selecciona una coincidencia.':{ca:'Escriu un nom de client i selecciona una coincidència.',en:'Type a client name and select a match.'},
    'Escribe para buscar cliente':{ca:'Escriu per cercar un client',en:'Type to search for a client'},
    'Abrir lista de clientes':{ca:'Obrir la llista de clients',en:'Open client list'},
    'Abrir lista de titulares':{ca:'Obrir la llista de titulars',en:'Open account holder list'},
    'Abrir lista de CUPS':{ca:'Obrir la llista de CUPS',en:'Open CUPS list'},
    'Abrir lista':{ca:'Obrir la llista',en:'Open list'},
    'Todos los titulares · escribe para buscar':{ca:'Tots els titulars · escriu per cercar',en:'All account holders · type to search'},
    'Todos los CUPS · escribe para buscar':{ca:'Tots els CUPS · escriu per cercar',en:'All CUPS · type to search'},
    'No hay una coincidencia única. Sigue escribiendo o selecciona un titular de la lista.':{ca:'No hi ha una coincidència única. Continua escrivint o selecciona un titular de la llista.',en:'There is no unique match. Keep typing or select an account holder from the list.'},
    'No hay una coincidencia única. Busca por CUPS, nombre, dirección o localidad.':{ca:'No hi ha una coincidència única. Cerca per CUPS, nom, adreça o localitat.',en:'There is no unique match. Search by CUPS, name, address or town/city.'},
    'Facturación bimestral.':{ca:'Facturació bimestral.',en:'Bimonthly billing.'},
    'Facturación con cadencia irregular.':{ca:'Facturació amb cadència irregular.',en:'Irregular billing cadence.'},
    'Cada punto representa el periodo real de la factura. No se reparten ni se inventan consumos o importes mensuales. El detalle de cada punto incluye el equivalente diario para comparar periodos de distinta duración.':{ca:"Cada punt representa el període real de la factura. No es reparteixen ni s'inventen consums o imports mensuals. El detall de cada punt inclou l'equivalent diari per comparar períodes de durada diferent.",en:'Each point represents the actual invoice period. Consumption and amounts are neither spread nor invented monthly. Each point includes the daily equivalent to compare periods of different lengths.'},
    'El intervalo supera 100 años. Revisa las fechas.':{ca:"L'interval supera els 100 anys. Revisa les dates.",en:'The range exceeds 100 years. Check the dates.'},
    'Hay un mes con datos incompletos.':{ca:'Hi ha un mes amb dades incompletes.',en:'One month has incomplete data.'},
    'La gráfica deja un hueco para no mostrar una subida o bajada falsa.':{ca:'La gràfica deixa un buit per no mostrar una pujada o baixada falsa.',en:'The chart leaves a gap to avoid showing a false increase or decrease.'},
    'Falta información en algún mes.':{ca:'Falta informació en algun mes.',en:'Information is missing for at least one month.'},
    'Ese periodo no se usa para comparar la evolución.':{ca:"Aquest període no s'utilitza per comparar l'evolució.",en:'That period is not used to compare the trend.'},
    'No hay meses con cobertura suficiente para comparar.':{ca:'No hi ha mesos amb prou cobertura per comparar.',en:'There are no months with enough coverage for comparison.'},
    'Consumo registrado por mes':{ca:'Consum registrat per mes',en:'Consumption recorded by month'},
    'Gasto registrado por mes':{ca:'Despesa registrada per mes',en:'Spend recorded by month'},
    'Excedentes compensados por mes':{ca:'Excedents compensats per mes',en:'Compensated surplus by month'},
    'Compensación económica por mes':{ca:'Compensació econòmica per mes',en:'Financial compensation by month'},
    'Evolución mensual':{ca:'Evolució mensual',en:'Monthly trend'},
    'Evolución del coste medio en euros por kilovatio hora':{ca:'Evolució del cost mitjà en euros per quilowatt hora',en:'Average cost trend in euros per kilowatt-hour'},
    'Sin potencia registrada':{ca:'Sense potència registrada',en:'No recorded power'},
    'Cambio de tarifa observado':{ca:'Canvi de tarifa observat',en:'Observed tariff change'},
    'Cambio de potencia observado':{ca:'Canvi de potència observat',en:'Observed power change'},
    'Cambio de tarifa':{ca:'Canvi de tarifa',en:'Tariff change'},
    'Inicio del periodo posterior':{ca:'Inici del període posterior',en:'Start of the following period'},
    'Concepto':{ca:'Concepte',en:'Item'},
    'Antes':{ca:'Abans',en:'Before'},
    'Después':{ca:'Després',en:'After'},
    'Diferencia':{ca:'Diferència',en:'Difference'},
    'Sin detalle P1-P6 de energía.':{ca:'Sense detall P1-P6 d’energia.',en:'No P1-P6 energy detail.'},
    'Sin detalle de potencia.':{ca:'Sense detall de potència.',en:'No power detail.'},
    'Sin detalle de compensación por excedentes.':{ca:"Sense detall de compensació d'excedents.",en:'No surplus compensation detail.'},
    'Sin conceptos adicionales.':{ca:'Sense conceptes addicionals.',en:'No additional items.'},
    'Excesos':{ca:'Excessos',en:'Excess power'},
    'Compensación':{ca:'Compensació',en:'Compensation'},
    'Bono social':{ca:'Bo social',en:'Social tariff charge'},
    'Alquiler contador':{ca:'Lloguer de comptador',en:'Meter rental'},
    'Derechos distribuidora':{ca:'Drets de distribuïdora',en:'Distributor charges'},
    'Impuesto electricidad':{ca:"Impost d'electricitat",en:'Electricity tax'},
    'Otros':{ca:'Altres',en:'Other'},
    'Lectura:':{ca:'Lectura:',en:'Reading:'},
    'Energía por periodos':{ca:'Energia per períodes',en:'Energy by period'},
    'Potencia y maxímetros':{ca:'Potència i maxímetres',en:'Power and maximum demand'},
    'Compensación de excedentes':{ca:"Compensació d'excedents",en:'Surplus compensation'},
    'Otros conceptos':{ca:'Altres conceptes',en:'Other items'},
    'Recomendaciones':{ca:'Recomanacions',en:'Recommendations'},
    'No se pudieron calcular las propuestas. El histórico sigue disponible.':{ca:"No s'han pogut calcular les propostes. L'històric continua disponible.",en:'The recommendations could not be calculated. History remains available.'},
    'Varias':{ca:'Diverses',en:'Several'},
    'Periodos guardados':{ca:'Períodes desats',en:'Saved periods'},
    'Consumo acumulado':{ca:'Consum acumulat',en:'Cumulative consumption'},
    'Gasto acumulado':{ca:'Despesa acumulada',en:'Cumulative spend'},
    'Coste total medio':{ca:'Cost total mitjà',en:'Average total cost'},
    'Excedentes compensados':{ca:'Excedents compensats',en:'Compensated surplus'},
    'Detalle parcial':{ca:'Detall parcial',en:'Partial detail'},
    'Compensación acumulada':{ca:'Compensació acumulada',en:'Cumulative compensation'},
    'Tarifa(s) más reciente(s)':{ca:'Tarifa(es) més recent(s)',en:'Most recent tariff(s)'},
    'Evolución del consumo':{ca:'Evolució del consum',en:'Consumption trend'},
    'Evolución del gasto':{ca:'Evolució de la despesa',en:'Spend trend'},
    'Evolución del coste medio':{ca:'Evolució del cost mitjà',en:'Average cost trend'},
    'Cronología':{ca:'Cronologia',en:'Timeline'},
    'Periodos históricos':{ca:'Períodes històrics',en:'Historical periods'},
    'Periodos históricos. Desplazamiento vertical y horizontal':{ca:'Períodes històrics. Desplaçament vertical i horitzontal',en:'Historical periods. Vertical and horizontal scrolling'},
    'Otros/recargos €':{ca:'Altres/recàrrecs €',en:'Other/surcharges €'},
    'No hay periodos históricos para la selección actual.':{ca:'No hi ha períodes històrics per a la selecció actual.',en:'There are no historical periods for the current selection.'},
    'Cambios detectados':{ca:'Canvis detectats',en:'Detected changes'},
    'Tarifa y potencia':{ca:'Tarifa i potència',en:'Tariff and power'},
    'No hay ningún cliente accesible para esta cuenta.':{ca:'No hi ha cap client accessible per a aquest compte.',en:'There are no clients accessible to this account.'},

    'Diagnóstico energético':{ca:'Diagnòstic energètic',en:'Energy diagnosis'},
    'Qué merece atención':{ca:'Què mereix atenció',en:'What needs attention'},
    'Te mostramos solo los puntos que conviene revisar. No hacemos una propuesta económica ni calculamos ahorros automáticamente.':{ca:"Mostram només els punts que convé revisar. No feim una proposta econòmica ni calculam estalvis automàticament.",en:'We only show the points worth reviewing. We do not make an economic proposal or calculate savings automatically.'},
    'Cargando análisis…':{ca:"Carregant l'anàlisi…",en:'Loading analysis…'},
    'Qué merece atención y por qué conviene revisarlo.':{ca:'Què mereix atenció i per què convé revisar-ho.',en:'What needs attention and why it is worth reviewing.'},
    'Estás pagando penalizaciones por superar la potencia contratada':{ca:'Estàs pagant penalitzacions per superar la potència contractada',en:'You are paying charges for exceeding contracted power'},
    'Hemos detectado cargos por exceso de potencia.':{ca:"Hem detectat càrrecs per excés de potència.",en:'We detected excess-power charges.'},
    'Conviene revisar cuándo se producen los picos.':{ca:'Convé revisar quan es produeixen els pics.',en:'It is worth reviewing when the peaks occur.'},
    'Estás pagando un coste adicional por energía reactiva':{ca:'Estàs pagant un cost addicional per energia reactiva',en:'You are paying an additional reactive-energy cost'},
    'Hemos detectado cargos por energía reactiva.':{ca:'Hem detectat càrrecs per energia reactiva.',en:'We detected reactive-energy charges.'},
    'Conviene revisar su origen y la compensación existente.':{ca:"Convé revisar-ne l'origen i la compensació existent.",en:'It is worth reviewing its cause and the existing compensation.'},
    'La potencia contratada podría estar por encima del uso observado':{ca:'La potència contractada podria estar per sobre de l’ús observat',en:'Contracted power may be above observed use'},
    'La demanda registrada se ha mantenido baja respecto a la potencia contratada.':{ca:'La demanda registrada s’ha mantingut baixa respecte de la potència contractada.',en:'Recorded demand has remained low compared with contracted power.'},
    'Conviene revisar el histórico completo antes de plantear cambios.':{ca:"Convé revisar l'històric complet abans de plantejar canvis.",en:'It is worth reviewing the full history before considering changes.'},
    'Faltan datos fiables de consumo en algunas facturas':{ca:'Falten dades fiables de consum en algunes factures',en:'Reliable consumption data is missing from some invoices'},
    'Hay periodos cuyo consumo no debe interpretarse todavía como real.':{ca:'Hi ha períodes el consum dels quals encara no s’ha d’interpretar com a real.',en:'Some periods should not yet be interpreted as actual consumption.'},
    'Conviene revisar las lecturas antes de sacar conclusiones.':{ca:'Convé revisar les lectures abans de treure conclusions.',en:'It is worth reviewing the readings before drawing conclusions.'},
    'El consumo ha cambiado de forma importante':{ca:'El consum ha canviat de manera important',en:'Consumption has changed significantly'},
    'Los últimos periodos se alejan claramente del comportamiento anterior.':{ca:'Els darrers períodes s’allunyen clarament del comportament anterior.',en:'The latest periods differ clearly from previous behaviour.'},
    'Conviene confirmar qué ha cambiado en el uso del suministro.':{ca:"Convé confirmar què ha canviat en l'ús del subministrament.",en:'It is worth confirming what changed in the use of the supply point.'},
    'Hemos detectado un comportamiento que conviene revisar.':{ca:'Hem detectat un comportament que convé revisar.',en:'We detected behaviour worth reviewing.'},
    'Conviene revisar el suministro con más detalle.':{ca:'Convé revisar el subministrament amb més detall.',en:'It is worth reviewing the supply point in more detail.'},
    'Estudiar':{ca:'Estudiar',en:'Study'},
    'Revisar datos':{ca:'Revisar dades',en:'Review data'},
    'Qué conviene revisar:':{ca:'Què convé revisar:',en:'What should be reviewed:'},
    'Suministros activos':{ca:'Subministraments actius',en:'Active supply points'},
    'puntos incluidos en el diagnóstico actual':{ca:'punts inclosos en el diagnòstic actual',en:'points included in the current diagnosis'},
    'Facturas revisadas':{ca:'Factures revisades',en:'Reviewed invoices'},
    'registros históricos validados':{ca:'registres històrics validats',en:'validated historical records'},
    'Revisar primero':{ca:'Revisar primer',en:'Review first'},
    'Son cargos que ya aparecen en las facturas. Aquí solo señalamos dónde merece la pena mirar.':{ca:'Són càrrecs que ja apareixen a les factures. Aquí només assenyalam on convé mirar.',en:'These are charges already appearing on invoices. We only point out where it is worth looking.'},
    'También conviene revisar':{ca:'També convé revisar',en:'Also worth reviewing'},
    'Cambios, lecturas o patrones que merecen comprobación antes de sacar conclusiones.':{ca:'Canvis, lectures o patrons que convé comprovar abans de treure conclusions.',en:'Changes, readings or patterns worth checking before drawing conclusions.'},
    '¿Quieres que revisemos alguno de estos puntos?':{ca:'Vols que revisem algun d’aquests punts?',en:'Would you like us to review any of these points?'},
    'Llámanos y estudiaremos el caso contigo antes de plantear cualquier cambio.':{ca:'Crida’ns i estudiarem el cas amb tu abans de plantejar cap canvi.',en:'Call us and we will review the case with you before considering any change.'},
    'Llamar':{ca:'Cridar',en:'Call'},
    'Preparando análisis…':{ca:"Preparant l'anàlisi…",en:'Preparing analysis…'},
    'No se ha podido preparar el análisis. El histórico sigue disponible.':{ca:"No s'ha pogut preparar l'anàlisi. L'històric continua disponible.",en:'The analysis could not be prepared. History remains available.'},
    'No hay ningún cliente asignado a esta cuenta.':{ca:'No hi ha cap client assignat a aquest compte.',en:'There is no client assigned to this account.'},

    'Seguimiento interno':{ca:'Seguiment intern',en:'Internal follow-up'},
    'Alertas en seguimiento':{ca:'Alertes en seguiment',en:'Tracked alerts'},
    'Aquí guardamos solo los puntos que ELECTRICA BT ha decidido revisar. El análisis detecta; esta pantalla sirve para no perder el seguimiento.':{ca:"Aquí guardam només els punts que ELECTRICA BT ha decidit revisar. L'anàlisi detecta; aquesta pantalla serveix per no perdre'n el seguiment.",en:'Here we keep only the points ELECTRICA BT has decided to review. Analysis detects them; this screen is for tracking them.'},
    'Pendientes y en revisión':{ca:'Pendents i en revisió',en:'Pending and under review'},
    'Pendientes':{ca:'Pendents',en:'Pending'},
    'En revisión':{ca:'En revisió',en:'Under review'},
    'Resueltas':{ca:'Resoltes',en:'Resolved'},
    'Descartadas':{ca:'Descartades',en:'Dismissed'},
    'Todas':{ca:'Totes',en:'All'},
    'Cargando alertas…':{ca:'Carregant alertes…',en:'Loading alerts…'},
    'Seguimiento interno de los puntos que hemos decidido revisar.':{ca:'Seguiment intern dels punts que hem decidit revisar.',en:'Internal follow-up of the points we have decided to review.'},
    'Trabajo pendiente':{ca:'Feina pendent',en:'Pending work'},
    'Prioridad alta':{ca:'Prioritat alta',en:'High priority'},
    'Prioridad media':{ca:'Prioritat mitjana',en:'Medium priority'},
    'Prioridad normal':{ca:'Prioritat normal',en:'Normal priority'},
    'Resuelta':{ca:'Resolta',en:'Resolved'},
    'Descartada':{ca:'Descartada',en:'Dismissed'},
    'Pendiente de revisar.':{ca:'Pendent de revisar.',en:'Pending review.'},
    'Seguimiento':{ca:'Seguiment',en:'Follow-up'},
    'Cerradas':{ca:'Tancades',en:'Closed'},
    'todavía sin revisar':{ca:'encara sense revisar',en:'not yet reviewed'},
    'casos que ya estamos estudiando':{ca:'casos que ja estam estudiant',en:'cases already being reviewed'},
    'resueltas o descartadas':{ca:'resoltes o descartades',en:'resolved or dismissed'},
    'alertas guardadas para este cliente':{ca:'alertes desades per a aquest client',en:'alerts saved for this client'},
    'Bandeja interna':{ca:'Safata interna',en:'Internal queue'},
    'Qué tenemos pendiente':{ca:'Què tenim pendent',en:'What is pending'},
    'Las alertas aparecen aquí solo cuando alguien de ELECTRICA BT decide seguirlas desde la pantalla de Análisis. No se crean presupuestos ni cifras de ahorro automáticamente.':{ca:"Les alertes apareixen aquí només quan algú d'ELECTRICA BT decideix seguir-les des de la pantalla d'Anàlisi. No es creen pressupostos ni xifres d'estalvi automàticament.",en:'Alerts appear here only when someone at ELECTRICA BT decides to track them from the Analysis screen. No quotes or savings figures are created automatically.'},
    'No se pudo identificar':{ca:"No s'ha pogut identificar",en:'Could not identify'},
    'En Alertas ✓':{ca:'A Alertes ✓',en:'In Alerts ✓'},
    'Añadiendo…':{ca:'Afegint…',en:'Adding…'},
    'Añadir a Alertas':{ca:'Afegir a Alertes',en:'Add to Alerts'},

    'Portal de cliente':{ca:'Portal de client',en:'Client portal'},
    'Consulta únicamente la información energética asignada a tu cuenta.':{ca:'Consulta únicament la informació energètica assignada al teu compte.',en:'View only the energy information assigned to your account.'},
    'Acceso cliente':{ca:'Accés client',en:'Client access'},
    'Tu solicitud está pendiente de activación. Instal·lacions BT te avisará cuando puedas entrar.':{ca:"La teva sol·licitud està pendent d'activació. Instal·lacions BT t'avisarà quan puguis entrar.",en:'Your request is pending activation. Instal·lacions BT will notify you when you can sign in.'},
    'Tu cuenta está desactivada. Contacta con el administrador.':{ca:'El teu compte està desactivat. Contacta amb l’administrador.',en:'Your account is disabled. Contact the administrator.'},
    'Acceso interno · todos':{ca:'Accés intern · tots',en:'Internal access · all'},
    'Sin cliente asignado':{ca:'Sense client assignat',en:'No client assigned'},
    '+ Asignar cliente…':{ca:'+ Assignar client…',en:'+ Assign client…'},
    'Asignar cliente para aprobar':{ca:'Assigna un client per aprovar',en:'Assign a client to approve'},
    'Restablecer acceso':{ca:"Restablir l'accés",en:'Reset access'},
    'Te hemos enviado un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.':{ca:"T'hem enviat un enllaç per crear una contrasenya nova. Revisa també la carpeta de correu brossa.",en:'We sent you a link to create a new password. Please also check your spam folder.'},
    'Guardando nueva contraseña…':{ca:'Desant la contrasenya nova…',en:'Saving new password…'},
    'Contraseña actualizada. Ya puedes iniciar sesión.':{ca:'Contrasenya actualitzada. Ja pots iniciar sessió.',en:'Password updated. You can now sign in.'},
    'Aprueba solicitudes vinculando cada cuenta con su cliente y gestiona los accesos.':{ca:'Aprova sol·licituds vinculant cada compte amb el seu client i gestiona els accessos.',en:'Approve requests by linking each account to its client and manage access.'},

    'Gestión central':{ca:'Gestió central',en:'Central management'},
    'Buscar cliente…':{ca:'Cercar client…',en:'Search client…'},
    'Buscar titular, NIF/CIF o cliente…':{ca:'Cercar titular, NIF/CIF o client…',en:'Search account holder, tax ID or client…'},
    'Buscar CUPS, cliente o dirección…':{ca:'Cercar CUPS, client o adreça…',en:'Search CUPS, client or address…'},
    'Cliente sin identificar':{ca:'Client sense identificar',en:'Unidentified client'},
    'Titular sin identificar':{ca:'Titular sense identificar',en:'Unidentified account holder'},
    'Eliminar definitivamente':{ca:'Eliminar definitivament',en:'Delete permanently'},
    'Con datos: no se puede borrar':{ca:'Amb dades: no es pot eliminar',en:'Has data: cannot be deleted'},
    'Con histórico: no se puede borrar':{ca:"Amb històric: no es pot eliminar",en:'Has history: cannot be deleted'},
    'Aplicar titular de última factura':{ca:'Aplicar titular de la darrera factura',en:'Apply account holder from latest invoice'},
    'Titular coherente con la última factura válida':{ca:'Titular coherent amb la darrera factura vàlida',en:'Account holder matches the latest valid invoice'},
    'Titular pendiente de revisión: falta identificación fiscal en el maestro o en la última factura.':{ca:'Titular pendent de revisió: falta identificació fiscal al mestre o a la darrera factura.',en:'Account holder pending review: tax identification is missing from the master data or latest invoice.'},
    'Supabase no está disponible.':{ca:'Supabase no està disponible.',en:'Supabase is not available.'},
    'Operación rechazada.':{ca:'Operació rebutjada.',en:'Operation rejected.'},
    'Actualizando titular…':{ca:'Actualitzant titular…',en:'Updating account holder…'},
    'Titular actualizado. El histórico anterior permanece intacto.':{ca:"Titular actualitzat. L'històric anterior es manté intacte.",en:'Account holder updated. Previous history remains unchanged.'},
    'Cambio de titular aplicado. El titular anterior ya no tiene CUPS activos; puede archivarse cuando corresponda.':{ca:"Canvi de titular aplicat. El titular anterior ja no té CUPS actius; es pot arxivar quan correspongui.",en:'Account holder change applied. The previous account holder no longer has active CUPS and can be archived when appropriate.'},
    'Cambio de titular aplicado y trazado en el histórico.':{ca:"Canvi de titular aplicat i traçat a l'històric.",en:'Account holder change applied and traced in history.'},
    'Solo un administrador puede archivar suministros.':{ca:'Només un administrador pot arxivar subministraments.',en:'Only an administrator can archive supply points.'},
    'Archivar este suministro conservando todo su histórico':{ca:"Arxivar aquest subministrament conservant tot l'històric",en:'Archive this supply point while keeping all its history'},
    'La gestión central todavía se está cargando. Inténtalo de nuevo en un instante.':{ca:"La gestió central encara s'està carregant. Torna-ho a provar d'aquí un moment.",en:'Central management is still loading. Try again in a moment.'},
    'Eliminar':{ca:'Eliminar',en:'Delete'},
    'Nombre legal del titular:':{ca:'Nom legal del titular:',en:'Legal account-holder name:'},
    'NIF/CIF del titular:':{ca:'NIF/CIF del titular:',en:'Account-holder tax ID:'},
    'ELIMINAR':{ca:'ELIMINAR',en:'DELETE'},

    'Uso de base de datos respecto a la referencia de 500 MB':{ca:'Ús de la base de dades respecte de la referència de 500 MB',en:'Database usage against the 500 MB reference'},
    'Conexión con la base de datos no disponible.':{ca:'Connexió amb la base de dades no disponible.',en:'Database connection unavailable.'},
    'No se pudo consultar el uso de base de datos':{ca:"No s'ha pogut consultar l'ús de la base de dades",en:'Database usage could not be queried'},

    'Seguimiento de alertas':{ca:"Seguiment d'alertes",en:'Alert tracking'}
  });


  Object.assign(CATALOG,{
    'Factura no compatible todavía':{ca:'Factura encara no compatible',en:'Invoice not yet supported'},
    'No se pudo leer la primera página escaneada de esta posible factura FENIE':{ca:"No s'ha pogut llegir la primera pàgina escanejada d'aquesta possible factura FENIE",en:'The scanned first page of this possible FENIE invoice could not be read'},
    'La primera página se ha leído por OCR, pero el formato FENIE no se ha podido validar':{ca:"La primera pàgina s'ha llegit per OCR, però el format FENIE no s'ha pogut validar",en:'The first page was read by OCR, but the FENIE format could not be validated'},
    'Posible refacturación: mismo CUPS, periodo y consumo, pero no se puede determinar con seguridad cuál es posterior. Revisar antes de consolidar.':{ca:'Possible refacturació: mateix CUPS, període i consum, però no es pot determinar amb seguretat quina és posterior. Revisar abans de consolidar.',en:'Possible rebilling: same CUPS, period and consumption, but it is not possible to determine safely which invoice is later. Review before consolidating.'},
    'Posible refacturación: revisar antes de consolidar.':{ca:'Possible refacturació: revisar abans de consolidar.',en:'Possible rebilling: review before consolidating.'},
    'Motivo del error:':{ca:"Motiu de l'error:",en:'Error reason:'},
    'Por identificar':{ca:'Per identificar',en:'To be identified'},

    'Has pagado una penalización por superar la potencia contratada':{ca:'Has pagat una penalització per superar la potència contractada',en:'You paid a charge for exceeding contracted power'},
    'Es un coste adicional. Antes de cambiar la potencia conviene saber si los picos son puntuales o se repiten por el funcionamiento habitual del suministro.':{ca:'És un cost addicional. Abans de canviar la potència convé saber si els pics són puntuals o es repeteixen pel funcionament habitual del subministrament.',en:'This is an additional cost. Before changing contracted power, it is worth checking whether the peaks are isolated or part of the normal operation of the supply point.'},
    'Revisar cuándo se producen los picos y si responden al funcionamiento habitual del suministro.':{ca:'Revisar quan es produeixen els pics i si responen al funcionament habitual del subministrament.',en:'Review when the peaks occur and whether they reflect the normal operation of the supply point.'},
    'Conviene revisarlo':{ca:'Convé revisar-ho',en:'Worth reviewing'},
    'Ha aparecido un coste adicional por energía reactiva':{ca:'Ha aparegut un cost addicional per energia reactiva',en:'An additional reactive-energy cost has appeared'},
    'La energía reactiva puede generar cargos que no aportan consumo útil. Si se repite, merece revisar la instalación y la compensación existente.':{ca:"L'energia reactiva pot generar càrrecs que no aporten consum útil. Si es repeteix, convé revisar la instal·lació i la compensació existent.",en:'Reactive energy can generate charges without providing useful consumption. If it repeats, the installation and existing compensation are worth reviewing.'},
    'Comprobar el origen de la reactiva y el estado de la compensación antes de proponer equipos o cambios.':{ca:"Comprovar l'origen de la reactiva i l'estat de la compensació abans de proposar equips o canvis.",en:'Check the source of the reactive energy and the condition of the compensation before proposing equipment or changes.'},
    'Podrías tener más potencia contratada de la que necesitas':{ca:'Podries tenir més potència contractada de la que necessites',en:'You may have more contracted power than you need'},
    'Si este patrón se mantiene durante un ciclo completo, conviene revisar si la potencia contratada está ajustada al uso real.':{ca:"Si aquest patró es manté durant un cicle complet, convé revisar si la potència contractada s'ajusta a l'ús real.",en:'If this pattern continues over a full cycle, it is worth reviewing whether contracted power matches actual use.'},
    'Revisar un año completo y la estacionalidad antes de plantear cualquier cambio de potencia.':{ca:"Revisar un any complet i l'estacionalitat abans de plantejar qualsevol canvi de potència.",en:'Review a full year and seasonality before considering any power change.'},
    'Requiere revisión técnica':{ca:'Requereix revisió tècnica',en:'Technical review required'},
    'Este suministro aparece sin consumo pero sigue teniendo costes':{ca:'Aquest subministrament apareix sense consum però continua tenint costos',en:'This supply point shows no consumption but still has costs'},
    'Puede ser un suministro sin uso, estacional o necesario para algún servicio que no vemos en la factura.':{ca:'Pot ser un subministrament sense ús, estacional o necessari per a algun servei que no veim a la factura.',en:'It may be an unused or seasonal supply point, or one needed for a service that is not visible on the invoice.'},
    'Confirmar para qué se utiliza antes de plantear una baja o cualquier cambio de potencia.':{ca:"Confirmar per a què s'utilitza abans de plantejar una baixa o qualsevol canvi de potència.",en:'Confirm what it is used for before considering disconnection or any power change.'},
    'Conviene comprobarlo':{ca:'Convé comprovar-ho',en:'Worth checking'},
    'Sin una lectura fiable podríamos confundir una falta de datos con una bajada real de consumo.':{ca:'Sense una lectura fiable podríem confondre una manca de dades amb una baixada real de consum.',en:'Without a reliable reading, missing data could be confused with a real drop in consumption.'},
    'Revisar las lecturas de distribuidora o comercializadora antes de usar estos periodos para tomar decisiones.':{ca:'Revisar les lectures de distribuïdora o comercialitzadora abans d’utilitzar aquests períodes per prendre decisions.',en:'Review distributor or retailer readings before using these periods to make decisions.'},
    'No sacar conclusiones aún':{ca:'Encara no treure conclusions',en:'Do not draw conclusions yet'},
    'Puede deberse a más actividad, horarios, climatización, nuevos equipos o un cambio de uso. Merece revisar qué ha cambiado.':{ca:'Pot ser degut a més activitat, horaris, climatització, equips nous o un canvi d’ús. Convé revisar què ha canviat.',en:'It may be due to more activity, schedules, climate control, new equipment or a change of use. It is worth reviewing what changed.'},
    'Puede deberse a menos actividad, cambios de horario, cierre parcial o un cambio de uso. Conviene confirmar la causa antes de sacar conclusiones.':{ca:'Pot ser degut a menys activitat, canvis d’horari, tancament parcial o un canvi d’ús. Convé confirmar-ne la causa abans de treure conclusions.',en:'It may be due to less activity, schedule changes, partial closure or a change of use. Confirm the cause before drawing conclusions.'},
    'Comprobar si han cambiado la actividad, los horarios, la climatización, la ocupación o los equipos del suministro.':{ca:"Comprovar si han canviat l'activitat, els horaris, la climatització, l'ocupació o els equips del subministrament.",en:'Check whether activity, schedules, climate control, occupancy or equipment have changed.'},
    'Comprobar si ha cambiado la actividad o el uso del suministro y confirmar que las lecturas sean coherentes.':{ca:"Comprovar si ha canviat l'activitat o l'ús del subministrament i confirmar que les lectures siguin coherents.",en:'Check whether activity or use of the supply point has changed and confirm that the readings are consistent.'},
    'Hay algo que merece revisión':{ca:'Hi ha alguna cosa que convé revisar',en:'There is something worth reviewing'},
    'Hemos detectado un dato que se sale del comportamiento habitual del suministro.':{ca:'Hem detectat una dada que surt del comportament habitual del subministrament.',en:'We detected a value outside the usual behaviour of the supply point.'},
    'Conviene revisarlo antes de tomar decisiones.':{ca:'Convé revisar-ho abans de prendre decisions.',en:'It is worth reviewing before making decisions.'},
    'Revisar el detalle y confirmar el contexto del suministro.':{ca:'Revisar el detall i confirmar el context del subministrament.',en:'Review the detail and confirm the context of the supply point.'},
    'Suministro eléctrico':{ca:'Subministrament elèctric',en:'Electricity supply point'},
    'Cambio sobre consumo diario':{ca:'Canvi sobre consum diari',en:'Change in daily consumption'},
    'últimas 2 vs 3 anteriores':{ca:'darreres 2 vs 3 anteriors',en:'latest 2 vs previous 3'},

    'Potencia contratada claramente por encima de la demanda observada':{ca:'Potència contractada clarament per sobre de la demanda observada',en:'Contracted power clearly above observed demand'},
    'Estudiar un posible ajuste de potencia':{ca:'Estudiar un possible ajust de potència',en:'Study a possible power adjustment'},
    'Revisar un ciclo anual completo, la curva de demanda, la estacionalidad y las necesidades reales de la instalación. Después comparar varios escenarios de potencia y su coste antes de proponer nuevos kW.':{ca:'Revisar un cicle anual complet, la corba de demanda, l’estacionalitat i les necessitats reals de la instal·lació. Després comparar diversos escenaris de potència i el seu cost abans de proposar nous kW.',en:'Review a full annual cycle, the demand curve, seasonality and the actual needs of the installation. Then compare several power scenarios and their cost before proposing new kW.'},
    'Excesos de potencia repetidos':{ca:'Excessos de potència repetits',en:'Repeated excess-power charges'},
    'Revisar los excesos de potencia':{ca:'Revisar els excessos de potència',en:'Review excess power'},
    'Analizar por qué se repiten los picos, en qué periodos aparecen y si conviene actuar sobre las cargas o comparar económicamente una modificación de potencia. No cambiar los kW sin calcular antes ambos escenarios.':{ca:'Analitzar per què es repeteixen els pics, en quins períodes apareixen i si convé actuar sobre les càrregues o comparar econòmicament una modificació de potència. No canviar els kW sense calcular abans ambdós escenaris.',en:'Analyse why the peaks repeat, in which periods they occur, and whether it is better to act on loads or compare a power change economically. Do not change kW without calculating both scenarios first.'},
    'Analizar cuándo se produjo el pico y si fue puntual. Comparar el coste del exceso con el de cualquier posible ajuste de potencia antes de proponer nuevos kW.':{ca:'Analitzar quan es va produir el pic i si va ser puntual. Comparar el cost de l’excés amb el de qualsevol possible ajust de potència abans de proposar nous kW.',en:'Analyse when the peak occurred and whether it was isolated. Compare the excess cost with any possible power adjustment before proposing new kW.'},
    'El coste de excesos registrado no demuestra por sí solo que deba aumentarse la potencia. Puede haber picos puntuales, cambios de uso o alternativas operativas más baratas.':{ca:'El cost d’excessos registrat no demostra per si sol que s’hagi d’augmentar la potència. Pot haver-hi pics puntuals, canvis d’ús o alternatives operatives més barates.',en:'Recorded excess-power cost alone does not prove that contracted power should be increased. There may be isolated peaks, changes of use or cheaper operational alternatives.'},
    'Energía reactiva recurrente':{ca:'Energia reactiva recurrent',en:'Recurring reactive energy'},
    'Revisar la energía reactiva':{ca:'Revisar l’energia reactiva',en:'Review reactive energy'},
    'Comprobar el origen de la reactiva, el estado y regulación de la compensación existente, si la hay, y si los cargos se concentran en periodos concretos. Si se confirma el patrón, estudiar técnicamente la compensación y su coste antes de dimensionar o sustituir equipos.':{ca:'Comprovar l’origen de la reactiva, l’estat i regulació de la compensació existent, si n’hi ha, i si els càrrecs es concentren en períodes concrets. Si es confirma el patró, estudiar tècnicament la compensació i el seu cost abans de dimensionar o substituir equips.',en:'Check the source of reactive energy, the state and regulation of any existing compensation, and whether charges are concentrated in specific periods. If the pattern is confirmed, study the compensation technically and economically before sizing or replacing equipment.'},
    'Comprobar si el cargo corresponde a una situación puntual o a un patrón que empieza a repetirse. Revisar la instalación y la compensación existente, si la hay, antes de plantear una intervención.':{ca:'Comprovar si el càrrec correspon a una situació puntual o a un patró que comença a repetir-se. Revisar la instal·lació i la compensació existent, si n’hi ha, abans de plantejar una intervenció.',en:'Check whether the charge is an isolated event or the start of a recurring pattern. Review the installation and any existing compensation before considering an intervention.'},
    'El coste de reactiva registrado no equivale a ahorro posible ni demuestra por sí solo que sea necesario instalar o sustituir una batería de condensadores. Hay que revisar la instalación y las mediciones antes de dimensionar una solución.':{ca:'El cost de reactiva registrat no equival a un estalvi possible ni demostra per si sol que sigui necessari instal·lar o substituir una bateria de condensadors. Cal revisar la instal·lació i les mesures abans de dimensionar una solució.',en:'Recorded reactive-energy cost is not equivalent to potential savings and does not by itself prove that a capacitor bank must be installed or replaced. The installation and measurements must be reviewed before sizing a solution.'},
    'Comprobar un suministro con lectura real y consumo cero':{ca:'Comprovar un subministrament amb lectura real i consum zero',en:'Check a supply point with an actual reading and zero consumption'},
    'Confirmar si el suministro está en uso, es estacional o debe mantenerse para servicios esenciales. Revisar sus costes fijos y las condiciones del contrato antes de plantear cambios.':{ca:'Confirmar si el subministrament està en ús, és estacional o s’ha de mantenir per a serveis essencials. Revisar-ne els costos fixos i les condicions del contracte abans de plantejar canvis.',en:'Confirm whether the supply point is in use, seasonal or must be kept for essential services. Review fixed costs and contract conditions before considering changes.'},
    'El total facturado no equivale a ahorro posible. No se recomienda dar de baja el suministro ni reducir potencia sin comprobar su función.':{ca:'El total facturat no equival a un estalvi possible. No es recomana donar de baixa el subministrament ni reduir potència sense comprovar-ne la funció.',en:'The total billed amount is not equivalent to potential savings. Disconnecting the supply point or reducing power is not recommended without checking its function.'},
    'Revisar periodos sin lectura de distribuidora':{ca:'Revisar períodes sense lectura de distribuïdora',en:'Review periods without distributor readings'},
    '0 kWh sin lectura real confirmada':{ca:'0 kWh sense lectura real confirmada',en:'0 kWh without a confirmed actual reading'},
    'Verificar las lecturas de distribuidora/comercializadora antes de interpretar estos periodos como consumo cero. No utilizar esta secuencia como base para una baja, una reducción de potencia ni una anomalía de consumo.':{ca:'Verificar les lectures de distribuïdora/comercialitzadora abans d’interpretar aquests períodes com a consum zero. No utilitzar aquesta seqüència com a base per a una baixa, una reducció de potència ni una anomalia de consum.',en:'Verify distributor/retailer readings before interpreting these periods as zero consumption. Do not use this sequence as the basis for disconnection, a power reduction or a consumption anomaly.'},
    '0 kWh facturados no demuestran que el suministro no haya consumido. Puede faltar la lectura, existir una estimación o llegar una regularización posterior.':{ca:'0 kWh facturats no demostren que el subministrament no hagi consumit. Pot faltar la lectura, existir una estimació o arribar una regularització posterior.',en:'0 billed kWh does not prove that the supply point consumed nothing. A reading may be missing, an estimate may exist or a later adjustment may arrive.'},
    'Pendiente de revisión':{ca:'Pendent de revisió',en:'Pending review'},
    'Por qué aparece':{ca:'Per què apareix',en:'Why it appears'},
    'Qué proponemos revisar':{ca:'Què proposam revisar',en:'What we propose reviewing'},
    'Propuestas de revisión · no cambios realizados':{ca:'Propostes de revisió · cap canvi realitzat',en:'Review proposals · no changes made'},
    'Orientaciones automáticas basadas únicamente en los periodos de la selección. No son recomendaciones contractuales ni presupuestos.':{ca:'Orientacions automàtiques basades únicament en els períodes de la selecció. No són recomanacions contractuals ni pressupostos.',en:'Automatic guidance based only on the selected periods. These are not contractual recommendations or quotes.'},

    'Detalle a revisar':{ca:'Detall per revisar',en:'Detail to review'},
    'Completitud histórica: revisar':{ca:'Completitud històrica: revisar',en:'Historical completeness: review'},
    'Validado contra parser principal antes de guardar histórico':{ca:"Validat contra el parser principal abans de desar l'històric",en:'Validated against the main parser before saving to history'},
    'Solo conserva información estructurada extraída y validada. Los PDF se procesan localmente y no se almacenan.':{ca:"Només conserva informació estructurada extreta i validada. Els PDF es processen localment i no s'emmagatzemen.",en:'Only extracted and validated structured information is kept. PDFs are processed locally and are not stored.'},
    'periodos históricos guardados':{ca:'períodes històrics desats',en:'historical periods saved'},
    'Sincronización preparada':{ca:'Sincronització preparada',en:'Synchronisation ready'},
    'No se ha completado el guardado del histórico. Revisa la conexión.':{ca:"No s'ha completat el desament de l'històric. Revisa la connexió.",en:'History save did not complete. Check the connection.'}
  });

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

  const PATTERNS=[
    {re:/^(\d+) cliente(?:s)? · (\d+) titular(?:es)? · (\d+) CUPS$/,ca:m=>m[1]+' '+(m[1]==='1'?'client':'clients')+' · '+m[2]+' '+(m[2]==='1'?'titular':'titulars')+' · '+m[3]+' CUPS',en:m=>m[1]+' '+(m[1]==='1'?'client':'clients')+' · '+m[2]+' '+(m[2]==='1'?'account holder':'account holders')+' · '+m[3]+' CUPS'},
    {re:/^(\d+) clientes legales · (\d+) titular(?:es)? · (\d+) suministro(?:s)?$/,ca:m=>m[1]+' clients legals · '+m[2]+' '+(m[2]==='1'?'titular':'titulars')+' · '+m[3]+' '+(m[3]==='1'?'subministrament':'subministraments'),en:m=>m[1]+' legal clients · '+m[2]+' '+(m[2]==='1'?'account holder':'account holders')+' · '+m[3]+' '+(m[3]==='1'?'supply point':'supply points')},
    {re:/^(\d+) titular(?:es)? · (\d+) suministro(?:s)?$/,ca:m=>m[1]+' '+(m[1]==='1'?'titular':'titulars')+' · '+m[2]+' '+(m[2]==='1'?'subministrament':'subministraments'),en:m=>m[1]+' '+(m[1]==='1'?'account holder':'account holders')+' · '+m[2]+' '+(m[2]==='1'?'supply point':'supply points')},
    {re:/^\+ Nuevo suministro para (.+)$/,ca:m=>'+ Nou subministrament per a '+m[1],en:m=>'+ New supply point for '+m[1]},
    {re:/^Editar suministro · (.+)$/,ca:m=>'Editar subministrament · '+m[1],en:m=>'Edit supply point · '+m[1]},
    {re:/^(\d+) CUPS seleccionados$/,ca:m=>m[1]+' CUPS seleccionats',en:m=>m[1]+' CUPS selected'},
    {re:/^(\d+) titulares · (\d+) CUPS$/,ca:m=>m[1]+' titulars · '+m[2]+' CUPS',en:m=>m[1]+' account holders · '+m[2]+' CUPS'},
    {re:/^(\d+) CUPS con registros · (\d+) periodo\(s\)$/,ca:m=>m[1]+' CUPS amb registres · '+m[2]+' període(s)',en:m=>m[1]+' CUPS with records · '+m[2]+' period(s)'},
    {re:/^(\d+) días$/,ca:m=>m[1]+' dies',en:m=>m[1]+' days'},
    {re:/^(\d+) avisos?$/,ca:m=>m[1]+' '+(m[1]==='1'?'avís':'avisos'),en:m=>m[1]+' '+(m[1]==='1'?'notice':'notices')},
    {re:/^(\d+) visibles?$/,ca:m=>m[1]+' '+(m[1]==='1'?'visible':'visibles'),en:m=>m[1]+' visible'},
    {re:/^Detectada (.+)$/,ca:m=>'Detectada '+m[1],en:m=>'Detected '+m[1]},
    {re:/^Información: (.+)$/,ca:m=>'Informació: '+translateString(m[1],'ca'),en:m=>'Information: '+translateString(m[1],'en')},
    {re:/^\+ Selecciona cliente… \((\d+)\)$/,ca:m=>'+ Selecciona client… ('+m[1]+')',en:m=>'+ Select client… ('+m[1]+')'},
    {re:/^\+ Asignar cliente… \((\d+)\)$/,ca:m=>'+ Assignar client… ('+m[1]+')',en:m=>'+ Assign client… ('+m[1]+')'},
    {re:/^Escribe más para filtrar · (\d+) más$/,ca:m=>'Escriu més per filtrar · '+m[1]+' més',en:m=>'Type more to filter · '+m[1]+' more'},
    {re:/^Sin coincidencias$/,ca:()=> 'Sense coincidències',en:()=> 'No matches'},
    {re:/^No se pudo cargar el cliente: (.+)$/,ca:m=>"No s'ha pogut carregar el client: "+m[1],en:m=>'The client could not be loaded: '+m[1]},
    {re:/^No se ha podido cargar el histórico: (.+)$/,ca:m=>"No s'ha pogut carregar l'històric: "+m[1],en:m=>'History could not be loaded: '+m[1]},
    {re:/^No se ha podido iniciar el histórico: (.+)$/,ca:m=>"No s'ha pogut iniciar l'històric: "+m[1],en:m=>'History could not be started: '+m[1]},
    {re:/^No se ha podido cargar el análisis: (.+)$/,ca:m=>"No s'ha pogut carregar l'anàlisi: "+m[1],en:m=>'Analysis could not be loaded: '+m[1]},
    {re:/^No se ha podido iniciar el análisis: (.+)$/,ca:m=>"No s'ha pogut iniciar l'anàlisi: "+m[1],en:m=>'Analysis could not be started: '+m[1]},
    {re:/^No se pudieron cargar las alertas: (.+)$/,ca:m=>"No s'han pogut carregar les alertes: "+m[1],en:m=>'Alerts could not be loaded: '+m[1]},
    {re:/^No se pudo actualizar la alerta: (.+)$/,ca:m=>"No s'ha pogut actualitzar l'alerta: "+m[1],en:m=>'The alert could not be updated: '+m[1]},
    {re:/^No se pudo guardar la alerta: (.+)$/,ca:m=>"No s'ha pogut desar l'alerta: "+m[1],en:m=>'The alert could not be saved: '+m[1]},
    {re:/^Carpeta leída · (\d+) facturas PDF encontradas(?: · (\d+) archivos no PDF ignorados)?$/,ca:m=>'Carpeta llegida · '+m[1]+' factures PDF trobades'+(m[2]?' · '+m[2]+' fitxers no PDF ignorats':''),en:m=>'Folder read · '+m[1]+' PDF invoices found'+(m[2]?' · '+m[2]+' non-PDF files ignored':'')},
    {re:/^Carpeta seleccionada · (\d+) facturas PDF encontradas(?: · (\d+) archivos no PDF ignorados)?$/,ca:m=>'Carpeta seleccionada · '+m[1]+' factures PDF trobades'+(m[2]?' · '+m[2]+' fitxers no PDF ignorats':''),en:m=>'Folder selected · '+m[1]+' PDF invoices found'+(m[2]?' · '+m[2]+' non-PDF files ignored':'')},
    {re:/^Se encontraron (\d+) PDF, pero el navegador no permite entregarlos automáticamente\. Usa Chrome o Edge\.$/,ca:m=>"S'han trobat "+m[1]+" PDF, però el navegador no permet lliurar-los automàticament. Utilitza Chrome o Edge.",en:m=>m[1]+' PDFs were found, but the browser cannot pass them automatically. Use Chrome or Edge.'},
    {re:/^Lote recibido · (\d+) facturas PDF · preparando lectura…$/,ca:m=>'Lot rebut · '+m[1]+' factures PDF · preparant lectura…',en:m=>'Batch received · '+m[1]+' PDF invoices · preparing reading…'},
    {re:/^(\w[^·]*) · (\d+)\/(\d+) PDF$/,ca:m=>translateString(m[1],'ca')+' · '+m[2]+'/'+m[3]+' PDF',en:m=>translateString(m[1],'en')+' · '+m[2]+'/'+m[3]+' PDF'},
    {re:/^No se han encontrado filas con CUPS válidos en (.+)\.$/,ca:m=>"No s'han trobat files amb CUPS vàlids a "+m[1]+'.',en:m=>'No rows with valid CUPS were found in '+m[1]+'.'},
    {re:/^(\d+) CUPS nuevos · (\d+) suministros completados · (\d+) sin cambios · (\d+) conflictos bloqueados\.$/,ca:m=>m[1]+' CUPS nous · '+m[2]+' subministraments completats · '+m[3]+' sense canvis · '+m[4]+' conflictes bloquejats.',en:m=>m[1]+' new CUPS · '+m[2]+' supply points completed · '+m[3]+' unchanged · '+m[4]+' conflicts blocked.'},
    {re:/^(\d+) suministro(?:s)? inactivo(?:s)? se mantiene(?:n)? en el histórico, pero no genera(?:n)? avisos actuales\.$/,ca:m=>m[1]+' '+(m[1]==='1'?'subministrament inactiu es manté':'subministraments inactius es mantenen')+" a l'històric, però no "+(m[1]==='1'?'genera':'generen')+' avisos actuals.',en:m=>m[1]+' inactive '+(m[1]==='1'?'supply point remains':'supply points remain')+' in history but '+(m[1]==='1'?'does':'do')+' not generate current notices.'},
    {re:/^(.+) días, la potencia utilizada se ha mantenido baja en (\d+) periodo(?:s)? y no hemos visto penalizaciones por exceso\.$/,ca:m=>'Durant '+m[1]+' dies, la potència utilitzada s’ha mantingut baixa en '+m[2]+' '+(m[2]==='1'?'període':'períodes')+' i no hem vist penalitzacions per excés.',en:m=>'For '+m[1]+' days, power use remained low in '+m[2]+' '+(m[2]==='1'?'period':'periods')+' and no excess-power charges were observed.'}
  ];

  let current='es';
  let observer=null;
  let reverseText=new Map();
  const reverseAttr={placeholder:new Map(),'aria-label':new Map(),title:new Map()};
  const textSource=new WeakMap();
  const textRendered=new WeakMap();
  const attrSource=new WeakMap();
  const attrRendered=new WeakMap();
  let titleSource='';

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

  function patternFor(source,lang){
    if(lang==='es')return source;
    for(const item of PATTERNS){
      const match=String(source).match(item.re);
      if(match)return item[lang]?.(match)??source;
    }
    return source;
  }
  function translateString(source,lang=current){
    const raw=String(source??'');
    const key=Object.prototype.hasOwnProperty.call(CATALOG,raw)?raw:reverseText.get(raw);
    if(key){
      if(lang==='es')return key;
      return String(CATALOG[key]?.[lang]??key);
    }
    return patternFor(raw,lang);
  }
  function textFor(source,lang=current){return translateString(source,lang)}
  function attrFor(attr,value,lang=current){
    const sourceMap=ATTRIBUTE_CATALOG[attr]||{};
    const raw=String(value??'');
    const key=Object.prototype.hasOwnProperty.call(sourceMap,raw)?raw:reverseAttr[attr]?.get(raw);
    if(key){
      if(lang==='es')return key;
      return String(sourceMap[key]?.[lang]??key);
    }
    return translateString(raw,lang);
  }
  function translatedCandidate(source,lang=current){
    const exact=Object.prototype.hasOwnProperty.call(CATALOG,source)||reverseText.has(source);
    const translated=translateString(source,lang);
    return {translated,known:exact||translated!==source};
  }
  function translateTextNode(node){
    if(!node||node.nodeType!==3)return;
    const parent=node.parentElement;
    if(!parent||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(parent.tagName))return;
    const raw=node.nodeValue||'',trimmed=raw.trim();
    if(!trimmed)return;
    let source=textSource.get(node);
    const last=textRendered.get(node);
    if(!source||trimmed!==last){
      const normalized=reverseText.get(trimmed)||trimmed;
      const candidate=translatedCandidate(normalized,current);
      if(!candidate.known){
        textSource.delete(node);textRendered.delete(node);
        return;
      }
      source=normalized;
      textSource.set(node,source);
    }
    const translated=translateString(source,current);
    textRendered.set(node,translated);
    if(translated===trimmed)return;
    const at=raw.indexOf(trimmed);
    node.nodeValue=raw.slice(0,at)+translated+raw.slice(at+trimmed.length);
  }
  function attrMaps(el){
    if(!attrSource.has(el))attrSource.set(el,{});
    if(!attrRendered.has(el))attrRendered.set(el,{});
    return {sources:attrSource.get(el),rendered:attrRendered.get(el)};
  }
  function translateAttributes(el){
    if(!el||el.nodeType!==1)return;
    const maps=attrMaps(el);
    for(const attr of ['placeholder','aria-label','title']){
      if(!el.hasAttribute(attr))continue;
      const raw=el.getAttribute(attr)||'';
      let source=maps.sources[attr];
      const last=maps.rendered[attr];
      if(!source||raw!==last){
        const map=reverseAttr[attr];
        const normalized=map?.get(raw)||reverseText.get(raw)||raw;
        const translated=attrFor(attr,normalized,current);
        const known=translated!==normalized||Object.prototype.hasOwnProperty.call(ATTRIBUTE_CATALOG[attr]||{},normalized)||Object.prototype.hasOwnProperty.call(CATALOG,normalized);
        if(!known){
          delete maps.sources[attr];delete maps.rendered[attr];
          continue;
        }
        source=normalized;
        maps.sources[attr]=source;
      }
      const translated=attrFor(attr,source,current);
      maps.rendered[attr]=translated;
      if(translated!==raw)el.setAttribute(attr,translated);
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
    if(root.document?.documentElement){root.document.documentElement.lang=next;root.document.documentElement.dataset.language=next;}
    syncSelectors();
    translateTree(root.document?.body);
    if(root.document){
      if(!titleSource)titleSource=reverseText.get(root.document.title)||root.document.title||'Instal·lacions BT · Asesor Energético Alpha';
      root.document.title=translateString(titleSource,next);
    }
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
        if(record.type==='childList')record.addedNodes?.forEach(translateTree);
        else if(record.type==='characterData')translateTextNode(record.target);
        else if(record.type==='attributes')translateAttributes(record.target);
      }
      bindSelectors();
    });
    observer.observe(root.document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
  }
  function init(){
    current=safeStored()||'es';
    titleSource=root.document?.title||'Instal·lacions BT · Asesor Energético Alpha';
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
