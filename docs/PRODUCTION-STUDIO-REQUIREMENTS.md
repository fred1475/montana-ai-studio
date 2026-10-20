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

## Hito experimental: primera corrección real (no profesional)

Archivo `pitch-lab.html` junto con `pitch-engine.js` (sin llamadas a servidor). Se implementa estimación de F0 por autocorrelación y síntesis PSOLA por nota monofónica sostenida; objetivo de nota cromática, mayor o menor, tonalidad e intensidad, con exportación WAV. **No admite todavía melodías cambiantes, glides, vibrato complejo, consonantes ni mezclas polifónicas como uso garantizado.** La calidad de timbre y formantes no ha sido validada con voces reales; pueden aparecer artefactos. La prueba sintética de una nota aislada no certifica una canción.

La prueba se somete a GitHub Actions antes de considerarse aprobada. Integración directa a canales del mezclador aún pendiente; usar solo como laboratorio separado.

## Nuevo hito del laboratorio: corrección de frases con varias notas (20 oct 2026)

El archivo `pitch-melody.js` añade un **modo experimental separado** de segmentación por ventanas y corrección por tramos utilizando PSOLA. En `pitch-lab.html`, el artista selecciona **Una nota sostenida** o **Frase de varias notas**. El segundo admite por ahora frases monofónicas de 0.65–10 segundos con 2–12 notas claras, reconoce cambios de nota y mantiene la duración al exportar WAV.

Se añadieron pruebas de dos notas secuenciales con frecuencias distintas para verificar el procesamiento y la exportación real desde Chromium. **Aprobación automatizada no equivale a certificación vocal.** Quedan por evaluar respiraciones, consonantes, ruido, vibrato, glides, afinaciones rápidas, límites entre sílabas, voces estéreo, timbre, formantes y artefactos; las pruebas de estudio siguen pendientes.

No se integra todavía como efecto en tiempo real o en los canales del mezclador: el módulo se prueba por separado. No denominarlo 'Auto-Tune' comercial ni prometer funcionamiento sobre una canción completa.

## Hito siguiente: afinación vocal integrada al mezclador — beta

`mixer-pitch.js` ofrece controles experimentales para canales 2–8 y NO modifica los originales. Permite cambiar tonalidad/escala, intensidad y modo de nota sostenida o frases breves; procesa fuera de tiempo real, ofrece bypass original/corregido y usa el buffer seleccionado en reproducción, grabación de referencia y exportación WAV. El archivo de sesión conserva la fuente original y ajustes de afinación; al restaurarlo reconstituye la señal corregida cuando corresponde. Las sesiones anteriores sin ajustes de afinación continúan funcionando.

Pruebas GitHub Actions: audio sintetizado desafinado -> WAV corregido de frecuencia objetiva; bypass -> WAV con frecuencia original; duración constante; respaldo/restauración y rechazo de configuración inválida sin destruir la sesión anterior. Este hito no avala grabación real, calidad de formantes ni voces humanas.

**Bloqueadores:** voces reales, latencia, afinación cambiante compleja, formantes, glides y consonantes, rendimiento con pistas largas, monitorización real y preservación auditiva del timbre. No usar marca comercial Auto-Tune para denominar el producto propio.

## Nuevas herramientas comprobadas: edición y metrónomo

- `mixer-history.js`: historial limitado a 80 ediciones de posición y recortes, con botones Deshacer/Rehacer. Se reinicia de forma segura al importar nuevos audios, concluir una nueva toma y restaurar una sesión. No existe todavía historial de efectos, split, grabaciones o cambio de archivos.
- `mixer-metronome.js`: metrónomo real con cuatro tiempos, clic acentuado en el primero, tempo ajustable de 40 a 240 BPM, uso en reproducción y grabación de referencia. **No se incluye en el audio WAV exportado** ni en la pista registrada por MediaRecorder, salvo filtración acústica a través del micrófono; usar audífonos.
- Las pruebas de Chromium verifican historial, programación de clics, parada, no contaminación del WAV y conservación del BPM tras guardar/restaurar.
- Pendiente antes de publicar: pruebas manuales de metrónomo sincronizado con interfaces reales, latencia, temporización prolongada, time stretching, metrónomo con preconteo y automatización.

## Nueva fase: limitador maestro de exportación (muestra, no true-peak)

`mixer-limiter.js` añade un limitador **opcional** y enlazado en estéreo, aplicado al WAV exportado, con techo de picos de muestra de -6 a -0.5 dBFS, preataque y recuperación. Usa el mismo cambio de ganancia en ambos canales para conservar el balance estéreo. Permite conservar y recuperar ajustes desde sesiones anteriores o nuevas. Se desactiva por defecto; no cambia la escucha en vivo ni los originales.

**No constituye masterización ni certifica true peak, LUFS, ausencia de intersample clipping o ausencia de distorsión audible.** La fuente puede saturar antes de entrar al limitador; usar ganancias moderadas y revisar escucha real. Las pruebas objetivas cubren techo PCM, estímulo impulsivo, balance estéreo, comportamiento transparente sin picos excesivos, salida del navegador y respaldo/restauración. La calidad subjetiva y el rendimiento con canciones reales siguen pendientes.

## Nueva fase: limpieza vocal gate y de-esser — beta verificada

Los archivos `mixer-vocal-dsp.js` y `mixer-vocal-clean.js` permiten activar **puerta de ruido** y **de-esser de banda aguda** por separado en los canales vocales 2–8. La puerta utiliza estimación RMS enlazada entre canales y apertura/cierre suavizados; el de-esser aplica atenuación dinámica de contenido agudo a partir de un umbral. Se procesan copias de audio de forma local y no destructiva antes de reproducir y exportar; los ajustes y su estado se guardan en la sesión JSON.

Pruebas incluidas: reducción medida del ruido de bajo nivel en PCM, reducción real del componente agudo de una señal con sibilancia sintética, preservación comparativa de la fundamental vocal, bypass sin modificaciones, compatibilidad de audio estéreo, exportación WAV, persistencia y rechazo de sesiones inválidas sin destruir el proyecto activo.

**Limitaciones importantes:** no es separación de voz, reparación espectral ni eliminación completa de ruido. El de-esser utiliza una separación simple de frecuencias y puede causar artefactos o pérdida de brillo; la puerta puede cortar consonantes suaves. Falta probar voces humanas reales, ruido ambiental variable, rendimiento con tomas largas y calidad musical mediante escucha. No se han integrado motores IA de limpieza, medición LUFS/true-peak ni latencia calibrada.

## Requisito obligatorio: corrección de afinación vocal

**Prototipo restringido implementado; función profesional completa todavía NO implementada.** "Auto-Tune" es una marca comercial; usar "corrección de afinación" o "estilo Auto-Tune" hasta contar con derechos para usar el nombre del producto.

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
