function addPhraseToContainer({ raw, translated = null }) {
  const container = document.getElementById('phrases-container');
  if (!container) return;

  const card = document.createElement('div');
  card.classList.add('phrase-card');

  // Texto detectado
  const textEl = document.createElement('p');
  textEl.classList.add('detected-text');
  textEl.textContent = raw;
  card.appendChild(textEl);

  // Se houver tradução, cria ícone e elemento oculto
  if (translated) {
    // ícone (globinho)
    const icon = document.createElement('span');
    icon.classList.add('translation-icon');
    icon.textContent = '🌐'; // você pode trocar por um SVG se quiser
    icon.style.cursor = 'pointer';
    card.appendChild(icon);

    // elemento de tradução inicialmente oculto
    const translationEl = document.createElement('p');
    translationEl.classList.add('translation');
    translationEl.textContent = translated;
    translationEl.style.display = 'none';
    card.appendChild(translationEl);

    // clique no ícone para mostrar/ocultar
    icon.addEventListener('click', () => {
      translationEl.style.display = translationEl.style.display === 'none' ? 'block' : 'none';
    });
  }

  container.appendChild(card);
}

window.addNewPhrase = ({ raw, translated }) => {
  addPhraseToContainer({ raw, translated: translated ?? null });
};
