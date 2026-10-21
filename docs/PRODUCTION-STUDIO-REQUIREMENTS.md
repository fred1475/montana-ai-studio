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

## Grabación: ajuste manual y rescate de fuentes (en desarrollo, octubre 2026)

- Sincronización fina **manual**, no autocalibrada, de -250 a +250 ms para los canales vocales 2–8. Cuando la corrección adelanta una voz antes de t=0, la porción anterior a cero se omite en la reproducción/exportación, pero el archivo original sigue disponible; el resto se posiciona sin cambiar su tono o velocidad. Se conserva en la sesión, participa en Deshacer/Rehacer y afecta al WAV renderizado.
- La grabación con MediaRecorder de Chrome/Edge conserva el audio anterior si se deniega el micrófono, falla la grabación o la nueva toma no se decodifica. El reemplazo ocurre solo después de decodificación completa. El botón **Rescatar fuente del canal** descarga los bytes originales importados o grabados, sin aplicar efectos; funciona también al restaurar el respaldo JSON.
- La selección del canal de grabación se conserva en las sesiones nuevas, y las sesiones antiguas usan por defecto el canal 2.
- Las pruebas incluyen tiempos exactos +-100ms en WAV, historial, respaldo/restauración, invalidación de ajustes maliciosos, micrófono simulado de Chromium, recuperación byte a byte y rechazo de permisos sin perder la toma previa.
- **Bloqueadores para producción:** medición real de round-trip, conversores, interfaces de audio y latencia del navegador/dispositivo, pruebas prolongadas, sincronización sample-accurate, respaldo automático persistente fuera del navegador y hardware físico. La grabación guía sigue sin autocompensación. Los botones de descarga requieren acción del usuario y el navegador puede restringirlos.

## Exportación de stems WAV separados (beta)

`mixer-stems.js` ofrece dos acciones manuales: exportar un WAV estéreo de un canal seleccionado y exportar todos los canales cargados como ZIP portable (STORE + CRC32, sin biblioteca externa). Los archivos WAV comienzan todos en 0:00 y terminan en el mismo instante, incluso con recortes, desplazamientos y colas de efectos, para conservar la sincronización en un DAW externo.

**Incluye en cada stem:** audio procesado elegido del canal (incluida afinación y limpieza vocal cuando estén activadas), EQ, compresor, reverb, delay, volumen del propio canal y panorama. **No incluye:** mute/solo, volumen maestro, limitador maestro ni metrónomo. El ZIP incorpora `LEEME-STEMS.txt` para documentarlo. No exporta un master; cada pista es independiente aunque el mixer esté en modo solo o mute.

La exportación ZIP sin compresión tiene un tope de 145 MiB y se comprueba antes de crear los WAV para reducir el riesgo de agotar memoria. Para sesiones que superen el límite, se permite exportar pistas individuales. El WAV individual también tiene límite de 145 MiB, no se garantiza la exportación de material de larga duración en hardware de poca memoria. No hay exportación de buses o stems agrupados, edición avanzada ni masterización profesional.

Las pruebas previstas cubren canales aislados con notas de frecuencias distintas, WAV alineados, offset, silencio previo, mute/solo ignorados por diseño, colas de efectos, descarga individual, estructura del ZIP y rechazo preventivo de archivos excesivamente grandes.

## Nueva etapa verificada: fades de entrada/salida por clip

El módulo `mixer-fades.js` añade fundidos de entrada y salida de 0 a 5 segundos para cada uno de los ocho canales, sin cambiar los audios originales. Las rampas lineales actúan antes de los efectos de canal; las colas de reverb y delay quedan preservadas. Si un fragmento es más corto que la suma solicitada de ambos fundidos, se reducen proporcionalmente para evitar una automatización inválida.

