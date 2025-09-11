const express = require('express')
const router = express.Router()

router.get('/select-language', (_, res) => res.render('lessons/select'));

router.get('/lesson', (req, res) => {
    const { main, secondary } = req.query;

    if (!main || !secondary) {
        return res.status(400).json({ error: 'Parâmetros main e secondary são obrigatórios' });
    }

    res.render('lessons/app', {
        main,
        secondary
    });
});

module.exports = router