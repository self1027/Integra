# Integra MQF Core - Demonstração Técnica de Acessibilidade (TCC)

Este repositório contém a implementação da engine de transcrição e sinalização em LIBRAS do projeto Integra MQF. O sistema funciona como uma unidade de processamento de fala para tradução visual, priorizando baixa latência e processamento em borda (edge computing).

## 1. Escopo da Demonstração

Esta versão é estritamente uma **demonstração técnica (Demo)**. O objetivo é validar o pipeline de áudio, a integração com o motor de reconhecimento de fala offline e a comunicação bidirecional via WebSockets. Módulos complementares de autenticação, gestão de permissões e dashboards administrativos foram omitidos desta release para foco na performance do núcleo de transcrição.

## 2. Arquitetura do Sistema

A solução foi estruturada para operar de forma independente de serviços de nuvem de terceiros, garantindo a integridade dos dados e a disponibilidade em ambientes com conectividade limitada.

### 2.1 Componentes Principais:

* **Motor STT (Speech-to-Text):** Utilização do framework **Vosk** com modelo acústico em português brasileiro.
* **Processamento de Sinal:** Integração com **FFmpeg** para normalização de taxa de amostragem (16kHz), redução de ruído e conversão de codec em tempo real.
* **Camada de Persistência:** Implementação via **Mongoose/MongoDB** para registro de logs de transcrição e metadados de sessões.
* **Interface de Sinalização:** Acoplamento com o widget **VLibras** para renderização de avatares 3D interpretando o texto gerado.

## 3. Estrutura de Diretórios

A organização do projeto segue padrões de modularização para facilitar a manutenção da pipeline de áudio:

* `/audioPipeline`: Lógica de stream de áudio e integração com o motor de voz.
* `/wsServer`: Orquestração de conexões via WebSocket Protocol.
* `/public`: Recursos estáticos e interface do usuário otimizada para dispositivos móveis.
* `/models`: Esquemas de dados para armazenamento de lições e sessões transcritas.

## 4. Requisitos e Instalação

O sistema exige um ambiente de execução que suporte processamento de áudio intensivo.

### Pré-requisitos:

* Node.js v18.x ou superior.
* FFmpeg instalado e acessível via variáveis de ambiente (PATH).

### Procedimento:

1. Realize o clone do repositório.
2. Instale as dependências via gerenciador de pacotes:
```bash
npm install

```


3. Verifique a presença do modelo acústico na pasta `/vosk-model-small-pt-0.3`.
4. Inicie o servidor de aplicação:
```bash
node index.js

```



## 5. Protocolo de Comunicação

O tráfego de dados entre o cliente e o servidor ocorre via binários PCM (Pulse Code Modulation) sobre WebSockets, minimizando o overhead de protocolos tradicionais de aplicação e permitindo a entrega de resultados intermediários de transcrição antes mesmo do fim da sentença (utterance).

## 6. Considerações Finais

O Integra MQF Core demonstra a viabilidade de sistemas de acessibilidade de alta performance utilizando tecnologias open-source. Esta versão cumpre os requisitos de validação técnica propostos no plano de pesquisa original do TCC.

---

**Desenvolvimento:** Murilo D. & Victor H.

**Linha de Pesquisa:** Automação, API Design e Acessibilidade Digital.
