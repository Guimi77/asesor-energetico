# Asesor Energético

Aplicación web para procesar en lote facturas eléctricas, construir el histórico de cada CUPS y detectar situaciones que merece la pena revisar.

## Principios

- Procesamiento en el navegador: los PDF no se envían a un servidor propio ni se almacenan.
- Histórico estructurado por cliente, titular, CUPS y periodo.
- Los datos económicos validados no se sobrescriben silenciosamente al volver a cargar una factura.
- Los suministros dados de baja conservan todo su histórico.
- Las recomendaciones automáticas son señales para revisar, no cambios de contrato ni ahorros garantizados.
- La aplicación no calcula ni promete automáticamente cuánto puede ahorrar un cliente. Detecta, explica y deja la propuesta final a ELECTRICA BT.
- Compatible con GitHub Pages.

## Regla de lenguaje para todo el proyecto

La aplicación debe poder entenderla una persona que no conoce la factura eléctrica.

1. Primero mostramos **qué está pasando**, con una frase corta y clara.
2. Después explicamos **por qué importa**.
3. Después indicamos **qué recomendamos revisar**.
4. Los kW, kWh/día, maxímetros, P1-P6, kVArh, criterios internos, facturas utilizadas y demás datos técnicos quedan bajo **Ver detalle técnico**.
5. No mostramos expresiones como “confianza media” como conclusión principal. El grado de certeza se explica dentro del detalle cuando sea necesario.
6. Un coste detectado no se llama ahorro. La aplicación no promete ahorros ni genera propuestas económicas automáticas.
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
- Vista de Análisis orientada a diagnóstico, sin promesas de ahorro.
- Alertas internas para que ELECTRICA BT decida qué casos seguir y en qué estado están.
- Exportaciones internas y de cliente.
- Los informes actuales se mantienen estables visualmente, pero deben seguir recibiendo las correcciones de calidad de datos que afecten a cifras o hechos.

## Siguiente fase

1. **Ampliar compatibilidad de facturas por comercializadora**, usando ejemplos reales de cada formato y sin aplicar un lector a una factura cuyo formato no esté validado.
2. **Endurecer la identificación del formato antes de interpretar una factura**, para que un documento desconocido quede como no compatible o pendiente de revisión en lugar de producir cifras aparentemente válidas.
3. **Mantener las regresiones del parser y del histórico** cada vez que se añada un nuevo formato.
4. **Preparar una V1 estable** con carga masiva, históricos, estados de CUPS, análisis, alertas e informes funcionando sobre datos reales.
5. La IA conversacional sobre el histórico queda para una fase posterior, cuando la base de datos y los lectores estén suficientemente estabilizados.

## Informes

El formato actual de los informes queda congelado salvo correcciones necesarias de datos. No se añaden nuevas conclusiones, alertas internas ni cambios de diseño sin una decisión expresa. Si una mejora del parser, del histórico, de lecturas o del estado de un CUPS cambia un hecho o una cifra, el informe sí debe usar la información corregida.

## Privacidad

No subir al repositorio facturas reales, CIF, CUPS ni bases de datos del cliente. El repositorio público debe contener únicamente código y datos ficticios de prueba.
