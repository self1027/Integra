const express = require('express');
const router = express.Router();
const Lesson = require('../models/Lesson');

router.get('/', async (req, res) => {
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

router.get('/select', async (req, res) => {
  try {
    const lessonId = req.query.lesson;
    
    if (lessonId) {
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
      return res.redirect('/lesson/list');
    }
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

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

router.get('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson não encontrada' });
    res.json(lesson);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { startedAt, endedAt, entries } = req.body;

    if (!startedAt || !endedAt) {
      return res.status(400).json({ error: "startedAt e endedAt são obrigatórios" });
    }

    const duration = Math.round((new Date(endedAt) - new Date(startedAt)) / 1000);

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

router.delete('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson não encontrada' });
    res.json({ message: 'Lesson deletada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/rename', async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }

    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { title: title.trim() },
      { new: true, runValidators: true }
    );

    if (!lesson) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    res.json({ message: 'Aula renomeada com sucesso', lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;