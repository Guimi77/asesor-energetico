(()=>{
  'use strict';

  const $=s=>document.querySelector(s);
  let currentRole='';

  function ensureClientNotice(){
    const view=$('#facturasView');
    if(!view)return;
    let note=$('#clientInvoiceUploadNotice');
    if(note)return;
    note=document.createElement('section');
    note.id='clientInvoiceUploadNotice';
    note.className='card';
    note.style.cssText='margin-bottom:16px;border-left:4px solid #1834b8;padding:16px 18px';
    note.innerHTML=`
      <p class="eyebrow">Mi histórico energético</p>
      <h2 style="margin:2px 0 7px">Añadir facturas</h2>
      <p style="margin:0 0 7px">Puedes cargar tus facturas PDF. Se procesan localmente en este navegador y el PDF no se almacena.</p>
      <p style="margin:0"><strong>Solo se guardarán datos estructurados validados de CUPS que Instal·lacions BT haya vinculado previamente a tu cuenta.</strong> Si subes una factura de otro CUPS, no se incorporará al histórico y tendrás que contactar con nosotros para que lo revisemos.</p>`;
    view.prepend(note);
  }

  function adaptUploadCopy(){
    const copy=$('#dropZone p');
    if(!copy)return;
    if(currentRole==='client'){
      copy.textContent='Carga una o varias facturas PDF de tus suministros. Se analizarán en este navegador y, si el CUPS está vinculado a tu cuenta y la lectura es válida, sus datos se añadirán al histórico compartido con Instal·lacions BT.';
    }
  }

  function adaptButtons(){
    const client=currentRole==='client';
    const audit=$('#auditParser');
    if(audit)audit.classList.toggle('hidden',client);

    // El informe interno es una herramienta de trabajo de la empresa. Si existe
    // un exportador específico para cliente, dejamos ese y ocultamos el interno.
    const internal=$('#exportExcel');
    const clientExport=$('#exportClientExcel');
    if(internal&&clientExport)internal.classList.toggle('hidden',client);
  }

  function apply(profile){
    currentRole=profile?.role||'';
    const link=document.querySelector('.sidebar [data-view="facturas"]');
    if(currentRole==='client'){
      // auth.js oculta por defecto las vistas internas. Facturas se reabre aquí
      // expresamente; Clientes, CUPS y Usuarios continúan restringidos.
      link?.classList.remove('hidden');
      if(link)link.textContent='▣ Mis facturas';
      ensureClientNotice();
      adaptUploadCopy();
    }else{
      if(link)link.textContent='▣ Facturas';
      $('#clientInvoiceUploadNotice')?.remove();
    }
    adaptButtons();
  }

  window.addEventListener('ibt-role-changed',event=>apply(event.detail?.profile));

  const observer=new MutationObserver(()=>{
    if(currentRole==='client'){
      adaptButtons();
      adaptUploadCopy();
    }
  });

  function init(){
    observer.observe(document.body,{childList:true,subtree:true});
    if(window.ibtCurrentProfile)apply(window.ibtCurrentProfile);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();