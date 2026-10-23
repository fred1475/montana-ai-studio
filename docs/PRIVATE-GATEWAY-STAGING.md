# Montana AI Studio 2.0 — puerta HTTP privada, sin despliegue

**Estado: borrador técnico desactivado.** Rama `develop/studio-2-0-private-gateway`, PR #5 (Draft), dependiente de PR #4 (cuota D1), #3 (Lyria) y #2 (mezclador). Sin claves, servicios, cuentas nuevas, publicaciones ni cargos.

## Qué aporta el código

`server/worker-api.js` compone una puerta HTTP privada alrededor del contrato de generación existente.

- `GET /health`: indicador genérico de componente instalado; **no** afirma que el motor genere música.
- `GET /v1/usage`: consulta privada del límite global mensual, reservado, gastado y restante.
- `POST /v1/generate`: ruta protegida para una petición futura. Necesita Cloudflare Access real con `ctx.access`, audiencia exacta, propietario autorizado, origen HTTPS exacto y consentimiento en el cuerpo. Solo admite JSON hasta 32 KiB; utiliza el ledger D1 antes de invocar el proveedor.
- `GET /v1/audio/{assetId}`: transmite un MP3 completo desde R2 **solo** después de autenticar al propietario y confirmar su reserva `committed` en D1. Exige cabecera `Origin` exacta (el cliente debe utilizar `fetch` con credenciales), comprueba MIME y tamaño, niega `Range` por ahora y fija `no-store`. No crea URL compartible ni abre R2 al público.
- `OPTIONS` habilita la prevalidación CORS únicamente para el origen exacto configurado. La solicitud real sigue exigiendo Access.
- La respuesta de generación expone únicamente el descriptor opaco que permite el contrato. No filtra claves, URLs de proveedores, MP3, facturas ni identidad.

El **interruptor financiero está apagado por defecto**. Incluso con autentificación aprobada, la petición de generación devuelve `GENERATION_NOT_ENABLED` salvo que exista la bandera explícita `PRIVATE_GENERATION_ENABLED=YES_I_APPROVE_REAL_GENERATION_COSTS` y se hayan inyectado adaptadores reales, seguros y revisados de políticas y proveedor. Esta bandera no constituye por sí sola autorización para gastar.

## Integración simulada de componentes

`server/worker-runtime.js` prepara la composición de `worker-api.js`, `d1-quota.js`, `lyria-provider.js` y `r2-audio-store.js`. La suite `tests/worker-runtime.cjs` simula un ciclo completo de petición, autorización, reserva, respuesta del proveedor, inspección de bytes, guardado privado y liquidación; verifica también rechazos de contenido, errores de proveedor, MP3 no decodificable y falta de R2. **Los MP3 del test son bytes ficticios y el inspector es un doble de prueba; no constituye una decodificación ni un archivo musical real.**

El adaptador R2 usa claves derivadas de SHA-256 de la identidad, no permite devolver un objeto sin fila D1 confirmada para el propietario y requiere `inspectMp3` confiable (con decodificación y duración real). La ruta de lectura y sus rechazos están probados con dobles de D1/R2; **no** se ha probado audio auténtico.

`mixer-8.html` contiene un panel de importación privada que permanece **deshabilitado** (`data-api-origin=""`) hasta que se verifique un Worker real. `private-music-import.js` comprueba el origen HTTPS, exige sesión de Access, limita lectura a 20 MiB y formato MP3, y solo importa al canal escogido con permiso explícito de reemplazo y una comprobación de carrera posterior a la decodificación. Las pruebas no realizan solicitudes externas. No existe todavía un flujo activo de generación ni se ha conectado la clave de Lyria al navegador. No está implementado el decodificador real ni existe punto de entrada desplegable. No se publican URL de R2.

## Dependencias todavía ausentes

Este archivo **no es un Worker desplegable por sí solo**. El operador tendrá que:

