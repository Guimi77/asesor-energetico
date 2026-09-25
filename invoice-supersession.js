(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.IBTInvoiceSupersession=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const clean=value=>String(value??'').trim();
  const key=value=>clean(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const number=value=>{
    if(value==null||value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  };
  const near=(a,b,tolerance=.02)=>{
    const x=number(a),y=number(b);
    return x!=null&&y!=null&&Math.abs(x-y)<=tolerance;
  };
  const cupsKey=value=>{
    const valueKey=key(value);
    return valueKey.startsWith('ES')&&valueKey.length>=20?valueKey.slice(0,20):valueKey;
  };

  function isoDate(value){
    const source=clean(value);
    let m=source.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){
      const date=new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==source?'':source;
    }
    m=source.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m)return '';
    const result=`${m[3]}-${m[2]}-${m[1]}`,date=new Date(`${result}T00:00:00Z`);
    return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==result?'':result;
  }

  function period(value){
    const source=clean(value);
    let m=source.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
    if(m)return {start:isoDate(m[1]),end:isoDate(m[2])};
    m=source.match(/(\d{4}-\d{2}-\d{2})\s*(?:-|a|al)\s*(\d{4}-\d{2}-\d{2})/i);
    return m?{start:isoDate(m[1]),end:isoDate(m[2])}:{start:'',end:''};
  }

  function invoiceDate(row){
    const explicit=isoDate(row?.issueDate||row?.issue_date);
    if(explicit)return explicit;
    const invoice=key(row?.invoiceNumber||row?.invoice_number);
    const m=invoice.match(/^(20\d{6})/);
    if(!m)return '';
    const raw=m[1],candidate=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
    return isoDate(candidate);
  }

  function periodEntries(row){
    const periods=row?.periods||row?.energyPeriods||{};
    const result=new Map();
    const add=(p,value)=>{
      const consumption=number(value);
      if(!Number.isInteger(p)||p<1||p>6||consumption==null||consumption<0||result.has(p))return false;
      result.set(p,consumption);return true;
    };
    if(Array.isArray(periods)){
      for(const item of periods){
        if(!add(Number(item?.period),item?.consumption_kwh??item?.consumption))return [];
      }
    }else{
      for(let p=1;p<=6;p++){
        const item=periods[`P${p}`];
        if(item&&!add(p,item?.consumption_kwh??item?.consumption))return [];
      }
    }
    return [...result.entries()].sort((a,b)=>a[0]-b[0]);
  }

  function canonicalProfile(row){
    const entries=periodEntries(row),total=number(row?.kwh??row?.consumption_kwh);
    if(!entries.length||total==null||total<0)return null;
    const measured=entries.reduce((sum,item)=>sum+item[1],0);
    // A missing P1-P6 row is only allowed to mean zero when the rows that do
    // exist already add up to the invoice total. This covers PDFs that omit
    // zero-consumption periods without guessing away a real missing period.
    if(!near(measured,total))return null;
    const byPeriod=new Map(entries);
    return Array.from({length:6},(_,index)=>[index+1,byPeriod.get(index+1)??0]);
  }

  function sameProfile(a,b){
    const x=canonicalProfile(a),y=canonicalProfile(b);
    if(!x||!y)return false;
    for(let i=0;i<6;i++)if(!near(x[i][1],y[i][1]))return false;
    return true;
  }

  function samePhysicalPeriod(a,b){
    if(!a||!b||a.unsupported||b.unsupported||a.readOk!==true||b.readOk!==true||a.balanced!==true||b.balanced!==true)return false;
    const invoiceA=key(a.invoiceNumber||a.invoice_number),invoiceB=key(b.invoiceNumber||b.invoice_number);
    if(!invoiceA||!invoiceB||invoiceA===invoiceB)return false;
    if(!cupsKey(a.cups)||cupsKey(a.cups)!==cupsKey(b.cups))return false;
    const pa=period(a.period||`${a.billing_start||''} - ${a.billing_end||''}`),pb=period(b.period||`${b.billing_start||''} - ${b.billing_end||''}`);
    if(!pa.start||!pa.end||pa.start!==pb.start||pa.end!==pb.end)return false;
    const kwhA=number(a.kwh??a.consumption_kwh),kwhB=number(b.kwh??b.consumption_kwh);
    if(kwhA==null||kwhB==null||Math.abs(kwhA-kwhB)>.02)return false;
    return sameProfile(a,b);
  }

  function compareRecency(a,b){
    const da=invoiceDate(a),db=invoiceDate(b);
    if(!da||!db)return 0;
    if(da!==db)return da>db?1:-1;
    const ia=key(a.invoiceNumber||a.invoice_number),ib=key(b.invoiceNumber||b.invoice_number);
    if(/^\d+$/.test(ia)&&/^\d+$/.test(ib)&&ia.length===ib.length&&ia!==ib)return ia>ib?1:-1;
    return 0;
  }

  function reconcile(rows=[]){
    for(const row of rows){
      delete row.superseded;
      delete row.supersededBy;
      delete row.supersessionReason;
      delete row.possibleSupersession;
    }
    const groups=[];
    for(const row of rows){
      if(!row||row.unsupported||row.readOk!==true||row.balanced!==true)continue;
      let group=groups.find(g=>samePhysicalPeriod(g[0],row));
      if(group)group.push(row);else groups.push([row]);
    }
    let superseded=0,ambiguous=0;
    for(const group of groups){
      if(group.length<2)continue;
      let current=group[0],resolved=true;
      for(const row of group.slice(1)){
        const cmp=compareRecency(row,current);
        if(cmp>0)current=row;
        else if(cmp===0)resolved=false;
      }
      if(!resolved){
        for(const row of group)row.possibleSupersession=true;
        ambiguous+=group.length;
        continue;
      }
      for(const row of group){
        if(row===current)continue;
        row.superseded=true;
        row.supersededBy=current.invoiceNumber||current.invoice_number||'';
        row.supersessionReason='Mismo CUPS, periodo y consumo por periodos; se conserva la factura posterior.';
        superseded++;
      }
    }
    return {active:rows.filter(row=>!row?.superseded),superseded,ambiguous};
  }

  return Object.freeze({cupsKey,period,invoiceDate,periodEntries,canonicalProfile,sameProfile,samePhysicalPeriod,compareRecency,reconcile});
});
