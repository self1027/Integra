// vLibrasQueue.js
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
    
    // Get the raw text from the phrase object
    const phraseObj = phraseQueue[0];
    window.plugin.player.translate(phraseObj.raw);
  }

  patchVLibrasGlossEnd(() => {
    phraseQueue.shift();
    isReading = false;
    startVLibrasQueue();
  });

  window.addNewPhrase = function(phraseData) {
    // Handle both string (backward compatibility) and object formats
    let text = '';
    
    if (typeof phraseData === 'string') {
      text = phraseData.trim();
    } else if (typeof phraseData === 'object' && phraseData.raw) {
      text = phraseData.raw.trim();
    }
    
    if (text) {
      const wasEmpty = phraseQueue.length === 0;
      
      // Store the full phrase data object if available, otherwise just the text
      if (typeof phraseData === 'object') {
        phraseQueue.push(phraseData);
      } else {
        phraseQueue.push({ raw: text });
      }
      
      if (wasEmpty) startVLibrasQueue();
    }
  };
}