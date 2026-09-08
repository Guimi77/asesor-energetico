'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
function replace(file,old,next){const text=fs.readFileSync(file,'utf8');assert.equal(text.split(old).length,2,'Unique target: '+file);fs.writeFileSync(file,text.replace(old,()=>next));}
const chart=String.raw`  // Rendered with the other charts, from the same filtered numeric records.
  // No independent startup, DOM scraping, observer, timer or extra query.
  function svgCostChart(points) {
    if (!points.length) return '<div class="history-empty">Sin datos para este rango.</div>';
    const W=680,H=180,padL=68,padR=12,padT=12,padB=28;
    const values=points.map(p=>Number.isFinite(p.kwh)&&p.kwh>0&&Number.isFinite(p.eur)?p.eur/p.kwh:null);
    const valid=values.filter(v=>v!==null&&Number.isFinite(v));
    const max=Math.max(...valid,0.01),min=Math.min(...valid,0),span=Math.max(max-min,0.01);
    const innerW=W-padL-padR,innerH=H-padT-padB;
    const step=points.length>1?innerW/(points.length-1):innerW;
    const coords=points.map((p,i)=>{
      const value=values[i];
      return {p,value,x:padL+(points.length===1?innerW/2:i*step),y:value!==null&&Number.isFinite(value)?padT+innerH-(value-min)/span*innerH:null};
    });
    let connected=false;
    const path=coords.map(c=>{
      if(c.y===null){connected=false;return '';}
      const command=connected?'L':'M';connected=true;
      return command+' '+c.x.toFixed(1)+' '+c.y.toFixed(1);
    }).filter(Boolean).join(' ');
    const guides=[0,.5,1].map(f=>{
      const value=min+span*f,y=padT+innerH-innerH*f;
      return '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="#e4eaf1"/><text x="'+(padL-7)+'" y="'+(y+4)+'" text-anchor="end" font-size="10" fill="#65758a">'+esc(qty(value,4))+'</text>';
    }).join('');
    const labels=coords.filter((_,i)=>points.length<=8||i===0||i===points.length-1||i%Math.ceil(points.length/6)===0).map(c=>'<text x="'+c.x+'" y="'+(H-7)+'" text-anchor="middle" font-size="10" fill="#65758a">'+esc(monthLabel(c.p.key))+'</text>').join('');
    const dots=coords.map(c=>c.y===null?
      '<text class="history-cost-missing" data-month="'+esc(c.p.key)+'" x="'+c.x+'" y="'+(padT+innerH-7)+'" text-anchor="middle" font-size="12" fill="#65758a">—<title>'+esc(monthLabel(c.p.key))+': sin dato calculable de €/kWh</title></text>':
      '<circle data-month="'+esc(c.p.key)+'" data-cost="'+c.value+'" cx="'+c.x+'" cy="'+c.y+'" r="3.5" fill="#1834b8"><title>'+esc(monthLabel(c.p.key))+': '+esc(qty(c.value,4))+' €/kWh</title></circle>'
    ).join('');
    return '<svg class="history-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolución del coste medio en euros por kilovatio hora">'+guides+(path?'<path d="'+path+'" fill="none" stroke="#1834b8" stroke-width="2.5"/>':'')+dots+labels+'</svg>';
  }

`;
replace('history-ui.js','  function powerSignature(r) {',chart+'  function powerSignature(r) {');
replace('history-ui.js','      @media(max-width:1100px)', '      @media(min-width:1400px){#historyContent .history-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}\n      @media(max-width:1100px)');
const spend=fs.readFileSync('history-ui.js','utf8').split('\n').find(line=>line.includes('<h3>Evolución del gasto</h3>'));
assert(spend,'Existing spending chart must remain present');
replace('history-ui.js',spend,spend+'\n        <div id="historyCostChart" class="history-chart"><h3>Evolución del coste medio</h3><p>${esc(scope)}</p>${svgCostChart(monthly)}</div>');
const loader="      if(!document.querySelector('script[data-history-cost-chart]')){\n        const extra=document.createElement('script');\n        extra.src='history-cost-chart.js?v=20260908-3';\n        extra.dataset.historyCostChart='1';\n        document.body.appendChild(extra);\n      }\n";
replace('auth-bootstrap.js',loader,'');
replace('auth-bootstrap.js','history-ui.js?v=20260908-rec1','history-ui.js?v=20260908-chart1');
replace('index.html','auth-bootstrap.js?v=20260908-rec1','auth-bootstrap.js?v=20260908-chart1');
console.log('Only the chart renderer, its layout and module loading were changed.');
