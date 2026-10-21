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

## Nuevo hito en QA de entrega: maestro PCM24 y dither TPDF de 16 bits

El archivo `mixer-wav-export.js` permite exportar el master como WAV PCM16 (predeterminado, compatible con sesiones anteriores) o PCM24 a 44.1 kHz. El **dither TPDF opcional** se aplica únicamente al reducir a PCM16; no debe atribuirse mejora audible automática ni reducción de ruido por usarlo. Los stems individuales y ZIP admiten **PCM16/24**, en un selector independiente del master; PCM16 sigue siendo el valor por defecto. La opción se conserva en JSON y se valida antes de restaurar una sesión.

`mixer-master-audit.js` reconoce WAV PCM16 y PCM24 y mide los **bytes exactos** exportados; su límite vigente de **56 MiB** puede impedir la auditoría de un master PCM24 extenso, sin impedir descargar el WAV. La regresión `tests/mixer-wav-export.cjs` compara cabeceras, muestras con signo, CRC32 y recuperación de preferencias en Chromium. La prueba automática no equivale a mezcla/master profesional ni certifica ITU/EBU.

### Exportación de master a 48 kHz — compatibilidad con video

El mezclador permite seleccionar **44.1 kHz** (predeterminado y compatible con sesiones anteriores) o **48 kHz** para el **master WAV**, conservando 16/24 bits y dither TPDF opcional solamente en 16 bits. El render offline de Web Audio remuestrea las fuentes al formato elegido; esto **no sustituye** una prueba de calidad del algoritmo de remuestreo con contenido musical ni garantiza audio profesional por seleccionar 48 kHz. Stems y ZIP admiten 44.1/48 kHz y PCM16/24 mediante selectores independientes del master; la compatibilidad predeterminada sigue en 44.1 kHz PCM16. El límite de WAV de 150 MiB y de auditoría de 56 MiB sigue vigente; las exportaciones de 48 kHz/24 bits largas pueden superar el límite de auditoría sin impedir descargar el master. Las preferencias quedan en JSON, las sesiones antiguas usan 44.1 kHz y una frecuencia fuera de la lista se rechaza sin modificar la sesión activa.

Prueba: `tests/mixer-export-samplerate.cjs`, con una fuente de un segundo a 44.1 kHz; compara master PCM16 predeterminado y master PCM24 a 48 kHz, duración, frecuencia de un tono de 1 kHz, encabezados RIFF, CRC del informe exacto, restauración, compatibilidad de sesiones antiguas y rechazo de valores corruptos. **No hay evidencia todavía de calibración de hardware ni certificación de remuestreo.**

### Stems a 48 kHz para audio de video

Los stems WAV individuales y ZIP ahora pueden renderizarse en **44.1 o 48 kHz**, tanto PCM16 como PCM24, con opciones independientes del master. El render offline mantiene todos los stems alineados desde 0:00 y calcula límites de memoria según la frecuencia real y la profundidad de bytes. La frecuencia de stems queda guardada en la sesión JSON; los proyectos antiguos cargan 44.1 kHz por defecto y los valores inválidos se rechazan sin sustituir el proyecto actual. La guía dentro del ZIP indica la frecuencia de salida verdadera.

La regresión `tests/mixer-stems-multirate.cjs` contrasta WAV individuales y ZIP PCM24 a 48 kHz, cabeceras RIFF, duración, tono sintético sin transposición, silencio previo en una voz desplazada, independencia del master y sesiones antiguas/corruptas. Los tests con tonos no validan por sí solos la calidad perceptual de la conversión ni equivalen a un control de calidad con DAW y escucha de música real.

### Afinación experimental: protección del análisis estéreo

`pitch-engine.js` y `pitch-melody.js` usan una referencia de detección a partir de los canales originales: en contrafase pronunciada o con un lado casi silencioso, seleccionan el canal vocal con mayor energía para **evitar cancelación durante la detección**. Las muestras de origen no se sustituyen ni sobrescriben. `tests/pitch-stereo-reference.cjs` comprueba casos sintéticos de frase, tono sostenido, NaN, duración y originales intactos; `tests/mixer-pitch.cjs` también comprueba desde la UI hasta el WAV. No supone preservación garantizada de imagen estéreo, formantes ni corrección profesional de voces reales.

### Afinación estéreo: marcas PSOLA compartidas entre canales

