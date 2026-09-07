import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://rxvowuswudutuaajkcky.supabase.co';
const SUPABASE_KEY='sb_publishable_hn8DvxyLNaYxIm-4xmtuOw_9Bn0BEjl';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
window.ibtSupabase=supabase;

const $=s=>document.querySelector(s);
let currentProfile=null;

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
  const historical=$('#historicoView');
  if(historical){
    historical.classList.remove('hidden');
    historical.innerHTML='<section class="card placeholder-view"><div class="upload-icon">◷</div><h2>Portal de cliente</h2><p>Tu cuenta está correctamente aislada. Solo se mostrarán aquí los suministros, facturas e histórico que estén asignados a tu usuario en Supabase.</p><span class="status review">Sin datos asignados todavía</span></section>';
  }
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
  document.body.dataset.role=role||'';
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
    setAuthMessage('Tu cuenta está desactivada. Contacta con el administrador.','error');
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

async function renderUsers(){
  const body=$('#usersBody');
  if(!body||currentProfile?.role!=='admin')return;
  body.innerHTML='<tr><td colspan="4">Cargando usuarios…</td></tr>';
  const [{data:profiles,error:pErr},{data:links,error:lErr}]=await Promise.all([
    supabase.from('profiles').select('id,display_name,role,active,created_at').order('created_at',{ascending:true}),
    supabase.from('client_users').select('user_id,client_id')
  ]);
  if(pErr||lErr){body.innerHTML='<tr><td colspan="4">No se pudieron cargar usuarios.</td></tr>';return;}
  const count=new Map();
  for(const x of links||[])count.set(x.user_id,(count.get(x.user_id)||0)+1);
  body.innerHTML='';
  for(const p of profiles||[]){
    const tr=document.createElement('tr');
    const own=p.id===currentProfile.id;
    tr.innerHTML=`<td><strong>${escapeHtml(p.display_name||'Usuario')}</strong>${own?' <span class="status ok">Tú</span>':''}</td><td><select class="role-select" data-id="${p.id}" ${own?'disabled':''}><option value="admin" ${p.role==='admin'?'selected':''}>Administrador</option><option value="staff" ${p.role==='staff'?'selected':''}>Personal interno</option><option value="client" ${p.role==='client'?'selected':''}>Cliente</option></select></td><td>${count.get(p.id)||0}</td><td><button class="secondary user-active" data-id="${p.id}" data-active="${p.active}" ${own?'disabled':''}>${p.active?'Activo':'Desactivado'}</button></td>`;
    body.appendChild(tr);
  }
  body.querySelectorAll('.role-select').forEach(el=>el.addEventListener('change',async e=>{
    const {error}=await supabase.from('profiles').update({role:e.target.value}).eq('id',e.target.dataset.id);
    if(error){alert('No se pudo cambiar el rol: '+error.message);await renderUsers();}
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
  $('#showSignup')?.addEventListener('click',()=>{$('#loginPanel')?.classList.add('hidden');$('#signupPanel')?.classList.remove('hidden');setAuthMessage('');});
  $('#showLogin')?.addEventListener('click',()=>{$('#signupPanel')?.classList.add('hidden');$('#loginPanel')?.classList.remove('hidden');setAuthMessage('');});
  loginForm?.addEventListener('submit',async e=>{
    e.preventDefault();setAuthMessage('Entrando…');
    const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){setAuthMessage(error.message,'error');return;}
    setAuthMessage('');await refreshAuth();
  });
  signupForm?.addEventListener('submit',async e=>{
    e.preventDefault();setAuthMessage('Creando cuenta…');
    const email=$('#signupEmail').value.trim(),password=$('#signupPassword').value,display_name=$('#signupName').value.trim();
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name}}});
    if(error){setAuthMessage(error.message,'error');return;}
    if(data.session){setAuthMessage('Cuenta creada.','ok');await refreshAuth();}
    else setAuthMessage('Cuenta creada. Revisa tu correo para confirmar el acceso.','ok');
  });
  $('#logoutBtn')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});
  $('#usersNav')?.addEventListener('click',async()=>{
    $('#pageTitle').textContent='Usuarios';
    $('#pageSubtitle').textContent='Gestiona roles y acceso a clientes.';
    $('#pageEyebrow').textContent='Administración';
    await renderUsers();
  });
  supabase.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));
  refreshAuth();
});
