function monitorarFimTraducao(callback) {
  const playerElement = document.querySelector('[vp]');

  if (!playerElement) {
    console.warn('Elemento [vp] (VLibras player) não encontrado.');
    return;
  }

  function aoTerminarTraducao() {
    callback();
  }

  playerElement.removeEventListener('gloss:end', aoTerminarTraducao);
  playerElement.addEventListener('gloss:end', aoTerminarTraducao);
}

function traduzirTextosSequencialmente(textos, callbackFinal) {
  let index = 0;

  function traduzirProximo() {
    if (index >= textos.length) {
      callbackFinal?.();
      return;
    }

    const textoAtual = textos[index];
    window.plugin?.player?.translate(textoAtual);

    monitorarFimTraducao(() => {
      index++;
      traduzirProximo();
    });

    setTimeout(() => {
      if (textos[index] === textoAtual) {
        index++;
        traduzirProximo();
      }
    }, 15000);
  }

  traduzirProximo();
}

function patchVLibras() {
  if (!window.plugin) {
    setTimeout(patchVLibras, 500);
    return;
  }

  window.VLibras.translateElement = function (element, onComplete) {
    if (!element) return;

    const text = element.innerText || element.textContent;
    if (!text?.trim()) return;

    const player = window.plugin?.player;
    if (!player || typeof player.translate !== 'function') return;

    player.translate(text);

    const legendaContainer = document.querySelector('[vw] [vw-texto]');
    if (!legendaContainer) return;

    let ultimaLegenda = legendaContainer.innerText.trim();
    let timeout;

    const observer = new MutationObserver(() => {
      const novaLegenda = legendaContainer.innerText.trim();

      if (novaLegenda && novaLegenda !== ultimaLegenda) {
        ultimaLegenda = novaLegenda;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          observer.disconnect();
          onComplete?.();
        }, 1000);
      }
    });

    observer.observe(legendaContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });

    setTimeout(() => {
      observer.disconnect();
      onComplete?.();
    }, 15000);
  };
}

patchVLibras();

function patchVLibrasComGloss(onGlossEndCallback) {
  if (!window.plugin || !window.plugin.player) {
    setTimeout(() => patchVLibrasComGloss(onGlossEndCallback), 500);
    return;
  }

  const player = window.plugin.player;

  if (player._glossEndPatched) return;

  const originalEmit = player.emit;
  player.emit = function(event, ...args) {
    if (event === 'gloss:end') {
      onGlossEndCallback?.();
    }
    return originalEmit.call(this, event, ...args);
  };

  player._glossEndPatched = true;
}

document.addEventListener('DOMContentLoaded', function () {
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

        observer.observe(pluginWrapper, {
          attributes: true,
          attributeFilter: ['class']
        });
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
  const fraseFinalizada = filaFrases.shift();
  lendo = false;
  iniciarVLibrasAutomatico();
});

window.adicionarFraseNova = function(texto) {
  if (texto && typeof texto === 'string' && texto.trim() !== '') {
    filaFrases.push(texto.trim());
    iniciarVLibrasAutomatico();
  }
};