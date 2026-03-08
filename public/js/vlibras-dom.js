// DOM manipulations for VLibras
export function initDOMManipulations() {
  const maxAttempts = 15;
  let attempts = 0;
  let widgetInitialized = false;

  function ensureWidgetIsVisible() {
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
          if (!pluginWrapper.classList.contains('active')) pluginWrapper.classList.add('active');
          if (!mainWidget.classList.contains('centered')) mainWidget.classList.add('centered');
        });
        observer.observe(pluginWrapper, { attributes: true });

        //Skip welcome automático
        const monitorVLibras = () => {
          try {
            const plugin = window.plugin;
            const player = plugin?.player;

            if (!plugin || !player) {
              setTimeout(monitorVLibras, 200);
              return;
            }

            player.on('start:welcome', () => {
              try { player.emit('stop:welcome', true); } catch(e) {}

              try {
                const skipBtn = document.querySelector('button.vpw-skip-welcome-message[title="Pular animação"]');
                if (skipBtn) {
                  skipBtn.click();
                  skipBtn.style.display = 'none';
                }
              } catch(e) {}
            });

            try {
              const skipBtn = document.querySelector('button.vpw-skip-welcome-message[title="Pular animação"]');
              if (skipBtn) {
                skipBtn.click();
                skipBtn.style.display = 'none';
              }
            } catch(e) {}
          } catch (err) {
            setTimeout(monitorVLibras, 200);
          }
        };
        monitorVLibras();

        const observeLegendaButton = () => {
          const observer = new MutationObserver((mutations, obs) => {
            const btnLegenda = document.querySelector('path[d="M10.4 15.8H12.1V14.1H10.4V15.8ZM10.4 19.2H17.2V17.5H10.4V19.2ZM18.9 19.2H20.6V17.5H18.9V19.2ZM13.8 15.8H20.6V14.1H13.8V15.8ZM8.7 22.6C8.2325 22.6 7.83243 22.4337 7.4998 22.1011C7.1666 21.7679 7 21.3675 7 20.9V10.7C7 10.2325 7.1666 9.83243 7.4998 9.4998C7.83243 9.1666 8.2325 9 8.7 9H22.3C22.7675 9 23.1679 9.1666 23.5011 9.4998C23.8337 9.83243 24 10.2325 24 10.7V20.9C24 21.3675 23.8337 21.7679 23.5011 22.1011C23.1679 22.4337 22.7675 22.6 22.3 22.6H8.7Z"]');
            if (btnLegenda) {
              btnLegenda.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              obs.disconnect();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        };
        observeLegendaButton();
      }
    } else if (attempts < maxAttempts) {
      setTimeout(ensureWidgetIsVisible, 300);
    }
  }

  setTimeout(ensureWidgetIsVisible, 1000);

  window.addEventListener('resize', () => {
    const mainWidget = document.querySelector('[vw].enabled');
    if (mainWidget) mainWidget.classList.add('centered');
  });

  const hideBoxes = new MutationObserver(() => {
    // Mata a label de "Selecione um texto"
    const selectTextLabel = document.querySelector('.vpw-selectTextLabel');
    if (selectTextLabel) {
      selectTextLabel.style.setProperty('display', 'none', 'important');
    }

    const vpwBox = document.querySelector('[vp-box].vpw-box');
    if (vpwBox) vpwBox.style.display = 'none';

    document.querySelectorAll('[vp-message-box].vpw-message-box').forEach(box => {
      const message = box.querySelector('.vpw-message');
      if (message && message.textContent.trim() === 'Tempo de requisição excedido.') {
        box.style.display = 'none';
      }
    });
  });

  hideBoxes.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
