# Montana AI Studio — Validación técnica EBU R128

Fecha de revisión: 2026-10-20. Proyecto **beta** de Montana Music Production LLC.

## Normas contrastadas

- **EBU R 128 v5.0 (nov. 2023):** objetivo de loudness de programa **−23 LUFS** para emisión y descriptor de nivel de true-peak. Fuente oficial: https://tech.ebu.ch/publications/r128
- **ITU-R BS.1770-5:** filtrado K-weighting, energía con compuerta absoluta **−70 LUFS** y relativa **−10 LU**, medición estéreo. https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.1770-5-202311-I!!PDF-E.pdf
- **EBU Tech 3341:** momento 400 ms, corto plazo 3 s, integrado y pico verdadero. https://tech.ebu.ch/publications/tech3341
- **EBU Tech 3342:** LRA basado en mediciones de corto plazo (3 s, actualización ≥10 Hz), compuerta de **−20 LU** y percentiles **10 y 95**; durante los primeros 60 s, LRA se declara provisional. https://tech.ebu.ch/publications/tech3342
- **EBU Tech 3343:** el límite habitual de pico verdadero en producción PCM para emisión es **−1 dBTP**; algunos códecs requieren más margen. No confundir esto con los objetivos específicos de plataformas de streaming. https://tech.ebu.ch/docs/tech/tech3343.pdf

## Implementación de Montana

Archivo `mixer-loudness.js`, usando solamente JavaScript local:
1. Dos etapas de filtro K-weighting por canal, corregido el numerador del paso alto a [1, −2, 1].
2. Bloques de energía de **400 ms / salto 100 ms**: momentary e integrado con doble compuerta (−70 absoluto, −10 relativo).
3. **Short-term:** ventana rectangular de **3 s / salto 100 ms**, lectura actual y máximo.
4. **Loudness Range (LRA):** energías de short-term con doble compuerta (−70 absoluto y −20 relativo), percentiles 10/95. Lectura provisional si el programa dura menos de 60 s.
5. **True-peak estimado:** sobremuestreo a 4×, filtro sinc Blackman de **40 coeficientes**. Esta estimación no es un medidor true-peak certificado y puede discrepar en altas frecuencias.

Todos los cálculos usan PCM interno float; el proceso es opcional y no afecta la mezcla exportada ni modifica sus originales.

## Prueba independiente y criterios de aceptación

El workflow de GitHub Actions ejecuta `tests/mixer-ebu-reference.cjs`, usando **FFmpeg `ebur128`** como implementación independiente. Los audios de prueba se generan matemáticamente dentro del test sin copiar ni incluir secuencias protegidas de terceros. Casos:

- Seno de 1 kHz estéreo a −23 dBFS, 12 segundos (control de referencia de EBU Tech 3341).
- Tres secciones a −33, −20 y −27 dBFS (24 segundos) para contrastar la compuerta y LRA.
- Seno de 70 Hz para verificar el filtro K.
- Ruido pseudoaleatorio reproducible para verificar la respuesta de true-peak a banda ancha.
- Seno de 12 kHz desfasado para detectar picos entre muestras.

**Criterios internos** (no son tolerancias oficiales de homologación): desviación de LUFS integrado menor a **0.16 LU** frente a FFmpeg, LRA menor a **0.65 LU**, true-peak menor a **0.35–0.8 dB** según el tipo de señal. En tonos altos se permite una desviación más amplia, expresamente incompatible con afirmar una certificación profesional: faltan las pruebas de tolerancia oficial de picos entre muestras.

## Estado de conformidad

**NO CERTIFICADO.** Las pruebas contra FFmpeg solo demuestran concordancia bajo señales finitas y tolerancias indicadas, no aprobación EBU, ITU, acreditación del dispositivo ni uso de logo oficial. Falta verificar requisitos integrales del EBU Mode (p.ej. medición continua, pausa/reanudación/reset, balísticas en tiempo real), otros sample rates, toda la batería oficial de señales, comprobación de true-peak dentro de las tolerancias EBU, multicanal y rendimiento a escala real.

