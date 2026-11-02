import { PlayerController } from './player.mjs';

const el = id => document.getElementById(id);
const startBtn = el('startBtn');
const stopBtn = el('stopBtn');
const cancelBtn = el('cancelBtn');
const avatar = el('avatar');
let socket, stream, audioContext, processor;
let generation = 0, starting = false, capturing = false, ending = false;
let blocks = [], conflict = null, sessionId = null;
const transcripts = new Map();
const send = message => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
const status = text => { el('status').textContent = text; el('status').classList.toggle('connected', capturing); };
const showError = text => { el('errorBox').textContent = text; el('errorBox').hidden = !text; };

const player = new PlayerController({
  sendToPlayer: message => avatar.contentWindow?.postMessage(message, location.origin),
  sendToServer: send,
  onStatus: (text, block) => {
    el('playerStatus').textContent = text;
    if (block) el('playingText').textContent = block.text;
    if (text === 'Sinalizando' && block) {
      el('translationTime').textContent = Math.round(block.translationMs) + ' ms';
      el('playbackTime').textContent = Math.round(block.waitMs + performance.now() - (block.receivedAt || performance.now())) + ' ms';
    }
  },
  onError: text => { showError(text); stopRecording(); },
});

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== avatar.contentWindow || event.data?.type !== 'unity_event') return;
  player.handleEvent(event.data);
  if (event.data.event === 'on_load_player') player.command('setSlider', Number(el('speed').value));
});
el('speed').addEventListener('change', () => { if (player.loaded) player.command('setSlider', Number(el('speed').value)); });

function updateControls() {
  startBtn.disabled = starting || capturing || ending || blocks.length > 0 || !!conflict;
  stopBtn.disabled = !starting && !capturing;
  cancelBtn.disabled = !starting && !capturing && !ending && !blocks.length && !conflict;
}

function releaseAudio() {
  if (processor) { processor.onaudioprocess = null; processor.disconnect(); processor = null; }
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
}

function displayTranscript(message) {
  if (!message.text) return;
  transcripts.set(message.utteranceId, message);
  if (transcripts.size > 30) transcripts.delete(transcripts.keys().next().value);
  const fragment = document.createDocumentFragment();
  for (const item of transcripts.values()) {
    if (!item.text) continue;
    const p = document.createElement('p');
    p.textContent = item.text;
    p.className = [item.final ? '' : 'partial', item.corrected ? 'corrected' : ''].join(' ');
    fragment.appendChild(p);
  }
  el('transcript').replaceChildren(fragment);
  el('transcript').scrollTop = el('transcript').scrollHeight;
  el('timingStatus').textContent = message.timed
    ? 'Trechos estáveis podem ser sinalizados durante a fala.'
    : 'Aguardando palavras estáveis com tempo confirmado; o texto já está disponível.';
}

function onMessage(message) {
  if (message.type === 'session') { sessionId = message.sessionId; return; }
  if (message.sessionId !== sessionId) return;
  switch (message.type) {
    case 'audio_ready': status('Capturando sua fala'); break;
    case 'transcript': displayTranscript(message); break;
    case 'queue':
      blocks = message.blocks;
      el('queueStatus').textContent = blocks.length ? blocks.length + ' trecho(s) pendente(s).' : 'Nenhum trecho na fila.';
      el('retryBox').hidden = blocks[0]?.status !== 'error';
      if (blocks[0]?.status === 'error') showError(blocks[0].error);
      player.update(blocks); updateControls();
      if (!starting && !capturing && !ending && !blocks.length && !conflict) status('Pronto para conectar');
      break;
    case 'play': player.play({ ...message, receivedAt: performance.now() }); break;
    case 'play_denied': player.deny(message.id); break;
    case 'audio_ended':
      ending = false;
      status(blocks.length ? 'Captura encerrada. Concluindo os sinais.' : 'Pronto para conectar');
      updateControls(); break;
    case 'flow_control': stopRecording(); showError(message.message); break;
    case 'conflict':
      conflict = message; el('conflictBox').hidden = false; el('conflictText').textContent = message.text; updateControls(); break;
    case 'conflict_resolved': conflict = null; el('conflictBox').hidden = true; updateControls(); break;
    case 'error':
      showError(message.message);
      if (message.fatal) cancelRecording();
      break;
  }
}

