window.addEventListener('DOMContentLoaded',()=>{
  const signupCopy=document.querySelector('#signupPanel .auth-copy');
  if(signupCopy)signupCopy.textContent='Crea tu cuenta. El rol se asigna de forma segura desde Supabase según las reglas de acceso internas.';

  const uploadCopy=document.querySelector('#dropZone p');
  if(uploadCopy)uploadCopy.textContent='Arrastra aquí los PDF o selecciónalos. Los documentos se procesan únicamente en este navegador y no se almacenan.';

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
    style.textContent='.history-badge{display:none!important}';
    document.head.appendChild(style);
  }

  if(!document.querySelector('script[data-bulk-performance]')){
    const script=document.createElement('script');
    script.src='bulk-performance.js?v=20260908-2';
    script.dataset.bulkPerformance='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-xtra-pilot]')){
    const script=document.createElement('script');
    script.src='supabase-xtra-pilot.js?v=20260908-1';
    script.dataset.xtraPilot='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-xtra-history]')){
    const script=document.createElement('script');
    script.type='module';
    script.src='xtra-history.js?v=20260909-2';
    script.dataset.xtraHistory='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-xtra-completeness]')){
    const script=document.createElement('script');
    script.type='module';
    script.src='xtra-completeness.js?v=20260909-1';
    script.dataset.xtraCompleteness='1';
    document.body.appendChild(script);
  }

  if(!document.querySelector('script[data-history-ui]')){
    const script=document.createElement('script');
    script.src='history-ui.js?v=20260908-coverage1';
    script.dataset.historyUi='1';
    script.onload=()=>{
      if(window.ibtCurrentProfile){
        window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));
      }
    };
    document.body.appendChild(script);
  }

  // El histórico permanece montado en el DOM al cambiar de pestaña.
  // No se recarga al volver a abrirlo: así evitamos el destello de "Cargando…".
});