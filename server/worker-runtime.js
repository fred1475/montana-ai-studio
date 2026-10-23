'use strict';

// Server-only composition root; not a deployed Worker and no live credential.
// Deliberately requires a reviewed, REAL policy adapter and audio decoder.
const { createPrivateMusicGateway } = require('./worker-api');
const { createPrivateR2AudioStore } = require('./r2-audio-store');
const { createLyriaProvider } = require('./lyria-provider');
const { createDecodedMp3Inspector } = require('./mp3-inspection');

function createCloudflareMusicRuntime({
  screen, inspectMp3, decodeMp3, fetchImpl = globalThis.fetch, quotaFactory
} = {}) {
  // Production should provide decodeMp3: the inspector then measures duration
  // from complete PCM rather than trusting provider metadata. inspectMp3 is
  // retained for isolated contract tests only.
  if (decodeMp3 !== undefined && inspectMp3 !== undefined) {
    throw new TypeError('Supply one trusted decoder pathway only');
  }
  const inspector = typeof decodeMp3 === 'function' ?
    createDecodedMp3Inspector({ decodeMp3 }) : inspectMp3;
  if (typeof screen !== 'function' || typeof inspector !== 'function' ||
      typeof fetchImpl !== 'function') {
    throw new TypeError('Reviewed screening, actual MP3 decoding and fetch are mandatory');
  }

  const storageFor = env => {
    if (!env?.R2 || typeof env.R2.put !== 'function' ||
        typeof env.R2.get !== 'function') {
      throw new Error('PRIVATE_STORAGE_NOT_CONFIGURED');
    }
    return createPrivateR2AudioStore({ bucket: env.R2, inspectMp3: inspector });
  };

  return createPrivateMusicGateway({
    quotaFactory,
    policyScreen: screen,
    audioStoreFactory: storageFor,
    providerFactory: env => {
      if (typeof env?.LYRIA_API_KEY !== 'string' || env.LYRIA_API_KEY.length < 10) {
        throw new Error('PRIVATE_PROVIDER_NOT_CONFIGURED');
      }
      const storage = storageFor(env);
      return createLyriaProvider({
        apiKey: env.LYRIA_API_KEY,
        storeAudio: storage.storeAudio,
        fetchImpl
      });
    }
  });
}

module.exports = { createCloudflareMusicRuntime };
