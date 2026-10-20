# Montana AI Studio 2.0 — alcance real, herramientas y criterios de lanzamiento

## Estado comprobado (20 de octubre de 2026)

**Rama de desarrollo, PR #2 (Draft). No es producción.** La web pública permanece sin fusionar.

Funciona en pruebas automatizadas de Chromium: mezclador local de ocho pistas, importación de audio, volumen y panorama, mute/solo, edición no destructiva de inicio/recorte, movimiento básico de clips en la línea de tiempo, EQ de dos bandas, compresor, reverb de convolución, delay, respaldo de sesiones con audio y exportación WAV PCM16 a 44.1 kHz. Se han añadido medidores de nivel en desarrollo; deben pasar CI antes de darse por validados.

La grabación de micrófono utiliza MediaRecorder con guía sonora, **sin compensación de latencia** ni certificación con equipo real. No se ha implementado generación musical IA, Auto-Tune/corrección de afinación, soporte VST, monitoreo de entrada de micrófono calibrado ni masterización profesional. No confundir "las pruebas pasan" con "producto terminado".

## Herramientas pendientes y orden recomendado

1. **Medidores de pico** por pista y mezcla final; distinguir nivel PCM aproximado de true-peak y LUFS.
2. **Seguridad de grabación:** calibración de latencia, alineación automática/manual de overdubs, prueba con micrófonos e interfaces reales, control de entrada, protección contra pérdida de tomas.
3. **Corrección de afinación vocal (estilo Auto-Tune) — OBLIGATORIA.**
4. Transporte y edición DAW: cursor playhead, zoom, split de clips, deshacer/rehacer, loops, metrónomo, BPM, snap y cuantización.
5. Mezcla: EQ paramétrico, gate/de-esser, reducción de ruido, presets, buses, envíos, automatización, medidores de ganancia, limitador y masterización.
6. Proyectos: sesiones robustas de mayor duración, guardado local persistente, respaldo/versionado, auto-save recuperable, import/export de stems, nombres de canales.
7. Audio de entrega: normalización controlada, dither cuando corresponda, formatos y tasas, medición true-peak/LUFS y comprobación de clipping.
8. IA generativa con backend privado seguro y API autorizada; composición, generación musical y asistencia; validación de licencias y costos.
9. Integraciones/plug-ins externos solo si son técnica y legalmente compatibles, con pruebas en sistemas y navegadores concretos.
10. Calidad y lanzamiento: pruebas de ocho pistas reales en Chrome/Edge/Windows, hardware de audio, rendimiento móvil, accesibilidad y privacidad.

## Requisito obligatorio: corrección de afinación vocal

**No implementado ni probado aún.** "Auto-Tune" es una marca comercial; usar "corrección de afinación" o "estilo Auto-Tune" hasta contar con derechos para usar el nombre del producto.

- Motor de detección de F0 (pitch monofónico) con estimación de confianza, manejo de silencios, vibrato, notas inestables y ruido. No fingir que la detección de voz es compatible con pistas polifónicas.
- Transposición o *pitch shifting* **real**, independiente del tiempo, con gestión de formantes para preservar el carácter vocal en un modo natural y ofrecer modo efecto robótico marcado.
- Elegir tónica, escala mayor/menor/cromática, velocidad de retune, fuerza de corrección y mezcla húmeda/seca; función bypass y presets originales.
- Los valores y el estado del efecto deben restaurarse de forma idéntica al abrir sesiones y aplicarse también al WAV exportado.
- Pruebas objetivas: voz sintética afinada y desafinada con frecuencia conocida; medición en cents de entrada/salida; detección de notas incorrectas; verificación de duración inalterada, artefactos, latencia y CPU.
- Pruebas auditivas con voces reales, especialmente soneo y cambios de registro; evitar prometer "profesional" antes de escuchar el resultado.
- Seleccionar motor implementable y legalmente licenciable. Puede requerir WASM/AudioWorklet y procesamiento offline; no usar un filtro EQ como sustituto. Comparar latencia, calidad, presupuesto y licencias antes de integrar.

## Puertas para publicar como herramienta profesional

1. GitHub Actions sin fallos y tests de sonido reproducibles con archivos de referencia.
2. Una sesión completa grabada, editada, guardada, cerrada, restaurada y exportada sin pérdida de audio.
3. Comparación audible con un DAW y evaluación por usuario; rendimiento y latencia medidos con hardware real.
4. Verificación en Chrome y Edge; tratamiento seguro de sesiones inválidas, permisos de micrófono y privacidad.
5. Autorización explícita antes de fusionar PR #2 y publicar. Ningún desarrollo se declara implementado antes de pasar pruebas.
