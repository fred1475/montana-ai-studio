# Montana AI Studio 2.0 — selección técnica de decodificador MP3 (evaluación sin compra)

**Estado al 23/10/2026:** candidatos investigados; **NINGUNO desplegado, integrado ni aprobado para producción**. Esta evaluación es documentación de ingeniería, no prueba de música generada ni licencia comercial certificada.

## Requisito no negociable

El servidor solo debe aceptar el MP3 de Lyria cuando un decodificador real haya procesado la señal, identificado errores, confirmado muestras PCM finitas, duración razonable, canales/tasa estables y lectura completa verificable. Un encabezado válido, el MIME, la duración del prompt o una función de prueba simulada NO prueban decodificación.

El adaptador de `server/mp3-inspection.js` ofrece dos contratos: PCM completo y PCM por fragmentos de memoria acotada. El segundo exige un recibo del códec que acredite consumo íntegro de bytes y cero errores. **No falsificar `consumedBytes` poniendo simplemente `input.byteLength` tras llamar a un códec**: eso sería una atestación fabricada, no una verificación.

## Candidatos examinados

| Candidato | Ventaja | Riesgo/pregunta pendiente | Decisión |
|---|---|---|---|
| `mpg123-decoder` 1.0.3 (eshaz) | WASM con `decode`, `decodeFrame(s)`, PCM Float32, muestreo, errores de decodificación; Node/navegador | Compila libmpg123 LGPL-2.1 en paquete cuya capa propia es MIT; revisar obligaciones de distribución y cómo demostrar fin de stream sin memoria completa | Evaluación separada solamente |
| `minimp3-wasm` 0.1.0 (bashi + lieff) | WASM que permite leer ventanas PCM Int16; wrapper Apache-2.0 y núcleo minimp3 CC0 | Su API pública de ventanas no informa errores ni consumo real de cada byte; compila a WASM externo y requiere pruebas de compatibilidad | Evaluación separada solamente |

No basta escoger la licencia más permisiva si el códec no puede certificar el contenido. Tampoco basta una librería que se pueda instalar en Node: debe ejecutar en Cloudflare Workers o exigir arquitectura distinta dentro del techo de costos.

## Plan de validación sin facturación musical

1. Preparar audios MP3 de prueba localmente con FFmpeg (no Lyria): silencio, tono, voz autorizada, estéreo antifase, VBR, CBR, ID3, truncados, encabezados falsos y basura añadida.
2. Para cada opción, medir procesamiento auténtico en ventanas limitadas, conteo exacto de bytes consumidos, errores por frame, muestras decodificadas y consistencia de sample rate/canales. Rechazar incluso si la cabecera parece MP3.
3. Ejecutar pruebas de canciones enteras de 170 s, 44.1 kHz estéreo sin crear simultáneamente un PCM Float32 completo. Medir pico de RAM y CPU, incluyendo respuesta JSON/base64, binario comprimido y memoria WASM.
4. Confirmar cumplimiento efectivo del aislamiento Cloudflare de 128 MB por isolate y el límite de CPU del plan elegido. Repetir ante concurrencia y errores; contabilizar el presupuesto de infraestructura de USD 10 TOTAL, no solo la tarifa musical.
5. Revisar avisos, atribuciones y licencias concretas de la versión binaria antes de redistribuir o publicar.
6. Integrar únicamente el candidato que pase todo y agregar tests de regresión de MP3 reales a CI. **Si ninguno pasa, mantener bloqueada la generación de pago y revisar arquitectura**, sin mover el trabajo a un proveedor más costoso sin aprobación.

## Puerta financiera

- Presupuesto de referencia confirmado: **USD 10 por mes TOTAL** (USD 5 Cloudflare Workers previsto + máximo USD 3 Lyria + USD 2 de contingencia).
- `server/d1-quota.js` limita internamente el piloto a 300 centavos y Lyria a 8 centavos por solicitud. Máximo aritmético: **37** canciones, si la tarifa de referencia no cambia.
- Los límites D1 no son bloqueos en facturas de Google/Cloudflare. Sin alertas/topes externos verificables y autorización específica para una generación real, dejar `PRIVATE_GENERATION_ENABLED` desactivado.

## Fuentes primarias y riesgo de licencia

- Implementación `mpg123-decoder` y API: https://github.com/eshaz/wasm-audio-decoders/blob/main/src/mpg123-decoder/README.md
- Alcance de la licencia upstream (MIT en código propio, otros componentes con licencias propias): https://github.com/eshaz/wasm-audio-decoders/blob/main/README.md
- Proyecto mpg123 y LGPL-2.1: https://www.mpg123.de/
- `minimp3-wasm` (API, wrapper Apache-2.0): https://github.com/bashi/minimp3-wasm
- `minimp3` (licencia del núcleo CC0): https://github.com/lieff/minimp3
- Límite Workers, memoria y CPU: https://developers.cloudflare.com/workers/platform/limits/

**Resultado:** se mantiene abierta la puerta 8 de `docs/RELEASE-CANDIDATE-HANDOFF.md`; sin prueba real, no hay anuncio de 100 % ni publicación.
