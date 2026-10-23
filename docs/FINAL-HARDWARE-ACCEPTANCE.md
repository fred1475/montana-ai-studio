# Montana AI Studio 2.0 — aceptación final con micrófono e interfaz

**Estado: protocolo preparado, NO ejecutado.** Uso reservado a la **última fase**, después de que se complete la preparación técnica automatizada. No iniciar pruebas de hardware a mitad del desarrollo, tal como indicó el propietario. No usar material musical no autorizado ni publicar tomas privadas.

## Antes de la única sesión final

1. Obtener un candidato de publicación con GitHub Actions completo y en verde, copia recuperable, versión identificada y PR aún en **Draft**. La rama `main` no se toca sin autorización.
2. Abrir el estudio en **HTTPS o localhost** mediante Chrome/Edge en Windows. Guardar un JSON de respaldo de una sesión de demostración antes de grabar. Mantener una copia original del audio fuera del navegador.
3. Conectar micrófono e interfaz conforme al manual del fabricante. Usar audífonos para evitar realimentación. Ajustar ganancia de entrada para evitar saturación en el convertidor; los limitadores digitales no reparan una captura saturada.
4. La prueba de loopback requiere **una conexión expresamente adecuada para señales de línea o loopback interno**, con niveles bajos y monitorización controlada. **Jamás conectar una salida física a una entrada con alimentación phantom (+48 V) activa.** Si no existe una ruta segura compatible, omitir loopback físico e informar «latencia no calibrada», sin improvisar adaptadores ni conexiones.
5. **No subir el material grabado al repositorio público**. El audio y las sesiones quedan locales; los JSON de diagnóstico se comparten solo con consentimiento explícito.

## Secuencia de aceptación (una sesión, sin pasos intermedios previos)

| ID | Ensayo | Evidencia | Criterio para avanzar |
| --- | --- | --- | --- |
| H01 | Abrir `hardware-check.html`, permisos e identificación de entrada | Modelo visible al operador, frecuencia, registro de permiso | Entrada correcta; si se deniega el permiso, no se pierde ningún proyecto |
| H02 | Grabar voz a ganancia baja/moderada y picos variables | WAV local, niveles y diagnósticos JSON | Ausencia de distorsión no intencional y muestras saturadas; archivos reproducibles |
| H03 | Desconectar/reconectar el dispositivo (solo entre tomas) | Diagnóstico de error/reinicio y archivos originales | Error visible y recuperación sin pérdida de la toma anterior |
| H04 | Repetir grabaciones guiadas con metrónomo, audífonos y al menos dos capas | WAV exportado, referencia y stems alineados | No se filtra clic del software al export; no se pierde ninguna grabación |
| H05 | Ejecutar `hardware-loopback.html` solo con ruta física segura | Tres lecturas por tasa admitida, confianza, ms, JSON | Retorno detectado de forma repetible; si no, **sin calibración** |
| H06 | Medir y comprobar manualmente desplazamiento en una toma de referencia | Comparación de transientes en DAW y compensación manual | Alineación aceptable tras escucha; no dar por aplicada compensación automática |
| H07 | Restaurar respaldo JSON y verificar WAV/stems | Proyecto restaurado, original intacto, duración y canales | No hay pérdida, cambio de tempo ni modificación destructiva de fuentes |
| H08 | Escuchar mezcla vocal y efectos con material consentido | Bitácora de audición en audífonos y monitores adecuados | Sin artefactos graves de afinación, fades, dinámica o efectos |
| H09 | Exportar WAV final y reporte de auditoría | WAV PCM16 y JSON ligado por CRC32; LUFS/LRA/TP estimados | Coinciden los bytes y metadatos, sin clipping inesperado; **no implica certificación EBU** |
| H10 | Navegador alterno y sesión de duración representativa | Capturas de resultados, fallos y tiempos | Sin fallos críticos reproducibles; los defectos quedan registrados antes de publicar |

## Registro obligatorio

Guardar **localmente**: fecha/hora, versión/commit, navegador y SO, identificador genérico de interfaz, tasa de muestreo real, conexiones verificadas seguras, tres estimaciones de loopback (si aplica), parámetros de buffer cuando estén disponibles, tasa de error, observaciones de latencia, muestras saturadas, archivos de respaldo, CRC32 y fallos reproducibles. No registrar identificadores personales de dispositivo de forma permanente en el proyecto ni en la web.

**Criterio para RC / publicación:** no declarar «100 % terminado» por una CI verde. Deben aprobarse funcionalidad, pruebas de equipo, estabilidad, seguridad, accesibilidad y los requisitos de producto acordados; los servicios de IA externos y certificación de medición quedan como tareas independientes mientras no se resuelvan realmente. Cualquier defecto de pérdida de audio o saturación no controlada bloquea el lanzamiento. Solo el propietario autoriza fusionar el PR o publicar.

## Resultado de la fase actual

- [x] Protocolo redactado y preparado.
- [ ] Prueba física de micrófono/interfaz: **diferida**.
- [ ] Calibración física de ida y vuelta: **diferida**.
- [ ] Escucha crítica con voces reales: **diferida**.
- [ ] Decisión final del propietario sobre publicación: **pendiente**.
