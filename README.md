# 🧠 Reconhecimento de Voz em Tempo Real com Vosk + Node.js (Windows)

Este projeto realiza transcrição de voz em tempo real em **português** usando o [Vosk API](https://github.com/alphacep/vosk-api) diretamente em **Node.js no Windows**, com entrada do microfone.

> ⚠ **IMPORTANTE:** A integração com `vosk` no Node.js no Windows exige algumas configurações manuais devido a dependências de DLLs e compilação nativa.

---

## ✅ Tecnologias e dependências

- Node.js `v20.x` ou `v18.x` 64-bit
- [Vosk API](https://github.com/alphacep/vosk-api)
- `ffi-napi` (módulo nativo que carrega a `libvosk.dll`)
- `sox` (para capturar áudio do microfone)
- Modelo PT-BR (vosk-model-small-pt-0.3)

---

## 📦 Passo a passo (com gambiarras)

### 1. Instale o modelo de voz em português

Baixe e extraia o modelo:

```bash
https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip
```

Extraia para a raiz do projeto:

```
./vosk-model-small-pt-0.3/
```

---

### 2. Instale as dependências

```bash
npm install vosk ffi-napi
```

> ⚠ `ffi-napi` pode falhar ao instalar se você **não tiver o Visual Studio Build Tools com C++** instalado.

---

### 3. Instale o **Visual C++ Redistributable x64**

O `libvosk.dll` precisa das runtimes de C++:

🔗 https://aka.ms/vs/17/release/vc_redist.x64.exe

---

### 4. Corrija o PATH para as DLLs do Vosk

Coloque os seguintes arquivos na pasta:

```
./node_modules/vosk/
├── libvosk.dll
├── libgcc_s_seh-1.dll
├── libstdc++-6.dll
├── libwinpthread-1.dll
```

---

### 5. Configure o PATH manualmente no `index.js`

Antes de importar `vosk`, adicione:

```js
process.env.PATH = __dirname + '\\node_modules\\vosk;' + process.env.PATH;
const vosk = require('vosk');
```

> Sem isso, ocorre erro `Win32 127` porque o Node não encontra as dependências da DLL.

---

### 6. Instale e configure o `sox` no Windows

O Vosk no Node depende do `sox` para capturar o microfone.

#### Baixe:
🔗 https://sourceforge.net/projects/sox/files/latest/download

1. Extraia o ZIP em `C:\sox\` ou similar  
2. Adicione o caminho ao `PATH` do sistema:
   - `Win + R → sysdm.cpl → Variáveis de ambiente → Path → Adicionar "C:\sox"`

#### Verifique:
```bash
sox --version
```

---

## 🎤 Executando

```bash
node index.js
```

Você verá:

```
🎤 Iniciando microfone. Fale algo em português...
… estou
… falando
✅ transcrição completa: estou falando com você
```

---

## 🧪 Teste de carga de DLL (debug isolado)

Se quiser apenas testar o carregamento da DLL do Vosk:

```js
// test.js
process.env.PATH = __dirname + '\\node_modules\\vosk;' + process.env.PATH;
const ffi = require('ffi-napi');

try {
  const lib = ffi.Library('./node_modules/vosk/libvosk', {
    vosk_set_log_level: ['void', ['int']],
  });
  console.log("✅ Vosk e runtime carregados com sucesso!");
} catch (err) {
  console.error("❌ Falha ao carregar Vosk:", err.message);
}
```

```bash
node test.js
```

---

## 🚫 Possíveis erros e causas

| Erro | Causa | Solução |
|------|--------|---------|
| `Win32 error 127` | DLL encontrada, mas dependências ausentes | Adicionar DLLs + configurar PATH |
| `Win32 error 126` | DLL depende do `vc_redist` | Instalar Visual C++ Redistributable |
| `spawn sox ENOENT` | SOX não instalado ou fora do PATH | Instalar SOX + configurar PATH |
| `ffi-napi build failed` | Falta do compilador C++ | Instalar Visual Studio Build Tools com C++ |

---

## 📁 Estrutura final esperada

```
📁 Jessie/
├── index.js
├── test.js
├── vosk-model-small-pt-0.3/
└── node_modules/
    └── vosk/
        ├── libvosk.dll
        ├── libgcc_s_seh-1.dll
        ├── libstdc++-6.dll
        └── libwinpthread-1.dll
```