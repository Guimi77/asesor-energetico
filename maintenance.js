const DEFAULT_MAINTENANCE_MESSAGE='Estamos realizando tareas de mantenimiento y mejoras. El servicio volverá a estar disponible lo antes posible.';

function maintenancePanel(){
  return document.getElementById('maintenancePanel');
}
function maintenanceMessage(){
  return document.getElementById('maintenanceMessage');
}
function showMaintenance(settings={}){
  const panel=maintenancePanel();
  if(!panel)return;
  panel.classList.remove('hidden');
  ['loginPanel','signupPanel','signupSentPanel','recoveryPanel'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  const copy=maintenanceMessage();
  if(copy)copy.textContent=settings.maintenance_message||DEFAULT_MAINTENANCE_MESSAGE;
}
function hideMaintenance(){
  maintenancePanel()?.classList.add('hidden');
}
async function loadMaintenanceSettings(){
  const {data,error}=await window.ibtSupabase.from('app_settings').select('maintenance_mode,maintenance_message').eq('id','global').maybeSingle();
  if(error){console.warn('No se pudo consultar el modo mantenimiento',error);return {maintenance_mode:false,maintenance_message:DEFAULT_MAINTENANCE_MESSAGE};}
  return data||{maintenance_mode:false,maintenance_message:DEFAULT_MAINTENANCE_MESSAGE};
}
async function applyMaintenanceGate(session,profile){
  const settings=await loadMaintenanceSettings();
  const bypass=profile?.role==='admin'&&profile?.active!==false;
  document.body.classList.toggle('maintenance-active',!!settings.maintenance_mode&&!bypass);
  if(settings.maintenance_mode&&!bypass)showMaintenance(settings);
  else hideMaintenance();
  return settings;
}
async function renderMaintenanceAdmin(){
  const host=document.getElementById('maintenanceAdmin');
  if(!host||window.ibtCurrentProfile?.role!=='admin')return;
  const settings=await loadMaintenanceSettings();
  host.classList.remove('hidden');
  const toggle=document.getElementById('maintenanceToggle');
  const message=document.getElementById('maintenanceAdminMessage');
  const state=document.getElementById('maintenanceState');
  if(toggle)toggle.checked=!!settings.maintenance_mode;
  if(message)message.value=settings.maintenance_message||DEFAULT_MAINTENANCE_MESSAGE;
  if(state){state.textContent=settings.maintenance_mode?'ACTIVO':'DESACTIVADO';state.className='status '+(settings.maintenance_mode?'review':'ok');}
}
async function saveMaintenanceSettings(){
  if(window.ibtCurrentProfile?.role!=='admin')return;
  const toggle=document.getElementById('maintenanceToggle');
  const message=document.getElementById('maintenanceAdminMessage');
  const button=document.getElementById('saveMaintenance');
  const feedback=document.getElementById('maintenanceAdminFeedback');
  if(button)button.disabled=true;
  const {data:{user}}=await window.ibtSupabase.auth.getUser();
  const payload={maintenance_mode:!!toggle?.checked,maintenance_message:(message?.value||DEFAULT_MAINTENANCE_MESSAGE).trim(),updated_at:new Date().toISOString(),updated_by:user?.id||null};
  const {error}=await window.ibtSupabase.from('app_settings').update(payload).eq('id','global');
  if(feedback){feedback.textContent=error?'No se pudo guardar: '+error.message:'Configuración guardada.';feedback.dataset.type=error?'error':'ok';}
  if(button)button.disabled=false;
  if(!error)await renderMaintenanceAdmin();
}
window.IBTMaintenance={load:loadMaintenanceSettings,apply:applyMaintenanceGate,renderAdmin:renderMaintenanceAdmin};
