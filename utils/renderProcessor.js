const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

// Use ffmpeg-static (v6.1.1) as primary, fallback to @ffmpeg-installer
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
}

const { buildVisualizerFilter, validateSettings: validateVisualizerSettings } = require('./visualizerEngine');

ffmpeg.setFfmpegPath(ffmpegPath);
console.log('[FFmpeg] Using:', ffmpegPath);

const runFfmpeg = (configure, { onProgress, estimatedDurationSec } = {}) => new Promise((resolve, reject) => {
  const cmd = configure(ffmpeg());
  let progressEmitted = false;
  let lastProgress = 0;
  let lastCommand = '';
  const stderrLines = [];
  if (typeof onProgress === 'function') {
    cmd.on('progress', (p) => {
      progressEmitted = true;
      // Ensure we always pass a valid progress object
      if (p && p.timemark) {
        onProgress(p);
      } else if (p && p.percent) {
        // Some FFmpeg versions report percent directly
        onProgress({ timemark: '00:00:00', percent: p.percent });
      }
    });
  }
  cmd.on('start', (commandLine) => {
    lastCommand = commandLine;
  });
  cmd.on('stderr', (line) => {
    // Keep a rolling buffer of the last stderr lines for diagnostics on failure
    stderrLines.push(line);
    if (stderrLines.length > 40) stderrLines.shift();
  });
  cmd.on('end', () => {
    // If no progress was emitted (stream-copy), emit completion
    if (!progressEmitted && typeof onProgress === 'function') {
      onProgress({ timemark: '99:99:99', percent: 100, _synthetic: true });
    }
    resolve();
  }).on('error', (err) => {
    // Surface the actual FFmpeg command + stderr so silent fallbacks are debuggable
    if (lastCommand) console.error('[FFmpeg] Failed command:', lastCommand);
    if (stderrLines.length) console.error('[FFmpeg] stderr tail:\n' + stderrLines.join('\n'));
    err.ffmpegCommand = lastCommand;
    err.ffmpegStderr = stderrLines.join('\n');
    reject(err);
  }).run();
});

const ffprobeAsync = (filePath) => new Promise((resolve, reject) => {
  ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
});

const parseTimeToSeconds = (timemark = '') => {
  const [h = 0, m = 0, s = 0] = String(timemark).split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
};

/**
 * Safely calculate progress percentage from FFmpeg timemark
 * Handles division by zero and NaN cases
 */
const calcProgress = (timemark, totalDuration, minPct = 5, maxPct = 99) => {
  if (!totalDuration || totalDuration <= 0) return minPct;
  const elapsed = parseTimeToSeconds(timemark);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return minPct;
  const pct = Math.round((elapsed / totalDuration) * 100);
  return Math.min(maxPct, Math.max(minPct, pct));
};

/**
 * Apply audio visualizer overlay to a video+audio combination.
 * OPTIMIZED: Uses single-pass encoding with hardware-friendly settings.
 * 
 * @param {Object} params
 * @param {string} params.videoPath - Path to the video file (already looped/trimmed)
 * @param {string} params.audioPath - Path to the audio file (already looped/trimmed)
 * @param {string} params.outputPath - Final output path
 * @param {number} params.duration - Target duration in seconds
 * @param {Object} params.visualizerSettings - Visualizer configuration from frontend
 * @param {Function} params.onProgress - Progress callback (0-100)
 * @param {number} params.progressOffset - Starting progress percentage
 * @param {number} params.progressRange - Range of progress for this step
 * @returns {Promise<string>} Output path
 */
async function applyVisualizerOverlay({ videoPath, audioPath, outputPath, duration, visualizerSettings, onProgress, progressOffset = 0, progressRange = 100 }) {
  // Get video dimensions for proper sizing
  const videoMeta = await ffprobeAsync(videoPath);
  const videoStream = videoMeta.streams?.find(s => s.codec_type === 'video');
  const width = videoStream?.width || 1920;
  const height = videoStream?.height || 1080;
  const fpsStr = videoStream?.r_frame_rate || '30/1';
  let fps = 30;
  try { 
    const parts = fpsStr.split('/');
    fps = parts.length === 2 ? Math.round(parseInt(parts[0]) / parseInt(parts[1])) : parseInt(fpsStr);
  } catch(e) { fps = 30; }
  fps = Math.min(Math.max(fps || 30, 24), 30);

  console.log('[VISUALIZER] Applying visualizer overlay');
  console.log('[VISUALIZER] Type:', visualizerSettings.type);
  console.log('[VISUALIZER] Video:', width, 'x', height, '@', fps, 'fps');
  console.log('[VISUALIZER] Duration:', duration, 's');

  // Build the FFmpeg filter complex (pass fps so filters render at correct rate)
  const { filterComplex, outputMap } = buildVisualizerFilter(visualizerSettings, {
    width,
    height,
    position: visualizerSettings.position || 'bottom',
    fps
  });

  console.log('[VISUALIZER] Filter:', filterComplex);

  await runFfmpeg((cmd) => {
    return cmd
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-filter_complex', filterComplex,
        '-map', outputMap,
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-g', String(fps * 2),
        '-keyint_min', String(fps),
        '-sc_threshold', '0',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-t', String(duration),
        '-movflags', '+faststart',
        '-max_muxing_queue_size', '4096',
        '-vsync', 'cfr',
        '-y'
      ])
      .output(outputPath);
  }, {
    onProgress: (p) => {
      const progress = progressOffset + Math.min(progressRange - 1, Math.round((parseTimeToSeconds(p.timemark) / duration) * progressRange));
      onProgress?.(progress);
    }
  });

  // Verify output file exists and has size > 0
  if (!fs.existsSync(outputPath)) {
    throw new Error('Visualizer output file was not created');
  }
  const stat = fs.statSync(outputPath);
  if (stat.size < 1000) {
    throw new Error(`Visualizer output file too small (${stat.size} bytes), likely corrupt`);
  }

  console.log('[VISUALIZER] ✓ Output:', (stat.size / 1024 / 1024).toFixed(1), 'MB');
  return outputPath;
}

