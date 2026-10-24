# Montana AI Studio 2.0 — conciliación financiera privada

**Solo desarrollo, sin cuentas ni operaciones facturadas.** Este documento orienta al responsable de la cuenta cuando una solicitud a Google pudo generar un cargo, pero la aplicación no puede confirmar un MP3 en R2 o el `commit` falló.

## Regla de seguridad principal

La ausencia de MP3 o una respuesta de error **no prueba** que el proveedor no haya cobrado. La reserva `reserved` queda bloqueada y no caduca automáticamente. La primera versión piloto permite una sola reserva abierta en todo el sistema, incluso si cambia el mes UTC.

`GET /v1/usage` muestra `pendingReservations` y `GET /v1/pending` revela al dueño (Access + Origin exacto) hasta ocho identificadores de reserva, con mes e importe. Son **solo lecturas**. No existe una ruta HTTP para liberar fondos, marcar facturas o modificar reservaciones.

## Comprobación humana antes de cualquier asiento

1. Mantener apagada `PRIVATE_GENERATION_ENABLED`; documentar reserva, mes UTC y referencia privada de incidencia.
2. Consultar la factura/uso real de Google correspondiente a esa generación. Una petición HTTP fallida o una pestaña cerrada no determina cargo cero. No compartir capturas con credenciales ni datos personales.
3. Verificar que no existe un activo recuperable para esa reserva en R2 privado y comprobar el estado en D1. Recuperar el MP3 confirmado si existe, siempre priorizando la preservación del audio.
4. Resolver exactamente uno de estos resultados, con comprobación por una persona autorizada:

| Resultado comprobado | Acción de mantenimiento **solo en servidor** | Efecto en presupuesto |
|---|---|---|
| El proveedor NO cobró, con evidencia inequívoca | `quota.release(reservationId)` | Reserva liberada, solicitud original no reutilizable |
| El proveedor cobró y hay MP3 válido recuperable | `quota.commit(reservationId, asset)` luego de validación íntegra y R2 | Reserva convertida en gasto; el dueño puede escuchar |
| El proveedor SÍ cobró y NO existe MP3 recuperable | `quota.settleChargedWithoutAsset(reservationId, {providerCharged:true,assetUnavailable:true,evidenceRef:'ticket_...'})` | Reserva convertida en gasto, sin activo; debe explicarse claramente al propietario |
| No es posible determinar el cargo | **No efectuar mutación**; reserva sigue abierta | Se bloquean nuevas generaciones hasta resolver |

La llamada de mantenimiento `settleChargedWithoutAsset` requiere dos confirmaciones booleanas y una referencia opaca de auditoría de 8 a 128 caracteres; no expone HTTP público. Es una barrera de software, no una prueba automatizada de la factura: el operador debe verificar el hecho externo. La tabla D1 usa el estado `charged_without_asset`, no reproduce la solicitud ni crea activo ficticio.

## Consultas internas de solo lectura

Estas consultas únicamente sirven para verificar filas en una D1 **privada** cuando se disponga de acceso oficial y autorización. No se han ejecutado en ninguna base real:

```sql
SELECT month, limit_cents, reserved_cents, spent_cents
FROM monthly_budgets ORDER BY month DESC LIMIT 12;

SELECT reservation_id, month, cost_cents, state,
       asset_id, reconciliation_reference
FROM reservations
WHERE state IN ('reserved','charged_without_asset')
ORDER BY month DESC, reservation_id ASC
LIMIT 20;
```

No guardar letras, prompts, nombre real, email ni clave del proveedor en las referencias de conciliación.

## Bloqueos que persisten antes de lanzar

- Validar cotización y limitadores **externos** de facturación. USD 10/mes es solo el límite de la aplicación.
- Verificar el modelo real, la disponibilidad para la cuenta y las condiciones de uso comercial.
- Probar transacciones D1 y R2 reales con una sola generación expresamente aprobada.
- El decodificador MP3 real y los controles de carga/memoria de Cloudflare siguen pendientes; no activar producción sin ellos.
- Preparar una herramienta operativa autenticada fuera de las rutas web para invocar los métodos de conciliación con auditoría. Ninguna conciliación real se ha efectuado.

**No hay publicación ni activación de cobros autorizada por este runbook.**
