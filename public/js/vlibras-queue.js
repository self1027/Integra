// VLibras phrase queue system
export function initVLibrasQueue(patchVLibrasGlossEnd) {
  const phraseQueue = [];
  let isReading = false;

  function startVLibrasQueue() {
    if (isReading || phraseQueue.length === 0) return;
    if (!window.plugin?.player) {
      setTimeout(startVLibrasQueue, 300);
      return;
    }
    isReading = true;
    window.plugin.player.translate(phraseQueue[0]);
  }

  patchVLibrasGlossEnd(() => {
    phraseQueue.shift();
    isReading = false;
    startVLibrasQueue();
  });

  window.addNewPhrase = function(text) {
    if (typeof text === 'string' && text.trim()) {
      const wasEmpty = phraseQueue.length === 0;
      phraseQueue.push(text.trim());
      if (wasEmpty) startVLibrasQueue();
    }
  };
}
