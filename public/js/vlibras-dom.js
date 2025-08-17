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

  // Monitor VLibras intro
  (function monitorVLibrasIntro() {
    let skippedIntro = false;
    const interval = setInterval(() => {
      const skipButton = document.querySelector('.vpw-skip-welcome-message');
      if (skipButton && !skippedIntro) {
        skipButton.click();
        skipButton.style.display = 'none';
        skippedIntro = true;
      }
      if (skippedIntro) {
        const vpwBox = document.querySelector('[vp-box].vpw-box');
        if (vpwBox) {
          vpwBox.style.display = 'none';
          if (window.getComputedStyle(vpwBox).display === 'none') clearInterval(interval);
        }
      }
    }, 10);
  })();

  const checkVpwBoxVisibility = setInterval(() => {
    const vpwBox = document.querySelector('[vp-box].vpw-box');
    if (vpwBox) {
      vpwBox.style.display = 'none';
      if (window.getComputedStyle(vpwBox).display === 'none') clearInterval(checkVpwBoxVisibility);
    }
  }, 10);
}
