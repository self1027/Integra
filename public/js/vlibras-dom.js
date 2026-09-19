export function initDOMManipulations() {
  const maxAttempts = 30;
  let attempts = 0;
  let widgetInitialized = false;
  let widgetOpenRequested = false;

  const centerWidget = () => {
    const appRoot = document.getElementById('vlibras-app-root');

    if (!appRoot) return;

    appRoot.style.setProperty('position', 'fixed', 'important');
    appRoot.style.setProperty('top', '50%', 'important');
    appRoot.style.setProperty('left', '50%', 'important');
    appRoot.style.setProperty('right', 'auto', 'important');
    appRoot.style.setProperty('bottom', 'auto', 'important');

    appRoot.style.setProperty(
      'transform',
      'translate(-50%, -50%)',
      'important'
    );

    appRoot.style.setProperty(
      'margin',
      '0',
      'important'
    );

    appRoot.style.setProperty(
      'z-index',
      '10000',
      'important'
    );
  };

  const openWidget = () => {
    const widget = window.VLibrasWidget;

    if (!widget || typeof widget.open !== 'function') {
      return false;
    }

    try {
      widget.open();
      return true;
    } catch (error) {
      console.error(
        '[VLibras] Erro ao abrir widget:',
        error
      );

      return false;
    }
  };

  function ensureWidgetIsVisible() {
    attempts++;

    const widget = window.VLibrasWidget;

    if (!widget || typeof widget.open !== 'function') {
      if (attempts < maxAttempts) {
        setTimeout(
          ensureWidgetIsVisible,
          300
        );
      }

      return;
    }

    if (!widgetOpenRequested) {
      const opened = openWidget();

      if (!opened) {
        if (attempts < maxAttempts) {
          setTimeout(
            ensureWidgetIsVisible,
            300
          );
        }

        return;
      }

      widgetOpenRequested = true;
    }

    centerWidget();

    if (!widgetInitialized) {
      widgetInitialized = true;

      const appObserver = new MutationObserver(() => {
        centerWidget();
      });

      appObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      const monitorVLibras = () => {
        const player = window.plugin?.player;

        if (!player) {
          setTimeout(
            monitorVLibras,
            200
          );

          return;
        }

        player.on('start:welcome', () => {
          try {
            player.emit(
              'stop:welcome',
              true
            );
          } catch (e) {}

          try {
            const skipBtn = document.querySelector(
              'button.vpw-skip-welcome-message[title="Pular animação"]'
            );

            if (skipBtn) {
              skipBtn.click();
              skipBtn.style.display = 'none';
            }
          } catch (e) {}
        });
      };

      monitorVLibras();

      const observeLegendaButton = () => {
        const observer = new MutationObserver(
          (mutations, obs) => {
            const btnLegenda = document.querySelector(
              'path[d="M10.4 15.8H12.1V14.1H10.4V15.8ZM10.4 19.2H17.2V17.5H10.4V19.2ZM18.9 19.2H20.6V17.5H18.9V19.2ZM13.8 15.8H20.6V14.1H13.8V15.8ZM8.7 22.6C8.2325 22.6 7.83243 22.4337 7.4998 22.1011C7.1666 21.7679 7 21.3675 7 20.9V10.7C7 10.2325 7.1666 9.83243 7.4998 9.4998C7.83243 9.1666 8.2325 9 8.7 9H22.3C22.7675 9 23.1679 9.1666 23.8337 9.83243C24 10.2325 24 10.7V20.9C24 21.3675 23.8337 21.7679 23.5011 22.1011C23.1679 22.4337 22.7675 22.6 22.3 22.6H8.7Z"]'
            );

            if (!btnLegenda) {
              return;
            }

            btnLegenda.dispatchEvent(
              new MouseEvent(
                'click',
                { bubbles: true }
              )
            );

            obs.disconnect();
          }
        );

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      };

      observeLegendaButton();
    }
  }

  setTimeout(
    ensureWidgetIsVisible,
    400
  );

  const hideBoxes = new MutationObserver(() => {
    const selectTextLabel = document.querySelector(
      '.vpw-selectTextLabel'
    );

    if (selectTextLabel) {
      selectTextLabel.style.setProperty(
        'display',
        'none',
        'important'
      );
    }

    const vpwBox = document.querySelector(
      '[vp-box].vpw-box'
    );

    if (vpwBox) {
      vpwBox.style.setProperty(
        'display',
        'none',
        'important'
      );
    }

    document
      .querySelectorAll(
        '[vp-message-box].vpw-message-box'
      )
      .forEach(box => {
        const message = box.querySelector(
          '.vpw-message'
        );

        if (
          message &&
          message.textContent.trim() ===
            'Tempo de requisição excedido.'
        ) {
          box.style.setProperty(
            'display',
            'none',
            'important'
          );
        }
      });
  });

  hideBoxes.observe(document.body, {
    childList: true,
    subtree: true
  });
}