# Asesor Energético

Aplicación web para procesar en lote facturas eléctricas, generar un informe mensual y detectar oportunidades de optimización.

## Principios

- Procesamiento en el navegador: los PDF no se envían a un servidor propio.
- Sin backend ni API de IA obligatoria.
- Compatible con GitHub Pages.
- Maestro de empresas/CUPS e histórico se incorporarán por fases.

## MVP actual

- Carga múltiple y arrastrar/soltar PDF.
- Extracción inicial orientada a facturas Feníe: empresa, CUPS, periodo, tarifa, consumo, energía, potencia, excesos, reactiva, impuestos y total.
- Indicadores de revisión y oportunidades.
- Exportación Excel.

## Siguiente fase

Validar el parser con una muestra amplia de facturas reales antes de incorporar histórico, maestro de suministros y reglas avanzadas de optimización de potencia.

## Privacidad

No subir al repositorio facturas reales, CIF, CUPS ni bases de datos del cliente. El repositorio público debe contener únicamente código y datos ficticios de prueba.
