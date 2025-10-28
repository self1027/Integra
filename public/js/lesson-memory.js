// LessonMemory.js
class LessonMemory {
  constructor() {
    this.resetLesson();
  }

  startLesson() {
    this.entries = [];
    this.startedAt = new Date().toISOString();
    console.log('[LessonMemory] Aula iniciada:', this.startedAt);
  }

  addEntry({ raw, translated = null, confidence = null, isPrimary = null, language = null }) {
    if (!this.entries) this.startLesson();
    
    const entry = {
      timestamp: new Date().toISOString(),
      raw,
      translated,
      confidence,
      isPrimary,
      language
    };
    
    this.entries.push(entry);
    console.log('[LessonMemory] Frase adicionada:', {
      total: this.entries.length,
      raw: raw.substring(0, 50) + '...'
    });
  }

  endLesson() {
    const endedAt = new Date().toISOString();
    const lessonData = {
      startedAt: this.startedAt,
      endedAt: endedAt,
      entries: this.entries || []
    };
    
    console.log('[LessonMemory] Aula finalizada:', {
      startedAt: this.startedAt,
      endedAt: endedAt,
      totalPhrases: this.entries?.length || 0
    });
    
    // NÃO faz reset aqui - só retorna os dados
    return lessonData;
  }

  getEntryCount() {
    return this.entries?.length || 0;
  }

  resetLesson() {
    this.entries = [];
    this.startedAt = null;
  }

  async sendLessonToServer() {
    // Primeiro pega os dados SEM resetar
    const data = this.endLesson();
    
    try {
      const response = await fetch('/lesson', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      const result = await response.json();
      console.log("[LessonMemory] Aula salva com sucesso:", result);
      
      // SÓ AQUI faz reset depois do sucesso
      this.resetLesson();
      return true;
      
    } catch (err) {
      console.error("[LessonMemory] Erro ao salvar aula:", err);
      // Em caso de erro, mantém os dados para tentar novamente
      // Não faz reset, os dados ainda estão em this.entries
      return false;
    }
  }
}

// Exportação para módulos ES6
export default LessonMemory;