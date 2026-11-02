const same = (a, b) => a?.normalize('NFC').toLowerCase() === b?.normalize('NFC').toLowerCase();

class StreamingSession {
  constructor({ send, translate, now = Date.now }) {
    this.send = send;
    this.translate = translate;
    this.now = now;
    this.blocks = [];
    this.utterances = [];
    this.serial = 0;
    this.running = 0;
    this.cancelled = false;
    this.capturePaused = false;
  }

  recognize({ text = '', words = [], final = false, audioTime = 0 }) {
    if (this.cancelled) return;
    let u = this.utterances.at(-1);
    if (!u || u.final) {
      u = { id: (u?.id || 0) + 1, tokens: [], observations: [], entries: [], final: false, corrected: false, blocked: false, cursor: 0 };
      this.utterances.push(u);
    }
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    let prefix = 0;
    while (prefix < u.tokens.length && prefix < tokens.length && same(u.tokens[prefix], tokens[prefix])) prefix++;
    const revised = u.entries.filter(b => b.endIndex > prefix && !b.invalid);
    if (revised.some(b => b.status === 'playing' || b.status === 'ended')) {
      u.corrected = true;
      u.blocked = true;
      for (const b of u.entries) if (b.status !== 'playing' && b.status !== 'ended') this._invalidate(b);
    } else {
      for (const b of revised) this._invalidate(b);
    }
    const time = this.now();
    u.observations = tokens.map((word, i) => {
      const old = i < prefix ? u.observations[i] : null;
      return old ? { since: old.since, count: old.count + 1 } : { since: time, count: 1 };
    });
    u.tokens = tokens;
    u.words = words;
    u.final = final;
    u.text = tokens.join(' ');
    u.audioTime = audioTime;
    // O texto parcial pode estar à frente das palavras temporizadas do Vosk.
    u.timedCount = 0;
    let previousEnd = -1;
    for (let i = 0; i < words.length && i < tokens.length; i++) {
      const w = words[i];
      if (!same(w.word, tokens[i]) || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.start < previousEnd - 0.05 || w.end <= w.start) break;
      previousEnd = w.end;
      u.timedCount++;
    }
    for (const b of u.entries) {
      if (b.invalid || b.status === 'ended' || b.status === 'playing') continue;
      b.hold = !final && b.endIndex > u.timedCount;
      if (b.endIndex <= u.timedCount) {
        b.start = words[b.startIndex].start;
        b.end = words[b.endIndex - 1].end;
      }
    }
    if (final || time - (u.lastTranscript ?? -Infinity) >= 200) {
      u.lastTranscript = time;
      this.send({ type: 'transcript', utteranceId: u.id, text: u.text, final, corrected: u.corrected, timed: u.timedCount > 0, audioTime });
    }
    if (u.blocked && final && !u.entries.some(b => b.status === 'playing')) this._reconcile(u);
    this._fill();
  }

  _invalidate(b) {
    if (b.invalid) return;
    b.invalid = true;
    b.controller?.abort();
    this.blocks = this.blocks.filter(item => item !== b);
  }

  _reconcile(u) {
    const consumed = u.entries.filter(b => b.status === 'ended');
    const boundary = Math.max(...consumed.map(b => b.end ?? Infinity));
    const crossing = u.words?.some(w => w.start < boundary - 0.08 && w.end > boundary + 0.08);
    if (!Number.isFinite(boundary) || u.timedCount !== u.tokens.length || crossing || !u.words.length) {
      u.conflict = true;
      this.send({ type: 'conflict', utteranceId: u.id, text: u.text });
      return;
    }
    u.cursor = u.words.findIndex(w => w.end > boundary + 0.08);
    if (u.cursor < 0) u.cursor = u.tokens.length;
    // Os índices antigos não valem quando o resultado final muda a tokenização.
    u.entries = u.entries.filter(b => b.status !== 'ended');
    u.blocked = false;
  }

