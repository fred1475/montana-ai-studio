'use strict';
(function () {
  const byId = id => document.getElementById(id);
  const config = byId('privateAiConfig');
  if (!config) return;
  const fields = {
    prompt: byId('prompt'), style: byId('style'), lyrics: byId('lyrics'),
    mode: byId('mode'), language: byId('language'), duration: byId('duration'),
    rights: byId('rights'), privacy: byId('privacy'), cost: byId('cost')
  };
  const generateButton = byId('generateButton');
  const status = byId('generationStatus');
  const connection = byId('connectionStatus');
  const result = byId('resultStatus');
  const assetId = byId('assetId');
  const usageButton = byId('usageButton');
  const usageOutput = byId('usageOutput');
  const listenButton = byId('listenButton');
  const downloadButton = byId('downloadButton');
  const copyButton = byId('copyButton');
  const player = byId('privateAudio');
  const counter = byId('characterCount');
  let client = null, apiOrigin = null, busy = false;
  let localAudioUrl = null;
  let confirmedAsset = null;

  const friendly = {
    SERVIDOR_NO_CONFIGURADO: 'El servidor privado no está conectado.',
    CONSENTIMIENTO_REQUERIDO: 'Se necesitan las tres autorizaciones.',
    SOLICITUD_INVALIDA: 'Revisa el concepto, letra, estilo y duración.',
    SALDO_PRIVADO_NO_DISPONIBLE: 'No se pudo verificar el presupuesto privado. No se enviará una generación.',
    SALDO_PRIVADO_INVALIDO: 'El servidor devolvió un presupuesto incoherente. Generación bloqueada.',
    PRESUPUESTO_AGOTADO: 'Presupuesto insuficiente. No se ha hecho solicitud pagada.',
    GENERATION_NOT_ENABLED: 'La generación de pago sigue cerrada en el servidor.',
    QUOTA_EXCEEDED: 'La cuota está agotada. No se enviará otra generación.',
    POLICY_DENIED: 'La solicitud fue rechazada por el control de contenido.',
    ALREADY_IN_PROGRESS: 'Esta solicitud ya está reservada. No la repitas.',
    RECONCILIATION_REQUIRED: 'Estado financiero sin confirmar. No repitas la solicitud; verifica el saldo/factura primero.',
    UNAUTHORIZED: 'Inicia sesión con tu cuenta autorizada en el servidor privado.',
    GENERACION_NO_DISPONIBLE: 'El proveedor no confirmó la canción. Verifica el saldo antes de otro intento.',
    AUDIO_NO_ENCONTRADO: 'El archivo no está confirmado para esta cuenta.',
    ACCESO_PRIVADO_REQUERIDO: 'La descarga requiere iniciar sesión en Cloudflare Access.'
  };
  const message = error => friendly[error?.message] ||
    'No se pudo completar: ' + (error?.message || 'error de conexión');

  function invalidatePlayback() {
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    localAudioUrl = null;
    downloadButton.disabled = true;
  }
  function updateCounts() {
    counter.textContent = 'Letra: ' + fields.lyrics.value.length +
      '/5000 · Estilo: ' + fields.style.value.length + '/1000';
  }
  function refreshButton() {
    generateButton.disabled = !client || busy || !fields.rights.checked ||
      !fields.privacy.checked || !fields.cost.checked;
    generateButton.textContent = busy ? 'Generando (sin reintentos)...' :
      client ? 'Crear una canción IA (puede tener costo)' :
        'Crear canción IA — desactivado';
  }

  fields.mode.addEventListener('change', () => {
    const instrumental = fields.mode.value === 'instrumental';
    fields.lyrics.disabled = instrumental;
    if (instrumental) {
      fields.lyrics.value = '';
      updateCounts();
    }
  });
  fields.lyrics.addEventListener('input', updateCounts);
  fields.style.addEventListener('input', updateCounts);
  for (const field of [fields.rights, fields.privacy, fields.cost]) {
    field.addEventListener('change', refreshButton);
  }

  try {
    apiOrigin = window.MontanaPrivateGeneration.normalizeOrigin(config.dataset.apiOrigin);
    client = window.MontanaPrivateGeneration.createPrivateGenerationClient({
      apiOrigin
    });
    connection.textContent = 'Origen HTTPS privado preparado. El servidor todavía debe autenticarte y autorizar cualquier generación.';
    usageButton.disabled = false;
    status.textContent = 'Consulta primero el presupuesto real. Generar solo será posible con las tres autorizaciones y una solicitud manual.';
  } catch (_) {
    connection.textContent = 'Servidor privado sin configurar: generación apagada. Puedes preparar letras y estilo sin enviar información ni gastar.';
  }
  refreshButton();

  usageButton.addEventListener('click', async () => {
    if (!client || busy) return;
    usageButton.disabled = true;
    try {
      const quota = await client.usage();
      usageOutput.textContent = 'Límite de aplicación: $' +
        (quota.limitCents / 100).toFixed(2) + ' · Gastado: $' +
        (quota.spentCents / 100).toFixed(2) + ' · Reservado: $' +
        (quota.reservedCents / 100).toFixed(2) + ' · Disponible: $' +
        (quota.remainingCents / 100).toFixed(2) +
        '. La cuota interna no equivale a un límite de factura externa.';
    } catch (error) {
      usageOutput.textContent = message(error) + ' No hagas solicitudes pagadas.';
    } finally { usageButton.disabled = false; }
  });

  byId('musicForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || busy || generateButton.disabled) return;
    busy = true;
    refreshButton();
    status.textContent = 'Verificando consentimiento y saldo. Se enviará solo una solicitud si la cuota permite el gasto...';
    const input = {
      prompt: fields.prompt.value,
      style: fields.style.value,
      lyrics: fields.mode.value === 'instrumental' ? '' : fields.lyrics.value,
      mode: fields.mode.value, language: fields.language.value,
      durationSeconds: Number(fields.duration.value),
      confirmsRights: fields.rights.checked,
      consentToSendPrompt: fields.privacy.checked,
      confirmsCost: fields.cost.checked
    };
    fields.cost.checked = false; // Every further paid request needs fresh consent.
    try {
      const audio = await client.generate(input);
      confirmedAsset = audio;
      invalidatePlayback();
      assetId.value = audio.assetId;
      result.textContent = 'Canción confirmada: ' +
        audio.durationSeconds.toFixed(1) + ' s. Identificador ' + audio.assetId +
        '. Escúchala o impórtala al mezclador.';
      listenButton.disabled = false;
      copyButton.disabled = false;
      status.textContent = 'Generación confirmada por el servidor. Revisa su factura real antes de generar otra.';
    } catch (error) {
      status.textContent = message(error) +
        ' No hay reintentos automáticos. Una falla de red no demuestra ausencia de cobro.';
    } finally {
      busy = false;
      refreshButton();
    }
  });

  listenButton.addEventListener('click', async () => {
    if (!client || !confirmedAsset || busy) return;
    listenButton.disabled = true;
    result.textContent = 'Descargando audio privado confirmado...';
    try {
      const bytes = await window.MontanaPrivateMusicImport.fetchPrivateMp3({
        apiOrigin, assetId: confirmedAsset.assetId
      });
      invalidatePlayback();
      localAudioUrl = URL.createObjectURL(new Blob([bytes], {
        type: 'audio/mpeg'
      }));
      player.src = localAudioUrl;
      player.load();
      downloadButton.disabled = false;
      result.textContent = 'MP3 privado listo en tu navegador. Pulsa Play en el reproductor o descárgalo.';
    } catch (error) {
      result.textContent = message(error);
    } finally { listenButton.disabled = false; }
  });

  downloadButton.addEventListener('click', () => {
    if (!localAudioUrl || !confirmedAsset) return;
    const link = document.createElement('a');
    link.href = localAudioUrl;
    link.download = 'Montana-AI-Studio-' + confirmedAsset.assetId + '.mp3';
    link.click();
  });
  copyButton.addEventListener('click', async () => {
    if (!confirmedAsset) return;
    try {
      await navigator.clipboard.writeText(confirmedAsset.assetId);
      result.textContent = 'ID copiado. Pégalo en «Música IA privada» del mezclador.';
    } catch (_) {
      assetId.focus();
      assetId.select();
      result.textContent = 'Seleccioné el ID; cópialo manualmente al mezclador.';
    }
  });
  window.addEventListener('pagehide', invalidatePlayback, { once: true });
})();
