export class PlayerController {
  constructor({ sendToPlayer, sendToServer, onStatus = () => {}, onError = () => {} }) {
    this.sendToPlayer = sendToPlayer;
    this.sendToServer = sendToServer;
    this.onStatus = onStatus;
    this.onError = onError;
    this.blocks = [];
    this.loaded = false;
    this.pendingId = null;
    this.active = null;
  }

  command(method, params) {
    this.sendToPlayer({ type: 'unity', object: 'PlayerManager', method, params });
  }

  update(blocks) {
    this.blocks = blocks;
    if (this.pendingId !== null && !blocks.some(b => b.id === this.pendingId)) this.pendingId = null;
    this._next();
  }

  _next() {
    const first = this.blocks[0];
    if (!this.loaded || this.active || this.pendingId !== null || !first || first.hold || first.status !== 'ready') return;
    this.pendingId = first.id;
    this.sendToServer({ type: 'playback', action: 'request', id: first.id });
  }

  play(block) {
    if (!this.loaded || this.active || this.pendingId !== block.id) return;
    this.pendingId = null;
    this.active = { ...block, began: false };
    this.onStatus('Preparando sinais…', block);
    this._watch();
    this.command('playNow', block.gloss);
  }

  deny(id) {
    if (this.pendingId !== id) return;
    this.pendingId = null;
    this._next();
  }

  _watch() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      this.onError('O avatar não confirmou o término. Cancele a sinalização antes de tentar novamente.');
    }, 30000);
  }

  _started() {
    if (this.active.began) return;
    this.active.began = true;
    this.sendToServer({ type: 'playback', action: 'started', id: this.active.id });
    this.onStatus('Sinalizando', this.active);
  }

  handleEvent({ event, data }) {
    if (event === 'on_error') {
      this.onError('Falha ao carregar o avatar. Recarregue a página.'); return;
    }
    if (event === 'on_load_player') {
      if (this.loaded) return;
      this.loaded = true;
      this.command('setBaseUrl', 'https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/BR/');
      this.command('setSubtitlesState', 1);
      this.onStatus('Avatar pronto'); this._next(); return;
    }
    if (event === 'update_progress' && !this.loaded) {
      this.onStatus('Carregando avatar: ' + Math.round(Number(data) * 100) + '%'); return;
    }
    if (!this.active) return;
    if (event === 'counter_gloss') {
      if (Array.isArray(data) && Number(data[0]) > 0 && Number(data[1]) > 0) this._started();
      this._watch(); return;
    }
    if (event !== 'on_playing_state_change' || !Array.isArray(data)) return;
    const [playing, paused, interval, loading] = data.map(value => value === 'True' || value === true);
    if (loading || paused || interval) return;
    if (playing) {
      this._started();
      this._watch();
    } else if (this.active.began) {
      const id = this.active.id;
      clearTimeout(this.watchdog);
      this.active = null;
      // A próxima fila vem do servidor; idle repetido não autoriza outro bloco.
      this.blocks = this.blocks.filter(b => b.id !== id);
      this.onStatus('Avatar pronto');
      this.sendToServer({ type: 'playback', action: 'ended', id });
    }
  }

  cancel() {
    clearTimeout(this.watchdog);
    this.active = null; this.pendingId = null; this.blocks = [];
    if (this.loaded) this.command('stopAll');
    this.onStatus(this.loaded ? 'Avatar pronto' : 'Carregando avatar…');
  }
}
