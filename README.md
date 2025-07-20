# Reconhecimento de Voz em Tempo Real com Vosk + Node.js (via Navegador)

Este projeto realiza transcrição de voz em tempo real em português usando o [Vosk API](https://github.com/alphacep/vosk-api) com entrada de áudio do navegador via WebSocket, utilizando Node.js no Windows.

---

## Tecnologias e dependências

- Node.js v18.x ou v20.x 64-bit  
- Vosk API + modelo vosk-model-small-pt-0.3  
- WebSocket (`ws`)  
- FFmpeg (para reamostragem em tempo real)  
- `wav` (para salvar arquivos de áudio)  
- Navegador moderno com suporte a Web Audio API  
- HTML + JavaScript para captura e envio de áudio  

---

## Situação inicial

- Código backend que capturava áudio via microfone diretamente no servidor, usando FFmpeg ou sox para captura do áudio do dispositivo local (Windows).  
- Backend realizava a transcrição com Vosk diretamente sobre este áudio capturado localmente.  
- Frontend era simples, sem captura de áudio do navegador.  
- Audio recebidos pelo backend eram diretamente a entrada do FFmpeg ou do sox, e transcrição era feita em tempo real no servidor.

---

## Limitações da abordagem inicial

- Requeria que o microfone estivesse conectado ao servidor onde o Node.js rodava.  
- Não era possível captar áudio remotamente do navegador do usuário via internet.  
- Pouca flexibilidade para integração web.

---

## Mudanças implementadas

- Passamos a capturar o áudio do microfone no navegador via Web Audio API, usando `getUserMedia`.  
- O áudio capturado (48 kHz, PCM 16-bit mono) é enviado via WebSocket para o backend.  
- No backend, o áudio recebido em 48 kHz é enviado para o FFmpeg que faz a reamostragem em tempo real para 16 kHz, formato necessário para o Vosk.  
- O áudio convertido é enviado ao reconhecedor Vosk, que faz o reconhecimento e imprime resultados parciais e finais no console.  
- Áudios brutos e convertidos são salvos localmente para debug.  
- O frontend exibe botões para conectar e desconectar a transmissão, além de mostrar status da conexão.

---

## Justificativas técnicas para as mudanças

Capturar o áudio diretamente no servidor limitava o uso da aplicação a ambientes onde o microfone estivesse fisicamente conectado à máquina do backend, inviabilizando o uso remoto via navegador. Por outro lado, capturar no frontend e enviar o áudio cru ao backend oferece flexibilidade, mas o áudio chega no formato e taxa de amostragem nativos do navegador (48 kHz). Tentar fazer a reamostragem no navegador é possível, porém traz maior complexidade, consumo de CPU do cliente e risco de perda de qualidade ou sincronização. Utilizar o FFmpeg no backend para reamostragem em tempo real garante melhor controle da qualidade do áudio, menor latência na conversão, e mantém o frontend mais simples e leve. Além disso, essa arquitetura facilita a manutenção e futuras melhorias no pipeline de processamento de áudio.

---

## Benefícios da solução atual

- Permite capturar áudio do microfone do usuário diretamente no navegador, facilitando uso remoto.  
- Usa FFmpeg no backend para garantir que o áudio esteja no formato correto para o Vosk, com alta fidelidade e baixa latência.  
- Modularidade e controle do fluxo do áudio entre frontend e backend via WebSocket.  
- Interface simples e responsiva para o usuário.  
- Logs e arquivos salvos para análise e eventuais correções.

---

## Como executar

1. Baixe e extraia o modelo de voz português:  
   https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip  
   Extraia para a pasta: `./vosk-model-small-pt-0.3/`

2. Instale as dependências:  
   ```bash
   npm install
   ```

3. Instale o FFmpeg e adicione ao PATH do sistema.

4. Execute o servidor:  
   ```bash
   node index.js
   ```

5. Acesse no navegador:  
   ```
   http://localhost:3000
   ```

---

## Estrutura do projeto

```
projeto/
├── index.js               # Servidor Node.js
├── public/
│   └── index.html         # Frontend captura e envia áudio
├── vosk-model-small-pt-0.3/  # Modelo Vosk PT-BR
├── debug_audio/           # Áudios para debug (entrada e convertidos)
├── package.json
```

---

## Funcionamento resumido

- Navegador envia áudio do microfone em 48 kHz por WebSocket.  
- Backend usa FFmpeg para converter para 16 kHz em tempo real.  
- Áudio convertido é processado pelo recognizer do Vosk.  
- Resultados parciais e finais são exibidos no console do servidor.  
- Áudios são salvos para análise e debug.  
