const MEDIA_CODECS = [
  'avc1.42E01E',
  'avc1.4D4029',
  'avc1.640029',
  'avc1.64002A',
  'avc1.640033',
  'hvc1.1.6.L93.B0',
  'hvc1.1.6.L120.B0',
  'hvc1.1.6.L153.B0',
  'mp4a.40.2',
  'mp4a.40.5',
  'flac',
  'opus'
];

function mediaSourceConstructor() {
  return window.ManagedMediaSource || window.MediaSource || null;
}

function safeText(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown camera error');
}

class UcCameraPlayer extends HTMLElement {
  constructor() {
    super();
    this.video = null;
    this.statusNode = null;
    this.abortController = null;
    this.ws = null;
    this.pc = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.queue = [];
    this.connected = false;
    this.retryTimer = 0;
    this.retryCount = 0;
    this.preferredGo2RtcMode = 'webrtc';
    this.go2rtcReady = false;
    this.stream = null;
    this.disconnectGraceTimer = 0;
    this.lastEngine = 'http';
  }

  connectedCallback() {
    this.connected = true;
    this.render();
    this.connect();
  }

  disconnectedCallback() {
    this.connected = false;
    this.cleanup();
  }

  render() {
    if (this.video) return;
    this.innerHTML = '<video playsinline preload="auto"></video><div class="camera-player-status" role="status"></div>';
    this.video = this.querySelector('video');
    this.statusNode = this.querySelector('.camera-player-status');
    this.video.autoplay = this.hasAttribute('autoplay');
    this.video.muted = this.hasAttribute('muted');
    this.video.controls = this.hasAttribute('controls');
    this.video.style.objectFit = this.getAttribute('object-fit') || 'cover';
    this.video.style.width = '100%';
    this.video.style.height = '100%';
    this.video.style.display = 'block';
    this.video.style.background = '#000';
    const poster = this.getAttribute('poster');
    if (poster) this.video.poster = poster;
    this.video.addEventListener('playing', () => { this.retryCount = 0; this.setStatus('playing', ''); });
    this.video.addEventListener('waiting', () => this.setStatus('loading', 'Buffering…'));
    this.video.addEventListener('error', () => {
      const mediaError = this.video.error;
      const message = mediaError?.message || `Media error ${mediaError?.code || 'unknown'}`;
      this.setStatus('error', message);
      if (this.connected) this.scheduleReconnect(message);
    });
  }

  setStatus(state, message, mode = '') {
    this.dataset.streamState = state;
    this.dataset.streamMode = mode;
    if (this.statusNode) {
      this.statusNode.textContent = message;
      this.statusNode.hidden = !message;
    }
    this.dispatchEvent(new CustomEvent('camera-status', {
      bubbles: true,
      detail: { state, message, mode }
    }));
  }

  play() {
    if (!this.video) return;
    this.video.play().catch(() => {
      if (!this.video.muted) {
        this.video.muted = true;
        this.video.play().catch(() => {});
      }
    });
  }

  async connect() {
    const src = this.getAttribute('src');
    const engine = this.getAttribute('engine') || 'http';
    this.lastEngine = engine;
    if (!src) {
      this.setStatus('error', 'Camera source is not configured.');
      return;
    }
    this.setStatus('loading', 'Connecting…', engine);
    try {
      if (engine === 'go2rtc') await this.connectGo2Rtc(src);
      else if (engine === 'ffmpeg') await this.connectFragmentedMp4(src);
      else {
        this.video.src = src;
        this.play();
      }
    } catch (error) {
      if (this.connected) {
        const message = safeText(error);
        this.setStatus('error', message, engine);
        this.scheduleReconnect(message);
      }
    }
  }

  supportedCodecs(MediaSourceClass) {
    const muted = this.hasAttribute('muted');
    return MEDIA_CODECS
      .filter((codec) => !muted || !/^(mp4a|flac|opus)/.test(codec))
      .filter((codec) => MediaSourceClass.isTypeSupported(`video/mp4; codecs="${codec}"`))
      .join();
  }