/**
 * Render video with visualizer in a SINGLE PASS.
 * Takes raw video paths and audio paths, prepares them (loop/concat if needed),
 * then renders final output with visualizer overlay applied directly.
 * This avoids the 2-pass problem where visualizer might not be applied.
 * 
 * @param {Object} params
 * @param {string[]} params.videoPaths - Array of video file paths
 * @param {string[]} params.audioPaths - Array of audio file paths  
 * @param {string} params.outputPath - Final output file path
 * @param {number} params.duration - Target duration in seconds
 * @param {Object} params.visualizerSettings - Visualizer configuration
 * @param {string} params.workDir - Temp working directory
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<string>} Output path
 */
async function renderWithVisualizerSinglePass({ videoPaths, audioPaths, outputPath, duration, visualizerSettings, workDir, onProgress }) {
  if (!videoPaths?.length) throw new Error('Video diperlukan');
  if (!audioPaths?.length) throw new Error('Audio diperlukan untuk visualizer');

  console.log('[VIZ-RENDER] ========================================');
  console.log('[VIZ-RENDER] Single-pass visualizer render');
  console.log('[VIZ-RENDER] Videos:', videoPaths.length, '| Audios:', audioPaths.length);
  console.log('[VIZ-RENDER] Duration:', duration, 's');
  console.log('[VIZ-RENDER] Visualizer type:', visualizerSettings.type);
  console.log('[VIZ-RENDER] ========================================');

  onProgress?.(5);

  // Step 1: Prepare looped/concat video if needed
  let preparedVideoPath;
  if (videoPaths.length === 1) {
    const videoMeta = await ffprobeAsync(videoPaths[0]);
    const videoDuration = Number(videoMeta?.format?.duration || 0);
    if (videoDuration >= duration) {
      // Use directly
      preparedVideoPath = videoPaths[0];
    } else {
      // Loop video
      const loops = Math.ceil(duration / videoDuration) + 1;
      const concatFile = path.join(workDir, 'video-concat.txt');
      const lines = Array(loops).fill(`file '${videoPaths[0].replace(/'/g, "'\\''")}'`);
      fs.writeFileSync(concatFile, lines.join('\n'), 'utf8');
      preparedVideoPath = path.join(workDir, 'video-prepared.mp4');
      console.log('[VIZ-RENDER] Looping video', loops, 'times');
      await runFfmpeg((cmd) => cmd
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-t', String(duration), '-c:v', 'copy', '-movflags', '+faststart'])
        .output(preparedVideoPath));
    }
  } else {
    // Multiple videos - concat
    const concatFile = path.join(workDir, 'video-concat.txt');
    const totalDur = (await Promise.all(videoPaths.map(p => ffprobeAsync(p))))
      .reduce((s, m) => s + Number(m?.format?.duration || 0), 0);
    const loops = Math.ceil(duration / totalDur) + 1;
    const lines = [];
    for (let i = 0; i < loops; i++) {
      videoPaths.forEach(p => lines.push(`file '${p.replace(/'/g, "'\\''")}'`));
    }
    fs.writeFileSync(concatFile, lines.join('\n'), 'utf8');
    preparedVideoPath = path.join(workDir, 'video-prepared.mp4');
    console.log('[VIZ-RENDER] Concatenating', videoPaths.length, 'videos x', loops, 'loops');
    await runFfmpeg((cmd) => cmd
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart'])
      .output(preparedVideoPath));
  }

  onProgress?.(25);

  // Step 2: Prepare looped/concat audio
  let preparedAudioPath;
  if (audioPaths.length === 1) {
    const audioMeta = await ffprobeAsync(audioPaths[0]);
    const audioDuration = Number(audioMeta?.format?.duration || 0);
    if (audioDuration >= duration) {
      preparedAudioPath = audioPaths[0];
    } else {
      const loops = Math.ceil(duration / audioDuration) + 1;
      const concatFile = path.join(workDir, 'audio-concat.txt');
      const lines = Array(loops).fill(`file '${audioPaths[0].replace(/'/g, "'\\''")}'`);
      fs.writeFileSync(concatFile, lines.join('\n'), 'utf8');
      preparedAudioPath = path.join(workDir, 'audio-prepared.aac');
      console.log('[VIZ-RENDER] Looping audio', loops, 'times');
      await runFfmpeg((cmd) => cmd
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-t', String(duration), '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'])
        .output(preparedAudioPath));
    }
  } else {
    // Multiple audios
    const concatFile = path.join(workDir, 'audio-concat.txt');
    const totalDur = (await Promise.all(audioPaths.map(p => ffprobeAsync(p))))
      .reduce((s, m) => s + Number(m?.format?.duration || 0), 0);
    const loops = Math.ceil(duration / totalDur) + 1;
    const lines = [];
    for (let i = 0; i < loops; i++) {
      audioPaths.forEach(p => lines.push(`file '${p.replace(/'/g, "'\\''")}'`));
    }
    fs.writeFileSync(concatFile, lines.join('\n'), 'utf8');
    preparedAudioPath = path.join(workDir, 'audio-prepared.aac');
    console.log('[VIZ-RENDER] Concatenating', audioPaths.length, 'audios x', loops, 'loops');
    await runFfmpeg((cmd) => cmd
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-t', String(duration), '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'])
      .output(preparedAudioPath));
  }

  onProgress?.(40);

  // Step 3: Apply visualizer overlay - this is the FINAL render
  console.log('[VIZ-RENDER] Applying visualizer overlay - FINAL render');
  await applyVisualizerOverlay({
    videoPath: preparedVideoPath,
    audioPath: preparedAudioPath,
    outputPath,
    duration,
    visualizerSettings,
    onProgress: (pct) => onProgress?.(40 + Math.round((pct / 100) * 59)),
    progressOffset: 0,
    progressRange: 100
  });

  // Verify final output
  if (!fs.existsSync(outputPath)) {
    throw new Error('Visualizer render did not produce output file');
  }
  const stat = fs.statSync(outputPath);
  if (stat.size < 10000) {
    throw new Error(`Visualizer output too small (${stat.size} bytes), likely corrupt`);
  }

  console.log('[VIZ-RENDER] ✓ Final output:', (stat.size / 1024 / 1024).toFixed(1), 'MB');
  onProgress?.(99);
  return outputPath;
}

