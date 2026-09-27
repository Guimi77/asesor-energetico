# Subproyecto: Comparador Histórico

## Objetivo

Crear una herramienta interna del Asesor Energético para que ELECTRICA BT pueda responder, con datos históricos reales y trazables, a una pregunta concreta:

> Con el consumo y la potencia que realmente tuvo este suministro, ¿cómo habría evolucionado su coste si durante ese mismo periodo hubiese estado con una alternativa comparable de otra comercializadora?

El resultado es una **simulación histórica**, no una promesa de ahorro futuro ni una reproducción exacta de un contrato que el cliente no tuvo.

## Alcance de acceso

El Comparador Histórico es una herramienta **exclusiva para usuarios con rol `staff` o `admin`**.

Los clientes no acceden al buscador de referencias, al algoritmo de similitud, a facturas de terceros ni a datos internos. Reciben únicamente un informe final revisado y aprobado por ELECTRICA BT.

Flujo previsto:

```text
Cliente solicita comparación
        ↓
STAFF / ADMIN
        ↓
Comparador Histórico
        ↓
Búsqueda y validación de referencias
        ↓
Simulación
        ↓
Revisión humana
        ↓
Informe PDF
        ↓
Cliente
```

## Regla principal: comparar condiciones, no totales

No se debe comparar directamente el total de una factura de un cliente con el total de otra factura de un tercero.

El Comparador debe:

1. tomar el consumo y las potencias reales del suministro analizado;
2. localizar facturas históricas comparables de la comercializadora objetivo;
3. extraer y normalizar las condiciones económicas relevantes de esas facturas;
4. aplicar esas condiciones al consumo y potencia reales del suministro analizado;
5. calcular el coste simulado para el mismo periodo;
6. mostrar el resultado junto al coste real y el grado de calidad de la comparación.

## Detección obligatoria de modelo de precio

La clasificación se realiza por **contrato/factura**, no por comercializadora. Una misma comercializadora puede tener productos fijos, indexados o híbridos.

Valores normalizados:

```text
fijo
indexado
hibrido
desconocido
```

La detección debe apoyarse primero en evidencia explícita del documento y, cuando sea necesario, en la estructura del cálculo del término de energía.

### Evidencias típicas de precio fijo

- referencias explícitas a precio fijo, estable o tarifa estable;
- precios contractuales definidos en €/kWh por uno o varios periodos;
- producto comercial identificado de forma fiable como fijo.

### Evidencias típicas de precio indexado

- referencias explícitas a precio indexado;
- fórmula ligada a OMIE, mercado diario, pool o precio horario;
- precio de mercado más margen o fee de comercialización;
- desglose de pérdidas, desvíos, costes operativos u otros componentes propios de una fórmula indexada.

Un cambio de precio entre facturas **no basta por sí solo** para clasificar una tarifa como indexada.

Si no existe evidencia suficiente, el parser debe devolver `desconocido`. Nunca se inventa la clasificación.

## Campos normalizados necesarios

El modelo energético común deberá poder almacenar, como mínimo:

```text
modelo_precio
producto_comercial
precio_energia_tipo
formula_indexacion
margen_comercializador
precio_energia_periodos
fecha_inicio_condiciones
fecha_fin_condiciones
deteccion_modelo
confianza_deteccion
evidencias_deteccion
```

Valores sugeridos para `deteccion_modelo`:

```text
explicita
inferida
manual
```

## Selección de facturas comparables

Antes de medir similitud, el sistema debe aplicar filtros de compatibilidad.

Como mínimo:

- misma tarifa de acceso o una equivalencia expresamente validada;
- modelo de precio compatible: fijo con fijo, indexado con indexado, salvo comparación separada solicitada;
- periodo temporal comparable;
- territorio fiscal compatible;
- duración de factura razonablemente comparable;
- potencia contratada similar;
- consumo total similar;
- distribución de consumo por periodos similar;
- tratamiento compatible de autoconsumo, compensación, reactiva, excesos y maxímetros;
- servicios adicionales identificados y separados del suministro eléctrico cuando corresponda.

Después de los filtros, se calcula una puntuación de similitud.

No se recomienda utilizar una única factura espejo. Cuando existan suficientes datos, la simulación debe apoyarse en varias referencias comparables para reducir el efecto de regularizaciones, descuentos puntuales o anomalías.

## Fijo e indexado no se mezclan

## Escenarios tarifarios

El Comparador no se limita a cambiar de comercializadora. La unidad de comparación es el **escenario tarifario**, definido por:

```text
comercializadora + modelo de precio + producto/condiciones
```

Esto permite comparar, por ejemplo:

```text
Real: FENIE ENERGÍA · indexado
Escenario A: FENIE ENERGÍA · fijo
Escenario B: Endesa · fijo
Escenario C: Naturgy · indexado
```

La comercializadora y el modelo de precio se seleccionan de forma independiente. El motor debe poder comparar:

- misma comercializadora y distinto modelo de precio;
- distinta comercializadora y mismo modelo de precio;
- distinta comercializadora y distinto modelo de precio.

Cuando se comparen periodos históricos, las condiciones de referencia deben ser temporalmente compatibles con cada tramo analizado. No se debe aplicar retrospectivamente una oferta actual a meses anteriores salvo que el informe se identifique expresamente como simulación de oferta actual y no como comparación histórica.


Si una comercializadora tiene referencias históricas de ambos tipos, el sistema debe tratarlas como escenarios distintos:

```text
Comercializadora X - precio fijo
Comercializadora X - precio indexado
```