Los ajustes participan en reproducción, guía de overdub, exportación WAV completa, WAV individual y ZIP de stems alineados. Quedan guardados en el JSON de la sesión, admiten Deshacer/Rehacer y al restaurar sesiones antiguas el fundido por defecto es cero. Las pruebas automáticas de Chromium comparan la energía PCM en el principio/centro/final, el WAV del stem, el historial, la conservación de la duración y el rechazo de parámetros fuera de rango sin dañar el proyecto.

**No es un editor de clips con herramientas de corte múltiple:** sigue pendiente separar/duplicar/pegar regiones, preescucha de edición, crossfades, automatización de volumen y la edición sample-accurate. Los resultados de laboratorio no sustituyen escucha musical con grabaciones reales.

## Protección recuperable de sesiones — probado en Chromium

`mixer-recovery.js` añade **autoguardado voluntario** en IndexedDB. El usuario debe activarlo explícitamente, se intenta guardar cada 45 segundos cuando hay cambios y también mediante el botón “Guardar recuperación ahora”. El respaldo local contiene una copia completa de los ajustes y los bytes originales de las pistas, usando la misma validación que la sesión JSON descargable. Al restaurar el navegador, se indica que hay recuperación, pero **no se carga silenciosamente**, sino únicamente al pulsar Restaurar. Borrar la copia exige confirmación y no elimina el audio abierto ni JSON externos. La preferencia de activación se conserva solo en el navegador.

La transacción IndexedDB es atómica: un error de cuota o almacenamiento no reemplaza una copia anterior. Las pruebas end-to-end prueban optar por activar, restaurar después de recargar, audio original idéntico byte a byte, rechazo de copias inválidas conservando el proyecto activo y eliminación segura. **Límites:** navegador/dispositivo específico, cuotas del navegador, modo incógnito, bloqueos o borrado de almacenamiento. No hay sincronización nube, servidor o copias automáticas externas. Sigue siendo necesario descargar y almacenar JSON aparte.

## Normalización PCM y mediciones básicas — prueba de niveles completada

`mixer-export-levels.js` añade normalización **opcional y enlazada en estéreo** de picos de muestra del WAV maestro, objetivo ajustable entre -6 y -0.5 dBFS, con un máximo de aumento de +12 dB para reducir el riesgo de amplificar ruido débil. Se aplica antes del limitador opcional y no afecta la exportación de stems ni los originales. Muestra pico PCM, RMS estéreo y factor de cresta. La configuración se conserva al guardar y restaurar proyectos.

Las pruebas incluyen picos PCM medidos del WAV exportado, conservación del balance estéreo, bypass por defecto, límite de amplificación, silencio, respaldo/restauración y rechazo de configuraciones incorrectas. **No son mediciones LUFS integradas, true-peak, EBU R128 ni masterización profesional.** Todavía faltan análisis y ajuste de loudness por estándar, intersample peaks, comparación auditiva y pruebas con músicas completas.

## Avance de medición EBU R128 — comparación independiente con FFmpeg

**Ver método y tolerancias exactas en [VALIDACION-EBU-R128.md](./EBU-R128-VALIDATION.md).** El motor ya implementa integrado, momentáneo (400ms), corto plazo (3s), máximos, LRA provisional (<60s) y true-peak 4× con filtro sinc Blackman de 40 coeficientes. Se contrasta mediante GitHub Actions con **FFmpeg `ebur128`**, en cinco familias de señales sintéticas, incluido bajo, cambios de nivel, ruido y frecuencias altas. El resultado sigue siendo **NO CERTIFICADO**: el error de pico en tonos agudos y la validación restante de EBU Mode impiden afirmarlo.

## Nuevo hito: análisis LUFS estimado y true-peak 4× (octubre 2026)

