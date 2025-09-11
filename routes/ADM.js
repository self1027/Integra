const express = require('express')
const router = express.Router()

router.get('/', (_, res) => res.render('ADM/select'));

router.get('/app', (req, res) => {
    const { main, secondary } = req.query;

    if (!main || !secondary) {
        return res.status(400).json({ error: 'Parâmetros main e secondary são obrigatórios' });
    }

    res.render('ADM/app', {
        main,
        secondary
    });
});

module.exports = router