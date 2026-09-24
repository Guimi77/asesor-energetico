# Fixtures sintéticas

Esta carpeta está reservada para fixtures de parsers que puedan publicarse sin datos reales de clientes.

Antes de añadir una fixture:

1. partir del caso real solo en un entorno privado;
2. sustituir identidad e identificadores;
3. conservar estructura, importes, periodos, errores de OCR y demás rasgos necesarios;
4. ejecutar `node tools/scan-test-pii.js <archivo>`;
5. ejecutar la regresión del parser correspondiente.

No guardar aquí mapas de correspondencia entre valores reales y sintéticos.
