import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://rxvowuswudutuaajkcky.supabase.co';
const SUPABASE_KEY='sb_publishable_hn8DvxyLNaYxIm-4xmtuOw_9Bn0BEjl';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
window.ibtSupabase=supabase;
const APP_ROOT=new URL('./',window.location.href);
const SIGNUP_CONFIRM_URL=new URL('registro-completado.html',APP_ROOT).href;

if(!document.querySelector('script[data-admin-data-management]')){
  const script=document.createElement('script');
  script.src='admin-data-management.js?v=20260915-lifecycle1';
  script.dataset.adminDataManagement='1';
  document.head.appendChild(script);
}
if(!document.querySelector('script[data-client-archive-integrated]')){
  const script=document.createElement('script');
  script.src='client-archive-integrated.js?v=20260917-1';
  script.dataset.clientArchiveIntegrated='1';
  document.head.appendChild(script);
}

const $=s=>document.querySelector(s);
let currentProfile=null;
let lastAccessKey='';

function showAuthPanel(id){
  ['loginPanel','signupPanel','signupSentPanel','recoveryPanel'].forEach(panelId=>{
    document.getElementById(panelId)?.classList.toggle('hidden',panelId!==id);
  });
  setAuthMessage('');
}

async function notifyRegistration(userId){
  if(!userId)return false;
  try{
    const {data,error}=await supabase.functions.invoke('notify-new-registration',{body:{user_id:userId}});
    if(error){console.warn('No se pudo enviar el aviso de registro',error);return false;}
    return data?.ok===true;
  }catch(error){
    console.warn('No se pudo enviar el aviso de registro',error);
    return false;
  }
}

function setAuthMessage(text,type='info'){
  const el=$('#authMessage');
  if(!el)return;
  el.textContent=text||'';
  el.dataset.type=type;
}

async function loadProfile(user){
  if(!user){currentProfile=null;window.ibtCurrentProfile=null;return null;}
  const {data,error}=await supabase.from('profiles').select('id,role,display_name,active').eq('id',user.id).maybeSingle();
  if(error) throw error;
  currentProfile=data||null;
  window.ibtCurrentProfile=currentProfile;
  return currentProfile;
}

function hideInternalLocalViewsForClient(){
  const restrictedViews=['facturasView','clientesView','cupsView','usersView'];
  const restrictedLinks=['facturas','clientes','cups','users'];
  restrictedViews.forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  document.querySelectorAll('.sidebar [data-view]').forEach(link=>{
    if(restrictedLinks.includes(link.dataset.view))link.classList.add('hidden');
  });
  $('#historicoView')?.classList.remove('hidden');
  document.querySelectorAll('.sidebar [data-view]').forEach(link=>link.classList.toggle('active',link.dataset.view==='historico'));
  if($('#pageTitle'))$('#pageTitle').textContent='Portal de cliente';
  if($('#pageSubtitle'))$('#pageSubtitle').textContent='Consulta únicamente la información energética asignada a tu cuenta.';
  if($('#pageEyebrow'))$('#pageEyebrow').textContent='Acceso cliente';
}

function restoreInternalLinksForStaff(){
  ['facturas','clientes','cups'].forEach(view=>document.querySelector(`.sidebar [data-view="${view}"]`)?.classList.remove('hidden'));
}

function enforceRoleAccess(profile){
  const role=profile?.role||null;
  const accessKey=profile?`${profile.id}|${role}|${profile.active===false?'0':'1'}`:'signed-out';
  document.body.dataset.role=role||'';
  if(accessKey===lastAccessKey)return;
  lastAccessKey=accessKey;
  if(role==='client')hideInternalLocalViewsForClient();
  else restoreInternalLinksForStaff();
  window.dispatchEvent(new CustomEvent('ibt-role-changed',{detail:{profile}}));
}

function applySession(session,profile){
  const signed=!!session?.user;
  document.body.classList.toggle('auth-signed-in',signed);
  document.body.classList.toggle('auth-signed-out',!signed);
  document.body.classList.remove('auth-pending');
  const chip=$('#sessionChip');
  const logout=$('#logoutBtn');
  if(chip)chip.textContent=signed?`${profile?.display_name||session.user.email||'Usuario'} · ${profile?.role||'sin perfil'}`:'Sin sesión';
  if(logout)logout.classList.toggle('hidden',!signed);
  const usersLink=$('#usersNav');
  if(usersLink)usersLink.classList.toggle('hidden',profile?.role!=='admin');
  enforceRoleAccess(profile);
  if(profile?.active===false){
    setAuthMessage(profile?.role==='client'?'Tu solicitud está pendiente de activación. Instal·lacions BT te avisará cuando puedas entrar.':'Tu cuenta está desactivada. Contacta con el administrador.','error');
    supabase.auth.signOut();
  }
}

