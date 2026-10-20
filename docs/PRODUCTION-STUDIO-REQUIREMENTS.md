# Montana AI Studio — especificación de producto y puertas de lanzamiento

## Visión
Plataforma musical utilizable por artistas, no una demo de marketing. Mantener la beta pública y su biblioteca de proyectos. Los nuevos módulos se desarrollan por rama y no se anuncian como terminados hasta aprobar pruebas.

## Funciones implementadas en la rama Phase 2
- `mixer-8.html`: ocho canales fijos con importación local, volumen, paneo, mute, solo, reproducción sincronizada desde t=0 y exportación estéreo WAV (44.1 kHz / PCM16).
- `mixer-beta.html`: prototipo anterior de dos pistas, solo referencia interna. No publicar como producto final.
- Limitaciones actuales: no grabación dentro del mezclador, sin edición de línea de tiempo, sin automatización, sin plugins VST, sin proyecto multipista persistente; posibles altos consumos de memoria en móviles y archivos largos.

## Módulos necesarios antes de llamar al estudio 'profesional'
1. Sesiones multipista: agregar/eliminar/nombrar canales, grabación y overdub, control de latencia, monitoreo y alineación, deshacer y edición no destructiva.
2. Transporte y edición: timeline, zoom, split/trim/arrastrar, snap, loops, metrónomo, indicadores y peak meter.
3. Mezcla: EQ paramétrico, compresión, puerta de ruido, reverb, delay, panorama, buses, envíos y limitador, con presets originales.
4. Persistencia: respaldos integrales de proyectos, audio, ajustes y posición de pistas; recuperación y validación ante fallo.
5. Exportación: control de clipping, comparación audible WAV antes de publicar, formato de audio apropiado, documentación de calidad.
6. Seguridad: procesamiento local mientras no haya infraestructura autorizada; no insertar tokens ni música inédita en repositorio público.
7. Pruebas: Chrome, Edge, móvil, archivos mono y estéreo con diferentes tasas, ocho pistas simultáneas, silencio/solo, exportación y restauración, rendimiento con memoria limitada.
8. Accesibilidad, ayuda y soporte; política de privacidad y límites de uso claros.

## IA real (separada del mezclador)
- Composición: interfaz con proveedor de LLM autorizado para letras, ideas, estructuras y producción. Requiere servidor seguro y límites de tokens.
- Generación musical: proveedor con API comercial autorizada y derechos de uso claros, costo por segundo y revisión de licencia.
- Voz: herramientas de transcripción y procesamiento; clonación de voz solo con consentimiento verificado.
- Imagen y video: servicios de generación autorizados y presupuesto de GPU/API; declarar duración, resolución y restricciones.
- Integrar proveedores tras comparar tarifas y condiciones actuales. NUNCA poner las claves API en JS público. GitHub Pages no ejecuta backend privado.
- No prometer interoperabilidad con apps externas, plugins VST o DAWs sin licencia y pruebas de compatibilidad.

## Criterios de publicación
El módulo de 8 pistas recién implementado permanece en desarrollo. Requiere automatización de pruebas, pruebas manuales, revisión de clipping y rendimiento, archivos de respaldo de sesión y resolución de defectos antes de fusionar PR #2.