  go2rtcModes() {
    return String(this.getAttribute('modes') || 'webrtc,webrtc/tcp,mse,hls,mjpeg,mp4')
      .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  }

  createMediaSource() {
    const MediaSourceClass = mediaSourceConstructor();
    if (!MediaSourceClass) throw new Error('This browser does not support Media Source Extensions.');
    this.mediaSource = new MediaSourceClass();
    if ('ManagedMediaSource' in window && this.mediaSource instanceof window.ManagedMediaSource) {
      this.video.disableRemotePlayback = true;
      this.video.srcObject = this.mediaSource;
    } else {
      this.video.src = URL.createObjectURL(this.mediaSource);
      this.video.srcObject = null;
    }
    return { MediaSourceClass, mediaSource: this.mediaSource };
  }

  initializeSourceBuffer(mime) {
    if (!this.mediaSource || this.mediaSource.readyState !== 'open') {
      throw new Error(`Camera returned media before the player was ready (${mime}).`);
    }
    if (!this.mediaSource.constructor.isTypeSupported(mime)) {
      throw new Error(`Browser does not support camera codec: ${mime}`);
    }
    this.sourceBuffer = this.mediaSource.addSourceBuffer(mime);
    this.sourceBuffer.mode = 'segments';
    this.sourceBuffer.addEventListener('updateend', () => {
      this.trimBuffer();
      this.flushQueue();
    });
    this.sourceBuffer.addEventListener('error', () => {
      if (this.connected) this.scheduleReconnect('Camera media buffer failed.');
    });
    this.flushQueue();
  }

  appendSegment(segment) {
    const data = segment instanceof ArrayBuffer ? segment : segment.buffer.slice(segment.byteOffset, segment.byteOffset + segment.byteLength);
    this.queue.push(data);
    this.flushQueue();
  }

  flushQueue() {
    if (!this.sourceBuffer || this.sourceBuffer.updating || !this.queue.length) return;
    try {
      this.sourceBuffer.appendBuffer(this.queue.shift());
    } catch (error) {
      if (error?.name === 'QuotaExceededError') {
        this.trimBuffer(true);
        return;
      }
      if (this.connected) this.scheduleReconnect(`Camera media buffer error: ${safeText(error)}`);
    }
  }

