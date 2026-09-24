# Política de privacidad para parsers y pruebas

**Proyecto:** Asesor Energético · ELECTRICA BT MALLORCA  
**Objetivo:** poder desarrollar parsers con documentos reales sin publicar datos reales de clientes.

## Regla principal

Los documentos reales pueden utilizarse de forma privada para analizar, depurar y validar un parser, pero **no se incorporan al repositorio público**. Las pruebas permanentes que lleguen a GitHub deben utilizar fixtures sintéticas equivalentes.

## Flujo obligatorio para un parser nuevo o una corrección

```text
DOCUMENTO REAL (privado)
        ↓
análisis / reproducción del fallo
        ↓
parser o corrección
        ↓
fixture sintética equivalente
        ↓
prueba de regresión
        ↓
escáner de privacidad
        ↓
GitHub
```

## Qué debe sustituirse antes de guardar una prueba

- nombre o razón social del titular;
- NIF, NIE o CIF;
- CUPS;
- dirección de suministro y dirección postal;
- IBAN;
- teléfono;
- email;
- número de contrato;
- número de contrato de acceso;
- número de contador;
- número de factura cuando pueda identificar un documento real;
- cualquier otro identificador de cliente o suministro.

## Qué debe conservarse

La anonimización no debe destruir el caso técnico. Deben conservarse, cuando sean relevantes:

- estructura y orden del texto;
- saltos de línea y fragmentaciones de PDF.js;
- periodos tarifarios;
- potencias, consumos e importes;
- redondeos;
- errores de OCR;
- etiquetas desplazadas;
- tablas y posiciones lógicas;
- cualquier peculiaridad necesaria para reproducir el fallo.

Si un dato identificativo afecta al parser por su longitud o formato, se sustituye por un valor sintético con formato equivalente.

## Convenciones sintéticas

Preferir valores inequívocamente ficticios:

- nombres: `CLIENTE PRUEBA ALFA`, `EMPRESA PRUEBA UNO`;
- direcciones: `C/ EJEMPLO, 1`, `AV. PRUEBA, 10`;
- CUPS: familia `ES0000000000000000AA`, `ES0000000000000001AA`, etc.;
- NIF de prueba: familia `00000001R`, `00000002W`, etc.;
- emails: dominio `example.com`;
- contratos, contadores y facturas: rangos reservados de pruebas documentados en las fixtures.

## Prohibido en el repositorio público

- PDF reales de clientes;
- exportaciones de facturas o históricos con identidad real;
- `.env`, tokens, claves privadas o service-role;
- mapas de anonimización que relacionen datos reales con sintéticos;
- capturas o fixtures que permitan identificar a un cliente real.

## Escáner automático

`tools/scan-test-pii.js` comprueba datos sensibles de alta confianza en pruebas nuevas o modificadas. El workflow `privacy-regression.yml` bloquea el cambio si encuentra un identificador que parece real.

La primera fase inspecciona **solo archivos de tests añadidos o modificados**, para no romper el repositorio por la deuda histórica ya conocida. El escaneo completo se puede lanzar manualmente y será obligatorio cuando finalice la limpieza de las pruebas antiguas.

## Herramienta de sanitización

`tools/sanitize-parser-fixture.js` ayuda a sustituir identificadores de alta confianza manteniendo el formato del texto. No sustituye la revisión humana: nombres, direcciones o layouts especialmente ambiguos deben revisarse antes de publicar.

## Regla de no regresión

Antes de sustituir una prueba basada en un documento real:

1. registrar qué comportamiento reproduce;
2. crear una versión sintética equivalente;
3. ejecutar la prueba antigua y la nueva en privado cuando sea posible;
4. comprobar que ambas producen el mismo resultado técnico;
5. publicar únicamente la versión sintética.

## Checklist de alta de parser

Un parser o corrección no se considera terminado hasta que:

- existe al menos una prueba de regresión sintética;
- el caso real original permanece fuera del repositorio;
- el escáner de privacidad pasa;
- las regresiones anteriores siguen pasando;
- no se han añadido secretos ni credenciales.
