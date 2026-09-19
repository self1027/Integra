export function initVLibrasWidget() {
  let patchedPlayer = null;
  let patchAttempts = 0;

  const notifyGlossEnd = callback => {
    if (typeof callback === 'function') {
      callback();
    }
  };

  const patchPlayer = callback => {
    const player = window.plugin?.player;

    if (!player) {
      patchAttempts++;

      if (patchAttempts < 100) {
        setTimeout(
          () => patchPlayer(callback),
          200
        );
      }

      return;
    }

    if (patchedPlayer === player) {
      return;
    }

    patchedPlayer = player;

    const originalStopped = player.onStopped;

    player.onStopped = function (...args) {
      if (typeof originalStopped === 'function') {
        originalStopped.apply(
          this,
          args
        );
      }

      notifyGlossEnd(callback);
    };
  };

  const patchVLibrasGlossEnd = callback => {
    window.addEventListener(
      'message',
      event => {
        const data = event.data;

        if (
          data?.type === 'GLOSS_END' ||
          data?.action === 'stopped' ||
          (
            data?.event === 'stateChange' &&
            data?.state === 'stopped'
          )
        ) {
          notifyGlossEnd(callback);
        }
      }
    );

    patchAttempts = 0;
    patchPlayer(callback);
  };

  return {
    patchVLibrasGlossEnd
  };
}