La detección vocal estéreo ya era resistente a cancelaciones en contrafase; **la siguiente mejora aborda la corrección**: el motor ahora calcula una sola referencia de marcas de período PSOLA y reutiliza esas marcas en los canales izquierdo y derecho de una toma. En frases de varias notas, calcula una referencia por fragmento detectado. Esto evita que cada lado busque picos independientes, lo que podía alterar la relación de fase, el nivel relativo y el timing de estéreo. El algoritmo sigue siendo experimental, offline y limitado a voces monofónicas breves.

`tests/pitch-stereo-coherence.cjs` comprueba conservación de polaridad invertida y diferencias de nivel entre canales a nivel de muestra PCM, tanto en una nota sostenida como en una frase de dos notas; `tests/mixer-pitch.cjs` contrasta además el archivo WAV exportado. Se conserva el bypass y la fuente original. Las pruebas sintéticas **no demuestran calidad perceptual, preservación de formantes ni validez de corrección en voces grabadas con equipo real**.

### Inspección de tomas vocales antes del procesamiento

Ahora los siete canales vocales incluyen un botón **«Analizar fuente sin modificarla»**: inspecciona las muestras PCM decodificadas de la toma original, no la afinación, limpieza ni mezcla procesada. Presenta pico y RMS en dBFS, componente continua, correlación estéreo, muestras cerca de escala completa y avisos conservadores por señal muy débil, poco margen, posible saturación digital, offset DC, contrafase y desequilibrio estéreo. El análisis es deliberadamente manual y local, no se exporta ni sube, y se descarta al cambiar o restaurar la fuente para no reutilizar métricas obsoletas.

Los tests `tests/mixer-vocal-preflight.cjs` y `tests/mixer-vocal-preflight-ui.cjs` cubren señales sintéticas, seguridad de datos, navegador, reimportación y restauración de sesiones. **Interpretación:** una muestra cerca del máximo digital no demuestra saturación analógica, y ausencia de avisos no garantiza buena grabación, ruido aceptable ni calidad vocal. No requiere conectar equipo antes de la prueba final.

### Master: diagnóstico de fase y compatibilidad mono sobre PCM exacto

El informe JSON de preentrega (si se activa voluntariamente) ahora mide también correlación **L/R** con offset DC retirado para la correlación, RMS separado de cada lado, diferencia de niveles, componente continua, y cambio relativo de RMS al plegar la señal `(L+R)/2`. Evalúa alertas internas por correlación inferior o igual a −0.8, pérdida mono mayor de 6 dB, diferencia de niveles superior a 20 dB y offset DC absoluto ≥ 0.01. Una cancelación mono prácticamente completa tiene una marca propia para no confundir valores residuales de cuantización con audio audible. Todas las métricas se calculan sobre el **WAV exportado PCM16/24**, manteniendo su CRC32 de origen. La pantalla muestra correlación y pérdida mono junto a LUFS/TP aproximados; el botón permite descargar el informe exacto.

`tests/mixer-master-stereo-qa.cjs` verifica PCM16/24, inversión de fase, equilibrio, DC, silencio y clipping; `tests/mixer-master-stereo-browser.cjs` comprueba en Chromium el WAV PCM24 exportado y su JSON/CRC32. **Estas reglas no son criterios EBU R128 oficiales:** cambios de fase y de RMS no permiten concluir automáticamente que una canción suena mal o bien ni equivalen a una escucha profesional. La auditoría sigue sin certificación externa y no corrige la mezcla automáticamente.

### Planificación de exportaciones extensas — protección previa de recursos

Se incorpora el cálculo local **sin renderizar** para master WAV y stems WAV/ZIP (`mixer-export-preflight.js` y `mixer-export-preflight-ui.js`). El botón «Estimar tamaño y recursos» considera duración de fragmentos, desplazamientos, repeticiones, colas de efectos, frecuencias de salida, PCM16/24 y cantidad de pistas. Muestra los tamaños de los archivos y un **mínimo orientativo** de buffers simultáneos; avisa sobre proyectos con alto consumo y sobre el límite de auditoría de 56 MiB. No conoce la RAM realmente disponible ni estima buffers internos del navegador, efectos o archivos fuente. No garantiza estabilidad de sesiones extensas.

