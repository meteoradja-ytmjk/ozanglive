/**
 * Audio Visualizer Engine for OzangLive
 * 
 * Generates FFmpeg filter chains for real audio-reactive visualizations.
 * Each visualizer type has a distinct visual character.
 * 
 * KEY FIX: Uses `colorkey=black` to make visualizer's black background transparent
 * so only the bright visualizer pattern is overlaid on video (not a black box).
 */

const VISUALIZER_TYPES = {
  spectrum: 'Spectrum Bars',
  waveform: 'Waveform',
  circular: 'Circular Scope',
  particles: 'Particle Wave',
  bars_bottom: 'Bottom Bars',
  bars_center: 'Center Bars (Mirror)',
  wave_line: 'Wave Line',
  frequency_dots: 'Frequency Dots',
  spectrogram: 'Spectrogram (Heatmap)',
  phase: 'Phase Scope',
  histogram: 'Audio Histogram',
  showcqt: 'Musical Scale (CQT)',
  vector_lissajous: 'Lissajous Pattern',
  vector_polar: 'Polar Radar',
  nebula: 'Nebula Cloud',
  dna_helix: 'DNA Helix',
  pulse_ring: 'Pulse Ring',
  frequency_terrain: 'Frequency Terrain'
};

const COLOR_SCHEMES = {
  purple: { tint: { rr: 1.2, gg: 0.5, bb: 1.4 } },
  blue: { tint: { rr: 0.5, gg: 0.9, bb: 1.5 } },
  green: { tint: { rr: 0.4, gg: 1.4, bb: 0.6 } },
  rainbow: { tint: { rr: 1.0, gg: 1.0, bb: 1.0 } },
  fire: { tint: { rr: 1.6, gg: 0.8, bb: 0.3 } },
  neon: { tint: { rr: 1.4, gg: 0.6, bb: 1.5 } },
  ocean: { tint: { rr: 0.4, gg: 1.0, bb: 1.5 } },
  sunset: { tint: { rr: 1.5, gg: 0.9, bb: 0.4 } },
  gold: { tint: { rr: 1.4, gg: 1.1, bb: 0.3 } },
  ice: { tint: { rr: 0.9, gg: 1.1, bb: 1.4 } },
  cherry: { tint: { rr: 1.5, gg: 0.4, bb: 0.7 } },
  forest: { tint: { rr: 0.5, gg: 1.3, bb: 0.6 } },
  aurora: { tint: { rr: 1.0, gg: 0.8, bb: 1.4 } },
  midnight: { tint: { rr: 0.7, gg: 0.5, bb: 1.3 } },
  white: { tint: { rr: 1.0, gg: 1.0, bb: 1.0 } },
  lemon: { tint: { rr: 1.4, gg: 1.3, bb: 0.4 } }
};

/**
 * Build colorchannelmixer string for color tinting (only RGB, no alpha modification)
 */
function buildTint(scheme) {
  const t = scheme.tint || { rr: 1, gg: 1, bb: 1 };
  return `colorchannelmixer=rr=${t.rr}:gg=${t.gg}:bb=${t.bb}`;
}

/**
 * Build the alpha-keying chain that makes visualizer's black background transparent.
 * This is the KEY to making visualizer overlay properly on video.
 */
function buildAlphaKey(opacity = 1.0) {
  const alpha = Math.max(0.3, Math.min(1.0, opacity));
  // colorkey=black:similarity:blend - removes black background
  // similarity=0.3 = 30% color similarity threshold
  // blend=0.1 = small soft edge for smooth transition
  return `colorkey=0x000000:0.3:0.1,format=yuva420p,colorchannelmixer=aa=${alpha.toFixed(2)}`;
}

/**
 * Get overlay Y position based on position string
 */
function getOverlayY(position) {
  switch (position) {
    case 'top': return '0';
    case 'center': return '(H-h)/2';
    case 'full': return '0';
    case 'bottom':
    default: return 'H-h';
  }
}

