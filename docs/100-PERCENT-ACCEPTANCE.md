# Montana AI Studio 2.0 — definición verificable del 100 %
Fecha de revisión: 22 de octubre de 2026. Documento de **criterios**, no de certificación.
Propietario: Montana Music Production LLC. Implementación aislada en PR #2 (Draft);
sin autorización del propietario no fusionar la rama con `main`.

## Regla de porcentaje
El antiguo «65 %» era una estimación **sin rúbrica ponderada ni evidencia suficiente**.
No usarlo como métrica de aceptación. El número de commits y las horas trabajadas
no aumentan un porcentaje por sí mismos. Para declarar **100 % terminado**, cada
puerta obligatoria de abajo debe tener `APROBADA`, con evidencia reproducible,
y debe existir una aprobación explícita del propietario para publicar.

Estados: `APROBADA` (evidencia requerida completa), `BETA AUTOMÁTICA`
(pruebas de laboratorio reproducibles, pero pendientes de aceptación real),
`PARCIAL` (parte del requisito aún ausente) y `PENDIENTE` (sin comprobación).

| Puerta obligatoria | Estado a fecha de revisión | Evidencia actual / falta |
|---|---|---|
| 1. Mezclador de 8 pistas | BETA AUTOMÁTICA | Importación, fader, paneo, EQ, compresión, efectos, mute/solo y exportación en Chromium; falta sesión musical real y prueba de producción larga |
| 2. Editor temporal | PARCIAL | Recorte, división, copias con duración audible independiente, edición de inicios por BPM sin cambiar el sonido, fundidos, snap y deshacer; laboratorio WSOLA aislado con cambio de duración y pruebas sintéticas; faltan integración de time-stretch/warp al mezclador, edición libre completa y automatización continua |
| 3. Grabación y latencia | PARCIAL | MediaRecorder/PCM24 y pruebas de navegador simulado; calibración de interfaz/overdubs y latencia real pendientes |
| 4. Voz: afinación y formantes | PARCIAL | PSOLA offline limitado y QA local PCM, fase, brillo y microcortes; sin preservación validada de formantes ni retune completo |
| 5. Mezcla/master de entrega | PARCIAL | WAV16/24, 44.1/48k, stems, limitador de pico de muestra, R128 orientativo y contraste con FFmpeg; sin certificación externa ni prueba auditiva |
| 6. Sesiones y recuperación | BETA AUTOMÁTICA | JSON, restauración de fuentes, IndexedDB voluntario y casos corruptos; falta prueba de recuperación real de proyectos extensos |
| 7. Composición musical MIDI | BETA AUTOMÁTICA | Beat Lab con secuenciador, MIDI y WAV sintetizado; no confundir con piano roll completo o VST; requiere aceptación de CI del nuevo commit |
| 8. Generación musical por IA | PARCIAL | Contrato, adaptador Lyria, ledger D1, gateway HTTP y recuperación privada de MP3 por propietario/estado confirmado **sin desplegar**, con pruebas simuladas y cerrado a gastos por defecto (PR #3–#5); todavía no existen cuenta/proveedor habilitado, almacenamiento verificado, cribado real, facturación protegida externamente, generación auténtica ni licencias verificadas. No anunciar IA generativa funcional |
| 9. Calidad, seguridad y compatibilidad | PARCIAL | Tests Chromium CI, archivos locales y diagnósticos; faltan Windows Edge/Chrome con interfaz real, pruebas de estrés prolongadas, accesibilidad y revisión de privacidad |
| 10. Aceptación final física | PENDIENTE | Una sola sesión final con micrófono/interfaz del propietario: permisos, rutas, latencia, ruido, escucha, fases, over­dubs y estabilidad |
| 11. Publicación | PENDIENTE | Todas las puertas aprobadas, revisión de licencia/términos, archivo de versión, respaldo y autorización explícita antes de merge |

## Alcance del laboratorio temporal experimental
El archivo `time-lab.html` y el motor `time-stretch.js` ensayan WSOLA offline
en audio mono/estéreo de 0,3 a 12 s, a 8–96 kHz, con relación de duración
0,80–1,25. El motor calcula un plan temporal compartido para ambos canales
y deja las muestras de entrada intactas. Las pruebas automáticas deben medir
duración, frecuencia fundamental de una señal sintética, fase estéreo,
silencio, WAV exportado y controles de regeneración.

**No** certifica conservación de formantes, naturalidad de voz humana,
transitorios, calidad musical ni ausencia de artefactos; **no** retemporiza
todavía la línea de tiempo ni las exportaciones multicanal del mezclador.
Las pruebas auditivas sobre la interfaz del propietario siguen reservadas
para la única validación física final.

## Orden de cierre para no repetir pruebas de usuario
1. Continuar automatización y desarrollo de edición, grabación, voz, mezcla y creación.
2. Definir y conectar proveedor de IA autorizada sin introducir secretos en el navegador.
   Requiere la elección informada y presupuesto aprobado por el propietario; no gastar ni
   suscribir por defecto.
3. Completar pruebas de estrés, recuperación, navegador y seguridad, además de referencias
   oficiales cuando estén legalmente disponibles.
4. Preparar una candidata RC con artefactos de descarga y checklist de regresión sin errores.
5. **Una única ronda final** de hardware real y escucha del propietario; documentar resultados.
6. Rechazar el release si falla una puerta. Solo con la aprobación expresa del propietario
   se solicita la fusión con `main`.

## Evidencia mínima por puerta
- Código comprobable, tests de unidad y de navegador aprobados en el mismo SHA del PR.
- Valores reproducibles y límites explícitos, sin confundir señales sintéticas con canciones reales.
- Integridad de tomas de origen y sesiones antiguas; escenarios fallidos sin pérdida de datos.
- Audio de entrega correcto en bytes y validación auditiva y de referencia según la función.
- No declarar conformance a EBU R128 por coincidencia aproximada con FFmpeg.
- Documentar versión, commit, fecha, pasos, resultado y decisión de aceptación.

## Límites de esta revisión
El contador de commits informa actividad, **no completitud**. Una suite aprobada en GitHub
no certifica hardware, mastering profesional, IA generativa ni la obra final.
Este proyecto seguirá etiquetado como desarrollo hasta que todas las puertas estén aprobadas.
