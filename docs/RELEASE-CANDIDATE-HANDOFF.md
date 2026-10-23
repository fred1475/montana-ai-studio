# Montana AI Studio 2.0 — preparación de candidata de publicación

**Propietario:** Montana Music Production LLC · **Estado al 23/10/2026:** EN DESARROLLO; NO APTO PARA PUBLICAR.
**Mandato:** desarrollar hasta que solo falte publicar. **No publicar, fusionar a `main`, comprar servicios ni activar facturación por este documento.**

## Inventario verificado de desarrollo

- PR #2: mezclador de ocho pistas y edición local, pruebas de navegador.
- PR #3: contrato de música original y adaptador privado Google Lyria.
- PR #4: ledger D1, reservas e idempotencia (techo inicial USD 10/mes). PR #5 reduce la asignación de IA a USD 3/mes para un objetivo TOTAL de USD 10/mes.
- PR #5: entrada HTTP para acceso privado, integración D1/R2/Lyria con modelos simulados, transmisión de MP3 por propietario, cliente de importación al mezclador y laboratorio de generación con consentimiento.
- `studio.html`, `mixer-8.html` y `ai-music-lab.html` permanecen en ramas de desarrollo; sus paneles de IA **no generan música** sin origen privado configurado.
- Toda prueba de integración con proveedor usa bytes y respuestas simulados. No hay música real, clave, cuenta de proveedor, Worker desplegado ni cargos en esta etapa.

## Puertas de publicación — ninguna se omite

| # | Condición para publicar | Evidencia exigida | Situación |
|---|---|---|---|
| 1 | Mezclador de 8 pistas estable | Sesión extensa sin pérdidas, render exacto y pruebas Chromium/Edge | BETA AUTOMÁTICA |
| 2 | Editor temporal completo | Warp/estiramiento y automatización incorporados al mezclador con pruebas musicales | PARCIAL |
| 3 | Grabación y latencia real | Medición con el micrófono/interfaz del propietario al final | PARCIAL |
| 4 | Voz afinada sin daño | Preservación de formantes, naturalidad y prueba auditiva | PARCIAL |
| 5 | Master apto para entrega | WAV/estéreo/volumen/true peak/medición objetiva y escucha | PARCIAL |
| 6 | Sesiones recuperables | Copias íntegras/restauración de proyectos grandes | BETA AUTOMÁTICA |
| 7 | Composición MIDI | Exportación e importación de ritmos reales validadas | BETA AUTOMÁTICA |
| 8 | IA generativa auténtica | Servicio privado, licencia, una generación real aprobada, MP3 decodificado y costes conciliados | PARCIAL |
| 9 | Privacidad/compatibilidad | Pruebas de seguridad, accesibilidad, Edge/Chrome Windows y estrés | PARCIAL |
| 10 | Aceptación física única | Sesión final con hardware, sin rondas manuales repetitivas a mitad de desarrollo | PENDIENTE |
| 11 | Lanzamiento | Candidato RC, respaldos, rollback, autorización expresa para publicar | PENDIENTE |

## Trabajo técnico autónomo pendiente

1. Terminar edición musical, time-stretch integrado, afinación/formantes y mezcla con regresiones.
2. Construir política de cribado aplicable y auditable. Confirmación de derechos del usuario **no** sustituye la revisión real; no fingir que un regex resuelve derechos de autor.
3. Elegir decodificador MP3 que produzca PCM verificado; comprobar compatibilidad con Workers, límite de CPU/memoria y licencia. Existe una frontera `server/mp3-inspection.js` que valida PCM e integridad declarada por un decodificador **inyectado**. También dispone de una modalidad de PCM por fragmentos con recibo de consumo íntegro de bytes para reducir la memoria máxima, pero todavía NO incluye códec real ni garantía de compatibilidad Cloudflare. Un MP3 de 170 segundos a 44.1 kHz estéreo puede ocupar aproximadamente 60 MB solo en PCM de 32 bits; sumar respuesta JSON/base64, WASM, MP3 y runtime podría exceder los 128 MB por isolate de Cloudflare. Ensayar uso real de memoria y considerar arquitectura de procesamiento separada. El parser de cabecera, MIME o duración declarada **no** son decodificación.
4. Preparar Worker real y pruebas de D1/R2/Access, sin desplegar ni introducir secretos en GitHub. Probar concurrencia D1 e idempotencia contra cuentas reales solo con permiso.
5. Revisar seguridad de origen y Access en el navegador real: un Worker con Static Assets puede no pasar `ctx.access`; evitarlo. Comprobar redirecciones/login y CORS de `credentials: 'include'`.
6. Añadir recuperación y borrado autorizados de activos, retención y observabilidad segura. La conciliación financiera de los tres casos (sin cargo, cobro con audio, cobro sin audio) ya tiene contrato D1 de mantenimiento sin API pública; falta herramienta de operador real y verificación externa. Véase `docs/FINANCIAL-RECONCILIATION.md`.
7. Ejecutar stress tests, restores, exportaciones extensas y pruebas de accesibilidad en modo sin facturación.
8. Crear un candidato RC con SHA fijado y resumen de fallos cero en todas las suites. Mantener rollback a la beta pública anterior.

