'use strict';

function compactAlnum(value){
  return String(value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
}

function formatLike(original, compactReplacement){
  let i=0;
  return String(original).split('').map(ch=>{
    if(/[A-Za-z0-9]/.test(ch) && i<compactReplacement.length){
      return compactReplacement[i++];
    }
    return ch;
  }).join('');
}

function syntheticCupsFor(original,index=0){
  const n=Math.max(0,Math.min(9,index%10));
  const compact=compactAlnum(original);
  const base=`ES000000000000000${n}AA`;
  const replacement=compact.length>20 ? `${base}0F`.slice(0,compact.length) : base.slice(0,compact.length);
  return formatLike(original,replacement);
}

function isSyntheticCups(value){
  const c=compactAlnum(value);
  return /^ES000000000000000\dAA(?:[A-Z0-9]{0,2})?$/.test(c);
}

function isSyntheticTaxId(value){
  const c=compactAlnum(value);
  return /^0000000\d[A-Z]$/.test(c) || /^X0000000[A-Z]$/.test(c) || /^B0000000\d$/.test(c);
}

function isSyntheticEmail(value){
  return /@(example\.com|example\.org|example\.net|invalid)$/i.test(String(value||''));
}

function looksSyntheticText(value){
  return /(PRUEBA|EJEMPLO|TEST|FICTICI|SINTETIC|DEMO)/i.test(String(value||''));
}

module.exports={compactAlnum,formatLike,syntheticCupsFor,isSyntheticCups,isSyntheticTaxId,isSyntheticEmail,looksSyntheticText};
