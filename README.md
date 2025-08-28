# Sistema de Transcrição de Voz para LIBRAS

## Funcionamento

1. O usuário fala no microfone através do navegador
2. O áudio é enviado via WebSocket para o servidor Node.js
3. O servidor processa o áudio com **Google Speech-to-Text (GSTT)** ou **Vosk** (offline)
4. O texto transcrito é enviado de volta ao navegador em tempo real
5. O VLibras converte o texto em sinais de LIBRAS

## Arquitetura do Sistema

### Múltiplos Motores de Reconhecimento:
- **Google Speech-to-Text (GSTT)**: Reconhecimento em nuvem com alta precisão (padrão)
- **Vosk**: Reconhecimento offline para uso local sem internet

### Fluxo de Áudio em Tempo Real:
- Captura de áudio do microfone → WebSocket → Servidor
- Processamento com FFmpeg para conversão de formato
- Reconhecimento de fala contínuo com detecção automática de utterances
- Transcrições enviadas em tempo real (resultados intermediários e finais)

## Requisitos

### Servidor:
- Node.js 18+
- FFmpeg instalado
- Chave API do Google Cloud (para GSTT)
- **OU** Modelo Vosk para reconhecimento offline

### Cliente:
- Navegador moderno (Chrome, Firefox ou Edge)
- Acesso ao microfone
- Conexão HTTPS (requerido para acesso ao microfone)

## Instalação

### Opção 1: Google Speech-to-Text (Recomendado - Maior Precisão)
```bash
# 1. Configure as credenciais do Google Cloud no .env
export GOOGLE_APPLICATION_CREDENTIALS="caminho/para/sua/chave.json"

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
node index.js
```

### Opção 2: Vosk (Offline - Sem Internet)
```bash
# 1. Baixe o modelo de voz português:
wget https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip
unzip vosk-model-small-pt-0.3.zip

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
node index.js
```

## Uso

### Acesso via Navegador:
- **Google STT**: https://localhost/app?engine=gstt
- **Vosk**: https://localhost/app?engine=vosk

### Controles:
- **Botão Iniciar**: Começa a captura de áudio e transcrição
- **Botão Parar**: Interrompe a transcrição
- **Status em Tempo Real**: Mostra o estado da conexão e transcrição

### Parâmetros de URL:
- `?engine=gstt` - Usa Google Speech-to-Text (padrão)
- `?engine=vosk` - Usa reconhecimento offline Vosk

## Funcionalidades Avançadas

### Transcrição Contínua:
- Detecção automática de frases completas
- Múltiplas utterances em uma única sessão
- Reinício automático do stream para reconhecimento contínuo

### Processamento de Áudio:
- Conversão em tempo real para formato PCM
- Resampling para taxa de amostragem ideal
- Suporte a diferentes taxas de amostragem de microfone

### Tolerância a Falhas:
- Reconexão automática em caso de erros
- Buffer de áudio durante reinicializações
- Fallback entre motores de reconhecimento

## Segurança

- HTTPS obrigatório para acesso ao microfone
- WebSocket seguro (WSS)
- Certificado SSL auto-assinado para desenvolvimento
- Validação de origem e formato de áudio

## Desenvolvimento

### Estrutura de Arquivos:
```
/
├── audioPipeline/
│   ├── ffmpeg.js          # Processamento de áudio
│   ├── gsttPipeline.js    # Google Speech-to-Text
│   └── voskRecognizer.js  # Reconhecimento offline
├── wsServer/
│   └── websocket.js       # Servidor WebSocket
├── public/
│   ├── app.html           # Interface principal
│   └── landpage.html      # Página inicial
├── config.js              # Configurações
└── index.js               # Servidor principal
```

## Troubleshooting

### Problemas Comuns:
1. **Microfone não acessível**: Verifique permissões HTTPS
2. **Erro de conexão**: Verifique se o servidor está rodando
3. **Áudio não processado**: Verifique instalação do FFmpeg

### Logs de Debug:
```bash
DEBUG=* node index.js  # Logs detalhados
```

Este sistema fornece uma solução completa para transcrição de voz em tempo real com suporte a múltiplos motores de reconhecimento e integração com VLibras para tradução em LIBRAS.