async function renderLoopVideo({ 
  videoPaths, 
  audioPaths, 
  outputPath, 
  targetDurationSeconds, 
  visualizerPreset = 'none', 
  followAudioDuration = false,
  muteVideoAudio = false,
  advancedAudio = {}, 
  watermark = null,
  overlayVideo = null,
  visualizerSettings = null,
  onProgress 
}) {
  if (!videoPaths?.length) throw new Error('Minimal 1 video diperlukan');
  
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-render-'));
  const startTime = Date.now();
  
  // Determine if visualizer should be applied
  const shouldApplyVisualizer = visualizerSettings && 
    visualizerSettings.type && 
    visualizerSettings.type !== 'none' && 
    audioPaths?.length > 0;
  
  if (shouldApplyVisualizer) {
    const validation = validateVisualizerSettings(visualizerSettings);
    if (!validation.valid) {
      console.warn('[RENDER] Visualizer settings invalid, skipping:', validation.errors);
    }
  }
  
  try {
    console.log('[RENDER] ========================================');
    console.log('[RENDER] START - Render Job');
    console.log('[RENDER] Videos:', videoPaths.length);
    console.log('[RENDER] Audios:', audioPaths?.length || 0);
    console.log('[RENDER] Target Duration:', targetDurationSeconds, 's');
    console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
    console.log('[RENDER] Visualizer:', shouldApplyVisualizer ? visualizerSettings.type : 'none');
    console.log('[RENDER] Work Dir:', workDir);
    console.log('[RENDER] ========================================');
    
    // Calculate effective target duration
    let effectiveTargetDuration = targetDurationSeconds;
    
    if (followAudioDuration && audioPaths?.length > 0) {
      console.log('[RENDER] Calculating audio duration...');
      const audioDurations = await Promise.all(audioPaths.map(async (audioPath) => {
        const meta = await ffprobeAsync(audioPath);
        return Number(meta?.format?.duration || 0);
      }));
      const totalAudioDuration = audioDurations.reduce((sum, val) => sum + val, 0);
      effectiveTargetDuration = totalAudioDuration > 0 ? Math.ceil(totalAudioDuration) : targetDurationSeconds;
      console.log('[RENDER] Audio duration:', totalAudioDuration, 's');
    }
    
    console.log('[RENDER] Effective Duration:', effectiveTargetDuration, 's');
    
    // ========================================
    // VISUALIZER PATH: When visualizer is enabled, use single-pass render
    // This guarantees visualizer is applied to output (avoids the 2-pass issue)
    // ========================================
    if (shouldApplyVisualizer) {
      console.log('[RENDER] 🎵 VISUALIZER MODE: Single-pass render with overlay');
      try {
        await renderWithVisualizerSinglePass({
          videoPaths,
          audioPaths,
          outputPath,
          duration: effectiveTargetDuration,
          visualizerSettings,
          workDir,
          onProgress
        });
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] 🎵 COMPLETED IN', elapsedSeconds, 'SECONDS (VISUALIZER MODE)');
        console.log('[RENDER] ========================================');
        return outputPath;
      } catch (vizError) {
        console.error('[RENDER] ⚠️ Visualizer render failed:', vizError.message);
        console.error('[RENDER] Falling back to standard render without visualizer');
        // Fall through to standard render
      }
    }
    
    // When visualizer is enabled, we render video+audio to a temp file first,
    // then apply the visualizer overlay as a post-processing step.
    const actualOutputPath = shouldApplyVisualizer 
      ? path.join(workDir, 'pre-visualizer-output.mp4') 
      : outputPath;
    
    /**
     * Helper: Apply visualizer post-processing if enabled.
     * Uses single-pass approach: takes the pre-rendered video and applies visualizer overlay.
     * @param {string} renderedPath - Path to the rendered file (actualOutputPath or outputPath)
     * @returns {Promise<string>} Final output path
     */
    async function finalizeWithVisualizer(renderedPath) {
      if (!shouldApplyVisualizer) return renderedPath;
      
      // Determine source file
      let preVizPath;
      if (renderedPath === outputPath && fs.existsSync(outputPath)) {
        preVizPath = path.join(workDir, 'pre-viz-final.mp4');
        fs.renameSync(outputPath, preVizPath);
      } else if (fs.existsSync(actualOutputPath)) {
        preVizPath = actualOutputPath;
      } else {
        console.error('[RENDER] ⚠️ No source file found for visualizer');
        return renderedPath;
      }
      
      // Verify source file is valid
      const srcStat = fs.statSync(preVizPath);
      if (srcStat.size < 1000) {
        console.error('[RENDER] ⚠️ Source file too small, skipping visualizer');
        fs.copyFileSync(preVizPath, outputPath);
        return outputPath;
      }
      
      console.log('[RENDER] 🎵 Applying Audio Visualizer...');
      console.log('[RENDER] Source:', preVizPath, '(' + (srcStat.size / 1024 / 1024).toFixed(1) + ' MB)');
      
      // Extract audio - re-encode to AAC to ensure compatibility with filter
      const vizAudioPath = path.join(workDir, 'viz-audio.aac');
      try {
        await runFfmpeg((cmd) => {
          return cmd
            .input(preVizPath)
            .outputOptions([
              '-vn',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-t', String(effectiveTargetDuration)
            ])
            .output(vizAudioPath);
        });
      } catch (audioErr) {
        console.error('[RENDER] ⚠️ Audio extraction failed:', audioErr.message);
        fs.copyFileSync(preVizPath, outputPath);
        return outputPath;
      }
      
      // Verify audio was extracted
      if (!fs.existsSync(vizAudioPath) || fs.statSync(vizAudioPath).size < 100) {
        console.error('[RENDER] ⚠️ Audio extraction produced empty file');
        fs.copyFileSync(preVizPath, outputPath);
        return outputPath;
      }
      
      try {
        await applyVisualizerOverlay({
          videoPath: preVizPath,
          audioPath: vizAudioPath,
          outputPath: outputPath,
          duration: effectiveTargetDuration,
          visualizerSettings,
          onProgress,
          progressOffset: 0,
          progressRange: 100
        });
        console.log('[RENDER] 🎵 Visualizer applied successfully!');
      } catch (vizError) {
        console.error('[RENDER] ⚠️ Visualizer failed:', vizError.message);
        // Fallback: copy the pre-visualizer output as final
        if (fs.existsSync(preVizPath)) {
          fs.copyFileSync(preVizPath, outputPath);
          console.log('[RENDER] Using pre-visualizer output as fallback');
        }
      }
      
      return outputPath;
    }
    
    // ========================================
    // SPECIAL CASE: Mute video without audio (video only, no audio)
    // ========================================
    if (muteVideoAudio && (!audioPaths || audioPaths.length === 0)) {
      console.log('[RENDER] 🔇 MUTE MODE: Video only (no audio)');
      
      if (videoPaths.length === 1) {
        // Single video - just trim and remove audio
        const videoPath = videoPaths[0];
        if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
        
        const videoMeta = await ffprobeAsync(videoPath);
        const videoDuration = Number(videoMeta?.format?.duration || 0);
        
        if (videoDuration >= effectiveTargetDuration) {
          // Video long enough - just trim and remove audio
          console.log('[RENDER] Trimming video and removing audio');
          await runFfmpeg((cmd) => {
            return cmd
              .input(videoPath)
              .outputOptions([
                '-t', String(effectiveTargetDuration),
                '-c:v', 'copy',
                '-an', // Remove audio
                '-movflags', '+faststart'
              ])
              .output(outputPath);
          }, {
            onProgress: (p) => {
              const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 99);
              onProgress?.(progress);
            }
          });
        } else {
          // Need to loop video
          console.log('[RENDER] Looping video and removing audio');
          const videoLoops = Math.ceil(effectiveTargetDuration / videoDuration) + 1;
          const videoConcatFile = path.join(workDir, 'video-loop.txt');
          const videoLines = Array(videoLoops).fill(`file '${videoPath.replace(/'/g, "'\\''")}'`);
          fs.writeFileSync(videoConcatFile, videoLines.join('\n'), 'utf8');
          
          await runFfmpeg((cmd) => {
            return cmd
              .input(videoConcatFile)
              .inputOptions(['-f', 'concat', '-safe', '0'])
              .outputOptions([
                '-t', String(effectiveTargetDuration),
                '-c:v', 'copy',
                '-an', // Remove audio
                '-movflags', '+faststart'
              ])
              .output(outputPath);
          }, {
            onProgress: (p) => {
              const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 99);
              onProgress?.(progress);
            }
          });
        }
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] 🔇 COMPLETED IN', elapsedSeconds, 'SECONDS (MUTE MODE)');
        console.log('[RENDER] ========================================');
        return outputPath;
      }
    }
    
    // ========================================
    // OPTIMIZATION: 1 video + 1 audio = ULTRA FAST MODE
    // ========================================
    if (videoPaths.length === 1 && audioPaths?.length === 1) {
      console.log('[RENDER] ⚡⚡⚡ ULTRA FAST MODE: Single video + audio');
      const videoPath = videoPaths[0];
      const audioPath = audioPaths[0];
      
      // Validate files exist
      if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
      if (!fs.existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}`);
      
      console.log('[RENDER] Video:', videoPath);
      console.log('[RENDER] Audio:', audioPath);
      
      // Get durations
      const videoMeta = await ffprobeAsync(videoPath);
      const audioMeta = await ffprobeAsync(audioPath);
      const videoDuration = Number(videoMeta?.format?.duration || 0);
      const audioDuration = Number(audioMeta?.format?.duration || 0);
      
      console.log('[RENDER] Video duration:', videoDuration, 's');
      console.log('[RENDER] Audio duration:', audioDuration, 's');
      console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
      
      // Check if we need to loop or can use direct
      const needVideoLoop = videoDuration < effectiveTargetDuration;
      const needAudioLoop = audioDuration < effectiveTargetDuration;
      
      if (!needVideoLoop && !needAudioLoop) {
        // CASE 1: Both long enough - Direct trim
        console.log('[RENDER] ⚡ CASE 1: Direct trim');
        console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
        console.log('[RENDER] Using audio file - GUARANTEED AUDIO OUTPUT');
        console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
        
        // Emit initial progress
        onProgress?.(15);
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoPath)
            .input(audioPath)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-map', '0:v:0',
              '-map', '1:a:0',
              '-movflags', '+faststart'
            ])
            .output(actualOutputPath);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 15, 99);
            console.log(`[RENDER] Progress: ${progress}% - ${p.timemark}`);
            onProgress?.(progress);
          }
        });
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] ⚡ COMPLETED IN', elapsedSeconds, 'SECONDS (ULTRA FAST)');
        console.log('[RENDER] ========================================');
        return await finalizeWithVisualizer(outputPath);
        
      } else if (needVideoLoop && !needAudioLoop) {
        // CASE 2: Loop video, trim audio
        console.log('[RENDER] ⚡ CASE 2: Loop video + trim audio');
        
        const videoLoops = Math.ceil(effectiveTargetDuration / videoDuration) + 1;
        console.log('[RENDER] Video loops needed:', videoLoops);
        
        // Create video concat file
        const videoConcatFile = path.join(workDir, 'video-loop.txt');
        const videoLines = Array(videoLoops).fill(`file '${videoPath.replace(/'/g, "'\\''")}'`);
        fs.writeFileSync(videoConcatFile, videoLines.join('\n'), 'utf8');
        
        // Loop video with stream copy
        const loopedVideo = path.join(workDir, 'video-looped.mp4');
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy'
            , '-movflags', '+faststart'])
            .output(loopedVideo);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 50);
            onProgress?.(progress);
          }
        });
        
        // Combine with audio
        console.log('[RENDER] Combining looped video with audio');
        console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
        console.log('[RENDER] Using audio file - GUARANTEED AUDIO OUTPUT');
        console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(loopedVideo)
            .input(audioPath)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-map', '0:v:0',
              '-map', '1:a:0'
            , '-movflags', '+faststart'])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 50, 99);
            console.log(`[RENDER] Progress: ${progress}% - ${p.timemark}`);
            onProgress?.(progress);
          }
        });
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] ⚡ COMPLETED IN', elapsedSeconds, 'SECONDS (FAST)');
        console.log('[RENDER] ========================================');
        return await finalizeWithVisualizer(outputPath);
        
      } else if (!needVideoLoop && needAudioLoop) {
        // CASE 3: Trim video, loop audio
        console.log('[RENDER] ⚡ CASE 3: Trim video + loop audio');
        
        const audioLoops = Math.ceil(effectiveTargetDuration / audioDuration) + 1;
        console.log('[RENDER] Audio loops needed:', audioLoops);
        
        // Create audio concat file
        const audioConcatFile = path.join(workDir, 'audio-loop.txt');
        const audioLines = Array(audioLoops).fill(`file '${audioPath.replace(/'/g, "'\\''")}'`);
        fs.writeFileSync(audioConcatFile, audioLines.join('\n'), 'utf8');
        
        // Loop audio with stream copy
        const loopedAudio = path.join(workDir, 'audio-looped.aac');
        await runFfmpeg((cmd) => {
          return cmd
            .input(audioConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:a', 'copy'
            , '-movflags', '+faststart'])
            .output(loopedAudio);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 50);
            onProgress?.(progress);
          }
        });
        
        console.log('[RENDER] Combining video with looped audio');
        console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
        console.log('[RENDER] Using audio file - GUARANTEED AUDIO OUTPUT');
        console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoPath)
            .input(loopedAudio)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-map', '0:v:0',
              '-map', '1:a:0'
            , '-movflags', '+faststart'])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 50, 99);
            console.log(`[RENDER] Progress: ${progress}% - ${p.timemark}`);
            onProgress?.(progress);
          }
        });
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] ⚡ COMPLETED IN', elapsedSeconds, 'SECONDS (FAST)');
        console.log('[RENDER] ========================================');
        return await finalizeWithVisualizer(outputPath);
        
      } else {
        // CASE 4: Both need looping
        console.log('[RENDER] ⚡ CASE 4: Loop both video + audio');
        
        const videoLoops = Math.ceil(effectiveTargetDuration / videoDuration) + 1;
        const audioLoops = Math.ceil(effectiveTargetDuration / audioDuration) + 1;
        console.log('[RENDER] Video loops:', videoLoops, '| Audio loops:', audioLoops);
        
        // Create concat files
        const videoConcatFile = path.join(workDir, 'video-loop.txt');
        const audioConcatFile = path.join(workDir, 'audio-loop.txt');
        const videoLines = Array(videoLoops).fill(`file '${videoPath.replace(/'/g, "'\\''")}'`);
        const audioLines = Array(audioLoops).fill(`file '${audioPath.replace(/'/g, "'\\''")}'`);
        fs.writeFileSync(videoConcatFile, videoLines.join('\n'), 'utf8');
        fs.writeFileSync(audioConcatFile, audioLines.join('\n'), 'utf8');
        
        // Loop video
        const loopedVideo = path.join(workDir, 'video-looped.mp4');
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy'
            , '-movflags', '+faststart'])
            .output(loopedVideo);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 33);
            onProgress?.(progress);
          }
        });
        
        // Loop audio
        const loopedAudio = path.join(workDir, 'audio-looped.aac');
        await runFfmpeg((cmd) => {
          return cmd
            .input(audioConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:a', 'copy'
            , '-movflags', '+faststart'])
            .output(loopedAudio);
        }, {
          onProgress: (p) => {
            const progress = 33 + calcProgress(p.timemark, effectiveTargetDuration, 5, 33);
            onProgress?.(progress);
          }
        });
        
        // Combine
        console.log('[RENDER] Combining looped video with looped audio');
        console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
        console.log('[RENDER] Using audio file - GUARANTEED AUDIO OUTPUT');
        console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(loopedVideo)
            .input(loopedAudio)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-map', '0:v:0',
              '-map', '1:a:0'
            , '-movflags', '+faststart'])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = 66 + calcProgress(p.timemark, effectiveTargetDuration, 5, 33);
            console.log(`[RENDER] Progress: ${progress}% - ${p.timemark}`);
            onProgress?.(progress);
          }
        });
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] ⚡ COMPLETED IN', elapsedSeconds, 'SECONDS (FAST)');
        console.log('[RENDER] ========================================');
        return await finalizeWithVisualizer(outputPath);
      }
    }
    
    // ========================================
    // OPTIMIZATION 2: 1 video + multiple audios = FAST MODE
    // ========================================
    if (videoPaths.length === 1 && audioPaths?.length > 1) {
      console.log('[RENDER] ⚡⚡ FAST MODE: Single video + multiple audios');
      const videoPath = videoPaths[0];
      
      // Validate video exists
      if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
      
      console.log('[RENDER] Video:', videoPath);
      console.log('[RENDER] Audios:', audioPaths.length);
      
      // Get video duration
      const videoMeta = await ffprobeAsync(videoPath);
      const videoDuration = Number(videoMeta?.format?.duration || 0);
      console.log('[RENDER] Video duration:', videoDuration, 's');
      console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
      
      // Get audio durations
      const audioDurations = await Promise.all(audioPaths.map(async (audioPath) => {
        const meta = await ffprobeAsync(audioPath);
        return Number(meta?.format?.duration || 0);
      }));
      const totalAudioDuration = audioDurations.reduce((sum, val) => sum + val, 0);
      console.log('[RENDER] Total audio duration:', totalAudioDuration, 's');
      
      // Calculate loops needed
      const audioLoops = Math.ceil(effectiveTargetDuration / totalAudioDuration) + 1;
      console.log('[RENDER] Audio loops needed:', audioLoops);
      
      // Create audio concat file
      const audioConcatFile = path.join(workDir, 'audios.txt');
      const audioLines = [];
      for (let i = 0; i < audioLoops; i++) {
        audioPaths.forEach(aPath => {
          audioLines.push(`file '${aPath.replace(/'/g, "'\\''")}'`);
        });
      }
      fs.writeFileSync(audioConcatFile, audioLines.join('\n'), 'utf8');
      console.log('[RENDER] Audio concat file created');
      
      // Merge audios with stream copy (FAST!)
      const mergedAudio = path.join(workDir, 'audio-merged.aac');
      console.log('[RENDER] Step 1/2: Merging audios (stream copy)...');
      
      await runFfmpeg((cmd) => {
        return cmd
          .input(audioConcatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions([
            '-t', String(effectiveTargetDuration),
            '-c:a', 'copy'
          , '-movflags', '+faststart'])
          .output(mergedAudio);
      }, {
        onProgress: (p) => {
          const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 50);
          console.log(`[RENDER] Audio merge: ${progress}%`);
          onProgress?.(progress);
        }
      });
      
      console.log('[RENDER] Audios merged ✓');
      
      // Check if video needs looping
      const needVideoLoop = videoDuration < effectiveTargetDuration;
      
      if (needVideoLoop) {
        // Loop video then combine
        console.log('[RENDER] Step 2/2: Loop video + combine (stream copy)...');
        
        const videoLoops = Math.ceil(effectiveTargetDuration / videoDuration) + 1;
        console.log('[RENDER] Video loops needed:', videoLoops);
        
        const videoConcatFile = path.join(workDir, 'video-loop.txt');
        const videoLines = Array(videoLoops).fill(`file '${videoPath.replace(/'/g, "'\\''")}'`);
        fs.writeFileSync(videoConcatFile, videoLines.join('\n'), 'utf8');
        
        // Loop video
        const loopedVideo = path.join(workDir, 'video-looped.mp4');
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy'
            , '-movflags', '+faststart'])
            .output(loopedVideo);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 50, 75);
            onProgress?.(progress);
          }
        });
        
        // Combine
        console.log('[RENDER] Combining looped video with merged audio');
        console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
        console.log('[RENDER] Using audio file - GUARANTEED AUDIO OUTPUT');
        console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(loopedVideo)
            .input(mergedAudio)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-map', '0:v:0',
              '-map', '1:a:0'
            , '-movflags', '+faststart'])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 75, 99);
            console.log(`[RENDER] Progress: ${progress}% - ${p.timemark}`);
            onProgress?.(progress);
          }
        });
        
      } else {
        // Video long enough, just trim and combine
        console.log('[RENDER] Step 2/2: Trim video + combine...');
        console.log('[RENDER] Mute Video Audio:', muteVideoAudio);
        console.log('[RENDER] Using audio file - GUARANTEED AUDIO OUTPUT');
        console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoPath)
            .input(mergedAudio)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '44100',
              '-ac', '2',
              '-map', '0:v:0',
              '-map', '1:a:0'
            , '-movflags', '+faststart'])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 50, 99);
            console.log(`[RENDER] Progress: ${progress}% - ${p.timemark}`);
            onProgress?.(progress);
          }
        });
      }
      
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      console.log('[RENDER] ========================================');
      console.log('[RENDER] ⚡ COMPLETED IN', elapsedSeconds, 'SECONDS (FAST MODE)');
      console.log('[RENDER] ========================================');
      return await finalizeWithVisualizer(outputPath);
    }
    
    // ========================================
    // STANDARD MODE: Multiple videos/audios
    // Try stream copy first (fast), fallback to re-encode only if needed
    // ========================================
    console.log('[RENDER] 📦 STANDARD MODE: Multiple files');
    
    // Get video durations
    console.log('[RENDER] Analyzing video durations...');
    const videoDurations = await Promise.all(videoPaths.map(async (videoPath) => {
      const meta = await ffprobeAsync(videoPath);
      return Number(meta?.format?.duration || 0);
    }));
    const totalVideoDuration = videoDurations.reduce((sum, val) => sum + val, 0);
    console.log('[RENDER] Total video duration:', totalVideoDuration, 's');
    
    // Calculate loops needed
    const videoLoops = Math.ceil(effectiveTargetDuration / totalVideoDuration) + 1;
    console.log('[RENDER] Video loops needed:', videoLoops);
    
    // Create concat file for videos
    const videoConcatFile = path.join(workDir, 'videos.txt');
    const videoLines = [];
    for (let i = 0; i < videoLoops; i++) {
      videoPaths.forEach(vPath => {
        videoLines.push(`file '${vPath.replace(/'/g, "'\\''")}'`);
      });
    }
    const videoConcatContent = videoLines.join('\n');
    fs.writeFileSync(videoConcatFile, videoConcatContent, 'utf8');
    console.log('[RENDER] Video concat file created:', videoConcatFile);
    
    // Merge videos - try stream copy first (FAST), fallback to re-encode
    const mergedVideo = path.join(workDir, 'video-merged.mp4');
    const videoMergeStart = Date.now();
    console.log('[RENDER] Step 1/3: Merging videos (stream copy)...');
    
    let videoCopySuccess = false;
    try {
      await runFfmpeg((cmd) => {
        const opts = ['-t', String(effectiveTargetDuration), '-c:v', 'copy', '-movflags', '+faststart'];
        if (muteVideoAudio) {
          opts.push('-an');
        } else {
          opts.push('-c:a', 'copy');
        }
        return cmd
          .input(videoConcatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(opts)
          .output(mergedVideo);
      }, {
        onProgress: (p) => {
          const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 40);
          console.log(`[RENDER] Video progress: ${progress}% (${p.timemark}/${effectiveTargetDuration}s)`);
          onProgress?.(progress);
        }
      });
      // Verify output is valid (stream copy can silently produce bad files on mixed codecs)
      if (fs.existsSync(mergedVideo) && fs.statSync(mergedVideo).size > 10000) {
        videoCopySuccess = true;
        console.log('[RENDER] Video stream copy ✓');
      }
    } catch (copyErr) {
      console.warn('[RENDER] Stream copy failed, falling back to re-encode:', copyErr.message);
    }
    
    if (!videoCopySuccess) {
      // Fallback: re-encode for compatibility (mixed codecs/resolutions)
      console.log('[RENDER] Step 1/3: Merging videos (re-encode fallback)...');
      if (fs.existsSync(mergedVideo)) fs.unlinkSync(mergedVideo);
      
      await runFfmpeg((cmd) => {
        const outputOptions = [
          '-t', String(effectiveTargetDuration),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-movflags', '+faststart'
        ];
        if (muteVideoAudio) {
          outputOptions.push('-an');
        } else {
          outputOptions.push('-c:a', 'aac', '-b:a', '192k');
        }
        return cmd
          .input(videoConcatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(outputOptions)
          .output(mergedVideo);
      }, {
        onProgress: (p) => {
          const progress = calcProgress(p.timemark, effectiveTargetDuration, 5, 40);
          console.log(`[RENDER] Video re-encode: ${progress}% (${p.timemark}/${effectiveTargetDuration}s)`);
          onProgress?.(progress);
        }
      });
    }
    
    const videoMergeTime = Math.round((Date.now() - videoMergeStart) / 1000);
    console.log(`[RENDER] Video merged ✓ (${videoMergeTime}s)`);
    
    // Handle audio if present
    const hasAudio = audioPaths?.length > 0;
    if (hasAudio) {
      console.log('[RENDER] Processing audio...');
      
      // Get audio durations
      const audioDurations = await Promise.all(audioPaths.map(async (audioPath) => {
        if (!fs.existsSync(audioPath)) {
          throw new Error(`Audio file not found: ${audioPath}`);
        }
        const meta = await ffprobeAsync(audioPath);
        return Number(meta?.format?.duration || 0);
      }));
      const totalAudioDuration = audioDurations.reduce((sum, val) => sum + val, 0);
      console.log('[RENDER] Total audio duration:', totalAudioDuration, 's');
      
      // Calculate audio loops
      const audioLoops = Math.ceil(effectiveTargetDuration / totalAudioDuration) + 1;
      console.log('[RENDER] Audio loops needed:', audioLoops);
      
      // Create concat file for audios
      const audioConcatFile = path.join(workDir, 'audios.txt');
      const audioLines = [];
      for (let i = 0; i < audioLoops; i++) {
        audioPaths.forEach(aPath => {
          audioLines.push(`file '${aPath.replace(/'/g, "'\\''")}'`);
        });
      }
      const audioConcatContent = audioLines.join('\n');
      fs.writeFileSync(audioConcatFile, audioConcatContent, 'utf8');
      console.log('[RENDER] Audio concat file created:', audioConcatFile);
      console.log('[RENDER] Concat content:\n', audioConcatContent);
      
      // Merge audios - stream copy first (FAST), fallback to re-encode
      const mergedAudio = path.join(workDir, 'audio-merged.aac');
      const audioMergeStart = Date.now();
      console.log('[RENDER] Step 2/3: Merging audios (stream copy)...');
      
      let audioCopySuccess = false;
      try {
        await runFfmpeg((cmd) => {
          return cmd
            .input(audioConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:a', 'copy'
            , '-movflags', '+faststart'])
            .output(mergedAudio);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 40, 70);
            console.log(`[RENDER] Audio progress: ${progress}% (${p.timemark}/${effectiveTargetDuration}s)`);
            onProgress?.(progress);
          }
        });
        if (fs.existsSync(mergedAudio) && fs.statSync(mergedAudio).size > 1000) {
          audioCopySuccess = true;
          console.log('[RENDER] Audio stream copy ✓');
        }
      } catch (copyErr) {
        console.warn('[RENDER] Audio stream copy failed, falling back to re-encode:', copyErr.message);
      }
      
      if (!audioCopySuccess) {
        console.log('[RENDER] Step 2/3: Merging audios (re-encode fallback)...');
        if (fs.existsSync(mergedAudio)) fs.unlinkSync(mergedAudio);
        await runFfmpeg((cmd) => {
          return cmd
            .input(audioConcatFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:a', 'aac',
              '-b:a', '192k'
            ])
            .output(mergedAudio);
        }, {
          onProgress: (p) => {
            const progress = calcProgress(p.timemark, effectiveTargetDuration, 40, 70);
            console.log(`[RENDER] Audio re-encode: ${progress}% (${p.timemark}/${effectiveTargetDuration}s)`);
            onProgress?.(progress);
          }
        });
      }
      
      const audioMergeTime = Math.round((Date.now() - audioMergeStart) / 1000);
      console.log(`[RENDER] Audio merged ✓ (${audioMergeTime}s)`);
      
      // Combine video + audio - ULTRA FAST
      const combineStart = Date.now();
      console.log('[RENDER] Step 3/3: Combining video + audio...');
      console.log('[RENDER] Video input:', mergedVideo);
      console.log('[RENDER] Audio input:', mergedAudio);
      console.log('[RENDER] Final output:', outputPath);
      console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
      console.log('[RENDER] GUARANTEED AUDIO OUTPUT');
      
      await runFfmpeg((cmd) => {
        return cmd
          .input(mergedVideo)
          .input(mergedAudio)
          .outputOptions([
            '-t', String(effectiveTargetDuration),
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ar', '44100',
            '-ac', '2',
            '-map', '0:v:0',
            '-map', '1:a:0'
          , '-movflags', '+faststart'])
          .output(outputPath);
      }, { 
        onProgress: (p) => {
          const progress = calcProgress(p.timemark, effectiveTargetDuration, 70, 99);
          console.log(`[RENDER] Combine progress: ${progress}% (${p.timemark})`);
          onProgress?.(progress);
        }
      });
      
      const combineTime = Math.round((Date.now() - combineStart) / 1000);
      console.log(`[RENDER] Combined ✓ (${combineTime}s)`);
    } else {
      // No audio selected, just copy video (with its original audio if not muted)
      console.log('[RENDER] No audio files selected');
      console.log('[RENDER] Copying merged video to output');
      console.log('[RENDER] Video has audio:', !muteVideoAudio);
      fs.copyFileSync(mergedVideo, outputPath);
      console.log('[RENDER] Video only (audio preserved:', !muteVideoAudio, ')');
    }
    
    console.log('[RENDER] COMPLETED');
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log('[RENDER] ========================================');
    console.log('[RENDER] Total Time:', elapsedSeconds, 'seconds');
    console.log('[RENDER] Output:', outputPath);
    console.log('[RENDER] ========================================');
    
    return await finalizeWithVisualizer(outputPath);
    
  } catch (error) {
    console.error('[RENDER] ERROR:', error.message);
    throw error;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('[RENDER] Cleanup error:', err.message);
    }
  }
}

