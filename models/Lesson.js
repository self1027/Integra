const mongoose = require('../db/mongoose');

const phraseSchema = new mongoose.Schema({
  raw: { type: String, required: true },
  translated: { type: String, default: null },
  language: { type: String, default: null },
  confidence: { type: Number, default: null },
  isPrimary: { type: Boolean, default: true },
  timestamp: { type: Date, default: Date.now }
});

const lessonSchema = new mongoose.Schema({
  title: { type: String, default: 'Aula sem título' },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, required: true },
  phrases: [phraseSchema], // Array de frases
  totalPhrases: { type: Number, default: 0 },
  duration: { type: Number, default: 0 } // em segundos
}, {
  timestamps: true
});

const Lesson = mongoose.model('Lesson', lessonSchema);

module.exports = Lesson;