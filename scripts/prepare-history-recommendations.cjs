'use strict';
const fs=require('node:fs');
function edit(file,old,next){let s=fs.readFileSync(file,'utf8');if(s.includes(next))return;if(s.split(old).length!==2)throw Error('Non-unique or missing target: '+file);fs.writeFileSync(file,s.replace(old,()=>next));}
const helper=`  function renderRecommendations(records) {
    try {
      return window.IBTHistoryRecommendations?.render({ records, supplies:state.supplies, holders:state.holders }) || '';
    } catch (error) {
      console.error('No se pudieron preparar las recomendaciones', error);
      return '<section class="card"><h2>Recomendaciones</h2><p class="history-scope">No se pudieron calcular las propuestas. El histórico sigue disponible.</p></section>';
    }
  }

`;
edit('history-ui.js','  function render(records) {',helper+'  function render(records) {');
edit('history-ui.js','      </section>`;\n\n    $$(\'.history-detail-btn\', host)','      </section>\n      ${renderRecommendations(records)}`;\n\n    $$(\'.history-detail-btn\', host)');
edit('auth-bootstrap.js','history-ui.js?v=20260908-4','history-ui.js?v=20260908-rec1');
edit('index.html','</head>','<link rel="stylesheet" href="history-recommendations.css?v=20260908-rec1"/></head>');
edit('index.html','<script src="auth-bootstrap.js?v=20260908-4"></script>','<script src="history-recommendations.js?v=20260908-rec1"></script><script src="auth-bootstrap.js?v=20260908-rec1"></script>');
console.log('Prepared isolated recommendations; parser, PDF lifecycle, auth and database untouched.');
