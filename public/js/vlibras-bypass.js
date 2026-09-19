export const disableVLibrasTextCapture = () => {
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this === document.body || this === document || this === window) {
      const fnStr = listener ? listener.toString() : '';

      const isTextCaptureHandler =
        fnStr.includes('SYNTHETIC_CLICK_FLAG') ||
        fnStr.includes('getWordAtPoint') ||
        fnStr.includes('dataset.vlibrasGloss') ||
        fnStr.includes('tooltipStore');

      if (isTextCaptureHandler) {
        return originalAddEventListener.call(this, type, function noop() {}, options);
      }
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('vlibras--hover') || target.classList.contains('vlibras--active')) {
          target.classList.remove('vlibras--hover', 'vlibras--active');
        }
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });

  const style = document.createElement('style');
  style.id = 'vlibras-override-styles';
  style.innerHTML = `
    .vlibras--hover,
    .vlibras--active,
    [class*="vlibras--hover"],
    [class*="vlibras--active"] {
      text-decoration: none !important;
      text-decoration-line: none !important;
      border-bottom: none !important;
      cursor: inherit !important;
    }

    .vlibras--hover[src],
    .vlibras--hover img {
      text-decoration: none !important;
      cursor: inherit !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
};


export function lockVLibrasToCenter() {
  if (!document.getElementById('vlibras-center-lock-style')) {
    const style = document.createElement('style');

    style.id = 'vlibras-center-lock-style';

    style.textContent = `
      .vlibras-center-container,
      [vw] {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
        z-index: 10000 !important;
      }

      [vw-plugin-wrapper],
      [vw-plugin-wrapper] > div,
      #vlibras-app,
      .widget-radius,
      .vp-box-border {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        right: auto !important;
        bottom: auto !important;
        transform: translate(-50%, -50%) !important;
        margin: 0 !important;
        pointer-events: auto !important;
        z-index: 10000 !important;
      }

      [vw-plugin-wrapper] * {
        margin-top: 0 !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function findElements(selector, root = document, results = []) {
    root.querySelectorAll(selector).forEach(el => results.push(el));

    root.querySelectorAll('*').forEach(host => {
      if (host.shadowRoot) {
        findElements(selector, host.shadowRoot, results);
      }
    });

    return results;
  }

  let updateScheduled = false;

  const applyLock = () => {
    updateScheduled = false;

    const targets = findElements(
      '[vw-plugin-wrapper], #vlibras-app, .widget-radius, [vw]'
    );

    targets.forEach(target => {
      target.style.setProperty('position', 'fixed', 'important');
      target.style.setProperty('top', '50%', 'important');
      target.style.setProperty('left', '50%', 'important');
      target.style.setProperty('right', 'auto', 'important');
      target.style.setProperty('bottom', 'auto', 'important');
      target.style.setProperty(
        'transform',
        'translate(-50%, -50%)',
        'important'
      );
      target.style.setProperty('margin', '0', 'important');
      target.style.setProperty('z-index', '10000', 'important');
    });
  };

  const scheduleApplyLock = () => {
    if (updateScheduled) return;

    updateScheduled = true;

    requestAnimationFrame(applyLock);
  };

  applyLock();

  const observer = new MutationObserver(scheduleApplyLock);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
}