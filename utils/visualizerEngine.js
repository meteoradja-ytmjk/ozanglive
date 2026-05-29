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
  circular: 'Circular Spectrum',
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
  vector_polar: 'Polar Scope'
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
  forest: { primary: '0x166534', secondary: '0x4ADE80', gradient: 'green|lime|yellow' }
};

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
    mirror = false,
    glow = false
  } = settings || {};

  const {
    width = 1920,
    height = 1080,
    position = 'bottom'
  } = options;

  const colorScheme = COLOR_SCHEMES[color] || COLOR_SCHEMES.purple;
  const vizHeight = Math.round(height * (intensity / 100) * 0.4); // Max 40% of video height
  const vizWidth = width;

  switch (type) {
    case 'spectrum':
    case 'bars_bottom':
      return buildSpectrumBars(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, mirror, glow, position, videoHeight: height
      });

    case 'bars_center':
      return buildCenterBars(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, glow, videoHeight: height
      });

    case 'waveform':
    case 'wave_line':
      return buildWaveform(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, smoothing, glow, position, videoHeight: height
      });

    case 'circular':
      return buildCircularSpectrum(colorScheme, {
        width, height, barCount, sensitivity, smoothing, glow
      });

    case 'particles':
    case 'frequency_dots':
      return buildParticleWave(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, glow, position, videoHeight: height
      });

    case 'spectrogram':
      return buildSpectrogram(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, position, videoHeight: height
      });

    case 'phase':
    case 'vector_lissajous':
      return buildCircularSpectrum(colorScheme, {
        width, height, barCount, sensitivity, smoothing, glow
      });

    case 'vector_polar':
      return buildVectorPolar(colorScheme, {
        width, height, sensitivity, glow
      });

    case 'histogram':
      return buildHistogram(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, position, videoHeight: height
      });

    case 'showcqt':
      return buildShowCQT(colorScheme, {
        width: vizWidth, height: vizHeight, sensitivity, glow, position, videoHeight: height
      });

    default:
      return buildSpectrumBars(colorScheme, {
        width: vizWidth, height: vizHeight, barCount, sensitivity, smoothing, mirror, glow, position, videoHeight: height
      });
  }
}

/**
 * Spectrum Bars - Classic bar chart visualizer
 * Uses showfreqs or showspectrum filter
 */
