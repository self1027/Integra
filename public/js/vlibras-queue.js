export function initVLibrasQueue(
  patchVLibrasGlossEnd
) {
  const phraseQueue = [];

  let isReading = false;
  let fallbackTimer = null;
  let starting = false;

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const advanceQueue = () => {
    if (!isReading) {
      return;
    }

    clearFallbackTimer();

    phraseQueue.shift();

    isReading = false;

    startVLibrasQueue();
  };

  const waitForPlugin = callback => {
    if (
      window.plugin &&
      (
        typeof window.plugin.translate === 'function' ||
        typeof window.plugin.player?.translate === 'function'
      )
    ) {
      callback();
      return;
    }

    setTimeout(
      () => waitForPlugin(callback),
      300
    );
  };

  async function startVLibrasQueue() {
    if (
      isReading ||
      starting ||
      phraseQueue.length === 0
    ) {
      return;
    }

    starting = true;

    waitForPlugin(async () => {
      starting = false;

      if (
        isReading ||
        phraseQueue.length === 0
      ) {
        return;
      }

      const phraseObj = phraseQueue[0];

      const textToTranslate = (
        phraseObj.texto ||
        phraseObj.raw ||
        ''
      ).trim();

      if (!textToTranslate) {
        advanceQueue();
        return;
      }

      isReading = true;

      try {
        if (
          typeof window.plugin.translate === 'function'
        ) {
          await window.plugin.translate(
            textToTranslate
          );
        } else if (
          typeof window.plugin.player?.translate ===
          'function'
        ) {
          await window.plugin.player.translate(
            textToTranslate
          );
        } else {
          throw new Error(
            'Nenhum método de tradução disponível.'
          );
        }

        const estimatedTime = Math.max(
          textToTranslate.length * 150,
          4000
        );

        fallbackTimer = setTimeout(() => {
          console.warn(
            '[VLibras Queue] Avanço forçado por timeout de animação'
          );

          advanceQueue();
        }, estimatedTime);
      } catch (err) {
        console.error(
          '[VLibras Queue] Erro ao disparar tradução:',
          err
        );

        advanceQueue();
      }
    });
  }

  patchVLibrasGlossEnd(() => {
    advanceQueue();
  });

  window.addNewPhrase = function (phraseData) {
    let text = '';

    if (typeof phraseData === 'string') {
      text = phraseData.trim();
    } else if (
      typeof phraseData === 'object' &&
      phraseData
    ) {
      text = (
        phraseData.texto ||
        phraseData.raw ||
        ''
      ).trim();
    }

    if (!text) {
      return;
    }

    const wasEmpty =
      phraseQueue.length === 0;

    if (
      typeof phraseData === 'object' &&
      phraseData
    ) {
      phraseQueue.push(
        phraseData
      );
    } else {
      phraseQueue.push({
        raw: text
      });
    }

    if (wasEmpty) {
      startVLibrasQueue();
    }
  };
}