async function refreshAuth(){
  const {data:{session}}=await supabase.auth.getSession();
  let profile=null;
  if(session?.user){
    try{profile=await loadProfile(session.user);}catch(err){console.error(err);}
  }
  applySession(session,profile);
  if(profile?.role==='admin')await renderUsers();
}

function clientAccessHtml(profile,clients,assigned){
  if(profile.role!=='client')return '<span class="status ok">Acceso interno · todos</span>';
  const current=[...(assigned.get(profile.id)||new Set())];
  const names=new Map(clients.map(c=>[c.id,c.name]));
  const chips=current.length
    ? current.map(id=>`<span class="status ok" style="display:inline-flex;align-items:center;gap:5px;margin:2px 4px 2px 0">${escapeHtml(names.get(id)||'Cliente')}<button type="button" class="user-client-remove" data-user="${profile.id}" data-client="${id}" title="Quitar acceso" style="border:0;background:transparent;color:inherit;font-weight:900;cursor:pointer;padding:0">×</button></span>`).join('')
    : '<span class="status review">Sin cliente asignado</span>';
  const available=clients.filter(c=>!current.includes(c.id));
  const selector=available.length
    ? `<select class="user-client-assign" data-user="${profile.id}" data-pending="${profile.active===false?'true':'false'}" style="display:block;margin-top:6px;max-width:320px"><option value="">+ Asignar cliente…</option>${available.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>`
    : '';
  return `<div>${chips}${selector}</div>`;
}

