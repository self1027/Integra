// Protocolo adaptado de spbgovbr-vlibras/vlibras-web-browsers; origem em upstream.json.
(() => {
  const post = (event, data) => parent.postMessage({ type: 'unity_event', event, data }, location.origin);
  const methods = new Set(['playNow', 'stopAll', 'setSlider', 'setBaseUrl', 'setSubtitlesState']);
  const callbacks = {
    onLoadPlayer: 'on_load_player', onPlayingStateChange: 'on_playing_state_change',
    CounterGloss: 'counter_gloss', GetAvatar: 'get_avatar', FinishWelcome: 'finish_welcome',
  };
  for (const [name, event] of Object.entries(callbacks)) {
    window[name] = (...args) => post(event, args.length === 1 ? args[0] : args);
  }
  let instance;
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || !instance) return;
    const msg = event.data;
    if (msg?.type !== 'unity' || msg.object !== 'PlayerManager' || !methods.has(msg.method)) return;
    if (msg.method === 'playNow' && (typeof msg.params !== 'string' || msg.params.length > 10000)) return;
    if (msg.method === 'setSlider' && (![0.5, 1, 1.5, 2, 3, 4].includes(msg.params))) return;
    if (msg.method === 'setSubtitlesState' && ![0, 1].includes(msg.params)) return;
    if (msg.method === 'setBaseUrl' && msg.params !== 'https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/BR/') return;
    instance.SendMessage(msg.object, msg.method, msg.params);
  });
  window.addEventListener('error', () => post('on_error'));
  try {
    instance = UnityLoader.instantiate('gameContainer', 'playerweb.json', {
      onProgress: (_, progress) => post('update_progress', progress),
      compatibilityCheck: (_, accept, deny) => {
        if (UnityLoader.SystemInfo.hasWebGL) accept();
        else { post('on_error', 'unsupported'); deny(); }
      },
    });
  } catch (error) { post('on_error', error.message); }
})();