`mixer-loudness.js` implementa análisis opcional del WAV maestro después de aplicar normalización/limitador. Utiliza dos filtros en serie tipo K-weighting para los canales estéreo, ventanas de energía de 400 ms con saltos de 100 ms y un umbral absoluto de -70 LUFS más umbral relativo de -10 LU; el resultado es una **estimación integrada** de loudness con compuerta. Estima los picos entre muestras reconstruyendo fases intermedias 4× mediante filtros de sinc con ventana. Presenta LUFS, dBTP estimado y dBFS de pico de muestra. El medidor se ejecuta voluntariamente para evitar costos en el navegador; no cambia el sonido exportado, la mezcla original ni los stems. Si el análisis falla, aún es posible descargar el WAV.

Las pruebas automatizadas verifican escalado de +6 dB, pico reconstruido entre muestras, rechazo de audio inválido y sin energía, interfaz de Chromium, generación de WAV y persistencia de ajustes. **NO está certificado contra un medidor EBU R128 o ITU BS.1770 de referencia**, y su estimación por sinc 4× no garantiza cumplir todos los márgenes de true-peak. Todavía se requiere calibración con señales de referencia, escucha real y pruebas con canciones completas.

## Nuevo hito: loop no destructivo de una región por canal

Cada canal admite **1–8 repeticiones** de la región establecida mediante recortes inicial y final. El navegador utiliza repetición del AudioBufferSourceNode sin sobrescribir ni copiar el archivo original. El cambio afecta a la reproducción, mezcla WAV, stems, guía de grabación, duración visual de la línea de tiempo y al guardado/restauración del proyecto. Participa en Deshacer/Rehacer. Las sesiones antiguas se cargan con una sola reproducción (valor por defecto 1). La exportación maestra limita el tamaño calculado ANTES de iniciar el renderizado para reducir el riesgo de quedar sin memoria con loops largos.

Las pruebas incluyen voces sintéticas con secciones activas/silenciosas, tres repeticiones audibles, precisión temporal, stems, respaldo/restauración, validación de 1–8 y compatibilidad hacia atrás. **No es un editor multipista con regiones independientes, time-stretch, grid/snap, crossfades entre fragmentos ni MIDI.**

## Editor de clips: hasta cuatro fragmentos independientes por pista (beta)

`mixer-split.js` permite **hasta cuatro fragmentos independientes por canal**, que referencian la **misma fuente original**. El usuario puede empezar con «Dividir por mitad», añadir o quitar cortes sucesivos, ajustar los tres puntos de corte y colocar por separado los fragmentos 2, 3 y 4; también puede mover todos los fragmentos arrastrándolos o con flechas en la línea de tiempo. Cada región es una fuente WebAudio independiente y pasa por la misma cadena de efectos del canal; los fragmentos se ven separados en la línea de tiempo. El WAV maestro, las pistas individuales (stems) y la guía de grabación usan esas posiciones. El corte y la posición independiente están en el JSON y en la recuperación IndexedDB; se admiten Deshacer/Rehacer y lectura de sesiones antiguas (sin división).

Límites intencionales: **máximo cuatro fragmentos por pista**, no hay aún fragmentos ilimitados, operaciones copy/paste, biblioteca de clips, edición con zoom sample-accurate, crossfade automático ni time-stretch. La división solo se permite con `Repetir región = 1`. Los fundidos generales del canal se aplican por fragmento cuando están activados; escuche las transiciones para evitar chasquidos. No se borra material del archivo fuente. Los segmentos fuera del tiempo cero se limitan a la línea de tiempo del proyecto.

Pruebas incluidas: una fuente que contiene 330 Hz y 660 Hz en mitades sucesivas, más una prueba multiclips con tonos de 220/440/880 Hz, cuatro fragmentos, cambios independientes de posición y fragmentos que se superponen o dejan silencio, movimiento de la segunda región para insertar silencio, comprobación de ambas frecuencias en PCM16 real, stems alineados, duración, undo/redo, integridad al guardar/restaurar y rechazo de posiciones de corte inválidas sin destruir el proyecto activo. El editor **sigue en desarrollo** hasta ampliar el manejo de clips y las pruebas con audio musical complejo.