El master y los stems ahora validan los límites de PCM/ZIP antes de procesar voces o crear un `OfflineAudioContext`; se evita desperdiciar memoria en renders que inequívocamente superarían límites ya existentes (150 MiB master, 145 MiB stem/ZIP). El botón no sube material ni modifica audio. Pruebas: `tests/mixer-export-preflight.cjs` (planes sintéticos de 60–600 s, PCM16/24, auditoría, ZIP, formatos inválidos) y `tests/mixer-export-preflight-ui.cjs` (navegador, botón, rechazo temprano antes de DSP, originales intactos). **No se ha comprobado todavía rendimiento real de 8 pistas durante minutos en todos los equipos y navegadores.**

### Exportación WAV en bloques — memoria contigua acotada

El codificador `mixer-wav-export.js` ahora compone WAV PCM16/PCM24 en bloques de **32 768 fotogramas estéreo** (además de la cabecera RIFF de 44 bytes), conservando el orden de muestras, cuantización y generador TPDF determinista entre bloques. Esto evita reservar un **único ArrayBuffer de hasta 150 MiB** solo para la salida codificada, y afecta tanto al master como a los stems porque comparten el codificador. Se conserva el límite total anterior de 150 MiB. El nuevo test `tests/mixer-wav-chunks.cjs` compara el archivo completo byte por byte, CRC32, PCM16/24, 44.1/48 kHz, dither con semilla fija y longitudes en los límites de bloque con una implementación independiente del codificador anterior. También comprueba entradas no finitas y que las fuentes Float32 originales no se alteran.

### ZIP de stems: CRC32 por streaming

La exportación ZIP de stems ahora calcula el CRC32 de cada WAV utilizando `Blob.stream()`, sin convertir previamente cada audio entero en un segundo `ArrayBuffer`/Uint8Array. El ZIP conserva formato STORE sin compresión, cabeceras locales, directorio central y CRC32 correctos. El archivo `LEEME-STEMS.txt` y los archivos WAV PCM16/24 mantienen el mismo contenido. `tests/mixer-stems-streamed.cjs` verifica en Chromium una exportación ZIP PCM24/48 kHz con dos stems, CRC32 de cada entrada, integridad de RIFF, formato y ausencia de llamadas a `Blob.arrayBuffer()` sobre WAV durante ese proceso. El bloque se incluye en la batería completa del mezclador.

El ZIP final, los WAV codificados, el render Web Audio y el navegador siguen ocupando RAM; esto **no es una garantía de consumo bajo ni una prueba de rendimiento real con ocho pistas largas**.

**Límite importante:** usar bloques no implica que el proceso completo consuma poca memoria. El Blob de salida, el render Web Audio, el ZIP de varios stems, la auditoría exacta y el navegador todavía requieren otros buffers; no se garantiza rendimiento estable en sesiones extensas de producción real.

### De-esser estéreo sincronizado en voces — imagen L/R estable

El procesamiento vocal `mixer-vocal-dsp.js` ahora calcula la atenuación de sibilancias una sola vez por fotograma usando el componente de alta frecuencia más intenso de los canales, y aplica **la misma envolvente** a ambos lados. Se conserva el filtrado pasa-bajos independiente por canal, pero no se generan dos detectores que puedan bombear de manera diferente. El suavizado de ganancia ahora depende de los segundos y de la frecuencia de muestreo (respuesta nominal de 0.4 ms); en mono se mantiene el comportamiento básico anterior. La operación sigue siendo **offline, optativa y no destructiva**. La misma lógica se usa para reproducir/exportar y queda reflejada al cargar las configuraciones guardadas.

`tests/mixer-vocal-stereo-link.cjs` usa voces sintéticas a **44.1/48 kHz** y compara polaridad invertida, lados proporcionales, puerta + de-esser, respuesta entre frecuencias, reducción de altas frecuencias, conservación de fundamental y protección de los originales. `tests/mixer-vocal-stereo-browser.cjs` verifica canal estéreo real decodificado, buffer de mezcla, WAV PCM16 exportado, caché y restauración de sesión en Chromium. **Estas señales artificiales no garantizan ausencia de artefactos perceptuales, mantenimiento del timbre/formantes ni resultado profesional en voces grabadas reales.** La escucha con el equipo físico sigue para la etapa final.

### Afinación: protección de consonantes y pausas (PSOLA experimental)