async function renderUsers(){
  const body=$('#usersBody');
  if(!body||currentProfile?.role!=='admin')return;
  body.innerHTML='<tr><td colspan="4">Cargando usuarios…</td></tr>';
  const [{data:profiles,error:pErr},{data:links,error:lErr},{data:clients,error:cErr}]=await Promise.all([
    supabase.from('profiles').select('id,email,display_name,role,active,created_at').order('created_at',{ascending:true}),
    supabase.from('client_users').select('user_id,client_id'),
    supabase.from('clients').select('id,name,status').eq('status','active').order('name',{ascending:true})
  ]);
  if(pErr||lErr||cErr){body.innerHTML='<tr><td colspan="4">No se pudieron cargar usuarios y permisos.</td></tr>';return;}
  const assigned=new Map();
  for(const x of links||[]){
    if(!assigned.has(x.user_id))assigned.set(x.user_id,new Set());
    assigned.get(x.user_id).add(x.client_id);
  }
  body.innerHTML='';
  for(const p of profiles||[]){
    const tr=document.createElement('tr');
    const own=p.id===currentProfile.id;
    const pending=p.role==='client'&&p.active===false;
    tr.innerHTML=`<td><strong>${escapeHtml(p.display_name||'Usuario')}</strong>${own?' <span class="status ok">Tú</span>':''}<small style="display:block;color:#65758a;margin-top:3px">${escapeHtml(p.email||'Sin correo')}</small></td><td><select class="role-select" data-id="${p.id}" ${own?'disabled':''}><option value="admin" ${p.role==='admin'?'selected':''}>Administrador</option><option value="staff" ${p.role==='staff'?'selected':''}>Personal interno</option><option value="client" ${p.role==='client'?'selected':''}>Cliente</option></select></td><td>${clientAccessHtml(p,clients||[],assigned)}</td><td><button class="secondary user-active" data-id="${p.id}" data-active="${p.active}" ${own||pending?'disabled':''}>${pending?'Pendiente':(p.active?'Activo':'Desactivado')}</button>${pending?'<span class="status pending" style="display:inline-flex;margin-left:6px">Asignar cliente para aprobar</span>':''}<button class="secondary user-reset-password" type="button" data-email="${escapeHtml(p.email||'')}" ${!p.email?'disabled':''}>Restablecer acceso</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll('.role-select').forEach(el=>el.addEventListener('change',async e=>{
    const {error}=await supabase.from('profiles').update({role:e.target.value}).eq('id',e.target.dataset.id);
    if(error)alert('No se pudo cambiar el rol: '+error.message);
    await renderUsers();
  }));
  body.querySelectorAll('.user-client-assign').forEach(el=>el.addEventListener('change',async e=>{
    const clientId=e.target.value,userId=e.target.dataset.user;
    if(!clientId||!userId)return;
    e.target.disabled=true;
    const {data,error}=await supabase.functions.invoke('admin-data-lifecycle',{body:{action:'approve_user',id:userId,client_id:clientId}});
    if(error||data?.error){
      alert('No se pudo asignar y aprobar el usuario: '+(data?.error||error?.message||'error desconocido'));
    }
    await renderUsers();
  }));
  body.querySelectorAll('.user-client-remove').forEach(el=>el.addEventListener('click',async e=>{
    const userId=e.currentTarget.dataset.user,clientId=e.currentTarget.dataset.client;
    if(!userId||!clientId)return;
    e.currentTarget.disabled=true;
    const {error}=await supabase.from('client_users').delete().eq('user_id',userId).eq('client_id',clientId);
    if(error)alert('No se pudo quitar el acceso: '+error.message);
    await renderUsers();
  }));
  body.querySelectorAll('.user-reset-password').forEach(el=>el.addEventListener('click',async e=>{
    const btn=e.currentTarget,email=btn.dataset.email;
    if(!email)return;
    btn.disabled=true;
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:APP_ROOT.href});
    if(error)alert('No se pudo enviar el restablecimiento: '+error.message);
    else alert('Se ha enviado un enlace de restablecimiento a '+email+'.');
    btn.disabled=false;
  }));
  body.querySelectorAll('.user-active').forEach(el=>el.addEventListener('click',async e=>{
    const active=e.currentTarget.dataset.active==='true';
    const {error}=await supabase.from('profiles').update({active:!active}).eq('id',e.currentTarget.dataset.id);
    if(error)alert('No se pudo actualizar el usuario: '+error.message);
    await renderUsers();
  }));
}

function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

window.addEventListener('DOMContentLoaded',()=>{
  const loginForm=$('#loginForm');
  const signupForm=$('#signupForm');
  const recoveryForm=$('#recoveryForm');

  $('#showSignup')?.addEventListener('click',()=>showAuthPanel('signupPanel'));
  $('#showLogin')?.addEventListener('click',()=>showAuthPanel('loginPanel'));
  $('#signupSentBack')?.addEventListener('click',()=>showAuthPanel('loginPanel'));

  $('#forgotPassword')?.addEventListener('click',async()=>{
    const email=$('#loginEmail')?.value.trim();
    if(!email){
      setAuthMessage('Introduce tu correo y vuelve a pulsar «He olvidado mi contraseña».','error');
      return;
    }
    setAuthMessage('Enviando enlace de restablecimiento…');
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:APP_ROOT.href});
    if(error){setAuthMessage(error.message,'error');return;}
    setAuthMessage('Te hemos enviado un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.','ok');
  });

  loginForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    setAuthMessage('Entrando…');
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){
      const msg=String(error.message||'');
      if(msg.toLowerCase().includes('email not confirmed')){
        setAuthMessage('Tu solicitud todavía está pendiente de aprobación por Instal·lacions BT.','error');
      }else{
        setAuthMessage(msg,'error');
      }
      return;
    }
    setAuthMessage('');
    await refreshAuth();
  });

  signupForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    setAuthMessage('Enviando solicitud…');
    const email=$('#signupEmail').value.trim(),password=$('#signupPassword').value,display_name=$('#signupName').value.trim();
    const submit=signupForm.querySelector('button[type="submit"]');
    if(submit)submit.disabled=true;
    try{
      const {data,error}=await supabase.auth.signUp({
        email,
        password,
        options:{data:{display_name,registration_source:'public_request'}}
      });
      if(error){setAuthMessage(error.message,'error');return;}
      await notifyRegistration(data?.user?.id);
      if(data?.session)await supabase.auth.signOut({scope:'local'}).catch(()=>{});
      showAuthPanel('signupSentPanel');
    }finally{
      if(submit)submit.disabled=false;
    }
  });

  recoveryForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const password=$('#recoveryPassword')?.value||'';
    const repeat=$('#recoveryPassword2')?.value||'';
    if(password!==repeat){setAuthMessage('Las contraseñas no coinciden.','error');return;}
    setAuthMessage('Guardando nueva contraseña…');
    const {error}=await supabase.auth.updateUser({password});
    if(error){setAuthMessage(error.message,'error');return;}
    await supabase.auth.signOut({scope:'local'}).catch(()=>{});
    showAuthPanel('loginPanel');
    setAuthMessage('Contraseña actualizada. Ya puedes iniciar sesión.','ok');
  });

  $('#logoutBtn')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});
  $('#usersNav')?.addEventListener('click',async()=>{
    $('#pageTitle').textContent='Usuarios';
    $('#pageSubtitle').textContent='Aprueba solicitudes vinculando cada cuenta con su cliente y gestiona los accesos.';
    $('#pageEyebrow').textContent='Administración';
    await renderUsers();
  });

  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){
      document.body.classList.add('auth-signed-out');
      document.body.classList.remove('auth-signed-in','auth-pending');
      showAuthPanel('recoveryPanel');
      return;
    }
    const incomingId=session?.user?.id||null;
    const appliedId=window.ibtCurrentProfile?.id||null;
    if(event==='TOKEN_REFRESHED')return;
    if((event==='SIGNED_IN'||event==='INITIAL_SESSION')&&incomingId&&incomingId===appliedId)return;
    setTimeout(refreshAuth,0);
  });
  refreshAuth();
});