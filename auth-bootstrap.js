'use strict';

window.addEventListener('DOMContentLoaded',()=>{
  const signupCopy=document.querySelector('#signupPanel .auth-copy');
  if(signupCopy)signupCopy.textContent='Crea tu cuenta. El rol se asigna de forma segura desde Supabase según las reglas de acceso internas.';

  const uploadCopy=document.querySelector('#dropZone p');
  if(uploadCopy)uploadCopy.textContent='Puedes cargar PDF sueltos, seleccionar una carpeta completa o arrastrar directamente la carpeta al recuadro. Se leerán todos los PDF que contenga, también los de sus subcarpetas. Los documentos se procesan únicamente en este navegador y no se almacenan.';

  const privacy=document.querySelector('.privacy');
  if(privacy)privacy.textContent='● Procesado local · los PDF no salen de tu equipo ni se almacenan';

  const historic=document.querySelector('#historicoView .placeholder-view');
  if(historic){
    const p=historic.querySelector('p');
    const status=historic.querySelector('.status');
    if(p)p.textContent='Aquí se conservan únicamente datos estructurados por CUPS y periodo: consumos, precios, potencias, tarifas, maxímetros, excesos, reactiva, recargos, impuestos, cambios y actuaciones. Los PDF no se almacenan.';
    if(status)status.textContent='Piloto GRUPO XTRA · histórico estructurado';
  }

  if(!document.querySelector('#historyUiTidy')){
    const style=document.createElement('style');
    style.id='historyUiTidy';
    style.textContent=`
      .history-badge{display:none!important}
      #historicoView,#historyApp,#historyContent{min-width:0;max-width:100%}
      #historicoView{overflow-x:hidden}
      #historicoView .history-table-wrap:has(> .history-table){
        max-height:min(68vh,720px);
        overflow:auto;
        overscroll-behavior:contain;
        scrollbar-gutter:stable;
      }
      #historicoView .history-table thead th{
        position:sticky!important;
        top:0;
        z-index:8;
        background:#10233f;
        box-shadow:0 1px 0 rgba(255,255,255,.18),0 2px 5px rgba(6,27,56,.16);
      }
      @media(min-width:1101px){
        #historicoView .history-rec>summary{
          grid-template-columns:minmax(0,980px) minmax(124px,170px) minmax(0,1fr);
          justify-content:start;
        }
        #historicoView .history-rec-status{
          justify-self:start;
          width:100%;
          max-width:170px;
        }
      }
      @media(max-width:1100px){
        #historicoView .history-table-wrap:has(> .history-table){max-height:64vh}
      }
    `;
    document.head.appendChild(style);
  }

  if(!document.querySelector('script[data-bulk-performance]')){
    const script=document.createElement('script');
    script.src='bulk-performance.js?v=20260908-2';
    script.dataset.bulkPerformance='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-folder-upload]')){
    const script=document.createElement('script');
    script.src='folder-upload.js?v=20260909-2';
    script.dataset.folderUpload='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-xtra-pilot]')){
    const script=document.createElement('script');
    script.src='supabase-xtra-pilot.js?v=20260908-1';
    script.dataset.xtraPilot='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-supply-lifecycle]')){
    const script=document.createElement('script');
    script.src='supply-lifecycle.js?v=20260909-2';
    script.dataset.supplyLifecycle='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-lifecycle-analysis-guard]')){
    const script=document.createElement('script');
    script.src='lifecycle-analysis-guard.js?v=20260909-1';
    script.dataset.lifecycleAnalysisGuard='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-consumption-anomalies],script[src*="consumption-anomalies.js"]')){
    const script=document.createElement('script');
    script.src='consumption-anomalies.js?v=20260915-trace1';
    script.dataset.consumptionAnomalies='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-history-row-compat]')){
    const script=document.createElement('script');
    script.src='history-row-compat.js?v=20260915-1';
    script.dataset.historyRowCompat='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-xtra-history]')){
    const script=document.createElement('script');
    script.type='module';
    script.src='xtra-history.js?v=20260915-endesa1';
    script.dataset.xtraHistory='1';
    document.body.appendChild(script);
  }

  // xtra-completeness.js queda temporalmente fuera del cargador.
  // Su versión 2026.09.09.1 puede competir con xtra-history v2 y degradar
  // el detalle semántico de derechos de distribuidora. xtra-history v2 sigue
  // auditando y guardando el histórico validado mientras se finaliza el sidecar v2.

  const loadAlertsUi=()=>{
    if(document.querySelector('script[data-alerts-ui]'))return;
    const script=document.createElement('script');
    script.src='alerts-ui.js?v=20260914-1';
    script.dataset.alertsUi='1';
    script.onload=()=>{
      if(window.ibtCurrentProfile){
        window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));
      }
    };
    document.body.appendChild(script);
  };

  const loadAnalysisUi=()=>{
    if(document.querySelector('script[data-analysis-ui]')){loadAlertsUi();return;}
    const script=document.createElement('script');
    script.src='analysis-ui.js?v=20260914-1';
    script.dataset.analysisUi='1';
    script.onload=()=>{
      loadAlertsUi();
      if(window.ibtCurrentProfile){
        window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));
      }
    };
    script.onerror=loadAlertsUi;
    document.body.appendChild(script);
  };

  const loadHistoryUi=()=>{
    if(document.querySelector('script[data-history-ui]')){loadAnalysisUi();return;}
    const script=document.createElement('script');
    script.src='history-ui.js?v=20260914-quickview1';
    script.dataset.historyUi='1';
    script.onload=()=>{
      loadAnalysisUi();
      if(window.ibtCurrentProfile){
        window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));
      }
    };
    script.onerror=loadAnalysisUi;
    document.body.appendChild(script);
  };

  // La capa de lenguaje sencillo cambia solo la presentación. La lógica técnica
  // de detección permanece intacta y queda accesible bajo "Ver datos y cálculo".
  if(window.IBTHistoryRecommendations?.__humanLanguage){
    loadHistoryUi();
  }else{
    const existing=document.querySelector('script[data-human-language]');
    if(existing){
      existing.addEventListener('load',loadHistoryUi,{once:true});
      existing.addEventListener('error',loadHistoryUi,{once:true});
    }else{
      const script=document.createElement('script');
      script.src='human-language.js?v=20260915-trace1';
      script.dataset.humanLanguage='1';
      script.onload=loadHistoryUi;
      script.onerror=()=>{console.warn('No se pudo cargar la capa de lenguaje sencillo');loadHistoryUi();};
      document.body.appendChild(script);
    }
  }

  // El histórico se inicializa antes de que puedan entrar nuevos clientes. Cuando
  // termina una importación multicliente, volvemos a lanzar la inicialización con
  // el perfil activo para recargar clientes, titulares, CUPS y registros.
  window.addEventListener('xtra-history-updated',()=>{
    if(window.ibtCurrentProfile){
      window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));
    }
  });

  // El histórico permanece montado en el DOM al cambiar de pestaña.
  // No se recarga al volver a abrirlo: así evitamos el destello de "Cargando…".
});