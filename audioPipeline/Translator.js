class Translator {
  constructor({ url = 'https://traducao2.vlibras.gov.br/translate', timeout = 5000 } = {}) {
    this.url = url;
    this.timeout = timeout;
    this.cache = new Map();
  }

  async translate(text, { signal } = {}) {
    signal?.throwIfAborted();
    if (this.cache.has(text)) return this.cache.get(text);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.any([AbortSignal.timeout(this.timeout), ...(signal ? [signal] : [])]),
        });
        if (!response.ok) {
          const error = new Error(`Tradução indisponível (HTTP ${response.status}).`);
          error.transient = response.status === 429 || response.status >= 500;
          throw error;
        }
        let gloss = await response.text();
        try {
          const parsed = JSON.parse(gloss);
          gloss = typeof parsed === 'string' ? parsed : parsed.traducao;
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
        if (typeof gloss !== 'string' || !gloss.trim()) throw new Error('Tradução vazia ou inválida.');
        gloss = gloss.trim();
        this.cache.set(text, gloss);
        if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value);
        return gloss;
      } catch (error) {
        signal?.throwIfAborted();
        const transient = error.transient || error.name === 'TimeoutError' || error instanceof TypeError;
        if (attempt || !transient) throw error;
      }
    }
  }
}

module.exports = { Translator };