function buildVisualizerFilter(settings, options = {}) {
  const {
    type = 'spectrum',
    intensity = 50,
    sensitivity = 1.0,
    barCount = 64,
    color = 'purple',
    customColors = null,
    glow = false,
    opacity = 1.0,
    position: settingsPosition = null,
    height: settingsHeight = null
  } = settings || {};

  const {
    width = 1920,
    height = 1080,
    position: optionsPosition = 'bottom',
    fps = 30
  } = options;

  const position = settingsPosition || optionsPosition;
  let colorScheme;
  if (color === 'custom' && customColors && customColors.length >= 2) {
    colorScheme = { tint: { rr: 1.2, gg: 0.5, bb: 1.4 } };
  } else {
    colorScheme = COLOR_SCHEMES[color] || COLOR_SCHEMES.purple;
  }

  const heightPercent = settingsHeight || Math.round(intensity * 0.4 + 10);
  const vizHeight = Math.round(height * (heightPercent / 100));
  const vizHeightEven = vizHeight % 2 === 0 ? vizHeight : vizHeight + 1;
  const widthEven = width % 2 === 0 ? width : width - 1;
  const effectiveOpacity = Math.max(0.3, Math.min(1.0, opacity));

  const opts = {
    width: widthEven,
    height: vizHeightEven,
    barCount,
    sensitivity,
    glow,
    opacity: effectiveOpacity,
    position,
    videoHeight: height,
    videoWidth: widthEven,
    fps,
    colorScheme
  };

  switch (type) {
    case 'spectrum':
    case 'bars_bottom':
      return buildSpectrumBars(opts);
    case 'bars_center':
      return buildCenterBars(opts);
    case 'waveform':
    case 'wave_line':
      return buildWaveform(opts);
    case 'circular':
      return buildCircular(opts);
    case 'nebula':
      return buildNebula(opts);
    case 'particles':
    case 'frequency_dots':
      return buildParticles(opts);
    case 'spectrogram':
      return buildSpectrogram(opts);
    case 'phase':
    case 'vector_lissajous':
    case 'dna_helix':
      return buildLissajous(opts);
    case 'vector_polar':
      return buildPolarRadar(opts);
    case 'histogram':
      return buildHistogram(opts);
    case 'showcqt':
      return buildShowCQT(opts);
    case 'pulse_ring':
      return buildPulseRing(opts);
    case 'frequency_terrain':
      return buildFrequencyTerrain(opts);
    default:
      return buildSpectrumBars(opts);
  }
}

