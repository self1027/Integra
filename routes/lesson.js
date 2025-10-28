const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');

// GET /lesson/list - renderizar página de listagem
router.get('/list', async (req, res) => {
  try {
    const lessons = await Lesson.find().sort({ createdAt: -1 });
    res.render('lessons/list', { 
      lessons,
      title: 'Lista de Aulas'
    });
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

// GET /lesson/select - mostrar frases de uma aula específica
router.get('/select', async (req, res) => {
  try {
    const lessonId = req.query.lesson;
    
    if (lessonId) {
      // Mostrar frases de uma aula específica
      const lesson = await Lesson.findById(lessonId);
      if (!lesson) {
        return res.status(404).render('lessons/select', { 
          lesson: null,
          title: 'Aula não encontrada'
        });
      }
      
      return res.render('lessons/select', { 
        lesson,
        title: `Frases da Aula - ${new Date(lesson.startedAt).toLocaleString()}`
      });
    } else {
      // Se não há ID, redirecionar para lista
      return res.redirect('/lesson/list');
    }
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

// GET /lesson/:id/detail - detalhes de uma aula específica
router.get('/:id/detail', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).render('error', { error: 'Aula não encontrada' });
    
    res.render('lessons/detail', { 
      lesson,
      title: `Aula - ${new Date(lesson.startedAt).toLocaleString()}`
    });
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

// GET /lesson - listar todas as lessons
router.get('/', async (req, res) => {
  try {
    const lessons = await Lesson.find().sort({ createdAt: -1 });
    res.json(lessons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /lesson/:id - pegar uma lesson pelo ID
router.get('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson não encontrada' });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /lesson - criar nova lesson completa
router.post('/', async (req, res) => {
  try {
    const { startedAt, endedAt, entries } = req.body;

    if (!startedAt || !endedAt) {
      return res.status(400).json({ error: "startedAt e endedAt são obrigatórios" });
    }

    // Calcular duração em segundos
    const duration = Math.round((new Date(endedAt) - new Date(startedAt)) / 1000);

    // Criar a lesson com todas as frases
    const lesson = new Lesson({
      startedAt: new Date(startedAt),
      endedAt: new Date(endedAt),
      phrases: entries || [],
      totalPhrases: entries ? entries.length : 0,
      duration: duration
    });

    const savedLesson = await lesson.save();

    res.status(201).json({
      message: "Lesson salva com sucesso",
      lesson: savedLesson,
      count: savedLesson.phrases.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /lesson/:id - atualizar lesson
router.put('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { 
      new: true, 
      runValidators: true 
    });
    if (!lesson) return res.status(404).json({ error: 'Lesson não encontrada' });
    res.json(lesson);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /lesson/:id - deletar lesson
router.delete('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson não encontrada' });
    res.json({ message: 'Lesson deletada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;