El motor `pitch-engine.js` incorpora una **protección conservadora de pasajes aperiódicos** para no aplicar completamente el cambio de tono PSOLA a ruidos breves, respiraciones y consonantes sin periodicidad: estima correlación a un período de la frecuencia fundamental con energía deslizante, suaviza un peso común (9 ms nominales) y mezcla con el audio original donde la referencia deja de ser periódica. La señal corregida sigue activa en notas estables. El mismo peso se aplica a L/R para preservar polaridad y proporción entre canales; `pitch-melody.js` aplica esta protección por segmento además de sus fundidos en transiciones de notas. Ni originales ni archivos fuente son alterados.

La regresión sintética `tests/pitch-unvoiced-guard.cjs` verifica preservación de un estallido de ruido durante una nota larga, corrección medible del resto, afinación A3 y relación estéreo L/R a 44.1/48 kHz, así como compatibilidad del modo melodía, bypass y errores de parámetros. Es solo una protección experimental: **no certifica preservación de formantes, calidad perceptual, un análisis perfecto de consonantes o funcionamiento profesional con voces reales**. Requiere escucha final controlada antes de publicación.

### Afinación: validación defensiva de las marcas PSOLA

El motor `correctChannel` ahora valida antes de procesar muestras la frecuencia de muestreo, las frecuencias de origen y destino, la correspondencia entre período calculado y grilla compartida, el tamaño/alcance de cada marca, su **orden estrictamente creciente**, la ventana de solapamiento y que todas las muestras sean finitas. Un plan de marcas inválido se rechaza explícitamente en vez de introducir NaN, saltos de índices o silencios inesperados en el WAV. Esta comprobación no cambia la corrección de notas con planes válidos. `tests/pitch-mark-validation.cjs` cubre marcas duplicadas, desordenadas, fuera de rango o no finitas, además del caso válido, la afinación real y la preservación del original.

### Prueba de resistencia de ocho pistas (sintética, automatizada)

`tests/mixer-eight-track-stress.cjs` carga en Chromium **8 WAV sintéticos de 30 segundos** (una pista instrumental y siete canales de voz), comprueba las ocho fuentes originales, calcula presupuesto de exportación, descarga un **master PCM24 a 48 kHz**, valida tamaño y encabezados, crea un **ZIP de 8 stems PCM16 a 44.1 kHz** con duración y orden consistentes, guarda una sesión JSON con fuentes originales y la restaura completa. Se exige ausencia de excepciones del navegador y conservación de las preferencias exportadoras tras recargar. Forma parte de la batería del mezclador.

Esta aceptación verifica funcionamiento automático de un caso controlado de 8 pistas durante 30 segundos, **no** demuestra estabilidad durante horas, rendimiento en todos los dispositivos, fidelidad sonora percibida, seguridad ante una pérdida de energía o comportamiento en un equipo real. Las pruebas manuales de hardware y material propio siguen reservadas para la etapa final.

### QA de afinación vocal: medición comparativa de muestras originales y corregidas

Cada uno de los siete canales vocales del mezclador muestra ahora un informe **local y no destructivo** tras procesar una afinación, con RMS de la fuente y de la toma afinada, variación de RMS, pico de muestra, incremento de pico y posibles discontinuidades súbitas nuevas. `pitch-quality.js` inspecciona Float32 PCM de origen y salida y valida muestras finitas, duración, frecuencia y número de canales. Emite avisos conservadores cuando el pico llega a escala completa, queda escaso margen, el RMS cambia más de 6 dB, aparecen saltos de muestra mayores de 0.25 en una muestra ausentes de la fuente o se pierde casi toda la energía. Estos umbrales son **heurísticos internos**, no estándares de masterización ni un detector seguro de clics.

La UI `mixer-pitch.js` vuelve a calcular el QA después de restaurar una sesión con afinación activa; **no guarda métricas temporales en el JSON** y las borra cuando la toma original cambia o se invalida la corrección. `pitch-lab.html` muestra el mismo resumen tras afinar una nota o frase, y lo borra al cambiar archivo o rechazar una toma inválida. Las pruebas `tests/pitch-quality.cjs` y `tests/mixer-pitch-quality-ui.cjs` incluyen silencio, clipping, variaciones de nivel, saltos bruscos, fuente inmutable, restauración de proyecto y limpieza de informes obsoletos. No se certifica preservación de formantes, timbre, ausencia de artefactos perceptuales, true peak ni EBU R128; se necesita escucha humana con material y equipo reales en la etapa final.

