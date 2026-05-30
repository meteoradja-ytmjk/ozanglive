/**
 * Audio Visualizer Live Preview Engine
 * Uses Web Audio API to analyze real audio and render reactive visualizations.
 * The spectrum/bars respond to actual music frequencies, not just CSS animation.
 */
class AudioVisualizerPreview {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.audioElement = null;
    this.animId = null;
    this.isPlaying = false;
    this.dataArray = null;
    this.frequencyData = null;

    // Settings
    this.settings = {
      type: 'spectrum',
      color: 'purple',
      customColors: null,
      intensity: 50,
      sensitivity: 1.0,
      barCount: 64,
      smoothing: 0.8,
      speed: 1.0,
      opacity: 1.0,
      position: 'bottom',
      height: 25,
      mirror: false,
      glow: false,
      shadow: false,
      roundBars: false,
      gradient: true,
      reflection: false,
      ...options
    };

    this.colorSchemes = {
      purple: ['#8B5CF6', '#EC4899', '#A855F7'],
      blue: ['#3B82F6', '#06B6D4', '#0EA5E9'],
      green: ['#10B981', '#34D399', '#6EE7B7'],
      rainbow: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'],
      fire: ['#DC2626', '#F59E0B', '#FCD34D'],
      neon: ['#FF00FF', '#00FFFF', '#39FF14'],
      ocean: ['#0EA5E9', '#06B6D4', '#22D3EE', '#67E8F9'],
      sunset: ['#F97316', '#FB923C', '#FBBF24', '#FDE047'],
      gold: ['#F59E0B', '#D97706', '#FBBF24'],
      ice: ['#93C5FD', '#DBEAFE', '#BAE6FD', '#F0F9FF'],
      cherry: ['#E11D48', '#FB7185', '#FDA4AF'],
      forest: ['#166534', '#4ADE80', '#86EFAC'],
      aurora: ['#06B6D4', '#8B5CF6', '#EC4899', '#F43F5E'],
      midnight: ['#1E1B4B', '#4338CA', '#7C3AED', '#A78BFA'],
      white: ['#FFFFFF', '#E2E8F0', '#CBD5E1'],
      lemon: ['#FDE047', '#F59E0B', '#FBBF24']
    };

    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    // Skip if canvas is not visible (width/height = 0)
    if (rect.width === 0 || rect.height === 0) return;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    if (this.analyser && newSettings.smoothing !== undefined) {
      this.analyser.smoothingTimeConstant = Math.min(0.95, newSettings.smoothing);
    }
  }

  /**
   * Load and play an audio file for live preview
   * @param {string} audioUrl - URL of the audio file to preview
   */
  async loadAudio(audioUrl) {
    this.stop();

    try {
      // Create audio context on user interaction
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      // Create audio element for streaming playback
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement.src = '';
      }

      this.audioElement = new Audio();
      this.audioElement.crossOrigin = 'anonymous';
      this.audioElement.src = audioUrl;
      this.audioElement.loop = true;
      this.audioElement.volume = 0.5;

      // Create analyser
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = this.settings.smoothing;

      // Connect audio element to analyser
      this.source = this.audioCtx.createMediaElementSource(this.audioElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      // Prepare data arrays
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Start playback
      await this.audioElement.play();
      this.isPlaying = true;
      this._startAnimation();

      return true;
    } catch (err) {
      console.error('[AudioVisualizer] Failed to load audio:', err);
      // Fallback to simulated mode
      this._startSimulatedAnimation();
      return false;
    }
  }

  /**
   * Start with simulated data (when no audio is loaded)
   */
  startSimulated() {
    this.stop();
    this._startSimulatedAnimation();
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    this.isPlaying = false;
  }

  setVolume(vol) {
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, vol));
    }
  }

  _startAnimation() {
    const draw = () => {
      if (!this.isPlaying) return;
      this.animId = requestAnimationFrame(draw);

      // Get frequency data from analyser
      this.analyser.getByteFrequencyData(this.frequencyData);
      this._render(this.frequencyData);
    };
    draw();
  }

  _startSimulatedAnimation() {
    this.isPlaying = true;
    let t = 0;
    const fakeData = new Uint8Array(1024);

    const draw = () => {
      if (!this.isPlaying) return;
      this.animId = requestAnimationFrame(draw);

      // Generate simulated frequency data
      for (let i = 0; i < fakeData.length; i++) {
        const f = (i / fakeData.length) * Math.PI * 4;
        const noise = Math.sin(t * 0.02 + f) * 0.3 +
                      Math.sin(t * 0.035 + f * 1.5) * 0.25 +
                      Math.cos(t * 0.015 + f * 2.1) * 0.15 +
                      Math.sin(t * 0.05 + f * 0.7) * 0.2;
        fakeData[i] = Math.max(0, Math.min(255, Math.round((noise + 0.5) * 180 * (this.settings.intensity / 50))));
      }
      t++;
      this._render(fakeData);
    };
    draw();
  }

  _render(frequencyData) {
    const { ctx, width: w, height: h, settings } = this;
    if (!ctx || !w || !h) return;

    // Clear
    ctx.clearRect(0, 0, w, h);

    const colors = settings.customColors || this.colorSchemes[settings.color] || this.colorSchemes.purple;
    const barCount = Math.min(settings.barCount, frequencyData.length);
    const intensity = settings.intensity / 100;
    const sensitivity = settings.sensitivity;

    ctx.globalAlpha = settings.opacity;

    // Shadow/glow setup
    if (settings.shadow) {
      ctx.shadowOffsetY = 2;
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
    }
    if (settings.glow) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = colors[0];
    }

    switch (settings.type) {
      case 'spectrum':
      case 'bars_bottom':
        this._drawBars(frequencyData, barCount, colors, intensity, sensitivity, 'bottom');
        break;
      case 'bars_center':
        this._drawBars(frequencyData, barCount, colors, intensity, sensitivity, 'center');
        break;
      case 'waveform':
      case 'wave_line':
        this._drawWaveform(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'circular':
      case 'vector_lissajous':
      case 'phase':
        this._drawCircular(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'nebula':
        this._drawNebula(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'vector_polar':
        this._drawPolar(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'pulse_ring':
        this._drawPulseRing(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'particles':
      case 'frequency_dots':
        this._drawParticles(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'spectrogram':
      case 'showcqt':
        this._drawSpectrogram(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'histogram':
        this._drawBars(frequencyData, barCount, colors, intensity, sensitivity, 'center');
        break;
      case 'frequency_terrain':
        this._drawTerrain(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      case 'dna_helix':
        this._drawDNA(frequencyData, barCount, colors, intensity, sensitivity);
        break;
      default:
        this._drawBars(frequencyData, barCount, colors, intensity, sensitivity, 'bottom');
    }

    // Reset
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = 1;
  }

  _drawBars(data, barCount, colors, intensity, sensitivity, position) {
    const { ctx, width: w, height: h, settings } = this;
    const barWidth = w / barCount;
    const step = Math.floor(data.length / barCount);

    for (let i = 0; i < barCount; i++) {
      // Average nearby frequencies for smoother look
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      let value = (sum / step) / 255;
      value = Math.pow(value, 1 / sensitivity) * intensity;

      let barHeight = value * h * 0.9;
      if (settings.mirror) {
        const mirrorIdx = barCount - 1 - i;
        const mirrorStep = Math.floor(data.length / barCount);
        let mirrorSum = 0;
        for (let j = 0; j < mirrorStep; j++) {
          mirrorSum += data[mirrorIdx * mirrorStep + j] || 0;
        }
        barHeight = Math.max(barHeight, ((mirrorSum / mirrorStep) / 255) * intensity * h * 0.9);
      }

      barHeight = Math.max(2, barHeight);

      const x = i * barWidth;

      // Color
      let fillStyle;
      if (settings.gradient) {
        const grad = position === 'center'
          ? ctx.createLinearGradient(x, h / 2 - barHeight / 2, x, h / 2 + barHeight / 2)
          : ctx.createLinearGradient(x, h, x, h - barHeight);
        colors.forEach((c, idx) => grad.addColorStop(idx / Math.max(1, colors.length - 1), c));
        fillStyle = grad;
      } else {
        fillStyle = colors[i % colors.length];
      }
      ctx.fillStyle = fillStyle;

      if (position === 'center') {
        const y = h / 2 - barHeight / 2;
        if (settings.roundBars) {
          this._roundRect(x + 1, y, barWidth - 2, barHeight, Math.min(3, (barWidth - 2) / 2));
          ctx.fill();
        } else {
          ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
        }
      } else {
        // Bottom
        if (settings.roundBars) {
          this._roundRect(x + 1, h - barHeight, barWidth - 2, barHeight, Math.min(3, (barWidth - 2) / 2));
          ctx.fill();
        } else {
          ctx.fillRect(x + 1, h - barHeight, barWidth - 2, barHeight);
        }
        // Reflection
        if (settings.reflection) {
          ctx.globalAlpha = settings.opacity * 0.15;
          ctx.fillRect(x + 1, h, barWidth - 2, barHeight * 0.3);
          ctx.globalAlpha = settings.opacity;
        }
      }
    }
  }

  _drawWaveform(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const step = Math.floor(data.length / barCount);

    ctx.beginPath();
    ctx.lineWidth = this.settings.roundBars ? 3 : 2;
    ctx.lineCap = this.settings.roundBars ? 'round' : 'butt';
    ctx.strokeStyle = colors[0];

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const x = (i / barCount) * w;
      const y = h / 2 + (value - 0.5) * h * 0.8;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Second line (mirror/dual channel effect)
    if (this.settings.mirror) {
      ctx.beginPath();
      ctx.strokeStyle = colors[colors.length - 1];
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += data[(barCount - 1 - i) * step + j] || 0;
        }
        const value = ((sum / step) / 255) * intensity * sensitivity;
        const x = (i / barCount) * w;
        const y = h / 2 - (value - 0.5) * h * 0.8;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  _drawCircular(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.3;
    const step = Math.floor(data.length / barCount);

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const angle = (i / barCount) * Math.PI * 2;
      const barLen = value * radius * 0.8;

      const x1 = cx + Math.cos(angle) * radius * 0.5;
      const y1 = cy + Math.sin(angle) * radius * 0.5;
      const x2 = cx + Math.cos(angle) * (radius * 0.5 + barLen);
      const y2 = cy + Math.sin(angle) * (radius * 0.5 + barLen);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = Math.max(2, (w / barCount) * 0.6);
      ctx.lineCap = 'round';
      ctx.strokeStyle = colors[i % colors.length];
      ctx.stroke();
    }
  }

  _drawParticles(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const step = Math.floor(data.length / barCount);

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const x = (i / barCount) * w;
      const y = h - value * h * 0.8;
      const r = Math.max(2, value * 6);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();

      if (this.settings.glow) {
        ctx.globalAlpha = this.settings.opacity * 0.3;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = this.settings.opacity;
      }
    }
  }

  _drawSpectrogram(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const step = Math.floor(data.length / barCount);
    const barWidth = w / barCount;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const colorIdx = Math.min(Math.floor(value * (colors.length - 1)), colors.length - 1);

      ctx.globalAlpha = Math.max(0.1, value) * this.settings.opacity;
      ctx.fillStyle = colors[colorIdx];
      ctx.fillRect(i * barWidth, 0, barWidth, h);
    }
    ctx.globalAlpha = this.settings.opacity;
  }

  _drawDNA(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const step = Math.floor(data.length / barCount);

    // Strand 1
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors[0];
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const x = (i / barCount) * w;
      const y = h / 2 + Math.sin((i / barCount) * Math.PI * 4 + Date.now() * 0.002) * value * h * 0.35;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Strand 2
    ctx.beginPath();
    ctx.strokeStyle = colors[colors.length - 1];
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const x = (i / barCount) * w;
      const y = h / 2 - Math.sin((i / barCount) * Math.PI * 4 + Date.now() * 0.002) * value * h * 0.35;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Nebula - soft glowing blobs that float and pulse (distinct from circular dots)
  _drawNebula(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const cx = w / 2, cy = h / 2;
    const step = Math.floor(data.length / barCount);
    const time = Date.now() * 0.001;
    const count = Math.min(barCount, 20);

    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
      const value = ((sum / step) / 255) * intensity * sensitivity;

      const angle = (i / count) * Math.PI * 2 + time * 0.3;
      const dist = value * Math.min(w, h) * 0.3 + 20;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      const radius = value * 40 + 10;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, colors[i % colors.length]);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.max(0.2, value * 0.8);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = this.settings.opacity;
  }

  // Polar - radar sweep with concentric rings (distinct from circular)
  _drawPolar(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const cx = w / 2, cy = h / 2;
    const maxR = Math.min(w, h) * 0.4;
    const step = Math.floor(data.length / barCount);
    const time = Date.now() * 0.002;

    // Draw concentric guide rings
    ctx.globalAlpha = 0.15;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * (r / 3), 0, Math.PI * 2);
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw radar lines from center
    ctx.globalAlpha = this.settings.opacity;
    ctx.lineWidth = 2;
    const count = Math.min(barCount, 36);
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
      const value = ((sum / step) / 255) * intensity * sensitivity;

      const angle = (i / count) * Math.PI * 2 + time;
      const len = value * maxR;
      const x2 = cx + Math.cos(angle) * len;
      const y2 = cy + Math.sin(angle) * len;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.stroke();

      // Dot at end
      ctx.beginPath();
      ctx.arc(x2, y2, 3, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
    }
  }

  // Pulse Ring - expanding/contracting ring that pulses with bass
  _drawPulseRing(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const cx = w / 2, cy = h / 2;
    const step = Math.floor(data.length / barCount);
    const time = Date.now() * 0.003;

    // Get bass energy (low frequencies)
    let bassSum = 0;
    const bassCount = Math.min(8, data.length);
    for (let i = 0; i < bassCount; i++) bassSum += data[i] || 0;
    const bassValue = ((bassSum / bassCount) / 255) * intensity * sensitivity;

    // Draw multiple expanding rings
    for (let ring = 0; ring < 4; ring++) {
      const baseR = Math.min(w, h) * (0.1 + ring * 0.1);
      const pulseR = baseR + bassValue * 60;
      const phase = time + ring * 0.5;

      ctx.beginPath();
      ctx.lineWidth = 3 - ring * 0.5;
      ctx.globalAlpha = Math.max(0.2, (1 - ring * 0.2) * bassValue);
      ctx.strokeStyle = colors[ring % colors.length];

      // Draw deformed circle
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const freqIdx = Math.floor((i / 64) * Math.min(barCount, data.length));
        const freqValue = ((data[freqIdx] || 0) / 255) * intensity * sensitivity;
        const r = pulseR + freqValue * 20 * Math.sin(angle * 3 + phase);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = this.settings.opacity;
  }

  // Terrain - vertical frequency bars that look like mountain terrain
  _drawTerrain(data, barCount, colors, intensity, sensitivity) {
    const { ctx, width: w, height: h } = this;
    const step = Math.floor(data.length / barCount);
    const count = Math.min(barCount, 80);
    const sliceW = w / count;

    // Draw filled terrain shape
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const x = i * sliceW + sliceW / 2;
      const peakY = h - value * h * 0.85;
      ctx.lineTo(x, peakY);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    colors.forEach((c, idx) => grad.addColorStop(idx / Math.max(1, colors.length - 1), c));
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.7;
    ctx.fill();

    // Top line
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
      const value = ((sum / step) / 255) * intensity * sensitivity;
      const x = i * sliceW + sliceW / 2;
      const peakY = h - value * h * 0.85;
      if (i === 0) ctx.moveTo(x, peakY); else ctx.lineTo(x, peakY);
    }
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = 2;
    ctx.globalAlpha = this.settings.opacity;
    ctx.stroke();
  }

  _roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /**
   * Get current settings for sending to server
   */
  getSettings() {
    return { ...this.settings };
  }

  destroy() {
    this.stop();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

// Export for use in EJS templates
window.AudioVisualizerPreview = AudioVisualizerPreview;
