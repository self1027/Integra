# Sistema de Transcrição de Voz para LIBRAS - V1

## Funcionamento

1. O usuário fala no microfone através do navegador
2. O áudio é enviado via WebSocket para o servidor Node.js
3. O servidor processa o áudio com **Google Speech-to-Text (GSTT)** ou **Vosk** (offline)
4. O texto transcrito é enviado de volta ao navegador em tempo real
5. O VLibras converte o texto em sinais de LIBRAS

## Novas Funcionalidades (V1)

### Transcrição Bilíngue
- Reconhecimento simultâneo em dois idiomas
- Tradução automática entre português e inglês
- Detecção automática do idioma falado

### Sistema de Aulas
- Gravação e armazenamento de sessões completas
- Listagem e gerenciamento de aulas anteriores
- Renomeação de aulas para organização
- Visualização detalhada com todas as frases transcritas

### Interface Aprimorada
- Controle de gravação com feedback visual
- Exibição em tempo real das transcrições
- Navegação entre aulas gravadas
- Interface responsiva e acessível

## Arquitetura do Sistema

### Múltiplos Motores de Reconhecimento:
- **Google Speech-to-Text (GSTT)**: Reconhecimento em nuvem com alta precisão (padrão)
- **Google Bilingual STT**: Reconhecimento simultâneo em dois idiomas
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
- **Google Bilingual**: https://localhost/app?engine=gstt&main=pt-BR&secondary=en-US
- **Vosk**: https://localhost/app?engine=vosk

### Controles:
- **Botão Iniciar**: Começa a captura de áudio e transcrição
- **Botão Parar**: Interrompe a transcrição e salva a aula
- **Status em Tempo Real**: Mostra o estado da conexão e transcrição

### Parâmetros de URL:
- `?engine=gstt` - Usa Google Speech-to-Text (padrão)
- `?engine=vosk` - Usa reconhecimento offline Vosk
- `?main=pt-BR&secondary=en-US` - Configura idiomas para transcrição bilíngue

## Funcionalidades Avançadas

### Transcrição Contínua:
- Detecção automática de frases completas
- Múltiplas utterances em uma única sessão
- Reinício automático do stream para reconhecimento contínuo

### Sistema de Aulas:
- Armazenamento completo com metadados
- Duração automática da sessão
- Contagem de frases transcritas
- Interface de gerenciamento

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
│   ├── Ffmpeg.js              # Processamento de áudio
│   ├── GoogleSTT.js           # Google Speech-to-Text
│   ├── GoogleBilingualSTT.js  # Reconhecimento bilíngue
│   ├── VoskSTT.js             # Reconhecimento offline
│   └── SpeechStreamManager.js # Gerenciamento de streams
├── routes/
│   └── lesson.js              # API de gerenciamento de aulas
├── models/
│   └── Lesson.js              # Modelo de dados das aulas
├── public/
│   ├── app.html               # Interface principal
│   └── landpage.html          # Página inicial
├── config.js                  # Configurações
└── index.js                   # Servidor principal
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

---

**Versão 1.0** - Sistema completo utilizado na apresentação final do TCC. Inclui transcrição em tempo real, reconhecimento bilíngue, sistema de gravação de aulas e integração com VLibras para tradução em LIBRAS.