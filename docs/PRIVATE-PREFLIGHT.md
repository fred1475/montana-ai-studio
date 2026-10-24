# Montana AI Studio 2.0 — diagnóstico privado previo al despliegue

**Solo borrador y sin despliegue.** Esta aplicación de Cloudflare Workers es un diagnóstico de infraestructura separado de la generación musical real. Ni puede hacer solicitudes al proveedor de música ni tiene ruta `POST /v1/generate`. Se conserva en la rama Draft del PR #5.

## Comportamiento

- `GET /v1/preflight` exige Cloudflare Access real mediante `ctx.access`, audiencia exacta y correo del propietario. No acepta identidad tomada de cabeceras ni de parámetros.
- Si existe `Origin`, debe coincidir con el origen HTTPS exacto `STUDIO_ORIGIN`. Responde únicamente con cinco indicadores booleanos: Access, origen, D1, R2 y presencia de clave del proveedor. **Nunca responde secretos ni IDs de cuenta**.
- Aunque por error esté presente `PRIVATE_GENERATION_ENABLED`, este Worker no contiene llamada a Lyria, R2 ni D1; todos los caminos de generación y audio devuelven 404. No representa el gateway musical.
- El archivo `wrangler.preflight.jsonc` intencionalmente **no contiene** claves reales, IDs de D1, nombres de bucket ni la identidad del propietario. No hacer `wrangler deploy` hasta configurar Cloudflare Access para proteger el Worker completo, probar la identidad exacta y aprobar expresamente el despliegue.
- No hay checkout de R2, plan Paid ni uso API como resultado de añadir estos archivos.

## Verificación sin gastos

```sh
node --check server/private-preflight.mjs
node --test tests/private-preflight.test.mjs
```

La suite verifica la ausencia de llamadas externas, rechazo de Access inválido, origen ajeno, rutas de pago y respuestas sin datos sensibles. El resultado confirma solamente la lógica de preflight **con simulaciones**; no confirma configuración real del proveedor, la privacidad del despliegue ni aprobación para publicar.

## Próximos pasos dependientes del propietario

1. Identificar la cuenta nueva en Cloudflare y mostrar el panel Workers & Pages sin publicar contraseñas ni API keys.
2. Definir el propietario y la audiencia de Cloudflare Access; no subirlos al repositorio público.
3. Revisar D1 y R2, verificando condiciones de facturación y presupuestos externos antes de crear recursos. R2 puede solicitar un checkout aun cuando exista nivel gratuito.
4. Completar códec MP3 real, verificación de audio, política de generación y pruebas de presupuesto antes de preparar el **Worker de música real**.
5. Hacer una única prueba real de una canción aprobada y la aceptación física final. Este preflight nunca genera música.

**Referencias:** https://developers.cloudflare.com/workers/configuration/cloudflare-access/ y https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/
