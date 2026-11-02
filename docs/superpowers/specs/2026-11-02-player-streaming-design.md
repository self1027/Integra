# Integra: transcrição incremental e player sem widget

Status: aprovado pelo usuário em 02/11/2026; implementação e validação registradas no plano e no relatório de validação.

## Intenção

Murilo quer reduzir a espera entre a fala e a sinalização. Hoje o Vosk precisa detectar uma pausa, só então o texto chega à fila do widget, que inicia a tradução e depois a animação. A experiência desejada faz requisições durante a transcrição e controla a reprodução no próprio Integra.

Decisão proposta pelo autor deste desenho: continuar usando os serviços públicos de tradução e sinais nesta primeira versão, com renderizador Unity/WebGL do VLibras hospedado no Integra. O usuário descreveu requisições próprias; funcionamento totalmente offline não foi solicitado. “Player próprio” aqui significa integração, controles e fila próprios, reaproveitando o motor de animação existente. Um renderizador novo em Three.js seria outro projeto.

## Evidências verificadas

- `audioPipeline/VoskSTT.js` consulta apenas `result()` quando `acceptWaveform()` retorna verdadeiro. O pacote instalado, Vosk 0.3.39, já oferece `partialResult()`, `setPartialWords()`, `setWords()` e `finalResult()`.
- `public/js/vlibras-queue.js` inicia a tradução somente quando a frase chega à cabeça da fila de reprodução. Seu fallback usa `Math.max(text.length * 150, 4000)`. Esse timeout pode avançar a fila sem confirmação da animação; não é uma espera mínima aplicada a todas as frases.
- A integração atual depende de `window.plugin`, patches de callbacks, observadores de DOM e alterações de `EventTarget.prototype.addEventListener`.
- Os PDFs fornecidos descrevem arquitetura de 2021. O código atual de `vlibras-web-browsers` separa tradução HTTP, player em iframe e comunicação com Unity por mensagens. O repositório antigo `vlibras-player-webjs` ajuda a entender a arquitetura, mas não será instalado como solução principal.
- Referência consultada do repositório atual: commit `be3fa2506a7c43e36e2ba551483cb5f89388d495`, de 27/10/2026. A implementação deve fixar a origem dos arquivos usados e preservar seus avisos de licença.
- Teste isolado em 02/11/2026: `POST https://traducao2.vlibras.gov.br/translate`, com `{ "text": "bom dia como você está" }`, retornou HTTP 200 e glosas em aproximadamente 286 ms. HEAD no player oficial e no bundle `OBRIGADO` também retornou 200. Isso não comprova desempenho sustentado, disponibilidade futura ou qualidade linguística.
- O ZIP fornecido contém somente `padrao.blend`, com cabeçalho Blender 2.76. Não é uma distribuição completa do dicionário de sinais; seu conteúdo de animações não foi validado no Blender.

## Alternativas

| Caminho | Resultado | Custo e limite |
| --- | --- | --- |
| Ajustar apenas a fila do widget | Pode sobrepor algumas etapas | Mantém os acoplamentos que o usuário quer remover |
| Integrar diretamente o Unity/WebGL e as APIs | Player controlado pelo Integra e tradução antecipada | Caminho recomendado; mantém motor e sinais do VLibras |
| Criar outro renderizador a partir do Blender | Controle também das animações e transições | Exige adaptar o acervo, rig, expressões e animações; não resolve a espera do Vosk por si só |

## Fluxo proposto

Microfone → PCM/WebSocket → FFmpeg/Vosk → hipóteses parciais → blocos estáveis → tradução HTTP antecipada → fila ordenada → Unity/WebGL.

A transcrição, a tradução dos próximos blocos e a reprodução do bloco atual avançam simultaneamente. A transcrição visível pode mudar; a animação que já ocorreu não pode ser desfeita.

### 1. Texto durante a fala

O backend emite hipóteses parciais e resultados finais com identificação de sessão, enunciado, revisão e tempo de áudio. Exibe texto parcial assim que houver atualização, limitado inicialmente a uma atualização a cada 200 ms. O resultado final substitui a hipótese visível daquele enunciado; não adiciona novamente a frase inteira à fila.

Habilitar informação temporal de palavras no Vosk. A disponibilidade efetiva dos tempos em resultados parciais deve ser confirmada com áudio real antes de habilitar reprodução incremental por padrão.

### 2. Preparação de blocos durante a fala

Não traduzir cada palavra isoladamente nem sinalizar cada hipótese inteira. O tradutor depende de contexto e pode reordenar as glosas.

