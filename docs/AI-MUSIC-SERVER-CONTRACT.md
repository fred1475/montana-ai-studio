# Montana AI Studio 2.0 — contrato de generación musical IA (integración pendiente)

**Estado: proveedor de referencia seleccionado para preparar integración, todavía no generador funcional.** Este hito
introduce `server/music-generation.js`, un adaptador privado experimental `server/lyria-provider.js` y pruebas simuladas. La página sigue siendo
estática; **no existe endpoint público de generación, modelo conectado,
cuenta de proveedor, servicio desplegado ni gasto autorizado**.

## Entrada permitida

Un backend futuro debe aceptar un objeto JSON con exactamente:

| Campo | Regla |
|---|---|
| `requestId` | UUID de idempotencia, creado para un solo intento de contenido |
| `prompt` | Texto de 10–1400 caracteres, sin caracteres de control |
| `style` | Descripción opcional, máximo 1,000 caracteres (compatible con el formato creativo de Montana) |
| `lyrics` | Letra original opcional, máximo 5,000 caracteres; permite saltos de línea |
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

## Decisión de producto — 23 octubre de 2026

- **Candidato inicial:** Google Lyria 3.5 mediante Gemini API (sujeto a verificación de la cuenta, elegibilidad y licencia antes de desplegar).
- **Control presupuestario propuesto y aceptado:** techo de **USD 10 por mes** para evaluación; no es una suscripción contratada y no se autoriza un cargo ni activación automática con este documento.
- **Precio público de referencia en la fecha de evaluación:** USD 0.08 por canción, sujeto a cambios y a facturación real. El techo debe aplicarse mediante reserva atómica en servidor, con persistencia, no mediante una etiqueta visual.
- **Prioridades:** canciones originales en español puertorriqueño, letra hasta 5,000 caracteres, STYLE hasta 1,000, duración objetivo 170 segundos no garantizada por el modelo, salida que pueda importarse al mezclador.
- **Claves:** exclusivamente del lado servidor. No introducir ningún secreto en GitHub, la aplicación estática ni los archivos de sesión.
- **Estado actual:** sin API key, sin billing, sin proveedor invocado, sin salida musical real y sin cambios en `main`.

## Adaptador Lyria preparado en rama experimental

El adaptador Node.js en la rama de integración #5 usa el endpoint oficial POST /v1beta/interactions con `model: lyria-3.5` y `input` como texto. La respuesta REST se lee desde los bloques de tipo `audio` en los pasos `model_output`. Se eligió Interactions para esta integración; la documentación separada de Google también presenta `generateContent` como opción *legacy*, pero ese endpoint no forma parte del adaptador ensayado.
Prepara el prompt a partir de la entrada validada por el contrato del servidor. Recibe una
clave exclusivamente mediante inyección en backend, nunca desde HTML ni GitHub Pages.
El resultado MP3 se entrega como bytes a una función privada storeAudio, que deberá
verificar el archivo, medir la duración real, cifrarlo y guardarlo asociado al propietario.
La función devuelve únicamente un identificador opaco y metadatos mínimos.

El adaptador **no crea una cuenta, endpoint web, aplicación desplegada ni factura**.
No contiene claves reales. Las pruebas usan respuestas simuladas: no generan música
ni certifican acceso a Google. Cualquier fallo después de enviar al proveedor
se trata como coste incierto y se reserva para conciliación, sin reintento automático.

USD 0.08 es una tarifa **por canción**, no una cuota mensual fija. El techo
aceptado de USD 10 permitiría 125 peticiones como máximo aritmético si se
dedicara todo a esa tarifa; backend y almacenamiento tienen costes adicionales.

## Pendiente antes de activar un solo usuario

- Verificar el acceso a Google Lyria 3.5 y las condiciones vigentes de distribución comercial compatibles con Montana Music Production LLC, incluyendo voz en español; revisar términos antes de contratar.
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

Ejecutar `node --test tests/music-generation-contract.cjs tests/lyria-provider.cjs`. Los casos incluyen
entrada maliciosa, falta de autenticación/consentimiento, rechazo de política,
cuota, reintento concurrente, idempotencia, respuesta insegura y fallas con
coste ambiguo. Todos los adaptadores de pruebas son **simulados**; ninguno
hace solicitudes externas ni genera audio real. Esta fase **no cierra** la
puerta 8 del documento de aceptación.


### Actualización de integración (23 octubre 2026)

El adaptador utiliza la **Interactions API** documentada oficialmente, sin depender de la ruta legacy `generateContent`; la suite de pruebas en PR #5 ahora exige `POST /v1beta/interactions`, `model=lyria-3.5` y salida `steps[].content[]` con bloques `audio`.
Fuente oficial: https://ai.google.dev/gemini-api/docs/music-generation

Estas pruebas siguen siendo simuladas. **No se invocó Google** ni se validó la elegibilidad de la cuenta, precio cobrado o calidad del audio real.

### Interfaz privada de preparación

Se añadieron `ai-music-lab.html`, `ai-music-lab.js` y `private-music-generation.js` (PR #5). Son una interfaz con presupuesto consultado al backend, consentimiento para enviar datos a Google, confirmación de derechos y autorización de coste **por intento**. Los botones están desactivados hasta que se configure un servidor HTTPS privado revisado; no existe una generación activa ni una cuenta de pago. El audio confirmado se recuperaría mediante el endpoint autenticado `/v1/audio/{assetId}` y puede importarse al mezclador con el puente igualmente inactivo por defecto.

Documentación del cierre: `docs/RELEASE-CANDIDATE-HANDOFF.md`. El proyecto no está listo para publicarse todavía.
