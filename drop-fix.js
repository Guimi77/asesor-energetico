(()=>{
  const zone=document.querySelector('#dropZone'),input=document.querySelector('#fileInput'),button=document.querySelector('#pickFiles');
  if(!zone||!input)return;

  const clarifyCounters=()=>{
    const invoiceStat=document.querySelector('#statInvoices')?.closest('.stat');
    const label=invoiceStat?.querySelector('span');
    const note=invoiceStat?.querySelector('small');
    if(label)label.textContent='Facturas únicas procesadas';
    if(note)note.textContent='Los PDF duplicados no cuentan';

    const history=document.querySelector('#historySyncStatus');
    if(!history)return;
    let text=history.textContent||'';
    if(!/^Histórico/.test(text))return;
    text=text.replace(/^(Histórico(?: terminado)?:\s*\d+\/\d+)(?!\s*PDF)/,'$1 PDF');
    if(/^Histórico terminado:/.test(text)&&!text.includes('facturas únicas')){
      const unique=document.querySelector('#statInvoices')?.textContent?.trim();
      if(unique)text+=` · ${unique} facturas únicas`;
    }
    if(text!==history.textContent)history.textContent=text;
  };

  clarifyCounters();
  const observer=new MutationObserver(clarifyCounters);
  observer.observe(zone,{childList:true,subtree:true,characterData:true});

  const stop=e=>{e.preventDefault();e.stopPropagation()};
  ['dragenter','dragover','dragleave','drop'].forEach(type=>window.addEventListener(type,stop,false));
  ['dragenter','dragover'].forEach(type=>zone.addEventListener(type,e=>{stop(e);zone.classList.add('drag')},true));
  zone.addEventListener('dragleave',e=>{stop(e);zone.classList.remove('drag')},true);
  zone.addEventListener('drop',e=>{
    stop(e);zone.classList.remove('drag');
    const files=[...e.dataTransfer.files].filter(f=>f.name.toLowerCase().endsWith('.pdf'));
    if(!files.length)return;
    const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },true);
  if(button)button.addEventListener('click',()=>{input.value=''},true);
})();