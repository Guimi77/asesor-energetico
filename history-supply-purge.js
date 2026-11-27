(() => {
  'use strict';

  // Never perform deletion in the browser directly. The database validates role,
  // selected entity, preview signature and exact CUPS at transaction time.
  const $ = (selector, root=document) => root.querySelector(selector);
  const state = { busy:false };
  const safe = value => String(value ?? '');

  function currentTarget() {
    if (state.busy || window.ibtCurrentProfile?.role !== 'admin') return null;
    return window.IBTHistoryUI?.getPurgeTarget?.() || null;
  }

  function renderControl() {
    const actions = $('#historicoView .history-actions');
    if (!actions) return;
    let button = $('#historyPurgeSupply', actions);
    if (!button) {
      button = document.createElement('button');
      button.id = 'historyPurgeSupply';
      button.type = 'button';
      button.className = 'secondary';
      button.style.cssText = 'color:#a42c25;border-color:#d8aaa5;margin-left:8px';
      button.textContent = 'Eliminar suministro definitivamente';
      button.addEventListener('click', () => void purge());
      actions.appendChild(button);
      const status = document.createElement('span');
      status.id = 'historyPurgeStatus';
      status.className = 'history-scope';
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      actions.appendChild(status);
    }
    const admin = window.ibtCurrentProfile?.role === 'admin';
    button.hidden = !admin;
    const target = currentTarget();
    button.disabled = !target;
    button.title = target
      ? 'Vista previa de eliminación definitiva del CUPS '+target.cups
      : 'Selecciona exactamente un suministro en el filtro CUPS';
  }

  function status(message) {
    const el = $('#historyPurgeStatus');
    if (el) el.textContent = safe(message);
  }

  async function purge() {
    const target = currentTarget();
    const db = window.ibtSupabase;
    if (!target || !db || state.busy) return;
    state.busy = true;
    renderControl();
    try {
      status('Comprobando las relaciones del suministro...');
      const {data:preview,error:previewError} = await db.rpc('admin_purge_supply_v1',{
        p_supply_id:target.id,p_execute:false
      });
      if (previewError) throw previewError;
      if (!preview?.ok || preview.mode !== 'preview' ||
          preview.supply_id !== target.id || preview.cups !== target.cups) {
        throw new Error(preview?.reason || 'Vista previa no verificable');
      }
      const lines = [
        'ELIMINACIÓN IRREVERSIBLE. Se borrarán:',
        '',
        'CUPS: '+preview.cups,
        'Titular: '+preview.holder,
        'Facturas: '+preview.invoice_count,
        'Detalles de factura: '+preview.detail_count,
        'Incidencias: '+preview.incident_count,
        'Recomendaciones: '+preview.recommendation_count,
        'Eventos: '+preview.event_count,
        'Revisiones de cambios: '+preview.history_review_count,
        '',
        preview.holder_will_be_deleted
          ? 'El titular también será eliminado porque no tiene otros suministros.'
          : 'El titular se conservará porque tiene '+preview.other_holder_supplies+' suministros adicionales.',
        'No se eliminarán el cliente ni otros suministros.',
        '',
        'Comprueba que tienes una copia de los datos y que no existen obligaciones de conservación.',
        '¿Deseas continuar?'
      ];
      if (!window.confirm(lines.join('\n'))) {
        status('Cancelado sin eliminar datos.');
        return;
      }
      const typed = window.prompt('Escribe exactamente el CUPS para autorizar el borrado definitivo:', '');
      if (typed !== preview.cups) {
        status('CUPS no confirmado. No se ha eliminado nada.');
        return;
      }
      if (!window.confirm('CONFIRMACIÓN FINAL: eliminar '+preview.invoice_count+
        ' facturas y el suministro '+preview.cups+' definitivamente. ¿Confirmar?')) {
        status('Cancelado sin eliminar datos.');
        return;
      }
      if (window.ibtCurrentProfile?.role !== 'admin' ||
          window.IBTHistoryUI?.getPurgeTarget?.()?.id !== target.id) {
        throw new Error('La selección o el acceso han cambiado. Vuelve a empezar.');
      }
      status('Ejecutando la operación confirmada...');
      const {data:result,error} = await db.rpc('admin_purge_supply_v1',{
        p_supply_id:preview.supply_id,p_execute:true,
        p_confirm_cups:typed,p_expected_signature:preview.signature
      });
      if (error) throw error;
      if (!result?.ok || result.mode !== 'deleted') {
        throw new Error(result?.reason === 'confirmation_or_preview_stale'
          ? 'Los datos cambiaron desde la vista previa. Repite la operación.'
          : (result?.reason || 'No se confirmó la eliminación.'));
      }
      status('Eliminado: '+result.invoice_count+' facturas. Titular '+
        (result.holder_deleted ? 'eliminado.' : 'conservado.'));
      window.dispatchEvent(new CustomEvent('ibt-central-data-changed',{
        detail:{action:'admin_supply_deleted'}
      }));
      await window.IBTHistoryUI?.refreshScope?.();
    } catch (error) {
      console.error('Borrado definitivo del suministro',error);
      status('El borrado no se ha confirmado: '+(error?.message || error));
    } finally {
      state.busy = false;
      renderControl();
    }
  }

  function install() {
    const view = $('#historicoView');
    if (!view || view.dataset.purgeControlInstalled === '1') return;
    view.dataset.purgeControlInstalled = '1';
    const observer = new MutationObserver(() => renderControl());
    observer.observe(view,{subtree:true,childList:true,attributes:true,attributeFilter:['placeholder']});
    renderControl();
  }

  window.addEventListener('ibt-role-changed',() => { install(); renderControl(); });
  window.addEventListener('DOMContentLoaded',install);
  install();
})();