## Crossfades no destructivos en fragmentos contiguos (beta, octubre 2026)

`mixer-crossfade.js` incorpora transiciones cruzadas **optativas por pista**, con dos curvas audibles:
- **Potencia igual**: ganancia `cos(πx/2)` en el fragmento saliente y `sin(πx/2)` en el entrante.
- **Lineal**: ganancia `1−x` en el saliente y `x` en el entrante.

Al activarlo, el sistema calcula el intervalo de solapamiento real entre fragmentos consecutivos procedentes de la misma pista (hasta **3 segundos** por transición). La curva se programa con automatización WebAudio sobre la ganancia individual de cada fragmento, **antes de la cadena de EQ, compresor, reverb y delay del canal**. Los fundidos generales de entrada/salida se conservan en una capa aparte. La misma automatización se aplica al monitor en directo, la guía de grabación, WAV maestro y WAV/stems individuales. El origen del audio no se modifica.

Para evitar transiciones ambiguas, el modo activo requiere fragmentos ordenados de izquierda a derecha, sin fragmentos anidados ni triple superposición durante la misma transición. Cuando el modo está desactivado, se conserva el comportamiento antiguo de mezclado simultáneo sin cruces. Las preferencias de cada pista se guardan/restauran de forma validada en el JSON y autoguardado, y están incluidas en Deshacer/Rehacer. Las sesiones antiguas mantienen crossfade desactivado.

`tests/mixer-crossfade.cjs` comprueba dos tonos en fragmentos solapados, atenuación real de la entrada y la salida, diferencia PCM entre potencia igual y lineal, stems, continuidad de duración, historial y restauración retrocompatible. **Limitación:** esto no reemplaza crossfades automáticos para cortes ilimitados, edición sample-accurate de extremos, elastic audio ni evaluación acústica con voces reales. La potencia igual puede aumentar el nivel cuando dos señales estén correlacionadas; escuchar y verificar pico final.

## Herramienta nueva: copiar y pegar clips sin duplicar audio (beta)

`mixer-clipboard.js` añade **hasta cuatro instancias copiadas** a cada una de las ocho pistas. El usuario puede elegir cualquiera de los fragmentos originales del canal (1–4), seleccionar el tiempo de pegado en la canción y reutilizar ese mismo fragmento varias veces. Los clips pegados apuntan al buffer de audio ya cargado; no se reencodan ni se insertan múltiples copias binarias del origen en el respaldo JSON. Las instancias aparecen en la línea de tiempo y pueden moverse con el ratón o las flechas.

La planificación de regiones se ordena temporalmente antes de reproducirlas y exportarlas, de modo que las copias se incluyen en el WAV maestro, WAVs individuales, ZIP de stems y guía de referencia para grabación. Deshacer/Rehacer cubre el número de copias, la elección de fragmento y la posición. La sesión JSON y el autoguardado IndexedDB conservan el número de copias y sus referencias, y validan de forma atómica el índice del fragmento, el límite de cuatro y la posición entre 0 y 300 s. Sesiones antiguas continúan sin copias. Reemplazar el audio original descarta automáticamente las copias de esa pista para evitar referencias obsoletas.

Prueba `tests/mixer-clipboard.cjs`: dos tonos distintos como fuente, copia separada de cada uno con intervalos silenciosos, medición de frecuencias en PCM16 real y en stem, historial de edición, límite máximo, restauración y rechazo de referencias inválidas.

**Limitaciones:** solo copia/pega dentro de la misma pista y únicamente fragmentos de su fuente original, no entre canales ni desde fuentes externas. El límite es cuatro copias adicionales a los cuatro fragmentos originales por pista, no una edición ilimitada. Los crossfades automáticos solo se habilitan cuando la ordenación y superposición de los fragmentos forman pares válidos. No garantiza ausencia de clics en cortes arbitrarios, elastic audio, MIDI ni edición sample-accurate de una forma de onda.

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
