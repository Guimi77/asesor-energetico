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
    rows.forEach(row=>{row.hidden=!!q&&!norm(row.textContent).includes(q);});
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