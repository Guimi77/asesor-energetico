(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const parseES = (v) => {
    const x = String(v ?? '').trim().replace(/\s/g,'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,'');
    return Number(x) || 0;
  };
  const fmt = (v, d=4) => Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d});
  const monthLabel = key => {
    const names=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const [y,m]=String(key||'').split('-');
    return y&&m?`${names[Number(m)-1]||m} ${String(y).slice(2)}`:key;
  };
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function readMonthly(){
    const rows=$$('.history-table tbody tr');
    const map=new Map();
    for(const tr of rows){
      const c=tr.children;
      if(c.length<12) continue;
      const period=String(c[0].textContent||'');
      const dates=[...period.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
      const d=dates.at(-1);
      if(!d) continue;
      const key=`${d[3]}-${d[2]}`;
      const kwh=parseES(c[4].textContent);
      const eur=parseES(c[11].textContent);
      if(!map.has(key)) map.set(key,{key,kwh:0,eur:0});
      const x=map.get(key); x.kwh+=kwh; x.eur+=eur;
    }
    return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(x=>({...x,cost:x.kwh?x.eur/x.kwh:0}));
  }

  function chart(points){
    if(!points.length) return '<div class="history-empty">Sin datos para este rango.</div>';
    const W=680,H=180,padL=52,padR=12,padT=12,padB=28;
    const vals=points.map(p=>p.cost);
    const max=Math.max(...vals,0.01);
    const min=Math.min(...vals,0);
    const span=Math.max(max-min,0.01);
    const innerW=W-padL-padR,innerH=H-padT-padB;
    const step=points.length>1?innerW/(points.length-1):innerW;
    const coords=points.map((p,i)=>({x:padL+(points.length===1?innerW/2:i*step),y:padT+innerH-((p.cost-min)/span)*innerH,p}));
    const path=coords.map((c,i)=>`${i?'L':'M'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const guides=[0,.5,1].map(f=>{
      const val=min+span*f, y=padT+innerH-innerH*f;
      return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#e4eaf1"/><text x="${padL-7}" y="${y+4}" text-anchor="end" font-size="10" fill="#65758a">${esc(fmt(val,4))}</text>`;
    }).join('');
    const labels=coords.filter((_,i)=>points.length<=8||i===0||i===points.length-1||i%Math.ceil(points.length/6)===0).map(c=>`<text x="${c.x}" y="${H-7}" text-anchor="middle" font-size="10" fill="#65758a">${esc(monthLabel(c.p.key))}</text>`).join('');
    const dots=coords.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#1834b8"><title>${esc(monthLabel(c.p.key))}: ${esc(fmt(c.p.cost,4))} €/kWh</title></circle>`).join('');
    return `<svg class="history-svg" viewBox="0 0 ${W} ${H}" role="img">${guides}<path d="${path}" fill="none" stroke="#1834b8" stroke-width="2.5"/>${dots}${labels}</svg>`;
  }

  function enhance(){
    const grid=$('#historyContent .history-grid');
    if(!grid) return;
    let box=$('#historyCostChart',grid);
    if(!box){
      box=document.createElement('div');
      box.id='historyCostChart';
      box.className='history-chart';
      grid.appendChild(box);
    }
    const scope=$('.history-chart p',grid)?.textContent||'';
    box.innerHTML=`<h3>Evolución del coste medio</h3><p>${esc(scope)}</p>${chart(readMonthly())}`;
  }

  function styles(){
    if($('#historyCostChartStyles')) return;
    const s=document.createElement('style');
    s.id='historyCostChartStyles';
    s.textContent='@media(min-width:1400px){#historyContent .history-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}';
    document.head.appendChild(s);
  }

  function start(){
    styles();
    enhance();
    const host=$('#historyContent');
    if(!host) return;
    const obs=new MutationObserver(()=>enhance());
    obs.observe(host,{childList:true,subtree:false});
    window.addEventListener('xtra-history-saved',()=>setTimeout(enhance,0));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(start,0));
  else setTimeout(start,0);
})();
