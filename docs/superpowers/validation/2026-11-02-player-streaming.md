# Validação — player incremental

Data: 02/11/2026. Ambiente: Windows, Node 22.23.3, FFmpeg no PATH, Vosk 0.3.39 com vosk-model-small-pt-0.3 e Chromium via Playwright. Nenhuma dependência de produção adicionada.

## Testes automatizados

`npm test`: **23 testes passaram**, sem falhas. `git diff --check`: sem problemas.

Cobertura: estabilidade durante a fala, margem de contexto, revisões com tradução em voo, ordem de respostas, repetição real de palavras, final com tokenização diferente, ordem entre enunciados, barreira de conflito, fila limitada com drenagem integral, cancelamento, autorização negada e posterior liberação, loading/idle duplicado, sequência real do Unity, erro/timeout/cancelamento de tradução, separação de PCM/controle, metadados inválidos, flush e morte do FFmpeg por sinal.

Os cenários encontrados na revisão independente foram primeiro reproduzidos com testes que falharam e depois corrigidos. O revisor confirmou as correções.

## Reconhecimento nativo

Gravação sintetizada localmente com a voz Microsoft Maria, pt-BR, duração de 20,63 s. Convertida para PCM mono de 16 kHz pelo FFmpeg. O Vosk nativo produziu 57 resultados parciais com palavras temporizadas antes do flush final. Não foi usado o microfone real do usuário.

## Navegador com serviços reais

A gravação foi usada como microfone virtual do Chromium. O site carregou o Unity local, chamou a API de tradução pelo backend e buscou os bundles no dicionário público. A ausência de `window.plugin` foi confirmada durante a execução.

Execução final, com cache de traduções em memória já aquecido:

| Evento após conectar | Tempo |
| --- | ---: |
| Primeiro comando de reprodução autorizado | 4,25 s |
| Primeiro sinal confirmado pelo CounterGloss do Unity | 8,46 s |
| Primeiro texto final do Vosk | 20,89 s |
| Captura encerrada e áudio drenado | 23,41 s |
| Fila de sinais completamente drenada | 62,76 s |

Para verificar a drenagem completa, a velocidade foi alterada manualmente de 1× para 2× após encerrar a captura, em torno de 23 s. Os tempos iniciais foram medidos a 1×. Uma execução anterior sem cache de tradução teve primeiro sinal em 8,79 s e texto final em 20,94 s. Estes números são observações locais, não metas garantidas nem comparação completa contra a versão antiga.

Na execução final foram reproduzidos 13 blocos. A concatenação literal de seus textos foi comparada ao primeiro enunciado final do Vosk e foi idêntica: sem perda ou repetição textual nesse cenário. A fila terminou vazia, o avatar confirmou o término e o botão de conectar foi reabilitado. Não houve erro JavaScript de página.

Desktop: 1280 px. Mobile: 390 px. Capturas foram inspecionadas; não houve rolagem horizontal em nenhum tamanho. Foram recebidas 48 requisições do dicionário, incluindo redirecionamentos e bundles.

## Permissões de captura

Dois cenários foram exercitados no navegador, substituindo apenas a fronteira de permissão do microfone:

- Recusa de acesso: erro visível, botão de conectar habilitado, botão de parar desabilitado e nenhuma conexão WebSocket aberta.
- Cancelar enquanto a permissão está pendente e concedê-la depois: tracks do stream tardio encerradas, nenhuma conexão iniciada e controles disponíveis novamente.

## Integridade dos arquivos do player

Os cinco arquivos obtidos do upstream, incluindo a licença, foram comparados por SHA-256 com o manifesto public/player/upstream.json. Todos conferem com o commit fixado be3fa2506a7c43e36e2ba551483cb5f89388d495.

## Limites desta validação

Não houve teste com a voz real do usuário, avaliação de compreensão por uma pessoa fluente em Libras ou medição em celular físico. Blocos menores podem reduzir contexto linguístico; a duração dos sinais pode exceder a duração da fala. Tradução e sinais continuam dependendo das APIs públicas. A primeira carga local do Unity inclui aproximadamente 20 MB de binários.

Áudio, capturas e telemetria da verificação ficaram no diretório temporário local integra-streaming-check, fora do repositório. O servidor usado na validação foi encerrado ao finalizar; iniciar novamente com npm start.
