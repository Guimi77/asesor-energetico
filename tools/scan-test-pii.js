#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {isSyntheticCups,isSyntheticTaxId,isSyntheticEmail,looksSyntheticText}=require('./privacy-utils.js');

function walk(dir){
  const out=[];
  if(!fs.existsSync(dir)) return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...walk(p));
    else if(/\.(?:js|cjs|mjs|json|txt|md|html)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

function lineOf(text,index){
  return text.slice(0,index).split('\n').length;
}

function add(findings,file,text,index,type,value,message){
  findings.push({file,line:lineOf(text,index),type,value:String(value).slice(0,120),message});
}

function scanText(text,file='<memory>'){
  const findings=[];
  const src=String(text||'');

  const cups=/ES(?:\s*\d){16}\s*[A-Z0-9]{2}(?:\s*[A-Z0-9]{2})?/gi;
  for(const m of src.matchAll(cups)){
    if(!isSyntheticCups(m[0])) add(findings,file,src,m.index,'CUPS',m[0],'CUPS con apariencia real');
  }

  const tax=/\b(?:NIF|NIE|CIF)(?:\s+titular(?:\s+del\s+contrato)?)?\s*[:#]?\s*([A-Z0-9-]{8,12})/gi;
  for(const m of src.matchAll(tax)){
    const value=m[1];
    if(!isSyntheticTaxId(value)) add(findings,file,src,m.index,'TAX_ID',value,'NIF/NIE/CIF con apariencia real');
  }

  const iban=/\bES\d{2}(?:[ -]?\d{4}){5}\b/gi;
  for(const m of src.matchAll(iban)) add(findings,file,src,m.index,'IBAN',m[0],'IBAN encontrado en una prueba');

  const email=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  for(const m of src.matchAll(email)){
    if(!isSyntheticEmail(m[0])) add(findings,file,src,m.index,'EMAIL',m[0],'Email que no usa un dominio de prueba');
  }

  const holder=/Titular\s+del\s+contrato\s*:\s*([^'"\n,]+)/gi;
  for(const m of src.matchAll(holder)){
    if(!looksSyntheticText(m[1])) add(findings,file,src,m.index,'HOLDER',m[1].trim(),'Titular no marcado como sintético');
  }

  const iberdrolaHolder=/['"]CONTRATO['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]Titular\b/gi;
  for(const m of src.matchAll(iberdrolaHolder)){
    if(!looksSyntheticText(m[1])&&!isSyntheticTaxId(m[1])) add(findings,file,src,m.index,'HOLDER',m[1].trim(),'Nombre de titular no marcado como sintético');
  }

  const addressSame=/Direcci[oó]n\s+de\s+suministro\s*:\s*([^'"\n,]{4,})/gi;
  for(const m of src.matchAll(addressSame)){
    if(!looksSyntheticText(m[1])) add(findings,file,src,m.index,'ADDRESS',m[1].trim(),'Dirección de suministro no marcada como sintética');
  }

  const street=/\b(?:C\/|CARRER|CALLE|AV\.|AVENIDA|PLAZA|CTRA\.)\s+([^'"\n]{3,80})/gi;
  for(const m of src.matchAll(street)){
    const full=m[0];
    if(!looksSyntheticText(full)) add(findings,file,src,m.index,'ADDRESS',full.trim(),'Dirección postal con apariencia real');
  }

  const labelledNumber=/\b(N[ºO°.]?\s*(?:DE\s*)?(?:CONTRATO|FACTURA|CONTADOR)|CONTRATO\s+DE\s+ACCESO|Referencia\s+del\s+contrato(?:\s+de\s+acceso)?)\s*[:#]?\s*([A-Z0-9-]{6,30})/gi;
  for(const m of src.matchAll(labelledNumber)){
    const value=m[2].replace(/[^A-Za-z0-9]/g,'');
    if(!/\d/.test(value)) continue;
    const allowed=/^(?:6000000\d+|5000000000\d+|2126000000000\d+|3000000\d+|TEST\d+|P\d{2}CON000000\d{3})$/i.test(value);
    if(!allowed) add(findings,file,src,m.index,'DOCUMENT_ID',m[2],`${m[1]} con apariencia real`);
  }

  return findings;
}

function printFindings(findings){
  for(const f of findings){
    console.error(`::error file=${f.file},line=${f.line}::[${f.type}] ${f.message}: ${f.value}`);
  }
  if(findings.length) console.error(`\nPrivacy check: ${findings.length} posible(s) dato(s) real(es) detectado(s).`);
}

function filesFromArgs(argv){
  if(argv.includes('--all')) return walk('tests');
  if(argv.includes('--stdin0')){
    return fs.readFileSync(0).toString('utf8').split('\0').filter(Boolean);
  }
  return argv.filter(x=>!x.startsWith('--'));
}

if(require.main===module){
  const files=filesFromArgs(process.argv.slice(2));
  if(!files.length){
    console.log('Privacy check: no hay archivos de tests para analizar.');
    process.exit(0);
  }
  let all=[];
  for(const file of files){
    if(!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    all=all.concat(scanText(fs.readFileSync(file,'utf8'),file));
  }
  if(all.length){ printFindings(all); process.exit(1); }
  console.log(`Privacy check OK: ${files.length} archivo(s) revisado(s), 0 hallazgos.`);
}

module.exports={scanText,walk};
