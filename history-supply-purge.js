(() => {
  'use strict';
  // One deletion gateway. Buttons live only in the Clients portfolio.
  // Database RPCs enforce privileges and revalidate a signed preview.
  let busy = false;
  function admin() { return window.ibtCurrentProfile?.role === 'admin'; }
  function report(message) {
    // Avoid success claims until the database commits and confirms result.
    if (message) window.alert(message);
  }
  async function run({rpc,id,confirmation,name,isClient}) {
    if (busy || !admin() || !window.ibtSupabase || !id || !name) return false;
    busy = true;
    try {
      const db=window.ibtSupabase;
      const base = isClient ? {p_client_id:id} : {p_supply_id:id};
      const {data:preview,error:preError}=await db.rpc(rpc,{...base,p_execute:false});
      if(preError) throw preError;
      if(!preview?.ok || preview.mode!=='preview' ||
        (isClient ? preview.client_id!==id || preview.client!==name : preview.supply_id!==id || preview.cups!==name))
        throw new Error(preview?.reason||'La vista previa no coincide con el registro seleccionado.');

      const header=isClient
        ? ['ELIMINAR CLIENTE DEFINITIVAMENTE: '+preview.client,
           'Titulares: '+preview.holder_count,'Suministros: '+preview.supply_count,
           'Facturas: '+preview.invoice_count,'Detalles: '+preview.detail_count,
           'Vínculos de acceso que se quitarán: '+preview.client_user_links]
        : ['ELIMINAR SUMINISTRO DEFINITIVAMENTE: '+preview.cups,
           'Titular: '+preview.holder,'Cliente: '+preview.client,
           'Facturas: '+preview.invoice_count,'Detalles: '+preview.detail_count,
           'Incidencias: '+preview.incident_count,'Recomendaciones: '+preview.recommendation_count,
           'Eventos: '+preview.event_count,
           preview.holder_will_be_deleted ? 'Su titular también se eliminará.' : 'Su titular se conservará.',
           preview.client_will_be_deleted ? 'La ficha del cliente también se eliminará.' : 'La ficha del cliente se conservará.'];
      const finalWarning = [
        ...header,'',
        'Esta eliminación no se puede deshacer desde la aplicación.',
        'Comprueba antes las obligaciones de conservación y la disponibilidad de copia de seguridad.',
        'No se borrarán las cuentas de acceso de los usuarios.',
        '',
        '¿Continuar?'
      ].join('\n');
      if(!window.confirm(finalWarning)) return false;
      const typed=window.prompt('Escribe exactamente '+(isClient?'el nombre del cliente':'el CUPS')+' para confirmar el borrado:', '');
      if(typed!==confirmation) { report('Confirmación incorrecta. No se ha borrado nada.'); return false; }
      if(!window.confirm('ÚLTIMA CONFIRMACIÓN: ¿Eliminar definitivamente '+
        (isClient?'el cliente '+preview.client+' y sus '+preview.supply_count+' suministros':'el suministro '+preview.cups)+
        ' y todos sus datos asociados?')) return false;
      if(!admin()) throw new Error('El acceso de administrador ha cambiado.');
      // Confirm the target remains identical before the destructive RPC.
      const args=isClient
        ? {...base,p_execute:true,p_confirm_name:typed,p_expected_signature:preview.signature}
        : {...base,p_execute:true,p_confirm_cups:typed,p_expected_signature:preview.signature};
      const {data:result,error}=await db.rpc(rpc,args);
      if(error) throw error;
      if(!result?.ok || result.mode!=='deleted') throw new Error(
        result?.reason==='confirmation_or_preview_stale'
          ? 'Los datos cambiaron desde la vista previa. Repite la operación.'
          : result?.reason||'La base de datos no confirmó la eliminación.'
      );
      // Local cache is not authoritative and must not reintroduce deleted CUPS.
      const cups=isClient
        ? (preview.supplies||[]).map(x=>x.cups)
        : [preview.cups];
      window.EnergyMaster?.removeLocal?.(cups);
      window.dispatchEvent(new CustomEvent('ibt-central-data-changed',{
        detail:{action:isClient?'admin_client_deleted':'admin_supply_deleted'}
      }));
      window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile:window.ibtCurrentProfile}}));
      report('Eliminación confirmada. '+result.invoice_count+' facturas y '+
        (isClient?result.supply_count:'1')+' suministro(s) eliminados.'+
        (!isClient?' Cliente '+(result.client_deleted?'eliminado.':'conservado.'):' Cliente eliminado.'));
      return true;
    } catch(error) {
      console.error('Borrado definitivo',error);
      report('No se ha confirmado ningún borrado: '+(error?.message||error));
      return false;
    } finally { busy=false; }
  }
  window.IBTAdminPurge = Object.freeze({
    purgeSupply:({id,cups}) => run({
      rpc:'admin_purge_supply_and_client_v2',id,name:cups,confirmation:cups,isClient:false
    }),
    purgeClient:({id,name}) => run({
      rpc:'admin_purge_client_v1',id,name,confirmation:name,isClient:true
    })
  });
})();