  trimBuffer(force = false) {
    if (!this.sourceBuffer || this.sourceBuffer.updating || !this.sourceBuffer.buffered.length) return;
    const end = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length - 1);
    const keepFrom = Math.max(0, end - (force ? 2 : 8));
    const start = this.sourceBuffer.buffered.start(0);
    if (keepFrom > start + 1) {
      try { this.sourceBuffer.remove(start, keepFrom); } catch {}
    }
    if (this.video.currentTime < keepFrom - 1) this.video.currentTime = keepFrom;
  }

  async connectFragmentedMp4(src) {
    const { mediaSource } = this.createMediaSource();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Camera player initialization timed out.')), 10000);
      mediaSource.addEventListener('sourceopen', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });

    this.abortController = new AbortController();
    const response = await fetch(src, { signal: this.abortController.signal, cache: 'no-store' });
    if (!response.ok || !response.body) {
      let message = `Camera stream request failed (${response.status}).`;
      try {
        const payload = await response.json();
        if (payload?.error) message = payload.error;
      } catch {}
      throw new Error(message);
    }
    const mime = response.headers.get('x-camera-mime') || 'video/mp4; codecs="avc1.4D4029"';
    this.initializeSourceBuffer(mime);
    this.setStatus('loading', 'Receiving RTSP stream…', 'ffmpeg');
    this.play();

    const reader = response.body.getReader();
    while (this.connected) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value?.byteLength) this.appendSegment(value);
    }
    if (this.connected) throw new Error('RTSP stream ended unexpectedly.');
  }

  async connectGo2Rtc(src) {
    const modes = this.go2rtcModes();
    const canWebRtc = modes.some((mode) => mode.startsWith('webrtc')) && 'RTCPeerConnection' in window;
    const canMse = modes.includes('mse') && Boolean(mediaSourceConstructor());
    const attempts = this.preferredGo2RtcMode === 'mse' ? ['mse', 'webrtc'] : ['webrtc', 'mse'];
    let lastError = null;
    for (const mode of attempts) {
      if ((mode === 'webrtc' && !canWebRtc) || (mode === 'mse' && !canMse)) continue;
      try {
        this.setStatus('loading', `Connecting with ${mode.toUpperCase()}…`, `go2rtc/${mode}`);
        if (mode === 'webrtc') await this.connectGo2RtcWebRtc(src);
        else await this.connectGo2RtcMse(src);
        this.preferredGo2RtcMode = mode;
        return;
      } catch (error) {
        lastError = error;
        this.cleanupTransport();
        this.setStatus('loading', `${mode.toUpperCase()} unavailable (${safeText(error)}). Trying another transport…`, 'go2rtc');
      }
    }
    throw lastError || new Error('No supported go2rtc browser transport is available.');
  }

  openSocket(src) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(src);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('go2rtc connection timed out.'));
      }, 12000);
      ws.addEventListener('open', () => { clearTimeout(timeout); resolve(ws); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Unable to connect to the go2rtc API. Check port 1984 and network access.')); }, { once: true });
    });
  }

  async connectGo2RtcMse(src) {
    const { MediaSourceClass, mediaSource } = this.createMediaSource();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MSE initialization timed out.')), 10000);
      mediaSource.addEventListener('sourceopen', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    const ws = await this.openSocket(src);
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('go2rtc did not return an MSE stream.')), 15000);
      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') {
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'mse') {
            clearTimeout(timeout);
            try {
              this.initializeSourceBuffer(message.value);
              this.setStatus('playing', '', 'go2rtc/mse');
              this.play();
              resolve();
            } catch (error) { reject(error); }
          } else if (message.type === 'error' && String(message.value).toLowerCase().includes('mse')) {
            clearTimeout(timeout);
            reject(new Error(message.value));
          }
        } else if (event.data instanceof ArrayBuffer) {
          this.appendSegment(event.data);
        }
      });
      ws.addEventListener('close', () => {
        if (!this.connected) return;
        if (!this.sourceBuffer) reject(new Error('go2rtc closed the MSE stream before playback started.'));
        else this.scheduleReconnect('go2rtc stream disconnected.');
      });
    });
    ws.send(JSON.stringify({ type: 'mse', value: this.supportedCodecs(MediaSourceClass) }));
    await ready;
  }

  async connectGo2RtcWebRtc(src) {
    const ws = await this.openSocket(src);
    const tcpOnly = this.go2rtcModes()[0] === 'webrtc/tcp';
    const pc = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }],
      sdpSemantics: 'unified-plan'
    });
    this.pc = pc;
    this.go2rtcReady = false;
    this.stream = new MediaStream();
    this.video.srcObject = this.stream;
    this.video.src = '';
    pc.addTransceiver('video', { direction: 'recvonly' });
    if (!this.hasAttribute('muted')) pc.addTransceiver('audio', { direction: 'recvonly' });

    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('go2rtc WebRTC playback timed out.')), 18000);
      const succeed = () => {
        if (this.go2rtcReady) return;
        this.go2rtcReady = true;
        clearTimeout(timeout);
        this.setStatus('playing', '', 'go2rtc/webrtc');
        this.play();
        resolve();
      };
      pc.addEventListener('track', (event) => {
        if (!this.stream.getTracks().some((track) => track.id === event.track.id)) this.stream.addTrack(event.track);
        if (event.track.kind === 'video') succeed();
      });
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          if (this.disconnectGraceTimer) clearTimeout(this.disconnectGraceTimer);
          this.disconnectGraceTimer = 0;
          if (this.stream.getVideoTracks().length) succeed();
          return;
        }
        if (['failed', 'closed'].includes(pc.connectionState) && !this.go2rtcReady) {
          clearTimeout(timeout);
          reject(new Error(`go2rtc WebRTC ${pc.connectionState}.`));
        } else if (pc.connectionState === 'failed' && this.go2rtcReady && this.connected) {
          this.scheduleReconnect('go2rtc WebRTC failed.');
        } else if (pc.connectionState === 'disconnected' && this.go2rtcReady && this.connected && !this.disconnectGraceTimer) {
          // WebRTC frequently reports a brief disconnected state while ICE recovers.
          // Waiting avoids needless stream cutouts caused by reconnecting too early.
          this.disconnectGraceTimer = window.setTimeout(() => {
            this.disconnectGraceTimer = 0;
            if (this.connected && this.pc === pc && pc.connectionState === 'disconnected') this.scheduleReconnect('go2rtc WebRTC remained disconnected.');
          }, 5000);
        }
      });
      ws.addEventListener('error', () => {
        if (!this.go2rtcReady) { clearTimeout(timeout); reject(new Error('go2rtc WebRTC signaling failed.')); }
      }, { once: true });
      ws.addEventListener('close', () => {
        if (!this.connected || this.go2rtcReady) return;
        clearTimeout(timeout);
        reject(new Error('go2rtc closed signaling before WebRTC playback started.'));
      });
    });

    pc.addEventListener('icecandidate', (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (event.candidate && tcpOnly && event.candidate.protocol === 'udp') return;
      ws.send(JSON.stringify({ type: 'webrtc/candidate', value: event.candidate ? event.candidate.candidate : '' }));
    });
    ws.addEventListener('message', async (event) => {
      if (typeof event.data !== 'string') return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'webrtc/answer') await pc.setRemoteDescription({ type: 'answer', sdp: message.value });
      else if (message.type === 'webrtc/candidate') {
        if (message.value && !(tcpOnly && String(message.value).includes(' udp '))) await pc.addIceCandidate({ candidate: message.value, sdpMid: '0' }).catch(() => {});
      } else if (message.type === 'error' && String(message.value).toLowerCase().includes('webrtc')) {
        if (!this.go2rtcReady) this.setStatus('error', message.value, 'go2rtc/webrtc');
      }
    });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
    await ready;
  }

  scheduleReconnect(message) {
    if (!this.connected || this.retryTimer) return;
    this.retryCount += 1;
    const delay = Math.min(15000, 1500 * this.retryCount);
    this.setStatus('loading', `${message} Reconnecting…`, this.dataset.streamMode || this.lastEngine);
    this.cleanupTransport();
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      if (this.connected) this.connect();
    }, delay);
  }

  cleanupTransport() {
    this.go2rtcReady = false;
    if (this.disconnectGraceTimer) clearTimeout(this.disconnectGraceTimer);
    this.disconnectGraceTimer = 0;
    this.abortController?.abort();
    this.abortController = null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try { ws.close(); } catch {}
    }
    if (this.pc) {
      const pc = this.pc;
      this.pc = null;
      for (const sender of pc.getSenders()) sender.track?.stop();
      try { pc.close(); } catch {}
    }
    for (const track of this.stream?.getTracks?.() || []) track.stop();
    this.stream = null;
    this.queue = [];
    this.sourceBuffer = null;
    if (this.mediaSource?.readyState === 'open') {
      try { this.mediaSource.endOfStream(); } catch {}
    }
    this.mediaSource = null;
    if (this.video) {
      this.video.srcObject = null;
      if (this.video.src?.startsWith('blob:')) URL.revokeObjectURL(this.video.src);
      this.video.removeAttribute('src');
      this.video.load();
    }
  }

  cleanup() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = 0;
    this.cleanupTransport();
  }
}

customElements.define('uc-camera-player', UcCameraPlayer);
