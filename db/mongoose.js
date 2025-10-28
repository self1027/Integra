const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myaudioapp';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('[MongoDB] Conectado'))
  .catch(err => console.error('[MongoDB] Erro de conexão:', err));

module.exports = mongoose;