function buildSpectrumBars(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, mirror, glow, position, videoHeight } = opts;
  const mode = mirror ? 'combined' : 'separate';
  const vizH = Math.max(60, Math.min(height, 400));
  
  // Calculate Y position for overlay
  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  // showspectrum produces a spectrogram-style visualization
  // We use showfreqs for bar-style display
  const gain = Math.max(0.5, sensitivity * 2);
  const fscale = 'log'; // logarithmic frequency scale (more musical)
  
  const filterComplex = [
    // Generate spectrum visualization from audio
    `[1:a]showfreqs=s=${width}x${vizH}:mode=bar:fscale=${fscale}:ascale=${gain > 1.5 ? 'log' : 'lin'}:colors=${colorScheme.gradient}:win_size=${barCount * 8}[viz]`,
    // Add fade/transparency at edges
    `[viz]format=rgba,colorchannelmixer=aa=${glow ? '0.9' : '0.75'}[vizalpha]`,
    // Overlay on video
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Center Bars - Mirrored bars from center
 */
function buildCenterBars(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, glow, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 300));
  const gain = Math.max(0.5, sensitivity * 2);

  const filterComplex = [
    // Generate spectrum
    `[1:a]showfreqs=s=${width}x${vizH}:mode=bar:fscale=log:colors=${colorScheme.gradient}:win_size=${barCount * 8}[viz_top]`,
    // Create mirrored copy
    `[viz_top]split[viz_a][viz_b]`,
    `[viz_b]vflip[viz_flip]`,
    // Stack vertically (original + flipped = mirror effect)
    `[viz_a][viz_flip]vstack[viz_mirror]`,
    // Add transparency
    `[viz_mirror]format=rgba,colorchannelmixer=aa=${glow ? '0.85' : '0.7'}[vizalpha]`,
    // Overlay centered on video
    `[0:v][vizalpha]overlay=0:(H-h)/2:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Waveform - Audio waveform display
 * Uses showwaves filter
 */
function buildWaveform(colorScheme, opts) {
  const { width, height, sensitivity, smoothing, glow, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 300));
  const rate = 25; // frames per second for waveform
  const scale = sensitivity > 1.5 ? 'log' : 'lin';

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const filterComplex = [
    // Generate waveform visualization
    `[1:a]showwaves=s=${width}x${vizH}:mode=cline:rate=${rate}:scale=${scale}:colors=${colorScheme.gradient}[viz]`,
    // Add transparency
    `[viz]format=rgba,colorchannelmixer=aa=${glow ? '0.9' : '0.7'}[vizalpha]`,
    // Overlay on video
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Circular Spectrum - Radial/circular visualization
 * Uses avectorscope for circular audio display
 */
function buildCircularSpectrum(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, glow } = opts;
  // avectorscope creates a circular Lissajous-style display
  const size = Math.min(width, height);
  const vizSize = Math.round(size * 0.5); // 50% of smallest dimension
  const mode = 'lissajous_xy'; // circular pattern

  const filterComplex = [
    // Generate circular visualization
    `[1:a]avectorscope=s=${vizSize}x${vizSize}:mode=${mode}:rate=25:scale=log:draw=dot:zoom=${sensitivity}[viz]`,
    // Add glow effect via blur if enabled
    glow
      ? `[viz]gblur=sigma=3,format=rgba,colorchannelmixer=aa=0.85[vizglow]`
      : `[viz]format=rgba,colorchannelmixer=aa=0.75[vizglow]`,
    // Overlay centered on video
    `[0:v][vizglow]overlay=(W-w)/2:(H-h)/2:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Particle Wave - Dot/particle style visualization
 * Uses showwaves with point mode
 */
function buildParticleWave(colorScheme, opts) {
  const { width, height, barCount, sensitivity, smoothing, glow, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 300));
  const rate = 25;
  const scale = sensitivity > 1.5 ? 'log' : 'lin';

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const filterComplex = [
    // Generate particle/dot waveform
    `[1:a]showwaves=s=${width}x${vizH}:mode=p2p:rate=${rate}:scale=${scale}:colors=${colorScheme.gradient}[viz]`,
    // Add glow via blur if enabled
    glow
      ? `[viz]gblur=sigma=2,format=rgba,colorchannelmixer=aa=0.85[vizalpha]`
      : `[viz]format=rgba,colorchannelmixer=aa=0.7[vizalpha]`,
    // Overlay on video
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Spectrogram - Heatmap-style frequency display
 * Uses showspectrum filter
 */
function buildSpectrogram(colorScheme, opts) {
  const { width, height, sensitivity, glow, position, videoHeight } = opts;
  const vizH = Math.max(80, Math.min(height, 300));
  const gain = Math.max(1, sensitivity * 3);

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const filterComplex = [
    `[1:a]showspectrum=s=${width}x${vizH}:mode=combined:color=intensity:scale=log:gain=${gain}:slide=scroll[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${glow ? '0.9' : '0.75'}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Vector Polar - Polar/radial scope
 * Uses avectorscope with polar mode
 */
function buildVectorPolar(colorScheme, opts) {
  const { width, height, sensitivity, glow } = opts;
  const size = Math.min(width, height);
  const vizSize = Math.round(size * 0.5);

  const filterComplex = [
    `[1:a]avectorscope=s=${vizSize}x${vizSize}:mode=polar:rate=25:scale=log:draw=line:zoom=${sensitivity}[viz]`,
    glow
      ? `[viz]gblur=sigma=2,format=rgba,colorchannelmixer=aa=0.85[vizglow]`
      : `[viz]format=rgba,colorchannelmixer=aa=0.75[vizglow]`,
    `[0:v][vizglow]overlay=(W-w)/2:(H-h)/2:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * Histogram - Audio level histogram
 * Uses ahistogram filter
 */
function buildHistogram(colorScheme, opts) {
  const { width, height, sensitivity, glow, position, videoHeight } = opts;
  const vizH = Math.max(60, Math.min(height, 250));

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const filterComplex = [
    `[1:a]ahistogram=s=${width}x${vizH}:scale=log:slide=scroll:rate=25[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${glow ? '0.9' : '0.7'}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto[outv]`
  ].join(';');

  return { filterComplex, outputMap: '[outv]' };
}

/**
 * ShowCQT - Constant-Q Transform (musical scale visualization)
 * Uses showcqt filter for piano-like frequency display
 */
function buildShowCQT(colorScheme, opts) {
  const { width, height, sensitivity, glow, position, videoHeight } = opts;
  const vizH = Math.max(80, Math.min(height, 300));
  const volume = Math.max(1, Math.round(sensitivity * 10));

  let overlayY;
  switch (position) {
    case 'top': overlayY = '0'; break;
    case 'center': overlayY = `(H-h)/2`; break;
    case 'bottom': default: overlayY = `H-h`; break;
  }

  const filterComplex = [
    `[1:a]showcqt=s=${width}x${vizH}:count=1:bar_g=2:sono_g=4:volume=${volume}[viz]`,
    `[viz]format=rgba,colorchannelmixer=aa=${glow ? '0.9' : '0.8'}[vizalpha]`,
    `[0:v][vizalpha]overlay=0:${overlayY}:format=auto[outv]`
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

  if (settings.color && !COLOR_SCHEMES[settings.color]) {
    errors.push(`Unknown color scheme: ${settings.color}`);
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