1. Seleccionar la cuenta Cloudflare y activar Cloudflare Access para el Worker, con verificación de audiencia e identidad real. Un Worker con Static Assets puede perder el contexto `ctx.access`; no usar ese despliegue para esta ruta sin comprobación.
2. Crear D1 privado y aplicar `server/schema/d1-quota.sql`. Confirmar con D1 real serialización, reservas simultáneas, idempotencia y conciliación.
3. Crear almacenamiento R2 privado para resultados musicales; validar decodificación, duración, MIME y retención; controlar recuperación por propietario y borrado consentido.
4. Inyectar el proveedor Lyria y una política de cribado auténtica. Los tests no conectan ninguna de ellas.
5. Configurar secretos privados `OWNER_EMAIL`, `ACCESS_AUD`, `STUDIO_ORIGIN`, clave de Google, y límites adicionales del proveedor. **No incluir ningún valor real en este repositorio público**.
6. Verificar derechos de distribución comercial, elegibilidad del modelo, contenido permitido, costes actualizados, alertas del proveedor y gastos asociados a Cloudflare. El límite D1 de 1,000 centavos protege las solicitudes registradas por esta aplicación, **no bloquea automáticamente todos los cargos externos**.
7. Completar la interfaz de **generación** del Studio: formulario de letra/estilo con consentimiento explícito antes de enviar datos a Google, estado de generación, recuperación de sesiones y reproducción/descarga confirmada. El puente opt-in de **importación** al mezclador ya está en la rama, pero permanece desconectado y la configuración de origen vacío es intencional. Solo se debe introducir un origen HTTPS verificado del Worker de la empresa, sin claves ni tokens en HTML.
8. Ejecutar una única prueba real mínima de generación con material genérico solo después de aprobación de gasto puntual. Comparar factura y ledger.
9. Completar las once puertas de `docs/100-PERCENT-ACCEPTANCE.md`; reservar las pruebas de micrófono e interfaz física para la fase final.

## Configuración lógica (nombres solamente)

| Configuración | Propósito |
| --- | --- |
| `STUDIO_ORIGIN` | Origen HTTPS exacto del cliente autorizado |
| `ACCESS_AUD` | Audiencia real de Cloudflare Access |
| `OWNER_EMAIL` | Identidad del único propietario autorizado |
| `DB` | Binding D1 privado |
| `PRIVATE_GENERATION_ENABLED` | Interruptor adicional para una futura prueba pagada |
| `policyScreen` | Adaptador obligatorio de políticas, inyectado mediante código confiable |
| `providerFactory` | Adaptador privado al proveedor, sin claves en cliente |

**No establecer la bandera de generación con el código actual.** No hay punto de entrada productivo, ni adaptadores de almacenamiento ni política de cribado real conectados. La cuenta personal de Suno queda intacta y la API de Suno no forma parte de este backend.

## Validación gratuita

```sh
node --check server/worker-api.js
node --check tests/worker-api.cjs
node --check server/r2-audio-store.js
node --check tests/r2-audio-store.cjs
node --check server/worker-runtime.js
node --check tests/worker-runtime.cjs
node --check private-music-import.js
node --check tests/private-music-import.cjs
node --test tests/music-generation-contract.cjs tests/lyria-provider.cjs tests/d1-quota.cjs tests/worker-api.cjs tests/r2-audio-store.cjs tests/worker-runtime.cjs tests/private-music-import.cjs
```

Las pruebas utilizan objetos simulados, sin credenciales ni llamadas al proveedor. Revisar el SHA de la rama y GitHub Actions. Aprobar CI **no certifica** confidencialidad de un entorno real, derechos comerciales, música generada, mastering, latencia física, ni el 100 % del proyecto.

## Referencias de Cloudflare verificadas

- Access y `ctx.access`: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- D1 y batch atómico: https://developers.cloudflare.com/d1/worker-api/d1-database/
- R2 privado y bindings: https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
