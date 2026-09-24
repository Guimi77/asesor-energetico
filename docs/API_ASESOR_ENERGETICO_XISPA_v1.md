# API ASESOR ENERGÉTICO — XISPA

**Proyecto:** Xispa · ELECTRICA BT MALLORCA SL  
**Fecha:** 2026-09-24  
**Versión del contrato:** `1.0`  
**Estado:** BACKEND DE SOLO LECTURA IMPLEMENTADO · OPENAPI Y CREDENCIAL XISPA PREPARADOS · REGISTRO MANUAL DE ACTION PENDIENTE

## Objetivo

Contrato estable de consulta entre Xispa y el Asesor Energético:

```text
USUARIO → XISPA → CAPA DE INTEGRACIÓN / API BT → ASESOR ENERGÉTICO / SUPABASE → DATOS REALES → XISPA
```

La implementación V1 usa la Edge Function `xispa-energy-query` y es exclusivamente de lectura.

## Operaciones V1

- `search-clients`: búsqueda de clientes activos.
- `search-supplies`: búsqueda por CUPS, nombre o dirección.
- `client`: cliente, titulares y suministros.
- `supply`: suministro, última factura y potencia disponible.
- `history`: histórico vigente, periodos, maxímetros, excesos y reactiva.
- `invoice`: detalle estructurado de factura.
- `opportunities`: recomendaciones e incidencias existentes.

Todas las respuestas incluyen `schemaVersion: "1.0"`.

## Autenticación

La función admite:
1. `x-xispa-key` contra el secreto de servidor `XISPA_ENERGY_API_KEY`.
2. JWT de Supabase de usuario interno activo con rol `admin` o `staff`.

El secreto máquina-a-máquina no debe aparecer en frontend, instrucciones de Xispa ni repositorios.

## Privacidad y no regresión

La API no almacena PDFs ni copia datos de clientes a Xispa. No modifica parsers, histórico, informes, gestión manual, CAD-Unifilar, catálogo ni criterios de mediciones.

Las recomendaciones son señales para revisar; no equivalen a ahorro garantizado ni autorizan cambios de contrato.

## Estado

- Backend desplegado: sí.
- Código versionado: sí.
- Lecturas básicas implementadas: sí.
- Credencial máquina-a-máquina preparada: sí (el secreto completo no se publica).
- OpenAPI v1 creado y versionado: sí.
- Action registrada en Xispa: pendiente.
- Prueba extremo a extremo Xispa → API → Asesor: pendiente.
