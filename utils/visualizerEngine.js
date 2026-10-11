/**
 * Audio Visualizer Engine for OzangLive
 * 
 * KEY APPROACH: Uses `blend=all_mode=screen` to overlay visualizer on video.
 * Screen blend mode treats black as transparent automatically (math: 1-(1-a)*(1-b)),
 * so black background of visualizer disappears and only bright pattern shows.
 * 
 * This is the industry-standard reliable way to composite glowing visualizers.
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
 * Build colorchannelmixer string for color tinting
 */
function buildTint(scheme) {
  const t = scheme.tint || { rr: 1, gg: 1, bb: 1 };
  return `colorchannelmixer=rr=${t.rr}:gg=${t.gg}:bb=${t.bb}`;
}

/**
 * Build a full-size composite filter that:
 * 1. Creates the visualizer at its natural size
 * 2. Pads it to full video dimensions with black background, positioned correctly
 * 3. Blends with the main video using SCREEN mode
 *    -> Black pixels become transparent (screen blend math: 1-(1-a)*(1-b))
 *    -> Bright pixels show through brightly
 * 
 * @param {string} vizFilter - The visualizer generation filter (e.g., showfreqs=...)
 * @param {Object} opts - { videoWidth, videoHeight, vizWidth, vizHeight, padX, padY, glow, opacity, colorScheme }
 * @returns {Object} { filterComplex, outputMap }
 */
