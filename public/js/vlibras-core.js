// VLibras widget core
export function initVLibrasWidget() {
  const widget = new window.VLibras.Widget({
    rootPath: 'https://vlibras.gov.br/app',
    position: 'T',
    opacity: 0.95
  });

  // Patch gloss:end event
  function patchVLibrasGlossEnd(onGlossEndCallback) {
    if (!window.plugin || !window.plugin.player) {
      setTimeout(() => patchVLibrasGlossEnd(onGlossEndCallback), 500);
      return;
    }

    const player = window.plugin.player;
    if (player._glossEndPatched) return;

    const originalEmit = player.emit;
    player.emit = function(event, ...args) {
      if (event === 'gloss:end' && onGlossEndCallback) {
        onGlossEndCallback();
      }
      return originalEmit.call(this, event, ...args);
    };

    player._glossEndPatched = true;
  }

  return { widget, patchVLibrasGlossEnd };
}
