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
