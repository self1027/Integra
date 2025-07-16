process.env.PATH = __dirname + '/node_modules/vosk;' + process.env.PATH;
const ffi = require('ffi-napi');

try {
  const lib = ffi.Library('./node_modules/vosk/libvosk', {
    vosk_set_log_level: ['void', ['int']],
  });
  console.log("✅ Vosk e runtime carregados com sucesso!");
} catch (err) {
  console.error("❌ Falha ao carregar Vosk:", err.message);
}
