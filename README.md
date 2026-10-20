# Montana AI Studio

Plataforma creativa independiente de Montana Music Production LLC, alojada como sitio estático en GitHub Pages.

**Página:** https://fred1475.github.io/montana-ai-studio/  
**Estudio:** https://fred1475.github.io/montana-ai-studio/studio.html

## Funciones realmente implementadas (beta)

| Módulo | Función |
| --- | --- |
| Audio | Grabación de voz con permiso de micrófono (MediaRecorder); importación de formatos compatibles (Web Audio API); visualización de onda; selección de tramo; volumen/ganancia; inversión; normalización; escucha; exportación WAV PCM 16 bits |
| Composición | Cuaderno de letras, secciones, conteo de caracteres, notas, exportación TXT |
| Video | Composición de un clip tipográfico vertical en Canvas, previsualización y exportación WebM cuando el navegador lo admita, sin audio |
| Proyectos | Guardado local en IndexedDB de composiciones y fragmentos WAV; descarga individual y exportación de índice JSON (sin audio) |
| Base musical | Metrónomo, acordes y estructuras (desde la portada) |
| Gratis | Herramientas anteriores, sin inicio de sesión ni pagos |

Estas herramientas **no usan IA generativa**. No se deben anunciar como generación automática de audio, letra o video con IA.

## Lo que NO está implementado

- Motor real de modelos de IA para componer letras / crear canciones / generar videos
- Mezclador multipista completo, efectos VST, afinación vocal o masterización automatizada
- Cuentas personales con autenticación, nube, sincronización o biblioteca remota
- Sistema de pagos o suscripciones Premium
- Infraestructura backend segura para API y administración de cuota

Antes de lanzar Premium deben decidirse proveedor/es de IA autorizados con APIs, costos por uso, presupuestos, protección de contenido, backend con secretos privados, autenticación y proveedor de pagos. **No integrar claves secretas directamente en HTML/JS públicos**. No usar AWS, por decisión del propietario.

## Privacidad y limitaciones

- La versión actual opera en el navegador. El código de la aplicación no sube los archivos al servidor. Las grabaciones y composiciones guardadas en IndexedDB se quedan en el perfil/dispositivo del navegador.
- El almacenamiento local puede borrarse al limpiar datos del navegador, usar modo privado, cambiar de dispositivo o ante políticas de cuota. Exportar respaldos de forma regular.
- La aplicación necesita HTTPS y permisos del navegador para acceder al micrófono.
- El archivo JSON de índice no incluye el audio; descargar las grabaciones por separado.
- El soporte de grabación, decodificación y WebM depende del navegador.
- El servicio de hosting puede registrar visitas bajo sus propias políticas; no se ha implementado un sistema propio de analíticas.
- Esta versión está en beta y todavía requiere pruebas manuales de extremo a extremo en los dispositivos de lanzamiento.

## Protección de proyectos privados

Repositorio **público**: prohibido publicar canciones inéditas, letras propias, prompts privados, fotografías privadas, estrategias internas, tokens, contraseñas, datos personales o documentos. Solo contenido genérico de demostración destinado a cualquier artista. La carpeta de trabajo privada y la música original no se comparten con la app pública.

## Verificación antes de anuncio comercial

1. Abrir la URL y probar audio importado, grabación, recorte, ganancia y exportación WAV en Chrome/Edge.
2. Probar notas/letras guardadas y restauradas en la biblioteca local.
3. Probar clip WebM y descarga en navegador compatible.
4. Comprobar diseño móvil, accesibilidad y manejo de errores.
5. Configurar páginas legales, canales de soporte y avisos adecuados antes de manejar pagos o datos de usuarios.
6. Evaluar proveedor de IA, costos y backend económico distinto de AWS antes de ofrecer generación o Premium.

## Despliegue

GitHub Pages desde `main` / `(root)`. Archivo `.nojekyll` presente. Los cambios al branch principal activan una nueva publicación.