// SPECTRUM - Frequency bars
function buildSpectrumBars(opts) {
  const { width, height, barCount, glow, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;
  const winSize = Math.min(2048, Math.max(512, barCount * 16));

  const filters = [
    `[1:a]showfreqs=s=${width}x${effectiveHeight}:mode=bar:fscale=log:ascale=log:win_size=${winSize},fps=${fps},${buildTint(colorScheme)},${buildAlphaKey(opacity)}${glow ? ',gblur=sigma=2' : ''}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// CENTER BARS - Mirrored
function buildCenterBars(opts) {
  const { width, height, barCount, glow, opacity, fps, colorScheme } = opts;
  const halfH = Math.round(height / 2);
  const halfHEven = halfH % 2 === 0 ? halfH : halfH + 1;
  const winSize = Math.min(2048, Math.max(512, barCount * 16));

  const filters = [
    `[1:a]showfreqs=s=${width}x${halfHEven}:mode=bar:fscale=log:ascale=log:win_size=${winSize},fps=${fps}[viz_top]`,
    `[viz_top]split[viz_a][viz_b]`,
    `[viz_b]vflip[viz_flip]`,
    `[viz_a][viz_flip]vstack,${buildTint(colorScheme)},${buildAlphaKey(opacity)}${glow ? ',gblur=sigma=2' : ''}[vizmix]`,
    `[0:v][vizmix]overlay=0:(H-h)/2:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// WAVEFORM - Audio wave line
function buildWaveform(opts) {
  const { width, height, sensitivity, glow, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;
  const scale = sensitivity > 1.5 ? 'log' : 'lin';

  const filters = [
    `[1:a]showwaves=s=${width}x${effectiveHeight}:mode=line:rate=${fps}:scale=${scale}:n=80,${buildTint(colorScheme)},${buildAlphaKey(opacity)}${glow ? ',gblur=sigma=2' : ''}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// CIRCULAR - avectorscope lissajous_xy with dots
function buildCircular(opts) {
  const { videoWidth, videoHeight, sensitivity, glow, opacity, fps, colorScheme } = opts;
  const size = Math.min(videoWidth, videoHeight);
  const vizSize = Math.round(size * 0.5);
  const vizSizeEven = vizSize % 2 === 0 ? vizSize : vizSize + 1;

  const filters = [
    `[1:a]avectorscope=s=${vizSizeEven}x${vizSizeEven}:mode=lissajous_xy:rate=${fps}:scale=log:draw=dot:zoom=${(sensitivity * 1.5).toFixed(2)},${buildTint(colorScheme)},${buildAlphaKey(opacity)}${glow ? ',gblur=sigma=4' : ''}[viz]`,
    `[0:v][viz]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// LISSAJOUS - line pattern
function buildLissajous(opts) {
  const { videoWidth, videoHeight, sensitivity, glow, opacity, fps, colorScheme } = opts;
  const size = Math.min(videoWidth, videoHeight);
  const vizSize = Math.round(size * 0.55);
  const vizSizeEven = vizSize % 2 === 0 ? vizSize : vizSize + 1;

  const filters = [
    `[1:a]avectorscope=s=${vizSizeEven}x${vizSizeEven}:mode=lissajous:rate=${fps}:scale=log:draw=line:zoom=${sensitivity.toFixed(2)},${buildTint(colorScheme)},${buildAlphaKey(opacity)}${glow ? ',gblur=sigma=3' : ''}[viz]`,
    `[0:v][viz]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// NEBULA - heavy blur cloud effect
function buildNebula(opts) {
  const { videoWidth, videoHeight, sensitivity, opacity, fps, colorScheme } = opts;
  const size = Math.min(videoWidth, videoHeight);
  const vizSize = Math.round(size * 0.6);
  const vizSizeEven = vizSize % 2 === 0 ? vizSize : vizSize + 1;

  const filters = [
    `[1:a]avectorscope=s=${vizSizeEven}x${vizSizeEven}:mode=lissajous:rate=${fps}:scale=sqrt:draw=line:zoom=${(sensitivity * 1.8).toFixed(2)},gblur=sigma=10,${buildTint(colorScheme)},${buildAlphaKey(opacity)}[viz]`,
    `[0:v][viz]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// PARTICLES
function buildParticles(opts) {
  const { width, height, sensitivity, glow, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;
  const scale = sensitivity > 1.5 ? 'log' : 'lin';

  const filters = [
    `[1:a]showwaves=s=${width}x${effectiveHeight}:mode=p2p:rate=${fps}:scale=${scale}:n=120,${buildTint(colorScheme)},${buildAlphaKey(opacity)},gblur=sigma=${glow ? 3 : 1.5}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// SPECTROGRAM - Heatmap
function buildSpectrogram(opts) {
  const { width, height, sensitivity, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;
  const gain = Math.max(1, sensitivity * 3);

  const filters = [
    `[1:a]showspectrum=s=${width}x${effectiveHeight}:mode=combined:color=intensity:scale=log:gain=${gain.toFixed(1)}:slide=scroll,fps=${fps},${buildTint(colorScheme)},${buildAlphaKey(opacity)}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// POLAR RADAR
function buildPolarRadar(opts) {
  const { videoWidth, videoHeight, sensitivity, glow, opacity, fps, colorScheme } = opts;
  const size = Math.min(videoWidth, videoHeight);
  const vizSize = Math.round(size * 0.5);
  const vizSizeEven = vizSize % 2 === 0 ? vizSize : vizSize + 1;

  const filters = [
    `[1:a]avectorscope=s=${vizSizeEven}x${vizSizeEven}:mode=polar:rate=${fps}:scale=lin:draw=line:zoom=${(sensitivity * 0.9).toFixed(2)},${buildTint(colorScheme)},${buildAlphaKey(opacity)}${glow ? ',gblur=sigma=2' : ''}[viz]`,
    `[0:v][viz]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// HISTOGRAM
function buildHistogram(opts) {
  const { width, height, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;

  const filters = [
    `[1:a]ahistogram=s=${width}x${effectiveHeight}:scale=log:slide=scroll:rate=${fps},${buildTint(colorScheme)},${buildAlphaKey(opacity)}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// SHOWCQT - Musical scale
function buildShowCQT(opts) {
  const { width, height, sensitivity, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;
  const volume = Math.max(1, Math.round(sensitivity * 10));

  const filters = [
    `[1:a]showcqt=s=${width}x${effectiveHeight}:fps=${fps}:count=1:bar_g=2:sono_g=4:volume=${volume},${buildTint(colorScheme)},${buildAlphaKey(opacity)}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// PULSE RING - Large lissajous with heavy zoom
function buildPulseRing(opts) {
  const { videoWidth, videoHeight, sensitivity, opacity, fps, colorScheme } = opts;
  const size = Math.min(videoWidth, videoHeight);
  const vizSize = Math.round(size * 0.7);
  const vizSizeEven = vizSize % 2 === 0 ? vizSize : vizSize + 1;

  const filters = [
    `[1:a]avectorscope=s=${vizSizeEven}x${vizSizeEven}:mode=lissajous_xy:rate=${fps}:scale=sqrt:draw=line:zoom=${(sensitivity * 2.5).toFixed(2)},gblur=sigma=6,${buildTint(colorScheme)},${buildAlphaKey(opacity)}[viz]`,
    `[0:v][viz]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

// FREQUENCY TERRAIN - vertical orientation
function buildFrequencyTerrain(opts) {
  const { width, height, sensitivity, opacity, position, videoHeight, fps, colorScheme } = opts;
  const overlayY = getOverlayY(position);
  const effectiveHeight = position === 'full' ? (videoHeight % 2 === 0 ? videoHeight : videoHeight - 1) : height;
  const gain = Math.max(2, sensitivity * 4);

  const filters = [
    `[1:a]showspectrum=s=${width}x${effectiveHeight}:mode=combined:color=channel:scale=sqrt:gain=${gain.toFixed(1)}:slide=scroll:orientation=vertical,fps=${fps},${buildTint(colorScheme)},${buildAlphaKey(opacity)}[viz]`,
    `[0:v][viz]overlay=0:${overlayY}:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

function getVisualizerTypes() { return { ...VISUALIZER_TYPES }; }
function getColorSchemes() {
  return Object.keys(COLOR_SCHEMES).reduce((acc, key) => {
    acc[key] = { name: key.charAt(0).toUpperCase() + key.slice(1), ...COLOR_SCHEMES[key] };
    return acc;
  }, {});
}

function validateSettings(settings) {
  const errors = [];
  if (!settings) return { valid: false, errors: ['No settings provided'] };
  if (settings.type && !VISUALIZER_TYPES[settings.type]) errors.push(`Unknown visualizer type: ${settings.type}`);
  if (settings.intensity !== undefined) {
    const v = Number(settings.intensity);
    if (isNaN(v) || v < 0 || v > 100) errors.push('Intensity must be between 0 and 100');
  }
  if (settings.sensitivity !== undefined) {
    const v = Number(settings.sensitivity);
    if (isNaN(v) || v < 0.1 || v > 5.0) errors.push('Sensitivity must be between 0.1 and 5.0');
  }
  if (settings.barCount !== undefined) {
    const v = Number(settings.barCount);
    if (isNaN(v) || v < 8 || v > 512) errors.push('Bar count must be between 8 and 512');
  }
  if (settings.color && settings.color !== 'custom' && !COLOR_SCHEMES[settings.color]) errors.push(`Unknown color scheme: ${settings.color}`);
  if (settings.color === 'custom' && (!settings.customColors || settings.customColors.length < 2)) errors.push('Custom color requires at least 2 colors in customColors array');
  return { valid: errors.length === 0, errors };
}

module.exports = {
  buildVisualizerFilter,
  getVisualizerTypes,
  getColorSchemes,
  validateSettings,
  VISUALIZER_TYPES,
  COLOR_SCHEMES
};
