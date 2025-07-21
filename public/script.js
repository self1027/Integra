function monitorarFimTraducao(callback) { // TODO: Fazer funcionar com gloss:End
  const playerElement = document.querySelector('[vp]');

  if (!playerElement) {
    console.warn('Elemento [vp] (VLibras player) não encontrado.');
    return;
  }

  function aoTerminarTraducao() {
    console.log('Evento gloss:end capturado');
    callback();
  }

  playerElement.removeEventListener('gloss:end', aoTerminarTraducao); // Evita duplicidade
  playerElement.addEventListener('gloss:end', aoTerminarTraducao);
}

function traduzirTextosSequencialmente(textos, callbackFinal) {
  let index = 0;

  function traduzirProximo() {
    if (index >= textos.length) {
      console.log('✅ Todas as traduções foram concluídas');
      callbackFinal?.();
      return;
    }

    const textoAtual = textos[index];
    console.log(`🚀 Traduzindo: "${textoAtual}"`);
    window.plugin?.player?.translate(textoAtual);

    monitorarFimTraducao(() => {
      console.log(`✔️ Tradução finalizada: "${textoAtual}"`);
      index++;
      traduzirProximo();
    });

    // Timeout de segurança
    setTimeout(() => {
      if (textos[index] === textoAtual) {
        console.warn(`⏰ Timeout de tradução: "${textoAtual}"`);
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
    console.log('Traduzindo:', text);

    const legendaContainer = document.querySelector('[vw] [vw-texto]');
    if (!legendaContainer) {
      console.warn('Legenda não encontrada');
      return;
    }

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

  console.log('VLibras patch aplicado com sucesso.');
}

patchVLibras();

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
    } else {
      console.warn('VLibras não carregou completamente.');
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

function inserirTexto() {
  const entrada = document.getElementById("entradaTexto").value;
  const saida = document.getElementById("saidaTexto");

  saida.innerHTML = '';

  const novoParagrafo = document.createElement("p");
  novoParagrafo.innerText = entrada;
  saida.appendChild(novoParagrafo);

  document.dispatchEvent(new Event("vwlibras:reload"));
  document.getElementById("entradaTexto").value = '';
}