async function startRecording() {
  if (startBtn.disabled) return;
  const token = ++generation;
  starting = true; showError(''); status('Aguardando acesso ao microfone…'); updateControls();
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    audioContext = new AudioContext();
    await audioContext.resume();
    if (token !== generation) return;
    socket?.close();
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    socket = ws; sessionId = null; transcripts.clear();
    status('Conectando…');
    ws.onmessage = event => { if (socket === ws) { try { onMessage(JSON.parse(event.data)); } catch (error) { showError(error.message); } } };
    ws.onerror = () => { if (socket === ws) showError('Não foi possível conectar ao servidor.'); };
    ws.onclose = () => {
      if (socket !== ws) return;
      generation++; releaseAudio(); starting = capturing = ending = false;
      blocks = []; conflict = null; player.cancel(); el('conflictBox').hidden = true; el('retryBox').hidden = true;
      el('queueStatus').textContent = 'Nenhum trecho na fila.'; status('Desconectado. Conecte novamente para retomar.'); updateControls();
    };
    ws.onopen = () => {
      if (token !== generation) { ws.close(); return; }
      try {
        send({ type: 'audio_metadata', sampleRate: audioContext.sampleRate });
        setupAudio();
        starting = false; capturing = true; updateControls();
      } catch (error) { showError(error.message); cancelRecording(); }
    };
  } catch (error) {
    if (token !== generation) return;
    releaseAudio(); starting = capturing = false;
    status('Não foi possível iniciar a captura.'); showError(error.message); updateControls();
  }
}

function setupAudio() {
  const source = audioContext.createMediaStreamSource(stream);
  const highpass = audioContext.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 300;
  const notch = audioContext.createBiquadFilter(); notch.type = 'notch'; notch.frequency.value = 60;
  const compressor = audioContext.createDynamicsCompressor(); compressor.threshold.value = -20; compressor.ratio.value = 4;
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  const mute = audioContext.createGain(); mute.gain.value = 0;
  source.connect(highpass); highpass.connect(notch); notch.connect(compressor); compressor.connect(processor); processor.connect(mute); mute.connect(audioContext.destination);
  processor.onaudioprocess = event => {
    if (!capturing || socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 1024 * 1024) { stopRecording(); showError('Envio de áudio atrasado. A captura foi interrompida.'); return; }
    const input = event.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) pcm[i] = (Math.max(-1, Math.min(1, input[i])) * 32767) | 0;
    socket.send(pcm.buffer);
  };
}

function stopRecording() {
  if (!starting && !capturing) return;
  generation++;
  const hadCapture = capturing;
  releaseAudio(); starting = capturing = false;
  if (hadCapture && socket?.readyState === WebSocket.OPEN) {
    ending = true; send({ type: 'end_audio' }); status('Concluindo a captura…');
  } else { socket?.close(); status('Captura encerrada.'); }
  updateControls();
}

function cancelRecording() {
  generation++; releaseAudio(); starting = capturing = ending = false;
  send({ type: 'cancel' }); const old = socket; socket = null; old?.close();
  player.cancel(); blocks = []; conflict = null; sessionId = null;
  el('queueStatus').textContent = 'Nenhum trecho na fila.';
  el('retryBox').hidden = el('conflictBox').hidden = true;
  status('Sinalização cancelada.'); updateControls();
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
cancelBtn.addEventListener('click', cancelRecording);
el('retryBtn').addEventListener('click', () => { showError(''); send({ type: 'playback', action: 'retry', id: blocks[0]?.id }); });
el('skipBtn').addEventListener('click', () => { showError(''); send({ type: 'playback', action: 'skip', id: blocks[0]?.id }); });
el('repeatBtn').addEventListener('click', () => send({ type: 'resolve', action: 'repeat', utteranceId: conflict?.utteranceId }));
el('continueBtn').addEventListener('click', () => send({ type: 'resolve', action: 'skip', utteranceId: conflict?.utteranceId }));
window.addEventListener('pagehide', cancelRecording);
updateControls();