Política experimental inicial, proposta técnica a calibrar: observar prefixos iguais em pelo menos três observações distribuídas por 600 ms; reter as duas palavras mais recentes como margem para revisão; preparar blocos de três a seis palavras estáveis. Após 1,2 s de espera de conteúdo estável ainda não enviado, permitir bloco menor, mantendo a margem. Ao finalizar o enunciado, liberar o restante imediatamente.

Esses números regulam a preparação de texto; não são promessa de latência entre fala e sinal. Sem hipótese estável, a confirmação final continua necessária. A política é heurística, não segmentação linguística garantida.

Usar intervalos de palavras/tempo de áudio para identificar o que cada bloco cobre. Não remover texto por comparação de prefixos de glosas, nem deduplicar palavras pelo seu valor: repetições reais da fala devem continuar possíveis.

Uma hipótese revisada invalida os blocos afetados que ainda não começaram a tocar, inclusive requisições em voo. A revisão do bloco precisa continuar válida no momento de iniciar sua reprodução. Blocos não afetados conservam a ordem.

Se uma revisão alcançar conteúdo que já começou a ser sinalizado, deixar o bloco atual terminar e marcar a correção no texto. Não interrompê-lo no meio: a ordem das glosas pode ser diferente da ordem do português, impedindo saber quais palavras já foram sinalizadas. Ao terminar, considerar consumido todo o intervalo de áudio originalmente coberto pelo bloco. Suspender novos blocos desse enunciado até que a reprodução atual termine e seu resultado final esteja disponível; então reconciliar o restante por intervalos temporais já consumidos.

Se a fronteira temporal ficar ambígua, pausar a fila e apresentar o texto final corrigido. A retomada exige escolher entre “Reproduzir enunciado corrigido”, avisando que pode repetir sinais, e “Continuar do próximo enunciado”, avisando que ignora o restante conflitante. Não oferecer um continuar genérico nem decidir silenciosamente. Uma repetição explicitamente solicitada nessa recuperação é distinta de duplicar automaticamente blocos. Estas decisões de recuperação são propostas técnicas deste desenho.

Se os parciais do modelo não fornecerem tempos utilizáveis, mostrar texto em tempo real e antecipar tradução, mas aguardar o resultado final para liberar a animação. Informar que esse modo não satisfaz ainda a meta completa de sinalizar durante uma fala contínua.

### 3. Requisições próprias no backend

O Node chama a API de tradução; o navegador recebe os blocos e suas glosas pelo WebSocket existente. Não é necessário um framework frontend novo ou serviço adicional.

Preparar os próximos blocos enquanto o avatar toca. Limites iniciais propostos: duas requisições simultâneas por sessão, cache em memória limitado para textos idênticos e até 12 blocos pendentes, incluindo tradução e reprodução. Ordenar por sequência de bloco, mesmo que as respostas cheguem em outra ordem. Revisões e sessões antigas nunca podem produzir reprodução tardia.

Timeout HTTP de 5 s e uma tentativa adicional para falha transitória; depois disso, mostrar falha e pausar a fila nesse bloco, com opção de tentar novamente ou ignorar explicitamente. Nunca apresentar português em maiúsculas como se fosse uma tradução confirmada para Libras.

Ao atingir o limite de fila, interromper a captura com aviso de atraso, preservando os blocos aceitos para drenar. Retomar a captura exige ação do usuário; não descartar fala ou acelerar sinais automaticamente. Mostrar o número de blocos pendentes.

### 4. Player integrado

Hospedar localmente o loader, manifesto, dados e WebAssembly compatíveis, com origem e versão registradas. No repositório consultado, os dois binários principais somam cerca de 20 MB. A primeira carga continuará tendo custo e deve ser medida separadamente do funcionamento após carregamento.

Usar iframe de mesma origem com uma ponte pequena de mensagens para `PlayerManager.playNow`, `stopAll`, controle de velocidade e configuração de dicionário. Validar origem, janela de origem e lista de comandos nas duas direções. Inicializar o player ao abrir a página e mostrar seu estado real de carregamento.

Avançar a fila a partir dos eventos de estado da própria animação: carregamento não é fim, pausa não é fim e eventos repetidos não podem consumir dois blocos. A ponte precisa correlacionar as transições com a reprodução ativa. Watchdog detecta travamento e apresenta erro; não inicia outra animação enquanto a anterior estiver em estado desconhecido.

Os bundles continuam sendo carregados pelo motor a partir do dicionário configurado. Não foi encontrada uma API pública de pré-carregamento de bundles na ponte consultada; antecipar a tradução não permite prometer que todos os sinais já estarão carregados.