// Fast loop video using stream copy (no re-encoding)
async function loopVideoFast({ inputPath, outputPath, loopCount, onProgress }) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Input video not found');
  }
  
  if (!loopCount || loopCount < 2) {
    throw new Error('Loop count must be at least 2');
  }
  
  console.log(`[LOOP] Starting fast loop: ${loopCount}x`);
  
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-loop-'));
  
  try {
    // Get video duration
    const meta = await ffprobeAsync(inputPath);
    const duration = Number(meta?.format?.duration || 0);
    const totalDuration = duration * loopCount;
    
    // Create concat file
    const concatFile = path.join(workDir, 'concat.txt');
    const concatContent = Array(loopCount).fill(`file '${inputPath.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent, 'utf8');
    
    // Use concat demuxer with stream copy
    await runFfmpeg((cmd) => {
      return cmd
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c', 'copy',
          '-movflags', '+faststart'
        ])
        .output(outputPath);
    }, {
      onProgress: (p) => {
        const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / totalDuration) * 100));
        onProgress?.(progress);
      }
    });
    
    console.log('[LOOP] Completed');
    return outputPath;
    
  } catch (error) {
    console.error('[LOOP] Error:', error.message);
    throw error;
  } finally {
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('[LOOP] Cleanup error:', err.message);
    }
  }
}

module.exports = { renderLoopVideo, loopVideoFast, applyVisualizerOverlay };
