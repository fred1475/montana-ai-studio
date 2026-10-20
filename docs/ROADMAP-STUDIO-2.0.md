# Montana AI Studio 2.0 — Plan de desarrollo

**Estado:** propuesta técnica en rama de desarrollo; no publicada.  
**Regla:** mantener operativa la beta pública; no sustituir ni eliminar funciones probadas.  
**Repositorio:** fred1475/montana-ai-studio  
**Rama:** develop/studio-2-0-phase-1

## Base verificada por el propietario (20 octubre 2026)
- Grabación y reproducción de voz.
- Importación de audio y reproducción.
- Ajuste de ganancia.
- Selección y reproducción de recortes.
- Exportación WAV.
- Clip tipográfico WebM y descarga.
- Composición y descarga TXT.
- Guardado local y recuperación de proyectos tras reabrir la página.

**No verificado todavía:** normalización con un control A/B independiente, inversión de audio, compatibilidad entre navegadores/dispositivos, pruebas automatizadas, seguridad, accesibilidad y rendimiento. Tampoco hay motor de IA generativa.

## Fase 1 — Fiabilidad antes de añadir IA (prioridad inmediata)
1. Introducir respaldo completo de proyectos incluyendo audios, con opción de restauración validada; conservar exportaciones actuales.
2. Pruebas de regresión para audio, letras, video y almacenamiento local; casos de permisos negados y formatos incompatibles.
3. Interfaz: indicadores claros, mensajes de error, accesibilidad teclado/lector de pantalla y diseño móvil.
4. Seguridad y privacidad: no claves ni materiales inéditos en el repositorio público, definir retención local y avisos.
5. SEO y publicación: title/description, sitemap/robots, Search Console y prueba de dominio personalizado si se aprueba.
6. Crear rama de pruebas / pull request. Ninguna modificación directa a main sin revisión y pruebas.

**Criterio de finalización:** todas las funciones anteriores siguen funcionando; respaldo y recuperación probados; ninguna clave secreta en frontend.

## Fase 2 — Producción avanzada
- Edición de onda con selección visual, deshacer/rehacer, multipistas y controles de volumen por pista.
- Efectos de voz y mezclas con procesamiento local cuando sea viable.
- Exportación de formatos sustentados en capacidades reales; evitar prometer formatos/funciones no soportados.

## Fase 3 — IA generativa
- Evaluar proveedores autorizados para texto, audio, imágenes y video, incluyendo límites de licencia, latencia y precio.
- Implementar backend seguro separado del hosting estático; autenticar usuarios y proteger claves.
- Control de cuota, presupuesto, permisos, políticas de contenido y derechos de uso.
- Prototipo interno primero; no anunciar generación si aún no existe.

## Fase 4 — Cuentas, respaldo en nube y Premium
- Registro y acceso privado, almacenamiento seguro, recuperación, borrado y transparencia.
- Facturación y límites de planes, políticas, soporte y monitoreo.
- No activar cobros sin pruebas, precios y aprobación explícita.

## Costos: presupuesto pendiente de cotización
GitHub Pages sirve la interfaz estática, pero la generación de IA, almacenamiento compartido y pagos requieren servicios adicionales. La estimación depende de:
- Proveedor y modelo elegido para cada modalidad.
- Uso esperado: usuarios activos, generaciones/mes, duración de clips, tamaño de audio y video.
- Transferencia/almacenamiento y costos de infraestructura.
- Comisión del procesador de pagos, dominios y soporte.

No asignar precios inventados: solicitar tarifas vigentes y construir presupuesto con escenario bajo/medio/alto antes de contratar.

## Protección de trabajo
- Mantener fuera de commits públicos música inédita, prompts internos, fotografías privadas, tokens y datos de clientes.
- Trabajo nuevo en ramas y pull requests; copias de seguridad de la beta.
- No implementar AWS en este proyecto sin nueva autorización.
