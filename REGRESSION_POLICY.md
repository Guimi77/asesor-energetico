# Política de no regresiones — Asesor Energético

Esta política es obligatoria para cualquier cambio futuro en el proyecto.

## Regla principal

**Si una funcionalidad ya funciona, un cambio posterior no puede romperla.**

Antes de modificar parser, exportaciones, maestro, informes, clientes, histórico o cualquier flujo existente, hay que comprobar explícitamente qué comportamiento ya estaba validado y preservarlo.

## Parser de facturas

### Normalización común previa a todos los parsers

Toda factura procesada por PDF.js debe pasar **antes de la detección de comercializadora y antes de cualquier parser específico** por la capa común `pdf-text-normalizer.js`.

Esta capa tiene una responsabilidad limitada y portable: reparar artefactos de extracción de PDF.js que no pertenecen al contenido real de la factura, especialmente glifos acentuados separados en elementos independientes, por ejemplo:

- `Energ í a` → `Energía`;
- `FACTURACI Ó N` → `FACTURACIÓN`;
- `N ú mero` → `Número`;
- `Ú ltima` → `Última`.

Reglas obligatorias:

- la normalización debe aplicarse por igual a FENIE, Endesa, Iberdrola y cualquier parser futuro;
- no debe alterar importes, fechas, CUPS, referencias, unidades ni signos;
- debe ser idempotente;
- los `rawPages` / items originales de PDF.js se conservan sin modificar para auditoría y trazabilidad;
- los parsers específicos no deben volver a implementar esta corrección de forma distinta salvo como defensa compatible;
- histórico, maestro/enriquecimiento y cualquier ruta secundaria que vuelva a leer un PDF deben utilizar la misma capa común;
- cualquier nueva regla de normalización debe llevar regresiones de todas las comercializadoras soportadas antes de publicarse.

Arquitectura objetivo:

`PDF → PDF.js → normalización común → detector de formato → parser específico → modelo energético común`

La batería de referencia actual contiene **341 facturas reales** y la auditoría del parser comprueba como mínimo:

- identidad esencial;
- suma de consumo P1-P6 frente a consumo total;
- suma del coste de energía P1-P6 frente al término de energía;
- coherencia entre tarifa y periodos;
- cuadre económico completo.

Un cambio del parser no se considera válido si mejora una casuística pero empeora cualquiera de las métricas que ya funcionaban.

### Parsers por comercializadora

Los parsers específicos deben permanecer desacoplados entre sí y devolver el mismo modelo energético normalizado. Añadir una nueva comercializadora no autoriza a ampliar de forma ambigua los detectores de formatos ya soportados ni a modificar sus cálculos sin una prueba específica.

**Iberdrola** se procesa mediante el parser portable `iberdrola-parser-v3.js`. Su detector no puede apropiarse de facturas Endesa, FENIE ni formatos desconocidos. La aplicación, el maestro de suministros y el histórico deben consumir ese mismo parser portable en lugar de duplicar sus reglas de lectura.

La persistencia histórica de cualquier nuevo parser sigue siendo *fail closed*: una factura solo puede guardarse cuando la fila del parser principal está validada, cuadra económicamente y coincide con la extracción histórica en consumo, energía, potencia, excesos, reactiva y total.

## Procedimiento obligatorio antes de aceptar un cambio

1. Identificar exactamente qué caso se quiere corregir.
2. Revisar la lógica ya existente que puede verse afectada.
3. Aplicar el cambio más pequeño posible.
4. Volver a ejecutar la auditoría completa sobre las 341 facturas.
5. Comparar los resultados con la última referencia válida.
6. Si alguna métrica empeora, el cambio se considera una regresión y debe corregirse o revertirse antes de continuar.


## Actualización controlada de referencias de regresión

Los tests de regresión deben permanecer **estrictos durante el desarrollo**. Un fallo de regresión no se resuelve modificando el resultado esperado únicamente para que el test vuelva a pasar.

Las referencias, expectativas, snapshots, fixtures de referencia o baselines solo pueden actualizarse cuando se cumplan **todas** estas condiciones:

1. El cambio funcional que motivó la actualización está terminado.
2. Las regresiones relevantes están ejecutadas y cualquier fallo está explicado.
3. Se ha realizado una auditoría funcional general del área afectada y no se han detectado regresiones reales.
4. El responsable del proyecto ha dado una aceptación explícita equivalente a **“OK, todo funciona”**.
5. La actualización de la referencia se realiza como cambio separado y trazable, preferiblemente en un PR específico.

Hasta ese momento, la referencia anterior se considera la verdad de regresión y no debe moverse.

### Qué sí puede actualizarse tras la aceptación

Después de una aceptación explícita y una auditoría satisfactoria se pueden actualizar:

- selectores o helpers de UI que representen la interfaz ya aceptada;
- baselines que comparen contra una versión anterior ya sustituida;
- expected values cuando el nuevo comportamiento haya sido verificado como correcto;
- snapshots y fixtures sintéticas equivalentes;
- documentación de regresión y referencias de commits;
- contratos de prueba que hayan quedado obsoletos por un cambio funcional aprobado.

### Qué no debe actualizarse automáticamente

No se actualizarán automáticamente para hacer coincidir el test con la salida nueva:

- CUPS;
- NIF/CIF/NIE;
- consumos;
- potencias;
- maxímetros;
- importes;
- impuestos;
- totales;
- periodos;
- resultados de parsers;
- estados de validación;
- ni cualquier dato técnico cuyo cambio pueda ocultar una regresión real.

Si uno de esos valores cambia, primero debe comprobarse por qué ha cambiado y validarse contra la factura o fixture sintética correspondiente.

### Regla de oro

**Primero se valida el comportamiento. Después, y solo después de aceptación explícita, se mueve la referencia. Nunca al revés.**

La actualización de una baseline no debe convertirse en una forma de silenciar un test rojo. Su función es fijar como nueva referencia un comportamiento que ya ha sido auditado y aceptado.


## Principio de desarrollo

No se debe resolver una excepción mediante reglas que oculten errores, inventen valores o trasladen diferencias a `Otros` sin identificar el concepto real cuando este exista en la factura.

La prioridad es mantener una lectura completa, trazable y estable antes de migrar el histórico a Supabase.
