# Política de no regresiones — Asesor Energético

Esta política es obligatoria para cualquier cambio futuro en el proyecto.

## Regla principal

**Si una funcionalidad ya funciona, un cambio posterior no puede romperla.**

Antes de modificar parser, exportaciones, maestro, informes, clientes, histórico o cualquier flujo existente, hay que comprobar explícitamente qué comportamiento ya estaba validado y preservarlo.

## Parser de facturas

La batería de referencia actual contiene **341 facturas reales** y la auditoría del parser comprueba como mínimo:

- identidad esencial;
- suma de consumo P1-P6 frente a consumo total;
- suma del coste de energía P1-P6 frente al término de energía;
- coherencia entre tarifa y periodos;
- cuadre económico completo.

Un cambio del parser no se considera válido si mejora una casuística pero empeora cualquiera de las métricas que ya funcionaban.

## Procedimiento obligatorio antes de aceptar un cambio

1. Identificar exactamente qué caso se quiere corregir.
2. Revisar la lógica ya existente que puede verse afectada.
3. Aplicar el cambio más pequeño posible.
4. Volver a ejecutar la auditoría completa sobre las 341 facturas.
5. Comparar los resultados con la última referencia válida.
6. Si alguna métrica empeora, el cambio se considera una regresión y debe corregirse o revertirse antes de continuar.

## Principio de desarrollo

No se debe resolver una excepción mediante reglas que oculten errores, inventen valores o trasladen diferencias a `Otros` sin identificar el concepto real cuando este exista en la factura.

La prioridad es mantener una lectura completa, trazable y estable antes de migrar el histórico a Supabase.