function compositeWithScreenBlend(vizFilter, opts) {
  const { videoWidth, videoHeight, vizWidth, vizHeight, padX, padY, glow, opacity, colorScheme, fps = 30 } = opts;
  
  // Apply opacity by darkening the visualizer (since screen blend additive,
  // less bright = less effect on output)
  const opacityFilter = opacity < 1.0 
    ? `,colorchannelmixer=rr=${(opacity).toFixed(2)}:gg=${(opacity).toFixed(2)}:bb=${(opacity).toFixed(2)}`
    : '';
  
  const blurFilter = glow ? ',gblur=sigma=2' : '';
  
  // CRITICAL FIX: screen blend math (1-(1-a)*(1-b)) is only correct in RGB.
  // We therefore convert BOTH inputs to planar RGB (gbrp) before blending so the
  // visualizer's black background (0,0,0) stays truly transparent and bright
  // pixels add correctly. Doing the blend in the video's native yuv420p makes the
  // black background's neutral chroma (128) wash out the frame and the visualizer
  // becomes invisible. We also force matching size/SAR/fps so blend never fails
  // (a size or SAR mismatch makes blend error out and the render silently falls
  // back to a no-visualizer output).
  const filters = [
    // Normalize base video: exact size, square pixels, constant fps, RGB
    `[0:v]fps=${fps},scale=${videoWidth}:${videoHeight},setsar=1,format=gbrp[base]`,
    // Generate visualizer, tint + effects, pad to full frame (black bg), match base
    `[1:a]${vizFilter},${buildTint(colorScheme)}${blurFilter}${opacityFilter},pad=${videoWidth}:${videoHeight}:${padX}:${padY}:black,setsar=1,format=gbrp[viz]`,
    // Screen blend in RGB space (black transparent), then back to yuv420p for h264
    `[base][viz]blend=all_mode=screen:shortest=1,format=yuv420p[outv]`
  ];

  return { filterComplex: filters.join(';'), outputMap: '[outv]' };
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
  const vizHeightCalc = Math.round(height * (heightPercent / 100));
  const vizHeightEven = vizHeightCalc % 2 === 0 ? vizHeightCalc : vizHeightCalc + 1;
  const widthEven = width % 2 === 0 ? width : width - 1;
  const heightEven = height % 2 === 0 ? height : height - 1;
  const effectiveOpacity = Math.max(0.3, Math.min(1.0, opacity));

  // Position calculation for pad
  // padX, padY = where to place the visualizer in the full-size frame
  let padX = 0, padY = 0;
  let usedHeight = vizHeightEven;
  let usedWidth = widthEven;

  switch (position) {
    case 'top':
      padX = 0; padY = 0; break;
    case 'center':
      padX = 0; padY = Math.round((heightEven - vizHeightEven) / 2);
      if (padY % 2 !== 0) padY++;
      break;
    case 'full':
      padX = 0; padY = 0;
      usedHeight = heightEven;
      break;
    case 'bottom':
    default:
      padX = 0; padY = heightEven - vizHeightEven; break;
  }

  const opts = {
    type, sensitivity, barCount, glow, opacity: effectiveOpacity, fps, colorScheme,
    videoWidth: widthEven, videoHeight: heightEven,
    vizWidth: usedWidth, vizHeight: usedHeight,
    padX, padY
  };

  // Build visualizer filter string based on type
  let vizFilter;
  switch (type) {
    case 'spectrum':
    case 'bars_bottom': {
      const winSize = Math.min(2048, Math.max(512, barCount * 16));
      vizFilter = `showfreqs=s=${usedWidth}x${usedHeight}:mode=bar:fscale=log:ascale=log:win_size=${winSize},fps=${fps}`;
      break;
    }
    case 'bars_center': {
      const halfH = Math.round(usedHeight / 2);
      const halfHE = halfH % 2 === 0 ? halfH : halfH + 1;
      const winSize = Math.min(2048, Math.max(512, barCount * 16));
      // Build mirror as a separate label chain
      return buildCenterBarsComposite({ ...opts, halfHE, winSize });
    }
    case 'waveform':
    case 'wave_line': {
      const scale = sensitivity > 1.5 ? 'log' : 'lin';
      vizFilter = `showwaves=s=${usedWidth}x${usedHeight}:mode=line:rate=${fps}:scale=${scale}:n=80`;
      break;
    }
    case 'circular': {
      // Circular: square in center, override sizes
      const size = Math.min(widthEven, heightEven);
      const vizSize = Math.round(size * 0.5);
      const vizSizeE = vizSize % 2 === 0 ? vizSize : vizSize + 1;
      const cPadX = Math.round((widthEven - vizSizeE) / 2);
      const cPadY = Math.round((heightEven - vizSizeE) / 2);
      vizFilter = `avectorscope=s=${vizSizeE}x${vizSizeE}:mode=lissajous_xy:rate=${fps}:scale=log:draw=dot:zoom=${(sensitivity * 1.5).toFixed(2)}`;
      return compositeWithScreenBlend(vizFilter, { ...opts, vizWidth: vizSizeE, vizHeight: vizSizeE, padX: cPadX % 2 === 0 ? cPadX : cPadX + 1, padY: cPadY % 2 === 0 ? cPadY : cPadY + 1, glow: glow || false });
    }
    case 'phase':
    case 'vector_lissajous':
    case 'dna_helix': {
      const size = Math.min(widthEven, heightEven);
      const vizSize = Math.round(size * 0.55);
      const vizSizeE = vizSize % 2 === 0 ? vizSize : vizSize + 1;
      const cPadX = Math.round((widthEven - vizSizeE) / 2);
      const cPadY = Math.round((heightEven - vizSizeE) / 2);
      vizFilter = `avectorscope=s=${vizSizeE}x${vizSizeE}:mode=lissajous:rate=${fps}:scale=log:draw=line:zoom=${sensitivity.toFixed(2)}`;
      return compositeWithScreenBlend(vizFilter, { ...opts, vizWidth: vizSizeE, vizHeight: vizSizeE, padX: cPadX % 2 === 0 ? cPadX : cPadX + 1, padY: cPadY % 2 === 0 ? cPadY : cPadY + 1 });
    }
    case 'nebula': {
      const size = Math.min(widthEven, heightEven);
      const vizSize = Math.round(size * 0.6);
      const vizSizeE = vizSize % 2 === 0 ? vizSize : vizSize + 1;
      const cPadX = Math.round((widthEven - vizSizeE) / 2);
      const cPadY = Math.round((heightEven - vizSizeE) / 2);
      vizFilter = `avectorscope=s=${vizSizeE}x${vizSizeE}:mode=lissajous:rate=${fps}:scale=sqrt:draw=line:zoom=${(sensitivity * 1.8).toFixed(2)},gblur=sigma=10`;
      return compositeWithScreenBlend(vizFilter, { ...opts, vizWidth: vizSizeE, vizHeight: vizSizeE, padX: cPadX % 2 === 0 ? cPadX : cPadX + 1, padY: cPadY % 2 === 0 ? cPadY : cPadY + 1, glow: false });
    }
    case 'particles':
    case 'frequency_dots': {
      const scale = sensitivity > 1.5 ? 'log' : 'lin';
      vizFilter = `showwaves=s=${usedWidth}x${usedHeight}:mode=p2p:rate=${fps}:scale=${scale}:n=120,gblur=sigma=${glow ? 3 : 1.5}`;
      break;
    }
    case 'spectrogram': {
      const gain = Math.max(1, sensitivity * 3);
      vizFilter = `showspectrum=s=${usedWidth}x${usedHeight}:mode=combined:color=intensity:scale=log:gain=${gain.toFixed(1)}:slide=scroll,fps=${fps}`;
      break;
    }
    case 'vector_polar': {
      const size = Math.min(widthEven, heightEven);
      const vizSize = Math.round(size * 0.5);
      const vizSizeE = vizSize % 2 === 0 ? vizSize : vizSize + 1;
      const cPadX = Math.round((widthEven - vizSizeE) / 2);
      const cPadY = Math.round((heightEven - vizSizeE) / 2);
      vizFilter = `avectorscope=s=${vizSizeE}x${vizSizeE}:mode=polar:rate=${fps}:scale=lin:draw=line:zoom=${(sensitivity * 0.9).toFixed(2)}`;
      return compositeWithScreenBlend(vizFilter, { ...opts, vizWidth: vizSizeE, vizHeight: vizSizeE, padX: cPadX % 2 === 0 ? cPadX : cPadX + 1, padY: cPadY % 2 === 0 ? cPadY : cPadY + 1 });
    }
    case 'histogram': {
      vizFilter = `ahistogram=s=${usedWidth}x${usedHeight}:scale=log:slide=scroll:rate=${fps}`;
      break;
    }
    case 'showcqt': {
      const volume = Math.max(1, Math.round(sensitivity * 10));
      vizFilter = `showcqt=s=${usedWidth}x${usedHeight}:fps=${fps}:count=1:bar_g=2:sono_g=4:volume=${volume}`;
      break;
    }
    case 'pulse_ring': {
      const size = Math.min(widthEven, heightEven);
      const vizSize = Math.round(size * 0.7);
      const vizSizeE = vizSize % 2 === 0 ? vizSize : vizSize + 1;
      const cPadX = Math.round((widthEven - vizSizeE) / 2);
      const cPadY = Math.round((heightEven - vizSizeE) / 2);
      vizFilter = `avectorscope=s=${vizSizeE}x${vizSizeE}:mode=lissajous_xy:rate=${fps}:scale=sqrt:draw=line:zoom=${(sensitivity * 2.5).toFixed(2)},gblur=sigma=6`;
      return compositeWithScreenBlend(vizFilter, { ...opts, vizWidth: vizSizeE, vizHeight: vizSizeE, padX: cPadX % 2 === 0 ? cPadX : cPadX + 1, padY: cPadY % 2 === 0 ? cPadY : cPadY + 1, glow: false });
    }
    case 'frequency_terrain': {
      const gain = Math.max(2, sensitivity * 4);
      vizFilter = `showspectrum=s=${usedWidth}x${usedHeight}:mode=combined:color=channel:scale=sqrt:gain=${gain.toFixed(1)}:slide=scroll:orientation=vertical,fps=${fps}`;
      break;
    }
    default: {
      const winSize = Math.min(2048, Math.max(512, barCount * 16));
      vizFilter = `showfreqs=s=${usedWidth}x${usedHeight}:mode=bar:fscale=log:ascale=log:win_size=${winSize},fps=${fps}`;
    }
  }

  return compositeWithScreenBlend(vizFilter, opts);
}

