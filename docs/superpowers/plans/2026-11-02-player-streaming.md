# Player incremental — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o widget e sobrepor reconhecimento, tradução e reprodução.
**Architecture:** Node mantém uma sessão por WebSocket, estabiliza palavras com tempos do Vosk e prepara traduções. O navegador controla uma fila de blocos confirmados pelo servidor e um iframe Unity local, avançando somente por eventos reais.
**Tech Stack:** Node 22, Express, ws, Vosk, FFmpeg, HTML/CSS/JS; testes com `node:test`.
**Spec:** `docs/superpowers/specs/2026-11-02-player-streaming-design.md`, aprovado pelo usuário em 02/11/2026.

## Restrições globais

- Manter APIs online e renderizador Unity existente; sem framework ou dependência de produção nova.
- Parciais a cada 200 ms; prefixo observado três vezes por 600 ms; duas palavras de margem; blocos de três a seis palavras; liberar bloco menor após 1,2 s.
- Duas traduções simultâneas, timeout de 5 s com uma nova tentativa transitória, até 12 blocos pendentes.
- Revisões invalidam blocos não iniciados; final não repete blocos consumidos.
- Parada drena áudio e preserva fila; cancelamento/queda invalida sessão.

## Review Focus

- Final com segmentação temporal diferente do parcial não deve repetir conteúdo já sinalizado.
- Evento idle duplicado não deve encerrar uma reprodução nova.
- Correção enquanto uma requisição está em voo não deve ressuscitar bloco antigo.
- Falha do microfone ou parada durante conexão não pode deixar captura ou reconexão ativa.
- Falha de FFmpeg deve encerrar recursos e informar o navegador.

### Task 1: Segmentação e tradução

**Files:** `audioPipeline/StreamingSession.js`, `audioPipeline/Translator.js`, `tests/streaming.test.js`, `tests/translator.test.js`.
**Interfaces:** `StreamingSession({send, translate, now})`: `recognize({text, words, final, audioTime})`, `playback({action,id})`, `resolve({action,utteranceId})`, `cancel()`; emite transcript, blocks, queue, conflict, error, flow_control. `Translator.translate(text,{signal})` retorna glosa.

- [x] Escrever e executar testes que falhem para emissão antecipada, revisão, final sem duplicar, repetição real, ordem HTTP, cancelamento e limites.
- [x] Implementar estabilização por palavras/tempos, estados dos blocos e tradução com cache limitado.
- [x] Executar testes e verificar resposta HTTP real separadamente.

### Task 2: Áudio e WebSocket

**Files:** `audioPipeline/VoskSTT.js`, `audioPipeline/Ffmpeg.js`, `wsServer/websocket.js`, `config.js`, `index.js`, `tests/audio.test.js`, `tests/websocket.test.js`.
**Interfaces:** Vosk chama `onRecognition` com palavras e finais; `finish()` drena FFmpeg antes de `stt.finish()`; WebSocket encaminha controles de início/fim/reprodução/recuperação para a sessão.

- [x] Testar parcial, flush final, metadados inválidos, frame de controle após início e parada com áudio pendente.
- [x] Conectar sessão ao pipeline, distinguir frames binários e JSON e limpar recursos de forma idempotente.
- [x] Testar com modelo nativo e gravação sintetizada localmente quando houver voz instalada.

### Task 3: Player e interface

**Files:** `public/player/*`, `public/js/player.js`, `public/js/audio_ws.js`, `public/app.html`, `public/css/MQF/app.css`, `tests/player.test.js`.
**Interfaces:** ponte `{type:'unity',object,method,params}` e eventos `{type:'unity_event',event,data}`; servidor autoriza cada bloco antes de tocar e recebe started/ended. Iframe valida origem, parent e comandos.

- [x] Testar estados de loading/playing/idle e idle repetido, invalidação e autorização tardia.
- [x] Obter arquivos Unity da referência fixa, manter licença e manifesto de origem/hashes.
- [x] Integrar fila autorizada, controles, transcrição, conflitos, cancelamento e métricas; remover módulos do widget.
- [x] Verificar interface e reprodução com navegador real e API/dicionário reais.

### Task 4: Verificação e revisão

**Files:** `README.md`, `package.json`, testes e documentos de acompanhamento.

- [x] Atualizar comandos e documentação do funcionamento e limites.
- [x] Executar suite completa, smoke de servidor/áudio e navegador, e `git diff --check`.
- [x] Solicitar revisão independente conforme `requesting-code-review` e corrigir problemas importantes com regressões.
- [x] Entregar alterações locais revisáveis; não publicar ou enviar ao GitHub.

## Registro de execução

- Ruling: execução nesta sessão e checkout atual `demo`, sem worktree adicional ou commits automáticos — usuário autorizou implementar e pediu solução enxuta; facilita testar no ambiente com modelo/certificados já presentes.
- Pre-flight: Task 1 define mensagens e autorização consumidas por Task 2 e Task 3; manter sessionId/id em todas as respostas. Task 2 deve continuar permitindo controles após fim da captura para drenar a fila.
- Baseline: não existia suite automatizada; `npm test` era somente um comando que encerra com erro. Node 22.23.3 carrega o Vosk nativo neste ambiente.
- Task 1: testes RED por módulos ausentes; GREEN após implementação. A margem de duas palavras incide sobre a hipótese mais recente, não subtrai novamente do prefixo estável; regressão RED/GREEN com hipótese crescente. A espera de bloco pequeno começa quando há conteúdo estável pendente.
- Task 2: testes RED de callback parcial e finish ausente; GREEN com drenagem real FFmpeg. Modelo nativo: 57 parciais temporizados em gravação sintetizada de 20,63 s.
- Task 3: módulo .mjs permite testar a mesma implementação no navegador e Node sem bundler. Build real do Unity usa CounterGloss positivo como confirmação do sinal após loading; regressão RED/GREEN cobre essa sequência.
- Final review: revisão independente encontrou perda por índices antigos após reconciliação temporal, ordem entre enunciados, barreira global de conflito e morte do FFmpeg por sinal. Os quatro problemas foram reproduzidos RED e corrigidos GREEN, com confirmação do revisor.
- Final review: recusa silenciosa de autorização travava pendingId. Adicionado play_denied precedido de snapshot atual e regressão integrada de sessão/player; confirmação independente: 4/4 testes de player passam.
- Ruling: arquivos Unity são locais e versionados com manifesto SHA-256 e licença; nenhuma dependência de produção foi adicionada. Playwright foi usado somente no cache de ferramentas para a validação manual.
- Task 4: npm test 23/23 GREEN; git diff --check sem problemas. Chromium com microfone sintetizado: primeiro sinal 8,46 s e texto final 20,89 s; fila drenada, textos dos 13 blocos idênticos ao final, sem erros JS. Recusa e cancelamento de permissão verificados. Relatório em docs/superpowers/validation/2026-11-02-player-streaming.md.
