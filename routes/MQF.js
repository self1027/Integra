const express = require('express')
const router = express.Router()

router.get('/', (_, res) => res.render('MQF/landpage'));
router.get('/app', (_, res) => res.render('MQF/app'));

module.exports = router