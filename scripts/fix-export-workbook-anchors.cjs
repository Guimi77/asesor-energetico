'use strict';
const fs=require('node:fs');
const file='history-client-export.js',old="ws.addImage(id,{tl:{col:0,row:row-1},ext:{width:900,height:300}});";
const next="let remaining=900,col=0;while(col<6){const width=Math.floor((ws.getColumn(col+1).width||8.43)*7+5);if(remaining<width)break;remaining-=width;col++;}const br={nativeCol:col,nativeColOff:Math.round(remaining*9525),nativeRow:row+14,nativeRowOff:0};ws.addImage(id,{tl:{col:0,row:row-1},br,editAs:'oneCell'});";
const s=fs.readFileSync(file,'utf8');
if(!s.includes(next)){if(s.split(old).length!==2)throw Error('Unexpected chart anchor source');fs.writeFileSync(file,s.replace(old,()=>next));}
console.log('Chart images use valid two-cell DrawingML anchors, with fixed 900 by 300 pixel bounds.');
