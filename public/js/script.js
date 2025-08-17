function patchVLibrasComGloss(onGlossEndCallback) { 
  // Permite acessar gloss:end para saber quando acabou a interpretação e chamar prox elemento da fila
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

/* ---------------------------
   BLOCO DA FILA SIMPLIFICADA
----------------------------*/
const filaFrases = [];
let lendo = false;

function iniciarVLibrasAutomatico() {
  if (lendo || filaFrases.length === 0) return;

  if (!window.plugin?.player) {
    // player ainda não pronto → tenta de novo
    setTimeout(iniciarVLibrasAutomatico, 300);
    return;
  }

  lendo = true;
  window.plugin.player.translate(filaFrases[0]);
}

patchVLibrasComGloss(() => {
  filaFrases.shift();     // remove a frase que acabou
  lendo = false;          // libera para próxima
  iniciarVLibrasAutomatico(); // tenta próxima
});

window.adicionarFraseNova = function(texto) {
  if (typeof texto === 'string' && texto.trim()) {
    const estavaVazia = filaFrases.length === 0;
    filaFrases.push(texto.trim());
    if (estavaVazia) iniciarVLibrasAutomatico();
  }
};
