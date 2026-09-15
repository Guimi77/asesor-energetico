(()=>{'use strict';
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function initClientSearch(){
  const input=document.querySelector('#clientSearch'),grid=document.querySelector('#companyGrid');
  if(!input||!grid)return;
  function apply(){
    const q=norm(input.value).trim();
    grid.querySelectorAll('.company-card-tree').forEach(card=>{
      if(!q){
        card.hidden=false;
        card.querySelectorAll('.holder-folder').forEach(f=>{
          f.hidden=false;
          f.querySelectorAll('.holder-supply-row').forEach(r=>r.hidden=false);
        });
        return;
      }
      const cardMatch=norm(card.querySelector('.client-tree-title h3')?.textContent).includes(q);
      let visibleFolders=0;
      card.querySelectorAll('.holder-folder').forEach(folder=>{
        const holderMatch=norm(folder.querySelector('summary strong')?.textContent).includes(q);
        let visibleRows=0;
        folder.querySelectorAll('.holder-supply-row').forEach(row=>{
          const rowMatch=norm(row.textContent).includes(q);
          row.hidden=!(cardMatch||holderMatch||rowMatch);
          if(!row.hidden)visibleRows++;
        });
        const show=cardMatch||holderMatch||visibleRows>0;
        folder.hidden=!show;
        if(show){visibleFolders++;folder.open=true;}
      });
      card.hidden=!(cardMatch||visibleFolders>0);
    });
  }
  input.addEventListener('input',apply);
  const observer=new MutationObserver(apply);
  observer.observe(grid,{childList:true,subtree:true});
}

function setupAssignmentPicker(select){
  if(!select||select.dataset.searchReady==='1')return;
  select.dataset.searchReady='1';

  const allOptions=[...select.options]
    .filter(o=>o.value)
    .map(o=>({value:o.value,text:o.textContent.trim()}))
    .sort((a,b)=>a.text.localeCompare(b.text,'es',{sensitivity:'base',numeric:true}));

  const search=document.createElement('input');
  search.type='search';
  search.className='user-client-assign-search';
  search.autocomplete='off';
  search.placeholder='Buscar cliente para asignar…';
  search.setAttribute('aria-label','Buscar cliente para asignar');
  search.style.cssText='display:block;width:100%;max-width:320px;box-sizing:border-box;margin-top:6px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#0f172a';
  select.parentNode.insertBefore(search,select);

  function renderOptions(){
    const q=norm(search.value).trim();
    const matches=allOptions.filter(o=>!q||norm(o.text).includes(q));
    const visible=matches.slice(0,q?25:15);
    select.replaceChildren();

    const first=document.createElement('option');
    first.value='';
    first.textContent=q
      ? `+ Selecciona cliente… (${matches.length})`
      : `+ Asignar cliente… (${allOptions.length})`;
    select.appendChild(first);

    visible.forEach(item=>{
      const option=document.createElement('option');
      option.value=item.value;
      option.textContent=item.text;
      select.appendChild(option);
    });

    if(!matches.length){
      const empty=document.createElement('option');
      empty.value='';
      empty.disabled=true;
      empty.textContent='Sin coincidencias';
      select.appendChild(empty);
    }else if(matches.length>visible.length){
      const more=document.createElement('option');
      more.value='';
      more.disabled=true;
      more.textContent=`Escribe más para filtrar · ${matches.length-visible.length} más`;
      select.appendChild(more);
    }
    select.value='';
  }

  search.addEventListener('input',renderOptions);
  search.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    const q=norm(search.value).trim();
    if(!q)return;
    const matches=allOptions.filter(o=>norm(o.text).includes(q));
    if(matches.length===1){
      e.preventDefault();
      select.value=matches[0].value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
  });
  renderOptions();
}

function rowSearchText(row){
  const copy=row.cloneNode(true);
  copy.querySelectorAll('.user-client-assign,.user-client-assign-search').forEach(el=>el.remove());
  return norm(copy.textContent);
}

function initUserDirectory(){
  const view=document.querySelector('#usersView');
  const body=document.querySelector('#usersBody');
  const head=view?.querySelector('.section-head');
  if(!view||!body||!head)return;

  let input=document.querySelector('#userSearch');
  if(!input){
    input=document.createElement('input');
    input.id='userSearch';
    input.className='search-box';
    input.type='search';
    input.autocomplete='off';
    input.placeholder='Buscar usuario, correo, tipo de cuenta o cliente asignado…';
    input.setAttribute('aria-label','Buscar usuarios');
    head.appendChild(input);
  }

  let observer;
  let scheduled=false;
  function realRows(){
    return [...body.querySelectorAll('tr')].filter(row=>!row.classList.contains('empty')&&!row.dataset.userSearchEmpty);
  }
  function applyFilter(){
    const q=norm(input.value).trim();
    const rows=realRows();
    rows.forEach(row=>{row.hidden=!!q&&!rowSearchText(row).includes(q);});
    let empty=body.querySelector('tr[data-user-search-empty]');
    const visible=rows.some(row=>!row.hidden);
    if(q&&rows.length&&!visible){
      if(!empty){
        empty=document.createElement('tr');
        empty.dataset.userSearchEmpty='1';
        empty.innerHTML='<td colspan="4" style="text-align:center;color:#65758a;padding:18px">No hay usuarios que coincidan con la búsqueda.</td>';
        body.appendChild(empty);
      }
    }else empty?.remove();
  }
  function sortAndFilter(){
    scheduled=false;
    const rows=realRows();
    if(rows.length>1){
      const sorted=[...rows].sort((a,b)=>{
        const an=a.querySelector('td strong')?.textContent?.trim()||a.cells?.[0]?.textContent?.trim()||'';
        const bn=b.querySelector('td strong')?.textContent?.trim()||b.cells?.[0]?.textContent?.trim()||'';
        const byName=an.localeCompare(bn,'es',{sensitivity:'base',numeric:true});
        if(byName)return byName;
        const ae=a.cells?.[0]?.querySelector('small')?.textContent?.trim()||'';
        const be=b.cells?.[0]?.querySelector('small')?.textContent?.trim()||'';
        return ae.localeCompare(be,'es',{sensitivity:'base'});
      });
      if(rows.some((row,i)=>row!==sorted[i])){
        observer.disconnect();
        sorted.forEach(row=>body.appendChild(row));
        observer.observe(body,{childList:true});
      }
    }
    body.querySelectorAll('.user-client-assign').forEach(setupAssignmentPicker);
    applyFilter();
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(sortAndFilter);
  }
  observer=new MutationObserver(schedule);
  observer.observe(body,{childList:true});
  input.addEventListener('input',applyFilter);
  schedule();
}

function init(){initClientSearch();initUserDirectory();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();