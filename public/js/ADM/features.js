function addPhraseToContainer({ raw, translated, language = null, confidence = null, isPrimary = null }) {
  const container = document.getElementById('phrases-container');
  if (!container) return;

  const card = document.createElement('div');
  card.classList.add('phrase-card');

  // Badge da linguagem com cor baseada na língua primária/secundária
  if (language) {
    const langBadge = document.createElement('span');
    langBadge.classList.add('language-badge');
    langBadge.textContent = `🌐 ${language}`;
    
    // Adiciona classe baseada se é primária ou secundária
    if (isPrimary !== null) {
      langBadge.classList.add(isPrimary ? 'language-primary' : 'language-secondary');
    }
    
    if (confidence) {
      langBadge.title = `Confiança: ${(confidence * 100).toFixed(1)}%`;
    }
    card.appendChild(langBadge);
  }

  // Texto detectado
  const textEl = document.createElement('p');
  textEl.classList.add('detected-text');
  textEl.textContent = raw;
  card.appendChild(textEl);

  // Se houver tradução disponível, adiciona botão de exibir tradução
  if (translated) {
    const btn = document.createElement('button');
    btn.classList.add('translation-btn');
    btn.textContent = 'Ver tradução';
    card.appendChild(btn);

    const translationEl = document.createElement('p');
    translationEl.classList.add('translation');
    translationEl.textContent = translated;
    translationEl.style.display = 'none';
    card.appendChild(translationEl);

    btn.addEventListener('click', () => {
      const isHidden = translationEl.style.display === 'none';
      translationEl.style.display = isHidden ? 'block' : 'none';
      btn.textContent = isHidden ? 'Ocultar tradução' : 'Ver tradução';
    });
  }

  container.appendChild(card);
  
  // Scroll automático para a nova frase
  container.scrollTop = container.scrollHeight;
}

window.addNewPhrase = (data) => {
  addPhraseToContainer({
    raw: data.raw,
    translated: data.translated,
    language: data.language ?? null,
    confidence: data.confidence ?? null,
    isPrimary: data.isPrimary ?? null
  });
  console.log('Frase adicionada:', data);
};