## Advertencia del costo TOTAL

- Google publica **USD 0.08 por canción Lyria 3.5** en nivel pagado. La cuota interna D1 propuesta para este piloto es **USD 3/mes en canciones**, hasta 37 solicitudes de USD 0.08 (USD 2.96), sin garantizar límite externo de facturación.
- Cloudflare Workers Paid tiene un cargo **mínimo USD 5/mes**. El Free tiene un límite de CPU que no podemos asumir compatible con decodificación MP3 completa; R2 Standard dispone de cuota gratuita con condiciones.
- Propuesta conservadora bajo autorización interpretada de USD 10 **TOTALES/mes**: USD 5 mínimos de Cloudflare Workers Paid + hasta USD 3 de Lyria + USD 2 de colchón para impuestos/operaciones/imprevistos. Esta suma es una planificación, **no un límite externo garantizado**. Si no se pueden configurar topes y alertas verificables, no contratar ni activar.
- El propietario **confirmó USD 10 como objetivo mensual TOTAL** para el piloto. **No se ha aprobado ningún cargo concreto ni habilitado facturación.** Si gastos fijos, impuestos o consumos potenciales no caben en el objetivo o no hay controles externos confiables, elegir arquitectura alternativa o pedir autorización explícita.

Fuentes: https://ai.google.dev/gemini-api/docs/pricing · https://developers.cloudflare.com/workers/platform/pricing/ · https://developers.cloudflare.com/workers/platform/limits/ · https://developers.cloudflare.com/r2/pricing/

## Pasos externos que requieren datos/acceso del propietario

- Confirmar si dispone de Cloudflare y Google AI Studio/Gemini API y si el modelo está habilitado para su cuenta. No solicitaremos contraseña en el chat.
- Elegir una cuenta/propiedad legal y definir controles de facturación **en el proveedor externo**: la tabla de USD 10 en D1 por sí sola no detiene todas las facturas.
- Crear Access, D1 y R2 privados, auditar permisos y mantener R2 sin dominio público.
- Asegurar la clave API en secretos gestionados y revisar condiciones de distribución comercial, contenido y watermark SynthID del proveedor.
- Autorizar el importe exacto **de una sola generación de prueba**, con material genérico, después de observar el presupuesto y un mecanismo de bloqueo externo; cotejar factura, reserva y objeto.
- Hacer la única sesión final con interfaz de audio/micrófono y aprobar el informe de aceptación.
- Conceder autorización final **separada** para publicación/fusión en `main`.

## Protocolo del laboratorio musical

- `ai-music-lab.html`: `data-api-origin=""` por defecto. Muestra letras, estilo, costo orientativo y tres consentimientos, pero el botón está desactivado sin servidor real. **El servidor valida también `confirmsCost: true` por cada solicitud** antes del ledger; una casilla marcada solo en la interfaz no basta.
- Antes de cada generación se consulta `GET /v1/usage`, incluyendo `pendingReservations` de TODOS los meses UTC. Si hay una reserva pendiente, si el conteo falta o si no hay saldo válido, no se efectúa POST. Nunca se reintenta automáticamente un POST ambiguo.
- `GET /v1/pending`: inventario de reservas sin conciliar en todos los meses, solo lectura, con ID opaco, mes y centavos; requiere Access y Origin exacto, sin letras ni identidad en respuesta. **No** ofrece cancelación/liberación desde el navegador.
- `POST /v1/generate`: verificación de dueño mediante Access, cribado, reserva en D1, Lyria, decodificación y objeto privado R2, `commit`; las claves solo en servidor.
- `GET /v1/audio/{assetId}`: la lectura necesita propietario autenticado y fila `committed`; salida MP3 para escucha/descarga o importación.
- `mixer-8.html`: su puente privado también está apagado hasta verificar Worker. Si la pista se ocupa durante la descarga o decodificación, rechaza la sustitución.
- `data-api-origin` solo se poblará con HTTPS del Worker validado para Montana Music Production LLC. No colocar JWT, emails, claves ni URLs firmadas en HTML.

## Riesgos que impiden certificar 100 %

| Bloqueo | Por qué importa |
|---|---|
| Falta decodificador real y prueba de memoria | R2 nunca debe guardar respuestas falsas/corrompidas; el procesamiento PCM de canciones completas puede sobrepasar memoria/CPU del Worker |
| Faltan cuentas y secretos privados | No se puede ensayar IA real ni asegurar gastos de infraestructura |
| Derechos y política pendientes | No se puede prometer distribución comercial autorizada sin revisar términos |
| Pruebas de hardware pendientes | No se puede certificar grabación ni master real desde CI |
| Funciones de audio aún parciales | El núcleo del estudio todavía no cumple todos los criterios establecidos |

**Definición de terminado:** once puertas aprobadas con evidencia reproducible en un SHA conocido y autorización escrita de Montana. Las aprobaciones previas al desarrollo no sustituyen la aprobación posterior de publicación.

## Referencias primarias

- Cloudflare Workers Access: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Cloudflare R2 Workers: https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- Gemini Lyria: https://ai.google.dev/gemini-api/docs/music-generation
- Precio de referencia: https://ai.google.dev/gemini-api/docs/pricing
