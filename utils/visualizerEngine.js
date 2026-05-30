/**
 * Audio Visualizer Engine for OzangLive
 * 
 * Generates FFmpeg filter chains for real audio-reactive visualizations.
 * Supports multiple visualizer types: spectrum bars, waveform, circular, particles, etc.
 * 
 * All visualizers use FFmpeg's built-in audio visualization filters combined with
 * custom overlay compositing to produce professional-looking results.
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

// Color scheme definitions (FFmpeg hex format without #)
const COLOR_SCHEMES = {
  purple: { primary: '0x8B5CF6', secondary: '0xEC4899', gradient: 'purple|magenta' },
  blue: { primary: '0x3B82F6', secondary: '0x06B6D4', gradient: 'blue|cyan' },
  green: { primary: '0x10B981', secondary: '0x34D399', gradient: 'green|lime' },
  rainbow: { primary: '0xEF4444', secondary: '0x8B5CF6', gradient: 'red|yellow|green|blue|violet' },
  fire: { primary: '0xDC2626', secondary: '0xFCD34D', gradient: 'red|orange|yellow' },
  neon: { primary: '0xFF00FF', secondary: '0x00FFFF', gradient: 'magenta|cyan' },
  ocean: { primary: '0x0EA5E9', secondary: '0x22D3EE', gradient: 'blue|cyan|white' },
  sunset: { primary: '0xF97316', secondary: '0xFBBF24', gradient: 'orange|yellow|red' },
  gold: { primary: '0xF59E0B', secondary: '0xD97706', gradient: 'yellow|orange' },
  ice: { primary: '0x93C5FD', secondary: '0xF0F9FF', gradient: 'white|cyan|blue' },
  cherry: { primary: '0xE11D48', secondary: '0xFB7185', gradient: 'red|pink|magenta' },
  forest: { primary: '0x166534', secondary: '0x4ADE80', gradient: 'green|lime|yellow' },
  aurora: { primary: '0x06B6D4', secondary: '0xEC4899', gradient: 'cyan|violet|magenta' },
  midnight: { primary: '0x1E1B4B', secondary: '0x7C3AED', gradient: 'blue|violet|purple' },
  white: { primary: '0xFFFFFF', secondary: '0xE2E8F0', gradient: 'white|gray' },
  lemon: { primary: '0xFDE047', secondary: '0xF59E0B', gradient: 'yellow|orange' }
};

/**
 * Convert hex color string (#RRGGBB) to FFmpeg-compatible color name or hex
 */
function hexToFfmpegColor(hex) {
  if (!hex) return 'white';
  // Remove # prefix
  const clean = hex.replace('#', '');
  return `0x${clean}`;
}

/**
 * Build FFmpeg filter complex string for audio visualization
 * 
 * @param {Object} settings - Visualizer settings from frontend
 * @param {string} settings.type - Visualizer type (spectrum, waveform, circular, etc.)
 * @param {number} settings.intensity - Intensity 0-100
 * @param {number} settings.sensitivity - Sensitivity multiplier (0.5-3.0)
 * @param {number} settings.smoothing - Smoothing factor (0.0-1.0)
 * @param {number} settings.barCount - Number of bars (16-256)
 * @param {string} settings.color - Color scheme name
 * @param {boolean} settings.mirror - Mirror effect
 * @param {boolean} settings.glow - Glow effect
 * @param {Object} options - Render options
 * @param {number} options.width - Video width
 * @param {number} options.height - Video height
 * @param {string} options.position - Position: 'bottom', 'top', 'center', 'fullscreen'
 * @returns {Object} { filterComplex: string, outputMaps: string[] }
 */
