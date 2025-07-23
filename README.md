# Sistema de Transcrição de Voz para LIBRAS

## Funcionamento

1. O usuário fala no microfone através do navegador
2. O áudio é enviado via WebSocket para o servidor Node.js
3. O servidor processa o áudio com Vosk e FFmpeg
4. O texto transcrito é enviado de volta ao navegador
5. O VLibras converte o texto em sinais de LIBRAS

## Requisitos

- Node.js 18+
- FFmpeg instalado
- Navegador moderno (Chrome, Firefox ou Edge)

## Instalação

1. Baixe o modelo de voz português:
```
wget https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip
unzip vosk-model-small-pt-0.3.zip -d ./models/
```

2. Instale as dependências:
```
npm install
```

3. Inicie o servidor:
```
node index.js
```

4. Acesse no navegador:
http://localhost:3000