La EBU limita el uso de su conjunto oficial de secuencias a I+D interna y prohíbe actividades comerciales sin otros permisos; **no lo copiamos ni redistribuimos**. Sus condiciones están en https://tech.ebu.ch/files/live/sites/tech/files/shared/testmaterial/use%20of%20EBU%20AUDIO%20test%20sequences.pdf

Hasta completar validación externa, mostrar *estimado / orientativo* en las interfaces y documentos. Una meta interna de 200 % de exigencia creativa **no constituye garantía verificable de 200 % de calidad**.

## Nueva función: informe de auditoría vinculada al WAV (octubre 2026)

El archivo `mixer-master-audit.js` genera, de forma **opcional**, un informe `montana-mezcla-auditoria-r128.json` tras exportar la mezcla WAV. **La fuente del informe es el WAV PCM16 o PCM24 codificado** (no el PCM float previo a la conversión); se vuelven a calcular LUFS integrado, momentáneo, corto, LRA, true-peak estimado, pico de muestra y RMS en el audio final, que puede incluir cuantización o clipping. El lector PCM24 interpreta valores con signo y conserva la profundidad exacta en la ficha del WAV.

El JSON incorpora dimensiones, duración, tasa de muestreo, checksum **CRC32 del WAV exacto** (para emparejar archivo e informe, NO como firma criptográfica), fecha, procesamiento de salida utilizado y comprobaciones de ingeniería: objetivo de emisión −23 LUFS ±0.5 LU, referencia de pico verdadero −1 dBTP, presencia de muestras PCM a escala máxima, y advertencia de LRA provisional para grabaciones menores de 60 segundos.

Se aplican límites de recursos: hasta 56 MiB de WAV PCM16/24 para la auditoría (un master PCM24 largo puede exceder ese límite), sin bloquear la descarga ordinaria de mezclas mayores. El informe solo queda disponible después de analizar una exportación concreta. Al exportar otra mezcla o restaurar otra sesión, se descarta cualquier informe anterior para no asociarlo por error a una canción diferente. La preferencia de auditoría sí puede guardarse en JSON de sesión.

Pruebas automáticas: `tests/mixer-master-audit.cjs` verifica el valor CRC32 universal `123456789` → `cbf43926`, asociación byte-a-byte del JSON al WAV descargado, exactitud de LUFS/true-peak recalculados a partir del PCM16, alertas de clipping y cambios entre dos exportaciones, y rechazo seguro de ajustes de sesión inválidos.

**La auditoría es orientativa y NO certifica EBU Mode, ni la cadena de audio, ni conformidad legal o artística.** La meta de calidad superior exige además probar masters completos, interfaces y monitores reales, codificación de plataformas y una revisión humana de la mezcla.

## Cobertura multimuestreo automatizada — ampliación de QA

El test adicional `tests/mixer-ebu-multirate.cjs`, ejecutado por `mixer-tests.yml`, contrasta contra el filtro independiente `ffmpeg ebur128=peak=true` cuatro casos sintéticos: estéreo asimétrico a **44.1 y 96 kHz**, señal unilateral a **48 kHz** y variaciones de nivel con compuerta a **44.1 kHz**. Comprueba I, LRA, pico verdadero **estimado 4×**, señales asimétricas y rechazo de entradas inválidas (NaN, duración insuficiente, tasas fuera de rango y canales desiguales).

Los umbrales de comparación de esta regresión son **criterios internos**, no oficiales: <0.22 LU en integrado, <0.8 LU en LRA y <0.7 dB en true-peak estimado. La CI verde indica solo que estos cuatro escenarios cumplen los umbrales internos, **no certificación EBU**. Siguen pendientes la batería oficial autorizada, pruebas de picos entre muestras adversarios, otros modos y validación de campo.
