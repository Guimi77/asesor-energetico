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
    let status = document.querySelector('#bulkProcessingStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'bulkProcessingStatus';
      status.style.cssText = 'display:block;margin-top:10px;padding:9px 12px;border-radius:9px;background:#eef1ff;color:#1834b8;font-size:12px;font-weight:700';
      dropZone.appendChild(status);
    }
    status.style.display = 'block';
    status.textContent = `Carpeta seleccionada · ${pdfs.length} facturas PDF encontradas${files.length !== pdfs.length ? ` · ${files.length - pdfs.length} archivos no PDF ignorados` : ''}`;
  }, true);
})();