/**
 * Center bars needs special handling: build mirror from top half then vstack
 */
function buildCenterBarsComposite(opts) {
  const { videoWidth, videoHeight, vizWidth, vizHeight, padX, padY, halfHE, winSize, glow, opacity, colorScheme, fps = 30 } = opts;
  
  const opacityFilter = opacity < 1.0 
    ? `,colorchannelmixer=rr=${(opacity).toFixed(2)}:gg=${(opacity).toFixed(2)}:bb=${(opacity).toFixed(2)}`
    : '';
  const blurFilter = glow ? ',gblur=sigma=2' : '';

  // Same RGB-space screen blend approach as compositeWithScreenBlend (see notes there).
  const filters = [
    `[0:v]fps=${fps},scale=${videoWidth}:${videoHeight},setsar=1,format=gbrp[base]`,
    `[1:a]showfreqs=s=${vizWidth}x${halfHE}:mode=bar:fscale=log:ascale=log:win_size=${winSize},fps=${fps}[viz_top]`,
    `[viz_top]split[viz_a][viz_b]`,
    `[viz_b]vflip[viz_flip]`,
    `[viz_a][viz_flip]vstack,${buildTint(colorScheme)}${blurFilter}${opacityFilter},pad=${videoWidth}:${videoHeight}:${padX}:${padY}:black,setsar=1,format=gbrp[viz]`,
    `[base][viz]blend=all_mode=screen:shortest=1,format=yuv420p[outv]`
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