function buildVisualizerFilter(settings, options = {}) {
  const {
    type = 'spectrum',
    intensity = 50,
    sensitivity = 1.0,
    smoothing = 0.8,
    barCount = 64,
    color = 'purple',
    customColors = null,
    mirror = false,
    glow = false,
    shadow = false,
    roundBars = false,
    gradient = true,
    reflection = false,
    speed = 1.0,
    opacity = 1.0,
    position: settingsPosition = null,
    height: settingsHeight = null
  } = settings || {};

  const {
    width = 1920,
    height = 1080,
    position: optionsPosition = 'bottom'
  } = options;

  // Settings position takes priority over options position
  const position = settingsPosition || optionsPosition;

  // Resolve color scheme - support custom colors from frontend
  let colorScheme;
  if (color === 'custom' && customColors && customColors.length >= 2) {
    const primary = hexToFfmpegColor(customColors[0]);
    const secondary = hexToFfmpegColor(customColors[1]);
    colorScheme = { primary, secondary, gradient: `${customColors[0].replace('#','')}|${customColors[1].replace('#','')}` };
  } else {
    colorScheme = COLOR_SCHEMES[color] || COLOR_SCHEMES.purple;
  }

  // Calculate visualizer height based on settingsHeight or intensity
  const heightPercent = settingsHeight || Math.round(intensity * 0.4 + 10); // 10-50% range
  const vizHeight = Math.round(height * (heightPercent / 100));
  const vizWidth = width;

  // Effective opacity for alpha channel
  const effectiveOpacity = Math.max(0.2, Math.min(1.0, opacity));

  switch (type) {
    case 'spectrum':
    case 'bars_bottom':
      return buildSpectrumBars(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, mirror, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    case 'bars_center':
      return buildCenterBars(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, glow, shadow, opacity: effectiveOpacity, videoHeight: height
      });

    case 'waveform':
    case 'wave_line':
      return buildWaveform(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, smoothing, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    case 'circular':
      return buildCircularSpectrum(colorScheme, {
        width, height, barCount, sensitivity, smoothing, glow, shadow, opacity: effectiveOpacity
      });

    case 'nebula':
      return buildNebula(colorScheme, {
        width, height, sensitivity, glow, shadow, opacity: effectiveOpacity
      });

    case 'particles':
    case 'frequency_dots':
      return buildParticleWave(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    case 'spectrogram':
      return buildSpectrogram(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    case 'phase':
    case 'vector_lissajous':
    case 'dna_helix':
      return buildCircularSpectrum(colorScheme, {
        width, height, barCount, sensitivity, smoothing, glow, shadow, opacity: effectiveOpacity
      });

    case 'vector_polar':
      return buildVectorPolar(colorScheme, {
        width, height, sensitivity, glow, shadow, opacity: effectiveOpacity
      });

    case 'histogram':
      return buildHistogram(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    case 'showcqt':
      return buildShowCQT(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    case 'pulse_ring':
      return buildPulseRing(colorScheme, {
        width, height, sensitivity, glow, shadow, opacity: effectiveOpacity
      });

    case 'frequency_terrain':
      return buildFrequencyTerrain(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });

    default:
      return buildSpectrumBars(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, mirror, glow, shadow, opacity: effectiveOpacity, position, videoHeight: height
      });
  }
}

/**
 * Spectrum Bars - Classic bar chart visualizer
 */
function buildSpectrumBars(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, mirror, glow, shadow, opacity = 0.75, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 400));
  
  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;
  const scale = sensitivity > 1.5 ? 'log' : 'lin';
  const alpha = glow ? Math.min(0.95, opacity) : Math.min(0.85, opacity * 0.9);
  
  const filters = [
    `[1:a]showwaves=s=${width}x${effectiveHeight}:mode=cline:rate=25:scale=${scale}[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
}

/**
 * Center Bars - Mirrored bars from center
 */
function buildCenterBars(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, glow, shadow, opacity = 0.7, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 300));
  const scale = sensitivity > 1.5 ? 'log' : 'lin';
  const alpha = glow ? Math.min(0.9, opacity) : Math.min(0.8, opacity * 0.9);

  const filterComplex = [
    `[1:a]showwaves=s=${width}x${vizH}:mode=cline:rate=25:scale=${scale}[viz_top]`,
    `[viz_top]split[viz_a][viz_b]`,
    `[viz_b]vflip[viz_flip]`,
    `[viz_a][viz_flip]vstack[viz_mirror]`,
    `[viz_mirror]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:(H-h)/2:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Waveform - Audio waveform display
 */
function buildWaveform(colorScheme, opts) {
  const { width, height, sensitivity, smoothing, glow, shadow, opacity = 0.7, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 300));
  const scale = sensitivity > 1.5 ? 'log' : 'lin';
  const alpha = glow ? Math.min(0.95, opacity) : Math.min(0.8, opacity * 0.9);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;

  const filterComplex = [
    `[1:a]showwaves=s=${width}x${effectiveHeight}:mode=line:rate=25:scale=${scale}[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Circular Spectrum - Radial/circular visualization
 * Uses avectorscope with lissajous_xy mode (dot pattern, tight circular)
 */
function buildCircularSpectrum(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, glow, shadow, opacity = 0.75 } = opts;
  const size = Math.min(width, height);
  const vizSize = Math.round(size * 0.5);
  const alpha = glow ? Math.min(0.9, opacity) : Math.min(0.8, opacity * 0.9);

  const filterComplex = [
    `[1:a]avectorscope=s=${vizSize}x${vizSize}:mode=lissajous_xy:rate=25:scale=log:draw=dot:zoom=${sensitivity}[viz]`,
    glow
      ? `[viz]gblur=sigma=3,format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizglow]`
      : `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizglow]`,
    `[0:v][vizglow]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Nebula - Dreamy expanding cloud effect
 * Uses avectorscope with lissajous mode + heavy blur for nebula look
 */
function buildNebula(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.75 } = opts;
  const size = Math.min(width, height);
  const vizSize = Math.round(size * 0.6);
  const alpha = Math.min(0.85, opacity);

  const filterComplex = [
    `[1:a]avectorscope=s=${vizSize}x${vizSize}:mode=lissajous:rate=25:scale=sqrt:draw=line:zoom=${sensitivity * 1.5}[viz]`,
    `[viz]gblur=sigma=8,format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}:rr=1.2:gg=0.8:bb=1.3[vizglow]`,
    `[0:v][vizglow]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Particle Wave - Dot/particle style visualization
 */
function buildParticleWave(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, glow, shadow, opacity = 0.7, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 300));
  const scale = sensitivity > 1.5 ? 'log' : 'lin';
  const alpha = glow ? Math.min(0.9, opacity) : Math.min(0.8, opacity * 0.9);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;

  const filterComplex = [
    `[1:a]showwaves=s=${width}x${effectiveHeight}:mode=p2p:rate=25:scale=${scale}[viz]`,
    glow
      ? `[viz]gblur=sigma=2,format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`
      : `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Spectrogram - Heatmap-style frequency display
 * Uses showspectrum filter
 */
function buildSpectrogram(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.75, position, videoHeight } = opts;
  const vizH = Math.max(80, Math.min(height, 300));
  const gain = Math.max(1, sensitivity * 3);
  const alpha = glow ? Math.min(0.95, opacity) : Math.min(0.85, opacity * 0.9);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;

  const filterComplex = [
    `[1:a]showspectrum=s=${width}x${effectiveHeight}:mode=combined:color=intensity:scale=log:gain=${gain}:slide=scroll[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Vector Polar - Radar/polar scope (distinct from circular)
 * Uses avectorscope with polar mode + line draw for radar sweep look
 */
function buildVectorPolar(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.75 } = opts;
  const size = Math.min(width, height);
  const vizSize = Math.round(size * 0.45);
  const alpha = glow ? Math.min(0.9, opacity) : Math.min(0.8, opacity * 0.9);

  const filterComplex = [
    `[1:a]avectorscope=s=${vizSize}x${vizSize}:mode=polar:rate=25:scale=lin:draw=line:zoom=${sensitivity * 0.8}[viz]`,
    glow
      ? `[viz]gblur=sigma=2,format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}:rr=0.8:gg=1.2:bb=0.9[vizglow]`
      : `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizglow]`,
    `[0:v][vizglow]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Histogram - Audio level histogram
 * Uses ahistogram filter
 */
function buildHistogram(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.7, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 250));
  const alpha = glow ? Math.min(0.95, opacity) : Math.min(0.8, opacity * 0.9);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;

  const filterComplex = [
    `[1:a]ahistogram=s=${width}x${effectiveHeight}:scale=log:slide=scroll:rate=25[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * ShowCQT - Constant-Q Transform (musical scale visualization)
 * Uses showcqt filter for piano-like frequency display
 */
function buildShowCQT(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.8, position, videoHeight } = opts;
  const vizH = Math.max(80, Math.min(height, 300));
  const volume = Math.max(1, Math.round(sensitivity * 10));
  const alpha = glow ? Math.min(0.95, opacity) : Math.min(0.85, opacity * 0.9);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;

  const filterComplex = [
    `[1:a]showcqt=s=${width}x${effectiveHeight}:count=1:bar_g=2:sono_g=4:volume=${volume}[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Pulse Ring - Pulsating ring/circle that reacts to bass
 * Uses avectorscope with lissajous mode at large size + color tint
 */
function buildPulseRing(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.8 } = opts;
  const size = Math.min(width, height);
  const vizSize = Math.round(size * 0.7);
  const alpha = Math.min(0.9, opacity);

  const filterComplex = [
    `[1:a]avectorscope=s=${vizSize}x${vizSize}:mode=lissajous_xy:rate=30:scale=sqrt:draw=line:zoom=${sensitivity * 2}[viz]`,
    `[viz]gblur=sigma=5,format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}:rr=1.1:bb=1.3[vizglow]`,
    `[0:v][vizglow]overlay=(W-w)/2:(H-h)/2:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Frequency Terrain - Scrolling frequency landscape
 * Uses showspectrum with scroll mode for terrain-like effect
 */
function buildFrequencyTerrain(colorScheme, opts) {
  const { width, height, sensitivity, glow, shadow, opacity = 0.8, position, videoHeight } = opts;
  const vizH = Math.max(100, Math.min(height, 400));
  const gain = Math.max(2, sensitivity * 4);
  const alpha = glow ? Math.min(0.95, opacity) : Math.min(0.85, opacity * 0.9);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'full': overlayY = '0'; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const effectiveHeight = position === 'full' ? videoHeight : vizH;

  const filterComplex = [
    `[1:a]showspectrum=s=${width}x${effectiveHeight}:mode=combined:color=channel:scale=sqrt:gain=${gain}:slide=scroll:orientation=vertical[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto:shortest=1[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Get available visualizer types
 * @returns {Object} Map of type id to display name
 */
function getVisualizerTypes() {
  return { ...VISUALIZER_TYPES };
}

/**
 * Get available color schemes
 * @returns {Object} Map of color id to color info
 */
function getColorSchemes() {
  return Object.keys(COLOR_SCHEMES).reduce((acc, key) => {
    acc[key] = { name: key.charAt(0).toUpperCase() + key.slice(1), ...COLOR_SCHEMES[key] };
    return acc;
  }, {});
}

/**
 * Validate visualizer settings
 * @param {Object} settings - Settings to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateSettings(settings) {
  const errors = [];

  if (!settings) {
    return { valid: false, errors: ['No settings provided'] };
  }

  if (settings.type && !VISUALIZER_TYPES[settings.type]) {
    errors.push(`Unknown visualizer type: ${settings.type}`);
  }

  if (settings.intensity !== undefined) {
    const intensity = Number(settings.intensity);
    if (isNaN(intensity) || intensity < 0 || intensity > 100) {
      errors.push('Intensity must be between 0 and 100');
    }
  }

  if (settings.sensitivity !== undefined) {
    const sensitivity = Number(settings.sensitivity);
    if (isNaN(sensitivity) || sensitivity < 0.1 || sensitivity > 5.0) {
      errors.push('Sensitivity must be between 0.1 and 5.0');
    }
  }

  if (settings.barCount !== undefined) {
    const barCount = Number(settings.barCount);
    if (isNaN(barCount) || barCount < 8 || barCount > 512) {
      errors.push('Bar count must be between 8 and 512');
    }
  }

  // Allow 'custom' color with customColors array
  if (settings.color && settings.color !== 'custom' && !COLOR_SCHEMES[settings.color]) {
    errors.push(`Unknown color scheme: ${settings.color}`);
  }

  if (settings.color === 'custom' && (!settings.customColors || settings.customColors.length < 2)) {
    errors.push('Custom color requires at least 2 colors in customColors array');
  }

  if (settings.opacity !== undefined) {
    const opacity = Number(settings.opacity);
    if (isNaN(opacity) || opacity < 0 || opacity > 1) {
      errors.push('Opacity must be between 0 and 1');
    }
  }

  if (settings.speed !== undefined) {
    const speed = Number(settings.speed);
    if (isNaN(speed) || speed < 0.1 || speed > 5.0) {
      errors.push('Speed must be between 0.1 and 5.0');
    }
  }

  if (settings.height !== undefined) {
    const height = Number(settings.height);
    if (isNaN(height) || height < 5 || height > 100) {
      errors.push('Height must be between 5 and 100 (percent)');
    }
  }

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
