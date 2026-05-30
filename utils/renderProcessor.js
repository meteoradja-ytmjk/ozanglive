const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { buildVisualizerFilter, validateSettings: validateVisualizerSettings } = require('./visualizerEngine');

ffmpeg.setFfmpegPath(ffmpegPath);

const runFfmpeg = (configure, { onProgress, estimatedDurationSec } = {}) => new Promise((resolve, reject) => {
  const cmd = configure(ffmpeg());
  let progressEmitted = false;
  if (typeof onProgress === 'function') {
    cmd.on('progress', (p) => {
      progressEmitted = true;
      onProgress(p);
    });
  }
  cmd.on('end', () => {
    // If no progress was emitted (stream-copy), emit 100% at end
    if (!progressEmitted && typeof onProgress === 'function') {
      onProgress({ timemark: '99:99:99', percent: 100 });
    }
    resolve();
  }).on('error', reject).run();
});

const ffprobeAsync = (filePath) => new Promise((resolve, reject) => {
  ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
});

const parseTimeToSeconds = (timemark = '') => {
  const [h = 0, m = 0, s = 0] = String(timemark).split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
};

/**
 * Apply audio visualizer overlay to a video+audio combination.
 * This re-encodes the video with FFmpeg filter_complex to overlay the visualizer.
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

  console.log('[VISUALIZER] Applying visualizer overlay');
  console.log('[VISUALIZER] Type:', visualizerSettings.type);
  console.log('[VISUALIZER] Color:', visualizerSettings.color);
  console.log('[VISUALIZER] Video dimensions:', width, 'x', height);
  console.log('[VISUALIZER] Intensity:', visualizerSettings.intensity);
  console.log('[VISUALIZER] Glow:', visualizerSettings.glow);
  console.log('[VISUALIZER] Mirror:', visualizerSettings.mirror);
  console.log('[VISUALIZER] Position:', visualizerSettings.position || 'bottom');
  console.log('[VISUALIZER] Opacity:', visualizerSettings.opacity || 1.0);
  console.log('[VISUALIZER] Height:', visualizerSettings.height || 'auto');

  // Build the FFmpeg filter complex
  const { filterComplex, outputMap } = buildVisualizerFilter(visualizerSettings, {
    width,
    height,
    position: visualizerSettings.position || 'bottom'
  });

  console.log('[VISUALIZER] Filter complex:', filterComplex);

  await runFfmpeg((cmd) => {
    return cmd
      .input(videoPath)    // Input 0: video
      .input(audioPath)    // Input 1: audio
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', outputMap,
        '-map', '1:a',
        '-t', String(duration),
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-movflags', '+faststart'
      ])
      .output(outputPath);
  }, {
    onProgress: (p) => {
      const progress = progressOffset + Math.min(progressRange - 1, Math.round((parseTimeToSeconds(p.timemark) / duration) * progressRange));
      console.log(`[VISUALIZER] Progress: ${progress}%`);
      onProgress?.(progress);
    }
  });

  console.log('[VISUALIZER] Overlay applied successfully');
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
    
    // When visualizer is enabled, we render video+audio to a temp file first,
    // then apply the visualizer overlay as a post-processing step.
    const actualOutputPath = shouldApplyVisualizer 
      ? path.join(workDir, 'pre-visualizer-output.mp4') 
      : outputPath;
    
    /**
     * Helper: Apply visualizer post-processing if enabled.
     * Call this before returning from any render path that produces video+audio output.
     * @param {string} renderedPath - Path to the rendered file (may be actualOutputPath or outputPath)
     * @returns {Promise<string>} Final output path
     */
    async function finalizeWithVisualizer(renderedPath) {
      if (!shouldApplyVisualizer) return renderedPath;
      
      // If rendered to actualOutputPath (temp), we need to apply visualizer to produce outputPath
      // If rendered directly to outputPath, we need to move it first
      const sourceFile = renderedPath === outputPath ? renderedPath : actualOutputPath;
      
      let preVizPath;
      if (sourceFile === outputPath) {
        preVizPath = path.join(workDir, 'pre-viz-final.mp4');
        fs.renameSync(outputPath, preVizPath);
      } else {
        preVizPath = sourceFile;
      }
      
      console.log('[RENDER] 🎵 Applying Audio Visualizer...');
      console.log('[RENDER] Visualizer Type:', visualizerSettings.type);
      console.log('[RENDER] Visualizer Color:', visualizerSettings.color);
      
      // Extract audio for visualizer filter input
      const vizAudioPath = path.join(workDir, 'viz-audio.aac');
      await runFfmpeg((cmd) => {
        return cmd
          .input(preVizPath)
          .outputOptions(['-vn', '-c:a', 'copy'])
          .output(vizAudioPath);
      });
      
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
        console.error('[RENDER] ⚠️ Visualizer failed, using original output:', vizError.message);
        if (fs.existsSync(preVizPath) && !fs.existsSync(outputPath)) {
          fs.copyFileSync(preVizPath, outputPath);
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
                '-an' // Remove audio
              ])
              .output(outputPath);
          }, {
            onProgress: (p) => {
              const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
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
                '-an' // Remove audio
              ])
              .output(outputPath);
          }, {
            onProgress: (p) => {
              const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
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
              '-map', '1:a:0'
            ])
            .output(actualOutputPath);
        }, {
          onProgress: (p) => {
            const progress = Math.min(99, Math.max(15, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100)));

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
            ])
            .output(loopedVideo);
        }, {
          onProgress: (p) => {
            const progress = Math.min(50, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 50));
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
            ])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = 50 + Math.min(49, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 49));
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
            ])
            .output(loopedAudio);
        }, {
          onProgress: (p) => {
            const progress = Math.min(50, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 50));
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
            ])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = 50 + Math.min(49, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 49));
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
            ])
            .output(loopedVideo);
        }, {
          onProgress: (p) => {
            const progress = Math.min(33, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 33));
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
            ])
            .output(loopedAudio);
        }, {
          onProgress: (p) => {
            const progress = 33 + Math.min(33, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 33));
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
            ])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = 66 + Math.min(33, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 33));
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
          ])
          .output(mergedAudio);
      }, {
        onProgress: (p) => {
          const progress = Math.min(50, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 50));
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
            ])
            .output(loopedVideo);
        }, {
          onProgress: (p) => {
            const progress = 50 + Math.min(25, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 25));
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
            ])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = 75 + Math.min(24, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 24));
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
            ])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = 50 + Math.min(49, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 49));
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
    // STANDARD MODE: Multiple videos/audios (need re-encode for compatibility)
    // ========================================
    console.log('[RENDER] 📦 STANDARD MODE: Multiple files (re-encode for compatibility)');
    
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
    console.log('[RENDER] Concat content:\n', videoConcatContent);
    
    // Merge videos - FAST with re-encode for compatibility
    const mergedVideo = path.join(workDir, 'video-merged.mp4');
    const videoMergeStart = Date.now();
    console.log('[RENDER] Step 1/3: Merging videos...');
    console.log('[RENDER] Input:', videoConcatFile);
    console.log('[RENDER] Output:', mergedVideo);
    console.log('[RENDER] Target duration:', effectiveTargetDuration, 's');
    
    await runFfmpeg((cmd) => {
      const outputOptions = [
        '-t', String(effectiveTargetDuration),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23'
      ];
      
      // Only remove audio if muteVideoAudio is true
      if (muteVideoAudio) {
        console.log('[RENDER] Removing video audio (mute mode)');
        outputOptions.push('-an');
      } else {
        console.log('[RENDER] Keeping video audio');
        outputOptions.push('-c:a', 'aac', '-b:a', '192k');
      }
      
      return cmd
        .input(videoConcatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(outputOptions)
        .output(mergedVideo);
    }, {
      onProgress: (p) => {
        const progress = Math.min(40, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 40));
        console.log(`[RENDER] Video progress: ${progress}% (${p.timemark}/${effectiveTargetDuration}s)`);
        onProgress?.(progress);
      }
    });
    
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
      
      // Merge audios - SIMPLE & FAST (NO FILTERS!)
      const mergedAudio = path.join(workDir, 'audio-merged.aac');
      const audioMergeStart = Date.now();
      console.log('[RENDER] Step 2/3: Merging audios...');
      console.log('[RENDER] Input:', audioConcatFile);
      console.log('[RENDER] Output:', mergedAudio);
      
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
          const progress = 40 + Math.min(30, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 30));
          console.log(`[RENDER] Audio progress: ${progress}% (${p.timemark}/${effectiveTargetDuration}s)`);
          onProgress?.(progress);
        }
      });
      
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
          ])
          .output(outputPath);
      }, { 
        onProgress: (p) => {
          const progress = 70 + Math.min(29, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 29));
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
