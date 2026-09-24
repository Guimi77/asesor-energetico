#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {syntheticCupsFor}=require('./privacy-utils.js');
const {scanText}=require('./scan-test-pii.js');

function padDigits(n,len){ return String(n).padStart(len,'0').slice(-len); }

function sanitizeText(input){
  let cupsIndex=0, emailIndex=0, phoneIndex=0, docIndex=0;
  let out=String(input||'');

  out=out.replace(/ES(?:\s*\d){16}\s*[A-Z0-9]{2}(?:\s*[A-Z0-9]{2})?/gi,m=>syntheticCupsFor(m,cupsIndex++));
  out=out.replace(/(\b(?:NIF|NIE|CIF)(?:\s+titular(?:\s+del\s+contrato)?)?\s*[:#]?\s*)([A-Z0-9-]{8,12})/gi,(m,prefix)=>`${prefix}00000001R`);
  out=out.replace(/\bES\d{2}(?:[ -]?\d{4}){5}\b/gi,'ES00 0000 0000 0000 0000 0000');
  out=out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,()=>`cliente.prueba${++emailIndex}@example.com`);
  out=out.replace(/((?:tel[eé]fono|m[oó]vil|whatsapp)\s*[:#]?\s*)(?:\+34\s*)?[6789](?:[ .-]?\d){8}/gi,(m,prefix)=>`${prefix}60000000${(++phoneIndex)%10}`);
  out=out.replace(/(Titular\s+del\s+contrato\s*:\s*)([^'"\n,]+)/gi,'$1CLIENTE PRUEBA ALFA');
  out=out.replace(/(['"]CONTRATO['"]\s*,\s*['"])([^'"]+)(['"]\s*,\s*['"]Titular\b)/gi,'$1CLIENTE PRUEBA ALFA$3');
  out=out.replace(/(Direcci[oó]n\s+de\s+suministro\s*:\s*)([^'"\n,]{4,})/gi,'$1C/ EJEMPLO, 1');

  out=out.replace(/\b(N[ºO°.]?\s*(?:DE\s*)?(?:CONTRATO|FACTURA|CONTADOR)|CONTRATO\s+DE\s+ACCESO|Referencia\s+del\s+contrato(?:\s+de\s+acceso)?)\s*([:#]?\s*)([A-Z0-9-]{6,30})/gi,(m,label,sep,value)=>{
    docIndex++;
    const digits=value.replace(/\D/g,'').length;
    let replacement;
    if(/factura/i.test(label)) replacement='2126'+padDigits(docIndex,Math.max(1,digits-4));
    else if(/contador/i.test(label)) replacement='300'+padDigits(docIndex,Math.max(1,digits-3));
    else if(/acceso/i.test(label)) replacement='500'+padDigits(docIndex,Math.max(1,digits-3));
    else replacement='600'+padDigits(docIndex,Math.max(1,digits-3));
    return `${label}${sep}${replacement}`;
  });

  return out;
}

if(require.main===module){
  const [input,output]=process.argv.slice(2);
  if(!input){
    console.error('Uso: node tools/sanitize-parser-fixture.js <entrada> [salida]');
    process.exit(2);
  }
  const src=fs.readFileSync(input,'utf8');
  const sanitized=sanitizeText(src);
  const target=output || path.join(path.dirname(input),`${path.basename(input,path.extname(input))}.synthetic${path.extname(input)}`);
  fs.writeFileSync(target,sanitized,'utf8');
  const findings=scanText(sanitized,target);
  console.log(`Fixture sintética escrita en ${target}`);
  if(findings.length){
    console.warn(`Revisión manual necesaria: quedan ${findings.length} posible(s) dato(s) sensible(s).`);
    for(const f of findings) console.warn(`- línea ${f.line} [${f.type}] ${f.message}: ${f.value}`);
    process.exitCode=3;
  }else{
    console.log('Sanitización automática: 0 hallazgos de alta confianza pendientes.');
  }
}

module.exports={sanitizeText};