## 2. Bloqueos de lanzamiento profesional pendientes

Estos requisitos **NO están completados** y no se deduce su cumplimiento de una suite verde:

- **Afinación vocal profesional:** algoritmo probado solo en fragmentos breves; faltan preservar y validar formantes, vibrato, fraseo largo y artefactos con voces reales y un comparador perceptual.
- **IA musical generativa integrada:** requiere proveedor elegido, contrato/API permitida, autenticación/consentimiento, presupuesto autorizado, privacidad y pruebas del servicio real. Ninguna IA de generación musical se ha integrado como backend fiable en este estudio.
- **Calibración de latencia:** ya hay `hardware-loopback.html`, un **estimador de ida y vuelta** por correlación entre una señal emitida y capturada en el mismo reloj de AudioContext. Sus pruebas sintéticas no constituyen validación física. Sigue pendiente la prueba real de loopback, repetibilidad por búfer/driver, compensación reproducible de overdubs y validación de precisión. Seleccionar dispositivo o medir un loopback simulado **no es calibrar latencia**.
- **Masterización validada externamente:** medidor R128/true-peak sigue sin certificación EBU/ITU. Debe verificarse con la suite oficial legalmente autorizada y un medidor de referencia, incluyendo señales adversarias, frecuencias de muestreo, colas y codificación de distribución.
- **Pruebas de aceptación real:** voces y beats propios consentidos, escucha de artefactos, coherencia y compatibilidad de la interfaz, latencia, clipping por hardware, estabilidad bajo sesiones largas, varios navegadores y accesibilidad.
- **Editor profesional completo:** copia entre canales, edición de clips ilimitados, cuantización de eventos sample-accurate y time-stretch/warp todavía faltan.

## 3. Aceptación diferida del usuario (NO pedir hasta el final)

El usuario decidió: **terminar primero todo el desarrollo y análisis automático; ejecutar las pruebas manuales de interfaz y material real una sola vez en la fase final**. No pedir WAV de voz, detalles de interfaz, conexión o gastos intermedios.

El candidato `RC` debe:

> **Protocolo final consolidado:** consultar `docs/FINAL-HARDWARE-ACCEPTANCE.md`. Está preparado en papel; no significa que se hayan probado el micrófono, los drivers o las conexiones físicas. La batería multimuestreo adicional `tests/mixer-ebu-multirate.cjs` contrastó 44.1/48/96 kHz contra FFmpeg bajo tolerancias **internas**, sin certificar EBU Mode.

1. Aprobar sintaxis, browser-tests y copias de seguridad en GitHub; cero pruebas fallidas.
2. Tener registro de versiones, limitaciones, procedimientos para respaldo y restauración de proyectos.
3. Acordar con el usuario los proveedores de IA y presupuesto, solo cuando esa integración esté lista para decisión.
4. Realizar **en la validación final** la prueba física de audio/latencia y el protocolo de escucha con material autorizado.
5. Obtener **aprobación explícita de publicación** antes de cambiar `main`.

Estado actual: **beta probada automáticamente; NO RC, NO 100 % terminado, NO certificación oficial**. No asignar porcentaje objetivo a criterios no validados.

## 4. Equipo de audio: estado del estimador preparado para la prueba final

- `hardware-loopback.js`: patrón de pulsos determinista de bajo nivel y correlación normalizada para detectar desfase a 44.1 y 48 kHz en pruebas sintéticas con ruido. Devuelve estimación de milisegundos, índice y confianza. Rechaza señal ausente y registros truncados.
- `hardware-loopback-ui.js`: solicita **confirmación explícita de conexión segura**, enumera entradas, captura PCM de retorno y registra el `currentFrame` del AudioWorklet dentro del mismo AudioContext que reproduce los pulsos. Nunca modifica automáticamente una grabación ni establece valores de latencia por defecto.
- Advertencia física: solo loopback interno o conexión de línea conforme al manual de la interfaz; **no conectar salida a una entrada con phantom power activada**. Esta prueba se ejecutará únicamente en la fase final acordada, con equipo real.
- CI prueba por un lado retardos sintéticos de 0–510 ms con ruido y por otro **rechazo de un micrófono simulado sin retorno**. Ninguna de las dos equivale a una medición de drivers reales.