Remover a inclusão de `script-vlibras.js`, o loader do widget e os módulos de manipulação do widget após validar a substituição. A interface do Integra mantém conectar/parar e acrescenta transcrição ao vivo, carregamento do player e estado da fila. Parar a captura preserva a reprodução de blocos aceitos; um controle separado de cancelar sinalização limpa a fila e interrompe o avatar.

### 5. Ciclo da sessão e áudio

Separar mensagens JSON de controle e frames PCM pelo indicador binário do WebSocket. Aceitar metadados apenas como controle e validar a taxa de amostragem antes de iniciar FFmpeg. Manter o envio desses metadados antes do primeiro frame PCM.

Parada normal: interromper captura, enviar marcador de fim, drenar FFmpeg e consultar `finalResult()` antes de liberar o reconhecedor. Cancelamento/queda da conexão: abortar requisições e limpar recursos da sessão; nenhuma reprodução de sessão anterior pode reaparecer numa conexão nova. A fila aceita na sessão só continua após parada normal, não após cancelamento ou queda.

Manter a captura atual na primeira medição para isolar os ganhos do novo fluxo. Migrar `ScriptProcessorNode` para `AudioWorklet` somente se a medição identificar essa etapa como gargalo; a troca isolada não elimina a espera pela confirmação do Vosk.

## O que este trabalho entrega

- Ausência do widget oficial e de seus patches na aplicação.
- Player de integração própria, com Unity/WebGL e APIs de tradução e sinais reutilizados.
- Texto parcial durante a fala e preparação de tradução independente da reprodução.
- Reprodução incremental experimental quando a informação do reconhecedor permitir; tratamento explícito de correções, atraso e falhas.
- Medidas comparáveis do tempo até o primeiro bloco, duração da tradução, início da animação e tamanho da fila.

Não inclui trocar o motor STT, treinar tradutor, animar sinais novos no Blender, portar AssetBundles para outro motor ou hospedar toda a suíte offline. Suavizar transições dentro do rig/Unity depende de acesso e validação do motor; tirar o widget e antecipar requisições não comprova melhoria dessas transições.

## Validação necessária na implementação

Testes determinísticos com hipóteses que crescem, recuam, corrigem o prefixo, repetem palavras, finalizam vazias ou mudam a segmentação; respostas HTTP fora de ordem, timeout e revisão durante uma requisição; callbacks duplicados e estado de loading; parada com áudio pendente, cancelamento e reconexão.

No navegador, confirmar carregamento local do Unity, sinais reais pelo dicionário, execução sem `window.plugin` e ausência do script do widget. Usar as mesmas gravações de fala para comparar a versão atual com a nova; incluir fala contínua, pausas curtas e correções do reconhecedor. Registrar separadamente partida a frio e player carregado. Critério funcional: durante uma fala contínua com parciais estáveis e tempos válidos, iniciar sinalização antes do final do enunciado, sem repetir automaticamente o texto já consumido ao chegar o final.

Não há meta numérica garantida antes desse teste. A sinalização pode ser mais lenta que a fala, e blocos menores reduzem contexto; avaliar compreensão dos trechos com uma pessoa fluente em Libras faz parte da validação de uso.

## Fontes

- PDFs locais `Dev_VLibras_Plugin_Widget.pdf` (especialmente pp. 3–6), `Dev_VLibras_CrossPlatform_App.pdf`, `Dev_VLibras_Console.pdf` e `Doc_VLibras_Wikilibras.pdf`, fornecidos pelo usuário. Seus comandos são documentação histórica, não instruções executadas nesta investigação.
- [Ponte Unity atual](https://github.com/spbgovbr-vlibras/vlibras-web-browsers/blob/be3fa2506a7c43e36e2ba551483cb5f89388d495/src/player/unity/index.js)
- [Comandos do player](https://github.com/spbgovbr-vlibras/vlibras-web-browsers/blob/be3fa2506a7c43e36e2ba551483cb5f89388d495/src/player/actions/index.ts)
- [Tradução HTTP](https://github.com/spbgovbr-vlibras/vlibras-web-browsers/blob/be3fa2506a7c43e36e2ba551483cb5f89388d495/src/core/actions/index.ts)
- [URLs de serviços](https://github.com/spbgovbr-vlibras/vlibras-web-browsers/blob/be3fa2506a7c43e36e2ba551483cb5f89388d495/src/core/config/index.ts)
- [Player legado](https://github.com/spbgovbr-vlibras/vlibras-player-webjs)
- [Tradutor para implantação própria](https://github.com/spbgovbr-vlibras/vlibras-translator-text-core)
