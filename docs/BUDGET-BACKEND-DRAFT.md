# Montana AI Studio 2.0 — presupuesto y backend privado (borrador)

**Estado:** módulo de cuotas y esquema D1 preparados en rama de desarrollo. Sin despliegue, cuenta Cloudflare, base de datos real, facturación o invocación de Lyria. No publicarlo ni conectar contenido inédito todavía.

## Arquitectura candidata sin AWS

- **Cloudflare Workers:** endpoint privado futuro con autenticación real, origen restringido, rate limiting y políticas de contenido.
- **D1 (SQLite):** registro DURADERO de reservas, resultados y consumo. El módulo `server/d1-quota.js` implementa el contrato exigido por `server/music-generation.js`.
- **R2 Standard:** alternativa para conservar MP3 finales de forma privada; requiere una suscripción R2 configurada por el propietario, aun si el uso cabe en el nivel gratuito.
- **Google Lyria 3.5:** proveedor de canciones original con clave exclusiva del servidor. Nunca incluir claves en GitHub Pages, el navegador ni una respuesta JSON.

### Límite de coste interno (configuración experimental)

- Tope global por mes UTC: **1,000 centavos ($10)** para todo el Studio, no $10 por cada usuario.
- Reserva estimada por canción Lyria 3.5: **8 centavos ($0.08)** según el precio publicado y a verificar de nuevo antes del despliegue.
- Cada petición requiere un ID único y huella de contenido. La base de datos rechaza repeticiones con contenido distinto.
- La transacción reserva fondos ANTES de invocar al proveedor. Una petición simultánea con el mismo ID no puede crear otra reserva.
- Si se confirma el resultado, la reserva se mueve a gastado sin subir el total.
- Un error con prueba fiable de **cero cargo** permite liberar la reserva. Error de red, timeout o confirmación incierta: **NO liberar ni reintentar**, investigar costo real.
- El historial y las reservas continúan después de reinicios del servidor. Cambio de mes abre un nuevo saldo; NO borra ni condona reservas previas.

**Importante:** el límite de la aplicación NO equivale a un límite garantizado de la factura de Google/Cloudflare. Cambios de precios, uso fuera de la aplicación, errores y cargos de otros servicios requieren controles externos, auditorías, alertas y revisión humana. No autorizar cargos externos solo por aprobar este código.

## Cómo probar sin gastos

Aplicar `server/schema/d1-quota.sql` en una base de pruebas vacía.
Ejecutar `node --test tests/d1-quota.cjs` en Node 22.13+.
La suite usa SQLite de memoria, simula la API D1 y no llama a Google ni Cloudflare.
Casos: techo global, dos usuarios, idempotencia, liquidación, liberación segura,
reinicio de mes, entrada inválida y rollback de transacciones.

## Verificaciones antes de conectar el proveedor

1. Elegibilidad de la cuenta y condiciones actuales de Google para uso comercial; verificar que las canciones generadas puedan incorporarse a las publicaciones previstas.
2. Acceso privado y almacenamiento seguro de secretos; sin usar el repositorio público para audio inédito ni API keys.
3. Despliegue Worker/D1/R2, autenticación, CORS y límites de solicitudes; revisión de privacidad, retención, eliminación y recuperación.
4. Instrumentar `storeAudio` con validación real de MP3, duración medida y almacenamiento cifrado.
5. Comprobar el ledger contra D1 REAL y concurrencia real, además de los tests SQLite.
6. Comprobar facturación real y presupuestos de Google/Cloudflare ANTES de habilitar solicitudes.
7. Ejecutar una generación mínima con material no confidencial solo tras permiso explícito de gasto; registrar importe real y reproducir en el mezclador.
8. Mantener la beta pública y `main` intactos hasta superar los criterios de aceptación.

## Fuentes oficiales consultadas (23 octubre 2026)

- Cloudflare Workers free: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 y batch: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Cloudflare D1 precios: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare R2 precios: https://developers.cloudflare.com/r2/pricing/
- Google Gemini API precios: https://ai.google.dev/gemini-api/docs/pricing
- Lyria 3.5: https://ai.google.dev/gemini-api/docs/music-generation
- Gemini API términos: https://ai.google.dev/gemini-api/terms