  _fill() {
    if (this.cancelled) return;
    for (const u of this.utterances) {
      if (u.blocked) break;
      if (u.skip) continue;
      let end = u.tokens.length;
      if (!u.final) {
        end = 0;
        while (end < u.observations.length && u.observations[end].count >= 3 && this.now() - u.observations[end].since >= 600) end++;
        end = Math.min(end, Math.max(0, u.tokens.length - 2));
      }
      let start = Math.max(u.cursor, ...u.entries.filter(b => !b.invalid).map(b => b.endIndex));
      while (start < end && this.blocks.length < 12) {
        const size = Math.min(6, end - start);
        if (u.pendingIndex !== start) { u.pendingIndex = start; u.pendingSince = this.now(); }
        if (!u.final && size < 3 && this.now() - u.pendingSince < 1200) break;
        const b = {
          id: ++this.serial, utteranceId: u.id, text: u.tokens.slice(start, start + size).join(' '),
          startIndex: start, endIndex: start + size, status: 'waiting',
          hold: !u.final && start + size > u.timedCount, preparedAt: this.now(),
          start: u.words[start]?.start, end: u.words[start + size - 1]?.end,
        };
        u.entries.push(b); this.blocks.push(b); start += size;
      }
      if (this.blocks.length >= 12 && !this.capturePaused) {
        this.capturePaused = true;
        this.send({ type: 'flow_control', action: 'stop_capture', message: 'Fila cheia. Captura interrompida para concluir os trechos aceitos.' });
      }
    }
    this.blocks.sort((a, b) => a.utteranceId - b.utteranceId || a.startIndex - b.startIndex);
    this._translate();
    this._publish();
    // Conservar apenas enunciados ainda necessários à fila e uma janela curta de histórico.
    while (this.utterances.length > 50 && !this.blocks.some(b => b.utteranceId === this.utterances[0].id)) this.utterances.shift();
  }

  _translate() {
    for (const b of this.blocks) {
      if (this.running >= 2) break;
      if (b.status !== 'waiting') continue;
      b.status = 'translating'; b.controller = new AbortController(); this.running++;
      const start = this.now();
      Promise.resolve().then(() => this.translate(b.text, { signal: b.controller.signal })).then(gloss => {
        if (this.cancelled || b.invalid) return;
        b.gloss = gloss; b.translationMs = this.now() - start; b.status = 'ready';
      }).catch(error => {
        if (this.cancelled || b.invalid) return;
        b.status = 'error'; b.error = error.message;
      }).finally(() => {
        this.running--;
        if (!this.cancelled) { this._translate(); this._publish(); }
      });
    }
  }

  _publish() {
    this.send({ type: 'queue', blocks: this.blocks.map(({ controller, invalid, ...b }) => ({ ...b, hold: this._held(b) })) });
  }

  _held(b) {
    return b.hold || this.utterances.some(u => u.blocked && u.id <= b.utteranceId);
  }

  playback({ action, id }) {
    if (this.cancelled) return;
    const b = this.blocks.find(item => item.id === id);
    if (!b) {
      if (action === 'request') { this._publish(); this.send({ type: 'play_denied', id }); }
      return;
    }
    if (action === 'request' && b === this.blocks[0] && b.status === 'ready' && !this._held(b)) {
      if (this.blocks.some(item => item.status === 'playing')) return;
      b.status = 'playing';
      this._publish();
      this.send({ type: 'play', id: b.id, gloss: b.gloss, text: b.text, translationMs: b.translationMs, waitMs: this.now() - b.preparedAt });
    } else if (action === 'started' && b.status === 'playing') {
      b.startedAt = this.now();
    } else if ((action === 'ended' && b.status === 'playing') || (action === 'skip' && b.status === 'error')) {
      b.status = 'ended';
      this.blocks = this.blocks.filter(item => item !== b);
      const u = this.utterances.find(item => item.id === b.utteranceId);
      if (u.blocked && u.final && !u.conflict) this._reconcile(u);
      this._fill();
    } else if (action === 'retry' && b.status === 'error') {
      b.status = 'waiting'; delete b.error; this._fill();
    } else if (action === 'request') {
      this._publish(); this.send({ type: 'play_denied', id });
    }
  }

  resolve({ action, utteranceId }) {
    const u = this.utterances.find(item => item.id === utteranceId);
    if (!u?.conflict || !u.final) return;
    if (action !== 'repeat' && action !== 'skip') return;
    for (const b of u.entries) this._invalidate(b);
    u.entries = []; u.cursor = 0; u.blocked = false; u.conflict = false; u.skip = action === 'skip';
    this.send({ type: 'conflict_resolved', utteranceId });
    this._fill();
  }

  cancel() {
    this.cancelled = true;
    for (const b of [...this.blocks]) this._invalidate(b);
    this._publish();
  }
}

module.exports = { StreamingSession };
