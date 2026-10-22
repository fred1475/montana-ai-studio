# Montana AI Studio 2.0 — contrato de generación musical IA (sin proveedor)

**Estado: preparación de infraestructura, no generador funcional.** Este hito
introduce `server/music-generation.js` y pruebas. La página sigue siendo
estática; **no existe endpoint público de generación, modelo conectado,
cuenta de proveedor, servicio desplegado ni gasto autorizado**.

## Entrada permitida

Un backend futuro debe aceptar un objeto JSON con exactamente:

| Campo | Regla |
|---|---|
| `requestId` | UUID de idempotencia, creado para un solo intento de contenido |
| `prompt` | Texto de 10–1400 caracteres, sin caracteres de control |
| `style` | Descripción opcional, máximo 240 caracteres |
| `mode` | `instrumental` o `vocal` |
| `durationSeconds` | Entero entre 15 y 180 segundos |
| `language` | Opcional, `es` o `en` |
| `confirmsRights` | Debe ser `true`; afirmación del solicitante, no verificación legal |
| `consentToSendPrompt` | Debe ser `true`; consentimiento explícito antes de enviar al tercero |

No se aceptan campos de identidad, proveedor, modelo, clave, precio, URL,
cuenta de pago ni callback desde el cliente. El servidor autentica la sesión
de forma independiente. La revisión de política de contenido y las licencias
específicas del proveedor se delegan a un `screen()` seguro, obligatorio.

## Ciclo de una solicitud

1. Autenticación y comprobación del permiso de generar.
2. Validación estricta de la solicitud y consentimiento.
3. Cribado de políticas sin invocar al proveedor si falla.
4. Reserva **atómica y duradera**, implementada en un futuro backend, de cuota,
   presupuesto y clave de idempotencia por usuario. El hash SHA-256 del contenido
   ayuda a impedir que un `requestId` se reutilice para contenido distinto.
5. Llamada al adaptador del proveedor solo tras obtener la reserva.
6. Resultado interno reducido a un identificador opaco, MIME y duración; las
   URLs firmadas, claves y datos internos no salen de este contrato.
7. Confirmación duradera del activo y el consumo de cuota.

Si el proveedor confirma de forma fiable que **no hubo cargo**, se puede
liberar la reserva ante un fallo. Con timeout, respuesta inválida, estado de
cobro incierto o error al confirmar, devolver `RECONCILIATION_REQUIRED` y
mantener la reserva hasta revisión. No reintentar a ciegas un servicio que
puede haber facturado; tampoco duplicar generaciones durante solicitudes
simultáneas. El adaptador de cuotas debe comprobar que la repetición usa el
mismo usuario, UUID y huella del contenido.

## Pendiente antes de activar un solo usuario

- Escoger proveedor con licencia y permisos de distribución comercial
  compatibles con Montana Music Production LLC, voz en español y el tipo de
  contenido previsto; leer los términos vigentes al contratar.
- Presupuesto máximo mensual/diario y coste por trabajo definido y autorizado
  por el propietario. Implementar cuota transaccional con persistencia y
  reconciliación de estados después de caídas del servidor.
- Servicio privado desplegado, autenticación real, almacenamiento cifrado,
  secretos en el servidor, control de origen, límite de solicitudes, seguimiento
  de tareas, expiración, borrado de activos y política de privacidad.
- Moderación/cribado real según el proveedor, revisión de derechos de entradas,
  licencia de resultados, consentimiento informado y trazabilidad.
- Pruebas de integración reales con el proveedor y datos de demostración,
  evaluación de costes, seguridad, concurrencia distribuida, auditoría de
  gastos, calidad musical, voz, artefactos y aceptación del propietario.

## Prueba automática

Ejecutar `node --test tests/music-generation-contract.cjs`. Los casos incluyen
entrada maliciosa, falta de autenticación/consentimiento, rechazo de política,
cuota, reintento concurrente, idempotencia, respuesta insegura y fallas con
coste ambiguo. Todos los adaptadores de pruebas son **simulados**; ninguno
hace solicitudes externas ni genera audio real. Esta fase **no cierra** la
puerta 8 del documento de aceptación.