El staff puede generar una comparación con uno de los escenarios o, cuando tenga sentido, presentar ambos de forma separada.

En productos indexados, la simulación debe distinguir entre:

- reproducción de una fórmula contractual conocida y suficientemente documentada;
- simulación basada en precios efectivos observados históricamente en facturas comparables.

La segunda debe etiquetarse expresamente como **simulación histórica observada** y nunca presentarse como garantía de condiciones futuras.

## Nivel de calidad de la comparación

Cada simulación debe devolver información suficiente para que el staff evalúe su solidez.

Ejemplos de métricas:

- número de facturas utilizadas;
- número de suministros de referencia;
- coincidencia de tarifa de acceso;
- diferencia media de potencia;
- diferencia media de consumo;
- coincidencia temporal;
- calidad de la detección fijo/indexado;
- presencia de meses con referencias insuficientes;
- incidencias o datos descartados.

La interfaz puede resumirlo en un indicador de calidad o confianza, pero el detalle técnico debe quedar disponible para ELECTRICA BT.

## Revisión humana obligatoria

El sistema puede automatizar la búsqueda, normalización, simulación y generación de borrador, pero **no debe enviar un informe al cliente sin revisión de staff/admin**.

Antes de aprobar una comparación deben poder revisarse:

- facturas rectificativas;
- cambios de contrato;
- cambios de modelo fijo/indexado;
- periodos partidos;
- descuentos extraordinarios;
- servicios adicionales;
- excesos de potencia;
- energía reactiva;
- datos incompletos o sospechosos;
- referencias descartadas.

Estados previstos:

```text
borrador
revisado
aprobado
enviado
```

## Informe para el cliente

El Comparador genera un **nuevo tipo de informe**. No modifica por defecto el formato de los informes actuales del Asesor.

El informe debe ser claro y orientado al cliente, e incluir como mínimo:

- suministro analizado;
- periodo;
- comercializadora y escenario alternativo;
- modelo de precio: fijo o indexado;
- coste real del periodo;
- coste simulado;
- diferencia absoluta y porcentual;
- evolución temporal real frente a simulada;
- desglose relevante de energía, potencia y otros conceptos;
- metodología resumida;
- calidad de la comparación;
- advertencias cuando falten referencias suficientes.

Los datos de terceros utilizados como referencia deben mostrarse únicamente de forma agregada y anonimizada.

Ejemplo permitido:

> Simulación basada en 18 facturas de 6 suministros comparables.

No deben aparecer nombres, NIF, CUPS, direcciones ni otros identificadores de los suministros de referencia.

## Trazabilidad

Cada comparación debe conservar su origen para que pueda auditarse y reconstruirse.

Modelo conceptual:

```text
comparacion_id
cliente_id
suministro_id
fecha_creacion
usuario_staff
comercializadora_objetivo
modelo_precio_objetivo
periodo_inicio
periodo_fin
coste_real
coste_simulado
diferencia
diferencia_porcentaje
calidad_comparacion
metodo
referencias_utilizadas
version_algoritmo
estado
documento_generado
```

Las referencias internas pueden guardar identificadores técnicos necesarios para reconstruir el cálculo, pero estos datos no se exponen al cliente.

## Privacidad

El repositorio público no debe contener facturas reales, CUPS, NIF, direcciones, nombres de clientes ni bases de datos reales.

El Comparador aprovecha el histórico privado autorizado del Asesor, pero:

- nunca publica datos de clientes de referencia;
- nunca incluye identificadores de terceros en el informe;
- trabaja con agregados o datos normalizados cuando genera el resultado para cliente;
- conserva la trazabilidad interna con los controles de acceso correspondientes.

## Portabilidad y futura migración a CRM

La lógica del Comparador debe mantenerse desacoplada de la interfaz y de Supabase.

Conceptualmente:

```text
histórico normalizado
        ↓
motor de compatibilidad
        ↓
motor de similitud
        ↓
normalizador tarifario
        ↓
simulador
        ↓
validador
        ↓
resultado estructurado
        ↓
interfaz / PDF / futuro CRM
```

El núcleo debe poder reutilizarse como módulo, servicio o API en una futura plataforma CRM.

## No regresión

El desarrollo del Comparador no puede alterar el comportamiento de parsers ya validados ni cambiar silenciosamente datos históricos.

Antes de utilizar una factura como referencia:

1. el parser correspondiente debe reconocer el formato de forma fiable;
2. los campos necesarios para la comparación deben estar validados;
3. las incidencias de lectura deben excluir o degradar la referencia;
4. cualquier mejora del parser debe conservar sus pruebas de regresión.

## Fases de implementación

### Fase 1. Datos

- ampliar el modelo común con clasificación fijo/indexado;
- añadir evidencias y confianza de detección;
- verificar que los parsers devuelven los términos económicos necesarios.

### Fase 2. Motor de comparación

- filtros de compatibilidad;
- puntuación de similitud;
- selección de varias referencias;
- normalización tarifaria;
- cálculo del coste simulado;
- indicador de calidad.

### Fase 3. Interfaz interna

- acceso exclusivo staff/admin;
- selección de suministro, periodo, comercializadora y modelo;
- revisión de referencias;
- revisión de incidencias;
- aprobación manual.

### Fase 4. Informe

- nuevo PDF de comparación;
- gráfica de evolución real frente a simulada;
- resumen económico;
- metodología y advertencias;
- anonimización completa de referencias.

### Fase 5. Histórico y CRM

- guardar comparaciones y estados;
- versionar el algoritmo;
- mantener trazabilidad;
- preparar exportación o integración futura con CRM.
