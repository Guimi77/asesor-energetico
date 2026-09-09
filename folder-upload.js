(() => {
  'use strict';

  const input = document.querySelector('#fileInput');
  const pickFiles = document.querySelector('#pickFiles');
  const dropZone = document.querySelector('#dropZone');
  if (!input || !pickFiles || !dropZone || document.querySelector('#pickFolder')) return;

  const pickFolder = document.createElement('button');
  pickFolder.id = 'pickFolder';
  pickFolder.type = 'button';
  pickFolder.className = 'secondary';
  pickFolder.textContent = 'Cargar carpeta completa';
  pickFolder.title = 'Selecciona una carpeta y se leerán todos los PDF que contenga, también dentro de subcarpetas.';
  pickFiles.insertAdjacentElement('afterend', pickFolder);

  const supportsFolder = 'webkitdirectory' in input;
  if (!supportsFolder) {
    pickFolder.disabled = true;
    pickFolder.title = 'Este navegador no permite seleccionar una carpeta completa. Usa Chrome o Edge.';
  }

  function ensureStatus(){
    let status = document.querySelector('#bulkProcessingStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'bulkProcessingStatus';
      status.style.cssText = 'display:block;margin-top:10px;padding:9px 12px;border-radius:9px;background:#eef1ff;color:#1834b8;font-size:12px;font-weight:700';
      dropZone.appendChild(status);
    }
    status.style.display = 'block';
    return status;
  }

  function setFileMode(){
    input.removeAttribute('webkitdirectory');
    input.removeAttribute('directory');
    input.dataset.folderMode = '0';
  }

  function setFolderMode(){
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.dataset.folderMode = '1';
  }

  function readFileEntry(entry){
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  function readDirectoryBatch(reader){
    return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  }

  async function filesFromEntry(entry, out){
    if (!entry) return;
    if (entry.isFile) {
      out.push(await readFileEntry(entry));
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    while (true) {
      const batch = await readDirectoryBatch(reader);
      if (!batch.length) break;
      for (const child of batch) await filesFromEntry(child, out);
    }
  }

  function dispatchFiles(files){
    const pdfs = files.filter(file => file?.name?.toLowerCase().endsWith('.pdf'));
    const status = ensureStatus();
    if (!pdfs.length) {
      status.textContent = 'La carpeta no contiene facturas PDF.';
      return;
    }

    status.textContent = `Carpeta leída · ${pdfs.length} facturas PDF encontradas${files.length !== pdfs.length ? ` · ${files.length - pdfs.length} archivos no PDF ignorados` : ''}`;

    try {
      const transfer = new DataTransfer();
      pdfs.forEach(file => transfer.items.add(file));

      // Reutilizamos exactamente el mismo camino que cuando arrastras PDF sueltos.
      // Así el lector de facturas, la validación y el histórico reciben el mismo lote.
      const syntheticDrop = new Event('drop', {bubbles:true, cancelable:true});
      Object.defineProperty(syntheticDrop, 'dataTransfer', {value: transfer});
      dropZone.dispatchEvent(syntheticDrop);
    } catch (error) {
      // Alternativa para navegadores que no permitan recrear el arrastre.
      try {
        const transfer = new DataTransfer();
        pdfs.forEach(file => transfer.items.add(file));
        setFileMode();
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', {bubbles:true}));
      } catch (fallbackError) {
        console.warn('No se pudo entregar la carpeta al lector de facturas', fallbackError || error);
        status.textContent = `Se encontraron ${pdfs.length} PDF, pero el navegador no permite entregarlos automáticamente. Usa Chrome o Edge.`;
      }
    }
  }

  // El botón normal sigue abriendo la selección de archivos, aunque antes se haya usado una carpeta.
  pickFiles.addEventListener('click', setFileMode, true);

  pickFolder.addEventListener('click', () => {
    if (!supportsFolder) return;
    input.value = '';
    setFolderMode();
    input.click();
  });

  input.addEventListener('change', event => {
    if (input.dataset.folderMode !== '1') return;
    const files = [...(event.target?.files || [])];
    const pdfs = files.filter(file => file?.name?.toLowerCase().endsWith('.pdf'));
    const status = ensureStatus();
    status.textContent = `Carpeta seleccionada · ${pdfs.length} facturas PDF encontradas${files.length !== pdfs.length ? ` · ${files.length - pdfs.length} archivos no PDF ignorados` : ''}`;
  }, true);

  // Permite arrastrar directamente una carpeta desde Windows al recuadro de carga.
  // Si lo arrastrado son PDF normales, no intervenimos y la aplicación sigue como hasta ahora.
  dropZone.addEventListener('drop', event => {
    const items = [...(event.dataTransfer?.items || [])];
    const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.some(entry => entry.isDirectory)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    dropZone.classList.remove('drag');
    const status = ensureStatus();
    status.textContent = 'Leyendo la carpeta y buscando facturas PDF…';

    (async () => {
      try {
        const files = [];
        for (const entry of entries) await filesFromEntry(entry, files);
        dispatchFiles(files);
      } catch (error) {
        console.warn('No se pudo leer la carpeta arrastrada', error);
        status.textContent = 'No se ha podido leer la carpeta arrastrada. Prueba con el botón “Cargar carpeta completa”.';
      }
    })();
  }, true);
})();