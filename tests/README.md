# Pruebas de regresión del parser

Ejecutar antes de publicar:

```sh
node --check app.js
node --check parser-audit.js
node --test tests/power-regression.test.cjs
```

Los 17 casos de potencia utilizan datos sintéticos, sin CUPS, nombres, facturas ni documentos de clientes. Cubren precios unitarios con dos decimales, subtotales en línea o separados, etiquetas desplazadas, importes negativos y cero, redondeos explícitos, importes ausentes y subtotales incompatibles. Comprueban además que no desaparezcan las funciones de visualización y exportación. GitHub Actions ejecuta estos casos en cambios de código relevantes. Este workflow informa del resultado; no configura protección de ramas ni bloquea por sí mismo el despliegue de Pages.

## Verificación privada del lote, versión 2026.09.07.7

Se ejecutó el JavaScript de la aplicación con el texto posicionado extraído de 341 PDF mediante PyMuPDF. Antes de probar la corrección se reprodujeron exactamente los campos de resumen y detalle por periodos del informe del navegador: cero diferencias y 129 descuadres económicos. Después de la corrección, los cinco controles existentes pasan en 341/341 y los 212 casos anteriormente válidos siguen pasando. No cambian identidad, consumos, precios energéticos, potencias contratadas almacenadas, maxímetros, excesos, reactiva, impuestos ni Otros. No se aplica ningún asiento artificial de reconciliación.

Se comprobó por separado que los importes individuales de potencia concuerdan con el subtotal impreso, con el margen de redondeo por línea. La prueba local ejecutó render y exportación con interfaces DOM/SheetJS simuladas. No equivale a una prueba integral de PDF.js en un navegador ni a una apertura en Microsoft Excel.

Los PDF originales, extracciones y resultados individuales permanecen fuera del repositorio público. El lote privado debe repetirse antes de futuros cambios; las pruebas sintéticas no lo sustituyen.

## Alcance

Que pasen los cinco controles de coherencia no certifica la captura de todos los campos del PDF. La auditoría de cobertura de identidad ampliada, potencias contratadas y métricas por periodo sigue siendo un trabajo distinto. No presentar este resultado como una garantía universal de ausencia de errores.
