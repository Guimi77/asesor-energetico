# Asesor Energético

Aplicación web para procesar en lote facturas eléctricas, construir el histórico de cada CUPS y detectar situaciones que merece la pena revisar.

## Principios

- Procesamiento en el navegador: los PDF no se envían a un servidor propio ni se almacenan.
- Histórico estructurado por cliente, titular, CUPS y periodo.
- Los datos económicos validados no se sobrescriben silenciosamente al volver a cargar una factura.
- Los suministros dados de baja conservan todo su histórico.
- Las recomendaciones automáticas son señales para revisar, no cambios de contrato ni ahorros garantizados.
- Compatible con GitHub Pages.

## Regla de lenguaje para todo el proyecto

La aplicación debe poder entenderla una persona que no conoce la factura eléctrica.

1. Primero mostramos **qué está pasando**, con una frase corta y clara.
2. Después explicamos **por qué importa**.
3. Después indicamos **qué recomendamos revisar**.
4. Los kW, kWh/día, maxímetros, P1-P6, kVArh, criterios internos, facturas utilizadas y demás datos técnicos quedan bajo **Ver detalle técnico**.
5. No mostramos expresiones como “confianza media” como conclusión principal. El grado de certeza se explica dentro del detalle cuando sea necesario.
6. Un coste detectado no se llama ahorro. El ahorro solo se mostrará cuando exista un cálculo suficiente para defenderlo.
7. La simplificación nunca elimina la trazabilidad: ELECTRICA BT debe poder comprobar siempre de qué facturas y datos sale cada aviso.

Resumen de diseño: **cliente = conclusión sencilla; ELECTRICA BT = detalle técnico disponible; factura original = fuente final**.

## Estado actual

- Carga de carpetas completas con cientos de PDF.
- Control de duplicados, errores de lectura y protección del histórico.
- Maestro de clientes, titulares y CUPS.
- Ciclo de vida de CUPS sin borrar el histórico.
- Histórico energético estructurado.
- Detección prudente de excesos de potencia, energía reactiva y posible potencia sobredimensionada.
- Estado de lectura para evitar interpretar un 0 kWh sin lectura como consumo real cero.
- Detección de cambios sostenidos de consumo usando varios periodos comparables.
- Exportaciones internas y de cliente.

## Siguiente fase

Convertir los hallazgos técnicos ya fiables en oportunidades priorizadas y comprensibles: qué merece atención primero, qué coste histórico está asociado y qué análisis adicional necesitamos antes de poder estimar un ahorro.

## Privacidad

No subir al repositorio facturas reales, CIF, CUPS ni bases de datos del cliente. El repositorio público debe contener únicamente código y datos ficticios de prueba.
