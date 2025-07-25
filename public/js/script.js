function patchVLibrasComGloss(onGlossEndCallback) { //Permite acessar gloss:end para saber quando acabou a interpretação e chamar prox elemento do array
  if (!window.plugin || !window.plugin.player) {
    setTimeout(() => patchVLibrasComGloss(onGlossEndCallback), 500);
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

document.addEventListener('DOMContentLoaded', function() {
  const widget = new window.VLibras.Widget({
    rootPath: 'https://vlibras.gov.br/app',
    position: 'T',
    opacity: 0.95
  });

  let widgetInitialized = false;
  const maxAttempts = 15;
  let attempts = 0;

  function ensureWidgetVisible() {
    attempts++;
    const mainWidget = document.querySelector('[vw].enabled');
    const pluginWrapper = document.querySelector('[vw-plugin-wrapper]');
    const accessButton = document.querySelector('[vw-access-button]');

    if (mainWidget && pluginWrapper && accessButton) {
      mainWidget.classList.add('centered');
      accessButton.classList.add('permanently-hidden');

      if (!pluginWrapper.classList.contains('active')) {
        accessButton.click();
      }

      if (!widgetInitialized) {
        widgetInitialized = true;
        const observer = new MutationObserver(() => {
          if (!pluginWrapper.classList.contains('active')) {
            pluginWrapper.classList.add('active');
          }
          if (!mainWidget.classList.contains('centered')) {
            mainWidget.classList.add('centered');
          }
        });
        observer.observe(pluginWrapper, { attributes: true });
      }
    } else if (attempts < maxAttempts) {
      setTimeout(ensureWidgetVisible, 300);
    }
  }

  setTimeout(ensureWidgetVisible, 1000);

  window.addEventListener('resize', () => {
    const mainWidget = document.querySelector('[vw].enabled');
    if (mainWidget) {
      mainWidget.classList.add('centered');
    }
  });
});

const filaFrases = [];
let lendo = false;

function iniciarVLibrasAutomatico() {
  if (lendo || filaFrases.length === 0 || !window.plugin?.player) return;

  const frase = filaFrases[0];
  lendo = true;
  window.plugin.player.translate(frase);
}

patchVLibrasComGloss(() => {
  filaFrases.shift();
  lendo = false;
  iniciarVLibrasAutomatico();
});

window.adicionarFraseNova = function(texto) {
  if (texto && typeof texto === 'string' && texto.trim() !== '') {
    filaFrases.push(texto.trim());
    iniciarVLibrasAutomatico();
  }
};