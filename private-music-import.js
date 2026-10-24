'use strict';

// Browser-only, opt-in client bridge for the private owner audio endpoint.
// No API key is ever accepted or stored here; Access authorizes server-side.
(function (root) {
  const MAX_BYTES = 20 * 1024 * 1024;
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

  function privateOrigin(value) {
    if (typeof value !== 'string') throw new Error('SERVIDOR_PRIVADO_NO_CONFIGURADO');
    let parsed;
    try { parsed = new URL(value); } catch (_) {
      throw new Error('SERVIDOR_PRIVADO_NO_CONFIGURADO');
    }
    if (parsed.protocol !== 'https:' || value !== parsed.origin ||
        parsed.username || parsed.password) {
      throw new Error('SERVIDOR_PRIVADO_NO_CONFIGURADO');
    }
    return parsed.origin;
  }

  async function fetchPrivateMp3({ apiOrigin, assetId, fetchImpl = root.fetch } = {}) {
    const origin = privateOrigin(apiOrigin);
    if (typeof assetId !== 'string' || !ID.test(assetId)) {
      throw new Error('IDENTIFICADOR_INVALIDO');
    }
    if (typeof fetchImpl !== 'function') throw new Error('SERVIDOR_PRIVADO_NO_CONFIGURADO');
    const response = await fetchImpl(origin + '/v1/audio/' + assetId, {
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'audio/mpeg' }
    });
    if (!response || response.status !== 200) {
      if (response?.status === 401 || response?.status === 403) {
        throw new Error('ACCESO_PRIVADO_REQUERIDO');
      }
      if (response?.status === 404) throw new Error('AUDIO_NO_ENCONTRADO');
      throw new Error('AUDIO_PRIVADO_NO_DISPONIBLE');
    }
    if (!/^audio\/mpeg(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) {
      throw new Error('RESPUESTA_NO_ES_MP3');
    }
    const announced = response.headers?.get('content-length');
    if (announced === null || !/^\d+$/.test(announced) ||
        !Number.isSafeInteger(Number(announced)) ||
        Number(announced) < 1024 || Number(announced) > MAX_BYTES) {
      throw new Error('TAMANO_MP3_INVALIDO');
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw new Error('AUDIO_STREAM_NO_DISPONIBLE');
    }
    const limit = Number(announced);
    const reader = response.body.getReader();
    const pieces = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        if (!(next.value instanceof Uint8Array)) throw new Error('AUDIO_STREAM_INVALIDO');
        total += next.value.byteLength;
        if (total > MAX_BYTES || total > limit) {
          await reader.cancel();
          throw new Error('TAMANO_MP3_INVALIDO');
        }
        pieces.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (total !== limit) throw new Error('TAMANO_MP3_INVALIDO');
    const bytes = new Uint8Array(total);
    let cursor = 0;
    for (const piece of pieces) { bytes.set(piece, cursor); cursor += piece.byteLength; }
    return bytes;
  }

  const api = Object.freeze({ privateOrigin, fetchPrivateMp3 });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root.document === 'object') {
    root.MontanaPrivateMusicImport = api;

    function ready() {
      const panel = root.document.getElementById('privateAiImport');
      if (!panel) return;
      const button = root.document.getElementById('privateAiImportButton');
      const status = root.document.getElementById('privateAiImportStatus');
      const assetField = root.document.getElementById('privateAiAssetId');
      const trackField = root.document.getElementById('privateAiTargetTrack');
      const replace = root.document.getElementById('privateAiReplace');
      let apiOrigin;
      try { apiOrigin = privateOrigin(panel.dataset.apiOrigin); }
      catch (_) {
        button.disabled = true;
        status.textContent = 'Importación privada inactiva: falta configurar y verificar el servidor seguro. Sin cargos.';
        return;
      }

      button.disabled = false;
      status.textContent = 'Servidor privado configurado. Importa solamente archivos que ya fueron generados y autorizados.';
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const assetId = assetField.value.trim();
        const channel = Number(trackField.value);
        const hasAccess = typeof root.montanaLoadTrackFile === 'function' &&
          typeof root.montanaTrackBuffer === 'function';
        if (!hasAccess || !Number.isInteger(channel) || channel < 0 || channel > 7) {
          status.textContent = 'El mezclador no está preparado.';
          return;
        }
        const existing = root.montanaTrackBuffer(channel);
        if (existing && !replace.checked) {
          status.textContent = 'Ese canal ya tiene audio. Selecciona otro o autoriza reemplazarlo.';
          return;
        }
        button.disabled = true;
        status.textContent = 'Descargando MP3 privado sin modificar la pista original...';
        try {
          const bytes = await fetchPrivateMp3({ apiOrigin, assetId });
          // Verify no change during network transfer; the mixer checks again
          // after decoding, before committing the replacement.
          if (root.montanaTrackBuffer(channel) !== existing) {
            throw new Error('EL_CANAL_CAMBIO');
          }
          const file = new File([bytes], 'Montana-IA-' + assetId + '.mp3', {
            type: 'audio/mpeg'
          });
          await root.montanaLoadTrackFile(channel, file, existing);
          status.textContent = 'Importado con éxito al canal ' + (channel + 1) +
            '. Guarda tu sesión para conservar la referencia local.';
        } catch (error) {
          const messages = {
            ACCESO_PRIVADO_REQUERIDO: 'Inicia sesión en el servidor privado autorizado.',
            AUDIO_NO_ENCONTRADO: 'No hay MP3 confirmado para esa cuenta e identificador.',
            EL_CANAL_CAMBIO: 'La pista cambió durante la descarga. No se reemplazó.'
          };
          status.textContent = 'No se importó: ' + (messages[error?.message] ||
            error?.message || 'fallo de lectura') + '. La pista anterior se conserva.';
        } finally { button.disabled = false; }
      });
    }
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', ready, { once: true });
    } else { ready(); }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
