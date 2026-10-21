# Montana AI Studio 2.0 — Puertas de lanzamiento y validación

Fecha de revisión: 2026-10-20. Repositorio `fred1475/montana-ai-studio`, rama protegida `develop/studio-2-0-mixer-mvp`, PR #2 en borrador. La versión pública **NO debe publicarse/fusionarse sin aprobación del propietario**.

## 1. Capacidades implementadas y probadas automáticamente (beta)

- Mezclador local de 8 pistas, volumen, panorama, EQ, compresión, reverb, delay, mute/solo, medidores.
- Línea de tiempo, recortes, loops, hasta 4 fragmentos por pista, hasta 4 copias enlazadas, crossfades y BPM snap; Deshacer/Rehacer.
- Grabación con MediaRecorder, guía de reproducción, rescate de fuente, alineación manual.
- Herramientas vocales optativas de puerta de ruido/de-esser y afinación monofónica **experimental y limitada**, preservando fuente original.
- WAV maestro PCM16, limitador de picos de muestra, normalización opcional, stems individuales/ZIP.
- Medición orientativa LUFS integrado/M/S, LRA, true-peak estimado 4×, e informe JSON de auditoría con CRC32 del WAV exacto.
- Sesiones JSON y recuperación local voluntaria IndexedDB, sin restauraciones automáticas.
- **Preparado para revisión final del hardware:** `hardware-check.html` obtiene permisos, enumera dispositivos, captura prueba mono con AudioWorklet, analiza niveles digitales/saturación, exporta WAV/JSON.
- El mezclador permite **seleccionar una entrada de audio** detectada para grabar, sin persistir los identificadores.
- Tests automatizados de Chromium con micrófono **simulado**, PCM medido, registros JSON, regresión, compatibilidad anterior y comparación de loudness con FFmpeg.

## 2. Bloqueos de lanzamiento profesional pendientes

Estos requisitos **NO están completados** y no se deduce su cumplimiento de una suite verde:

- **Afinación vocal profesional:** algoritmo probado solo en fragmentos breves; faltan preservar y validar formantes, vibrato, fraseo largo y artefactos con voces reales y un comparador perceptual.
- **IA musical generativa integrada:** requiere proveedor elegido, contrato/API permitida, autenticación/consentimiento, presupuesto autorizado, privacidad y pruebas del servicio real. Ninguna IA de generación musical se ha integrado como backend fiable en este estudio.
- **Calibración de latencia:** aún falta una prueba física sincronizada de loopback de interfaz/micrófono, compensación reproducible de hardware, validación de drivers y varios tamaños de búfer. Seleccionar dispositivo **no es calibrar latencia**.
- **Masterización validada externamente:** medidor R128/true-peak sigue sin certificación EBU/ITU. Debe verificarse con la suite oficial legalmente autorizada y un medidor de referencia, incluyendo señales adversarias, frecuencias de muestreo, colas y codificación de distribución.
- **Pruebas de aceptación real:** voces y beats propios consentidos, escucha de artefactos, coherencia y compatibilidad de la interfaz, latencia, clipping por hardware, estabilidad bajo sesiones largas, varios navegadores y accesibilidad.
- **Editor profesional completo:** copia entre canales, edición de clips ilimitados, cuantización de eventos sample-accurate y time-stretch/warp todavía faltan.

## 3. Aceptación diferida del usuario (NO pedir hasta el final)

El usuario decidió: **terminar primero todo el desarrollo y análisis automático; ejecutar las pruebas manuales de interfaz y material real una sola vez en la fase final**. No pedir WAV de voz, detalles de interfaz, conexión o gastos intermedios.

El candidato `RC` debe:
1. Aprobar sintaxis, browser-tests y copias de seguridad en GitHub; cero pruebas fallidas.
2. Tener registro de versiones, limitaciones, procedimientos para respaldo y restauración de proyectos.
3. Acordar con el usuario los proveedores de IA y presupuesto, solo cuando esa integración esté lista para decisión.
4. Realizar **en la validación final** la prueba física de audio/latencia y el protocolo de escucha con material autorizado.
5. Obtener **aprobación explícita de publicación** antes de cambiar `main`.

Estado actual: **beta probada automáticamente; NO RC, NO 100 % terminado, NO certificación oficial**. No asignar porcentaje objetivo a criterios no validados.
