(() => {
  'use strict';

  const VERSION = '2026.09.17.1';
  const dirtyPattern = /referencia\s+(?:de|del)\s+contrato|peaje\s+de\s+transporte/i;

  function normalize(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeAddress(value) {
    let s = normalize(value);
    if (!s) return '';

    s = s
      .replace(/\s*,?\s*Referencia\s+(?:de|del)\s+contrato(?:\s+de\s+suministro|\s+de\s+acceso)?\s*:?\s*(?:\d[\d.\s-]{7,25})\s*,?\s*/ig, ', ')
      .replace(/\s*Peaje\s+de\s+transporte(?:\s+y\s+distribuci[oó]n)?\s*:.*$/i, '')
      .replace(/\s*Segmento\s+de\s+cargos\s*:.*$/i, '')
      .replace(/\s*,\s*,+/g, ', ')
      .replace(/\s+,/g, ',')
      .replace(/,\s*$/g, '')
      .trim();

    return s;
  }

  function placeFromAddress(address) {
    const s = normalize(address);
    const m = s.match(/\b(\d{5})\s*,?\s*([^,]+?)(?:,\s*([^,]+))?$/i);
    return m ? { postalCode: m[1], city: normalize(m[2]), province: normalize(m[3] || '') } : { postalCode: '', city: '', province: '' };
  }

  function patchEndesaParser() {
    const base = window.IBTInvoiceFormats;
    if (!base?.parseEndesa || base.__endesaAddressSanitizerVersion === VERSION) return;

    const original = base.parseEndesa.bind(base);
    const patched = {
      ...base,
      __endesaAddressSanitizerVersion: VERSION,
      parseEndesa(...args) {
        const raw = original(...args);
        if (!raw || raw.unsupported) return raw;

        const supplyAddress = sanitizeAddress(raw.supplyAddress || raw.address);
        const place = placeFromAddress(supplyAddress);
        const supplyName = dirtyPattern.test(String(raw.supplyName || '')) ? supplyAddress : raw.supplyName;

        return {
          ...raw,
          supplyAddress: supplyAddress || raw.supplyAddress,
          address: supplyAddress || raw.address,
          supplyName: supplyName || raw.supplyName,
          supplyCity: raw.supplyCity || raw.city || place.city,
          supplyProvince: raw.supplyProvince || raw.province || place.province,
          postalCode: raw.postalCode || place.postalCode,
        };
      },
    };

    window.IBTInvoiceFormats = Object.freeze(patched);
  }

  let repairing = false;
  function repairLocalMaster() {
    if (repairing) return;
    const master = window.EnergyMaster;
    if (!master?.all || !master?.add) return;

    const dirty = master.all().filter((supply) => dirtyPattern.test(String(supply.address || supply.name || '')));
    if (!dirty.length) return;

    repairing = true;
    try {
      for (const supply of dirty) {
        const clean = sanitizeAddress(supply.address || supply.name);
        if (!clean) continue;
        const place = placeFromAddress(clean);
        master.add({
          ...supply,
          address: clean,
          name: dirtyPattern.test(String(supply.name || '')) ? clean : supply.name,
          city: supply.city || place.city,
          province: supply.province || place.province,
        }, {
          allowMove: true,
          fillOnly: false,
          preserveIdentity: true,
        });
      }
    } finally {
      repairing = false;
    }
  }

  patchEndesaParser();
  repairLocalMaster();
  window.addEventListener('energy-master-ready', repairLocalMaster);
  window.addEventListener('ibt-central-data-changed', repairLocalMaster);
})();
