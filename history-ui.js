(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n = (v) => Number(v) || 0;
  const money = (v) => n(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qty = (v, digits = 2) => n(v).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const dateES = (v) => {
    if (!v) return '—';
    const [y,m,d] = String(v).slice(0,10).split('-');
    return y && m && d ? `${d}/${m}/${y}` : String(v);
  };
  const monthKey = (v) => String(v || '').slice(0,7);
  const monthLabel = (key) => {
    const [y,m] = String(key).split('-');
    const names = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return y && m ? `${names[Number(m)-1] || m} ${String(y).slice(2)}` : key;
  };

  const state = {
    role: null,
    clients: [],
    holders: [],
    supplies: [],
    records: [],
    currentClient: '',
    currentHolder: '',
    currentSupply: '',
    initialized: false,
    loading: false,
  };

  function injectStyles() {
    if ($('#historyUiStyles')) return;
    const style = document.createElement('style');
    style.id = 'historyUiStyles';
    style.textContent = `
      .history-app{display:grid;gap:16px}.history-toolbar{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:12px;align-items:end}.history-toolbar label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#65758a}.history-toolbar select,.history-toolbar input{width:100%;padding:10px 12px;border:1px solid #dce4ed;border-radius:9px;background:#fff;color:#10233f}.history-client-fixed{padding:10px 12px;border-radius:9px;background:#eef1ff;color:#1834b8;font-weight:800;border:1px solid #d9e0ff}.history-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.history-kpi{padding:16px;border:1px solid #dce4ed;border-radius:12px;background:#fff}.history-kpi small{display:block;color:#65758a;margin-bottom:6px}.history-kpi strong{font-size:23px;color:#061b38}.history-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.history-chart{padding:16px;border:1px solid #dce4ed;border-radius:12px;background:#fff;min-height:245px}.history-chart h3{margin:0 0 4px}.history-chart p{margin:0 0 12px;color:#65758a;font-size:12px}.history-svg{width:100%;height:180px;display:block}.history-empty{padding:28px;text-align:center;color:#65758a}.history-table-wrap{overflow:auto}.history-table{width:100%;border-collapse:collapse;font-size:12px}.history-table th{position:sticky;top:0;background:#10233f;color:#fff;padding:10px 8px;text-align:left;white-space:nowrap}.history-table td{padding:9px 8px;border-bottom:1px solid #e7edf4;white-space:nowrap}.history-table tr:hover td{background:#f7f9fc}.history-detail-btn{border:1px solid #cfd9e5;background:#fff;border-radius:7px;padding:5px 8px;cursor:pointer}.history-events{display:grid;gap:8px}.history-event{display:grid;grid-template-columns:110px 150px 1fr;gap:10px;padding:10px 12px;border:1px solid #e1e8f0;border-radius:9px;background:#fff}.history-event b{color:#1834b8}.history-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.history-scope{font-size:12px;color:#65758a}.history-detail{margin-top:14px;padding:14px;border:1px solid #dce4ed;border-radius:10px;background:#f8faff}.history-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.history-mini-table{width:100%;border-collapse:collapse;font-size:12px}.history-mini-table th,.history-mini-table td{padding:6px 7px;border-bottom:1px solid #e3e9f0;text-align:right}.history-mini-table th:first-child,.history-mini-table td:first-child{text-align:left}.history-pill{display:inline-block;padding:3px 7px;border-radius:999px;background:#eef1ff;color:#1834b8;font-weight:700}.history-loading{padding:30px;text-align:center;color:#65758a}.history-error{padding:14px;border:1px solid #f1c6c1;background:#fff3f1;color:#8f1f17;border-radius:9px}.history-topline{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.history-topline h2{margin:0}.history-topline p{margin:5px 0 0;color:#65758a}.history-badge{padding:7px 10px;border-radius:999px;background:#e7f5e9;color:#19742b;font-size:12px;font-weight:800}.history-mode-note{font-size:11px;color:#65758a;margin-top:4px}
      @media(max-width:1100px){.history-toolbar{grid-template-columns:repeat(2,minmax(150px,1fr))}.history-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.history-grid{grid-template-columns:1fr}.history-detail-grid{grid-template-columns:1fr}.history-event{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function shell() {
    const view = $('#historicoView');
    if (!view) return null;
    if (!$('#historyApp', view)) {
      view.innerHTML = `
        <div id="historyApp" class="history-app">
          <section class="card">
            <div class="history-topline">
              <div><p class="eyebrow">Memoria energética</p><h2>Histórico energético</h2><p>Consulta la evolución técnica y económica conservada por cliente, titular y CUPS. Solo se almacenan datos estructurados validados.</p></div>
              <span class="history-badge">PDF no almacenados</span>
            </div>
          </section>
          <section class="card">
            <div class="history-toolbar">
              <label id="historyClientLabel">Cliente<div id="historyClientControl"></div></label>
              <label>Titular<select id="historyHolder"><option value="">Todos los titulares</option></select></label>
              <label>CUPS<select id="historySupply"><option value="">Todos los CUPS</option></select></label>
              <label>Desde<input id="historyFrom" type="date"></label>
              <label>Hasta<input id="historyTo" type="date"></label>
            </div>
            <div class="history-mode-note" id="historyModeNote"></div>
          </section>
          <div id="historyContent"><div class="history-loading">Cargando histórico…</div></div>
        </div>`;
    }
    return $('#historyApp', view);
  }

  async function getClients() {
    const supabase = window.ibtSupabase;
    const { data, error } = await supabase.from('clients').select('id,name,status').order('name');
    if (error) throw error;
    return data || [];
  }

  async function loadClientScope(clientId) {
    const supabase = window.ibtSupabase;
    const { data: holders, error: hErr } = await supabase.from('holders').select('id,client_id,legal_name,status').eq('client_id', clientId).order('legal_name');
    if (hErr) throw hErr;
    const holderIds = (holders || []).map(h => h.id);
    let supplies = [];
    if (holderIds.length) {
      const { data, error } = await supabase.from('supplies').select('id,holder_id,cups,supply_name,address,current_tariff,status').in('holder_id', holderIds).order('cups');
      if (error) throw error;
      supplies = data || [];
    }
    state.holders = holders || [];
    state.supplies = supplies;
    renderHolderOptions();
    renderSupplyOptions();
  }

  function renderClientControl() {
    const host = $('#historyClientControl');
    const note = $('#historyModeNote');
    if (!host) return;
    const internal = ['admin','staff'].includes(state.role);
    if (internal) {
      host.innerHTML = `<select id="historyClient">${state.clients.map(c => `<option value="${esc(c.id)}" ${c.id===state.currentClient?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`;
      $('#historyClient')?.addEventListener('change', async (e) => {
        state.currentClient = e.target.value;
        state.currentHolder = '';
        state.currentSupply = '';
        await loadClientScope(state.currentClient);
        await refreshRecords();
      });
      if (note) note.textContent = 'Acceso interno: puedes cambiar de cliente. La base de datos aplica los permisos de acceso.';
    } else {
      const c = state.clients.find(x => x.id === state.currentClient) || state.clients[0];
      host.innerHTML = `<div class="history-client-fixed">${esc(c?.name || 'Cliente')}</div>`;
      if (note) note.textContent = 'Acceso cliente: solo puedes consultar la información asignada a tu cuenta.';
    }
  }

  function renderHolderOptions() {
    const select = $('#historyHolder');
    if (!select) return;
    select.innerHTML = `<option value="">Todos los titulares</option>${state.holders.map(h => `<option value="${esc(h.id)}" ${h.id===state.currentHolder?'selected':''}>${esc(h.legal_name)}</option>`).join('')}`;
  }

  function visibleSupplies() {
    if (!state.currentHolder) return state.supplies;
    return state.supplies.filter(s => s.holder_id === state.currentHolder);
  }

  function renderSupplyOptions() {
    const select = $('#historySupply');
    if (!select) return;
    const list = visibleSupplies();
    if (state.currentSupply && !list.some(s => s.id === state.currentSupply)) state.currentSupply = '';
    select.innerHTML = `<option value="">Todos los CUPS</option>${list.map(s => `<option value="${esc(s.id)}" ${s.id===state.currentSupply?'selected':''}>${esc(s.cups)}${s.supply_name ? ` · ${esc(s.supply_name)}` : ''}</option>`).join('')}`;
  }

  async function fetchRecords(supplyIds) {
    if (!supplyIds.length) return [];
    const supabase = window.ibtSupabase;
    let q = supabase.from('invoices').select(`
      id,supply_id,invoice_number,billing_start,billing_end,billing_days,tariff,retailer,distributor,
      consumption_kwh,energy_cost_eur,power_cost_eur,excess_cost_eur,reactive_cost_eur,compensation_eur,
      social_bonus_eur,meter_rental_eur,distributor_charges_eur,electricity_tax_eur,vat_eur,igic_eur,
      other_cost_eur,total_eur,accounted_eur,difference_eur,average_total_eur_kwh,validation_status,validation_message,
      invoice_energy_periods(period,consumption_kwh,energy_cost_eur,unit_price_eur_kwh),
      invoice_power_periods(period,contracted_kw,billed_power_eur,unit_price_eur_kw_day),
      invoice_maximeters(period,maximeter_kw,reliable,source),
      invoice_excesses(period,excess_kw,amount_eur),
      invoice_reactive(period,reactive_kvarh,amount_eur),
      invoice_adjustments(concept,amount_eur,category)
    `).in('supply_id', supplyIds).order('billing_start', { ascending: true });
    const from = $('#historyFrom')?.value;
    const to = $('#historyTo')?.value;
    if (from) q = q.gte('billing_end', from);
    if (to) q = q.lte('billing_start', to);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  function supplyById(id) { return state.supplies.find(s => s.id === id); }
  function holderById(id) { return state.holders.find(h => h.id === id); }
  function holderForSupply(supply) { return holderById(supply?.holder_id); }

  function aggregateMonthly(records) {
    const map = new Map();
    for (const r of records) {
      const key = monthKey(r.billing_end || r.billing_start);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { key, kwh:0, eur:0 });
      const x = map.get(key);
      x.kwh += n(r.consumption_kwh);
      x.eur += n(r.total_eur);
    }
    return [...map.values()].sort((a,b) => a.key.localeCompare(b.key));
  }

  function svgChart(points, field, formatter) {
    if (!points.length) return `<div class="history-empty">Sin datos para este rango.</div>`;
    const W = 680, H = 180, padL = 46, padR = 12, padT = 12, padB = 28;
    const vals = points.map(p => n(p[field]));
    const max = Math.max(...vals, 1);
    const innerW = W-padL-padR, innerH = H-padT-padB;
    const step = points.length > 1 ? innerW/(points.length-1) : innerW;
    const coords = points.map((p,i) => ({ x: padL + (points.length===1?innerW/2:i*step), y: padT + innerH - (n(p[field])/max)*innerH, p }));
    const path = coords.map((c,i) => `${i?'L':'M'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const guides = [0,.5,1].map(f => {
      const y = padT + innerH - innerH*f;
      return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#e4eaf1"/><text x="${padL-7}" y="${y+4}" text-anchor="end" font-size="10" fill="#65758a">${esc(formatter(max*f))}</text>`;
    }).join('');
    const labels = coords.filter((_,i) => points.length <= 8 || i===0 || i===points.length-1 || i%Math.ceil(points.length/6)===0).map(c => `<text x="${c.x}" y="${H-7}" text-anchor="middle" font-size="10" fill="#65758a">${esc(monthLabel(c.p.key))}</text>`).join('');
    const dots = coords.map(c => `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#1834b8"><title>${esc(monthLabel(c.p.key))}: ${esc(formatter(c.p[field]))}</title></circle>`).join('');
    return `<svg class="history-svg" viewBox="0 0 ${W} ${H}" role="img">${guides}<path d="${path}" fill="none" stroke="#1834b8" stroke-width="2.5"/>${dots}${labels}</svg>`;
  }

  function powerSignature(r) {
    return [...(r.invoice_power_periods || [])].sort((a,b)=>a.period-b.period).map(p => `P${p.period}:${n(p.contracted_kw).toFixed(3)}`).join('|');
  }

  function describePower(r) {
    const rows = [...(r.invoice_power_periods || [])].sort((a,b)=>a.period-b.period);
    return rows.length ? rows.map(p => `P${p.period} ${qty(p.contracted_kw,3)} kW`).join(' · ') : 'Sin potencia registrada';
  }

  function comparablePowers(record) {
    const map=new Map();
    for(const x of record.invoice_power_periods || []) {
      if(x.contracted_kw==null || String(x.contracted_kw).trim()==='')continue;
      const value=Number(x.contracted_kw), period=Number(x.period);
      if(!Number.isFinite(value)||value<0||!Number.isInteger(period)||period<1||period>6)continue;
      if(map.has(period) && map.get(period)!==value)map.set(period,null);
      else if(!map.has(period))map.set(period,value);
    }
    return map;
  }

  function detectedEvents(records) {
    const bySupply=new Map(),events=[];
    for(const r of records){
      if(!bySupply.has(r.supply_id))bySupply.set(r.supply_id,[]);
      bySupply.get(r.supply_id).push(r);
    }
    for(const [supplyId,list] of bySupply){
      list.sort((a,b)=>String(a.billing_start).localeCompare(String(b.billing_start)));
      for(let i=1;i<list.length;i++){
        const prev=list[i-1],cur=list[i];
        const before=String(prev.tariff||'').trim(),after=String(cur.tariff||'').trim();
        if(before&&after&&before!=='—'&&after!=='—'&&before!==after)
          events.push({date:cur.billing_start,type:'Cambio de tarifa observado',supplyId,prev,cur,changes:[{label:'Tarifa',before,after}]});
        const p0=comparablePowers(prev),p1=comparablePowers(cur),changes=[];
        for(const [period,value] of p1){
          const old=p0.get(period);
          if(old==null||value==null||Math.abs(value-old)<0.0005)continue;
          changes.push({label:'P'+period,before:old,after:value,delta:value-old});
        }
        changes.sort((a,b)=>a.label.localeCompare(b.label));
        if(changes.length)events.push({date:cur.billing_start,type:'Cambio de potencia observado',supplyId,prev,cur,changes});
      }
    }
    return events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  }

  function renderContractEvent(e) {
    const s=supplyById(e.supplyId),h=holderForSupply(s);
    const name=s?.supply_name||s?.address||'Suministro';
    const rows=e.changes.map(c=>{
      const power=typeof c.delta==='number';
      const before=power?qty(c.before,3)+' kW':c.before;
      const after=power?qty(c.after,3)+' kW':c.after;
      const difference=power?(c.delta>0?'+':'')+qty(c.delta,3)+' kW':'Cambio de tarifa';
      return '<tr><td>'+esc(c.label)+'</td><td>'+esc(before)+'</td><td><strong>'+esc(after)+'</strong></td><td>'+esc(difference)+'</td></tr>';
    }).join('');
    const source=r=>esc(r.invoice_number||'Sin referencia')+' · '+dateES(r.billing_start)+' – '+dateES(r.billing_end);
    return '<div class="history-event"><div><small>Inicio del periodo posterior</small><br><strong>'+dateES(e.date)+'</strong></div><b>'+esc(e.type)+'</b><div><strong>'+esc(name)+'</strong><p class="history-scope">'+esc([h?.legal_name,s?.cups].filter(Boolean).join(' · '))+'</p><table class="history-mini-table"><thead><tr><th>Concepto</th><th>Antes</th><th>Después</th><th>Diferencia</th></tr></thead><tbody>'+rows+'</tbody></table><p class="history-scope">Registro anterior: '+source(e.prev)+'<br>Registro posterior: '+source(e.cur)+'</p></div></div>';
  }


  function rowDetail(r) {
    const energy = [...(r.invoice_energy_periods || [])].sort((a,b)=>a.period-b.period);
    const power = [...(r.invoice_power_periods || [])].sort((a,b)=>a.period-b.period);
    const max = [...(r.invoice_maximeters || [])].sort((a,b)=>a.period-b.period);
    const adjustments = r.invoice_adjustments || [];
    const energyTable = energy.length ? `<table class="history-mini-table"><thead><tr><th>Periodo</th><th>kWh</th><th>€/kWh</th><th>Coste €</th></tr></thead><tbody>${energy.map(x=>`<tr><td>P${x.period}</td><td>${qty(x.consumption_kwh)}</td><td>${qty(x.unit_price_eur_kwh,6)}</td><td>${money(x.energy_cost_eur)}</td></tr>`).join('')}</tbody></table>` : '<div class="history-empty">Sin detalle P1-P6 de energía.</div>';
    const maxMap = new Map(max.map(x=>[x.period,x]));
    const powerTable = power.length ? `<table class="history-mini-table"><thead><tr><th>Periodo</th><th>Contratada kW</th><th>Maxímetro kW</th><th>Coste €</th></tr></thead><tbody>${power.map(x=>`<tr><td>P${x.period}</td><td>${qty(x.contracted_kw,3)}</td><td>${maxMap.has(x.period)?qty(maxMap.get(x.period).maximeter_kw,3):'—'}</td><td>${money(x.billed_power_eur)}</td></tr>`).join('')}</tbody></table>` : '<div class="history-empty">Sin detalle de potencia.</div>';
    const extras = [
      ['Excesos', r.excess_cost_eur], ['Reactiva', r.reactive_cost_eur], ['Compensación', r.compensation_eur], ['Bono social', r.social_bonus_eur], ['Alquiler contador', r.meter_rental_eur], ['Derechos distribuidora', r.distributor_charges_eur], ['Impuesto electricidad', r.electricity_tax_eur], ['IVA', r.vat_eur], ['IGIC', r.igic_eur], ['Otros', r.other_cost_eur]
    ].filter(([,v])=>Math.abs(n(v))>0.0001);
    const extraHtml = `<div>${extras.map(([k,v])=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #e3e9f0"><span>${esc(k)}</span><strong>${money(v)} €</strong></div>`).join('') || '<div class="history-empty">Sin conceptos adicionales.</div>'}${adjustments.map(a=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #e3e9f0"><span>${esc(a.concept)}</span><strong>${money(a.amount_eur)} €</strong></div>`).join('')}</div>`;
    return `<div class="history-detail"><div class="history-section-head"><div><strong>${esc(r.invoice_number)}</strong> · ${dateES(r.billing_start)} – ${dateES(r.billing_end)}</div><span class="history-pill">${esc(r.tariff||'—')}</span></div><div class="history-detail-grid"><div><h4>Energía por periodos</h4>${energyTable}</div><div><h4>Potencia y maxímetros</h4>${powerTable}</div><div><h4>Otros conceptos</h4>${extraHtml}</div></div></div>`;
  }

  function render(records) {
    const host = $('#historyContent');
    if (!host) return;
    const monthly = aggregateMonthly(records);
    const totalKwh = records.reduce((s,r)=>s+n(r.consumption_kwh),0);
    const totalEur = records.reduce((s,r)=>s+n(r.total_eur),0);
    const avg = totalKwh ? totalEur/totalKwh : 0;
    const latest = [...records].sort((a,b)=>String(b.billing_end||b.billing_start).localeCompare(String(a.billing_end||a.billing_start)))[0];
    const selectedSupply = state.currentSupply ? supplyById(state.currentSupply) : null;
    const selectedHolder = state.currentHolder ? holderById(state.currentHolder) : null;
    const client = state.clients.find(c=>c.id===state.currentClient);
    const scope = [client?.name, selectedHolder?.legal_name, selectedSupply?.cups].filter(Boolean).join(' → ') || 'Histórico';
    const events = detectedEvents(records);

    host.innerHTML = `
      <section class="history-kpis">
        <div class="history-kpi"><small>Periodos guardados</small><strong>${records.length}</strong></div>
        <div class="history-kpi"><small>Consumo acumulado</small><strong>${qty(totalKwh,0)} kWh</strong></div>
        <div class="history-kpi"><small>Gasto acumulado</small><strong>${money(totalEur)} €</strong></div>
        <div class="history-kpi"><small>Coste total medio</small><strong>${avg?qty(avg,4):'—'} €/kWh</strong></div>
        <div class="history-kpi"><small>Tarifa más reciente</small><strong>${esc(latest?.tariff || '—')}</strong></div>
      </section>
      <section class="history-grid">
        <div class="history-chart"><h3>Evolución del consumo</h3><p>${esc(scope)}</p>${svgChart(monthly,'kwh',v=>`${qty(v,0)} kWh`)}</div>
        <div class="history-chart"><h3>Evolución del gasto</h3><p>${esc(scope)}</p>${svgChart(monthly,'eur',v=>`${money(v)} €`)}</div>
      </section>
      <section class="card">
        <div class="history-section-head"><div><p class="eyebrow">Cronología</p><h2 style="margin:0">Periodos históricos</h2></div><span class="history-scope">${esc(scope)}</span></div>
        <div class="history-table-wrap">
          <table class="history-table"><thead><tr><th>Periodo</th><th>Titular</th><th>CUPS</th><th>Tarifa</th><th>kWh</th><th>Energía €</th><th>Potencia €</th><th>Excesos €</th><th>Reactiva €</th><th>Otros/recargos €</th><th>Impuestos €</th><th>Total €</th><th>€/kWh</th><th></th></tr></thead><tbody>
            ${records.length ? records.map(r=>{const s=supplyById(r.supply_id),h=holderForSupply(s);const other=n(r.compensation_eur)+n(r.social_bonus_eur)+n(r.meter_rental_eur)+n(r.distributor_charges_eur)+n(r.other_cost_eur);const taxes=n(r.electricity_tax_eur)+n(r.vat_eur)+n(r.igic_eur);return `<tr data-history-id="${esc(r.id)}"><td>${dateES(r.billing_start)} – ${dateES(r.billing_end)}</td><td>${esc(h?.legal_name||'—')}</td><td>${esc(s?.cups||'—')}</td><td>${esc(r.tariff||'—')}</td><td>${qty(r.consumption_kwh)}</td><td>${money(r.energy_cost_eur)}</td><td>${money(r.power_cost_eur)}</td><td>${money(r.excess_cost_eur)}</td><td>${money(r.reactive_cost_eur)}</td><td>${money(other)}</td><td>${money(taxes)}</td><td><strong>${money(r.total_eur)}</strong></td><td>${n(r.average_total_eur_kwh)?qty(r.average_total_eur_kwh,4):'—'}</td><td><button class="history-detail-btn" data-id="${esc(r.id)}">Detalle</button></td></tr>`}).join('') : '<tr><td colspan="14" class="history-empty">No hay periodos históricos para la selección actual.</td></tr>'}
          </tbody></table>
        </div>
        <div id="historyDetailHost"></div>
      </section>
      <section class="card">
        <div class="history-section-head"><div><p class="eyebrow">Hechos del histórico · no recomendaciones</p><h2 style="margin:0">Cambios observados en el suministro</h2></div><span class="history-scope">Tarifa y potencia contratada</span></div>
        <p class="history-scope">Comparamos los datos de dos periodos guardados. Estos cambios no son recomendaciones de ahorro. La fecha corresponde al inicio del periodo posterior; no confirma el día exacto del cambio contractual.</p>
        <div class="history-events">${events.length ? events.map(renderContractEvent).join('') : '<div class="history-empty">No se observan cambios comparables en esta selección. Los datos ausentes no se interpretan como un cambio.</div>'}</div>
      </section>`;

    $$('.history-detail-btn', host).forEach(btn => btn.addEventListener('click', () => {
      const r = records.find(x => x.id === btn.dataset.id);
      const detailHost = $('#historyDetailHost');
      if (!detailHost || !r) return;
      detailHost.innerHTML = rowDetail(r);
      detailHost.scrollIntoView({behavior:'smooth',block:'nearest'});
    }));
  }

  async function refreshRecords() {
    if (state.loading) return;
    state.loading = true;
    const host = $('#historyContent');
    if (host) host.innerHTML = '<div class="history-loading">Cargando histórico…</div>';
    try {
      const supplyIds = state.currentSupply ? [state.currentSupply] : visibleSupplies().map(s=>s.id);
      state.records = await fetchRecords(supplyIds);
      render(state.records);
    } catch (error) {
      console.error('Error cargando histórico', error);
      if (host) host.innerHTML = `<div class="history-error">No se ha podido cargar el histórico: ${esc(error?.message || error)}</div>`;
    } finally {
      state.loading = false;
    }
  }

  function bindFilters() {
    $('#historyHolder')?.addEventListener('change', async e => {
      state.currentHolder = e.target.value;
      state.currentSupply = '';
      renderSupplyOptions();
      await refreshRecords();
    });
    $('#historySupply')?.addEventListener('change', async e => {
      state.currentSupply = e.target.value;
      await refreshRecords();
    });
    $('#historyFrom')?.addEventListener('change', refreshRecords);
    $('#historyTo')?.addEventListener('change', refreshRecords);
  }

  async function init(profile) {
    if (!profile || !window.ibtSupabase) return;
    injectStyles();
    shell();
    state.role = profile.role;
    try {
      state.clients = await getClients();
      if (!state.clients.length) {
        $('#historyContent').innerHTML = '<div class="history-empty">No hay ningún cliente accesible para esta cuenta.</div>';
        return;
      }
      if (!state.currentClient || !state.clients.some(c=>c.id===state.currentClient)) state.currentClient = state.clients[0].id;
      renderClientControl();
      await loadClientScope(state.currentClient);
      if (!state.initialized) { bindFilters(); state.initialized = true; }
      await refreshRecords();
    } catch (error) {
      console.error('No se pudo iniciar el histórico', error);
      const host = $('#historyContent');
      if (host) host.innerHTML = `<div class="history-error">No se ha podido iniciar el histórico: ${esc(error?.message || error)}</div>`;
    }
  }

  window.addEventListener('ibt-role-changed', e => init(e.detail?.profile));
  window.addEventListener('xtra-history-saved', () => refreshRecords());
  window.addEventListener('DOMContentLoaded', () => {
    if (window.ibtCurrentProfile) init(window.ibtCurrentProfile);
  });

  window.IBTHistoryUI = { reload: refreshRecords };
})();