'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const repsol=require('../repsol-parser.js');

const legacy={pages:[[
'DATOS DEL CLIENTE Y DEL PUNTO DE SUMINISTRO','Titular: DEMO REPSOL LEGACY','CIF/NIF: 00000000T','Dirección de CL DEMO 1','Suministro: 07001 PALMA (BALEARES)','Tipo: Mercado libre Nº Contrato: 4301281993','CUPS: ES0031500155734005LT0F','Comercializadora: Repsol Comercializadora de Electricidad y Gas, S.L.U.','TOTAL FACTURA 59,20 €','Periodo de Facturación: del 10.05.2023 al 10.06.2023','FACTURACIÓN TOTAL DEL PERIODO','Potencia Punta 2,300 kW x 31 días x Proporcional(1) €/kWaño 4,87','Potencia Valle 2,300 kW x 31 días x Proporcional(2) €/kWaño 5,00','Consumo 221 kWh x Proporcional(3) €/kWh 45,02','Financiación Bono Social 10 días x 0,038454 €/día 0,38','Impuesto Eléctrico 55,27 x 0,5% 0,28','Equipos de medida 0,83','Tu Asistente 24h 2,90 €/mes x 31 días 2,96','Descuento Tu Asistente 24h 100 % x 31 días -2,96','IVA (5 %) de 56,38 2,82','Peaje de transporte y distribución:2.0TD Segmento de cargos: 1','Potencias Contratadas: Punta=2,3kW; Valle=2,3kW','Potencias máx. demandadas último año: Punta=3,184kW; Valle=3,092kW','Nº de contador: 302077887','Distribuidora: EDISTRIBUCIÓN REDES DIGITALES S.L.U.','Contrato de acceso: 500006877578','Fecha final contrato: 01.06.2024','Fecha y Nº Factura: 15.06.2023 / 61033872804','Activa : Consumo del periodo (Real) hasta 10.06.2023 57 kWh 58 kWh 106 kWh'
]],text:''};legacy.text=legacy.pages.flat().join('\n');

const modern={pages:[[
'Factura de luz','Esta es tu factura de luz,','DEMO REPSOL MODERN','Total factura 61,90 €','Cupón saldo Waylet -20,00 €','Total a pagar 41,90 €','Término fijo 24,44 €','Energía 22,63 €','Otros conceptos 1,64 €','Impuestos 13,19 €','Periodo de facturación 11/08/2026 - 12/09/2026','Días facturados 32 Días','Consumo en este periodo 200,40 kWh','CUPS ES0031500538487014BG0F','Nº de contrato 4305024359','Nº de factura 61090914817','Fecha de emisión 16/09/2026','CL DEMO 1','Dirección de suministro 36 ESC D BJ D 07009','Accede a tus beneficios','PALMA (BALEARES'
],[
'INFORMACIÓN DE TUS CONSUMOS DATOS TÉCNICOS DE POTENCIA','Periodo de consumo Punta Llano Valle Periodo de consumo Punta Valle','Lectura actual (Real) 182,82 179,68 215,70 Potencia contratada 4,6kW 4,6kW','Lectura anterior -113,26 -111,58 -152,95 Tu potencia máxima demandada en el','3,860kW 3,380kW','último año','Consumo del periodo','(actual) hasta 69,56 kWh 68,09 kWh 62,75 kWh','12/09/2026','EL DESGLOSE DE TU FACTURA CON UNA EXPLICACIÓN DE CADA CONCEPTO','Término fijo 24,44 €','Periodo 1 12,37 € 4,600 kW x 32 días x 0,084037981 €/kW día','Periodo 2 12,07 € 4,600 kW x 32 días x 0,081994068 €/kW día','Energía 22,63 €','Consumo (P1) 22,63 € 200,40 kWh x 0,112931 €/kWh','Otros conceptos 1,64 €','Financiación Bono Social 0,79 € 32 días x 0,024688 €/día','Alquiler de contador 0,85 €','Impuesto Eléctrico 2,45 € 47,86 x 5,11269632%','IVA (21 %) de 51,16 10,74 €','Cupón saldo Waylet -20,00 €','Total a pagar 41,90 €'
],[
'TU CONTRATO','Comercializadora Tipo de tarifa','Repsol Comercializadora de Electricidad y Gas, S.L.U. Mercado libre DEMO REPSOL MODERN','Nº de contrato Potencia contratada','4305024359 Punta: 4,6kW','Valle: 4,6kW','Fecha fin de contrato','15/10/2026','Distribuidora Peaje de transporte y Segmentos de cargos','EDISTRIBUCIÓN REDES distribución 1','Localizador de pago','DIGITALES S.L.U. 2.0TD','Nº de contador Nº contrato de acceso Referencia: 999999','013491669 500022139937 Identificación: 000000','Nombre y Apellidos del titular DEMO REPSOL MODERN','DNI 00000000T'
]],text:''};modern.text=modern.pages.flat().join('\n');

test('detecta ambas generaciones Repsol sin apropiarse de formatos ajenos',()=>{
 assert.equal(repsol.detect(legacy),true);assert.equal(repsol.variant(legacy),'legacy');
 assert.equal(repsol.detect(modern),true);assert.equal(repsol.variant(modern),'modern');
 assert.equal(repsol.detect('Endesa Energía TOTAL FACTURA CUPS ES0031'),false);
});
test('legacy cuadra y conserva P1-P3 y máximas demandadas',()=>{
 const r=repsol.parse(legacy,{name:'legacy.pdf'});
 assert.equal(r.readOk,true);assert.equal(r.total,59.2);assert.equal(r.accounted,59.2);assert.equal(r.diff,0);
 assert.equal(r.kwh,221);assert.equal(r.energy,45.02);assert.equal(r.power,9.87);
 assert.equal(r.periods.P1.consumption,57);assert.equal(r.periods.P3.consumption,106);assert.equal(r.contracted.P1,2.3);assert.equal(r.maximeters.P1,3.184);
});
test('modern separa total factura de total a pagar y cupón Waylet',()=>{
 const r=repsol.parse(modern,{name:'modern.pdf'});
 assert.equal(r.readOk,true);assert.equal(r.total,61.9);assert.equal(r.paymentTotal,41.9);assert.equal(r.benefitCredit,-20);assert.equal(r.accounted,61.9);
 assert.equal(r.kwh,200.4);assert.equal(r.energy,22.63);assert.equal(r.power,24.44);
 assert.equal(r.periods.P1.consumption,69.56);assert.equal(r.periods.P3.consumption,62.75);assert.equal(r.contracted.P1,4.6);assert.equal(r.maximeters.P1,3.86);assert.equal(r.distributor,'EDISTRIBUCIÓN REDES DIGITALES S.L.U.');assert.match(r.supplyAddress,/CL DEMO 1 36 ESC D BJ D 07009 PALMA/);
});
