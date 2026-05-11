const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

const runFfmpeg = (configure, { onProgress } = {}) => new Promise((resolve, reject) => {
  const cmd = configure(ffmpeg());
  if (typeof onProgress === 'function') {
    cmd.on('progress', (p) => onProgress(p));
  }
  cmd.on('end', resolve).on('error', reject).run();
});

const ffprobeAsync = (filePath) => new Promise((resolve, reject) => {
  ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)));
});

const parseTimeToSeconds = (timemark = '') => {
  const [h = 0, m = 0, s = 0] = String(timemark).split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
};

async function renderLoopVideo({ 
  videoPaths, 
  audioPaths, 
  outputPath, 
  targetDurationSeconds, 
  visualizerPreset = 'none', 
  followAudioDuration = false, 
  advancedAudio = {}, 
  watermark = null,
  overlayVideo = null,
  visualizerSettings = null,
  onProgress 
}) {
  if (!videoPaths?.length) throw new Error('Minimal 1 video diperlukan');
  
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-render-'));
  
  try {
    console.log('[RENDER] === START ===');
    console.log('[RENDER] Videos:', videoPaths.length, 'Audios:', audioPaths?.length || 0);
    console.log('[RENDER] Target duration:', targetDurationSeconds, 's');
    
    // NOTE: watermark, overlay, visualizer will be implemented in future updates
    // For now, we do basic video+audio rendering to ensure stability
    
    // Parse advanced audio settings
    const audioSettings = {
      fadeIn: advancedAudio?.fadeIn || 0,
      fadeOut: advancedAudio?.fadeOut || 0,
      volume: advancedAudio?.volume || 100,
      crossfade: advancedAudio?.crossfade || 0,
      normalize: advancedAudio?.normalize || false,
      dualLayer: advancedAudio?.dualLayer || { enabled: false, bgVolume: 30, voiceVolume: 100 }
    };
    
    // Calculate effective target duration
    let effectiveTargetDuration = targetDurationSeconds;
    
    if (followAudioDuration && audioPaths?.length > 0) {
      const audioDurations = await Promise.all(audioPaths.map(async (audioPath) => {
        const meta = await ffprobeAsync(audioPath);
        return Number(meta?.format?.duration || 0);
      }));
      const totalAudioDuration = audioDurations.reduce((sum, val) => sum + val, 0);
      effectiveTargetDuration = totalAudioDuration > 0 ? Math.ceil(totalAudioDuration) : targetDurationSeconds;
    }
    
    console.log('[RENDER] Effective duration:', effectiveTargetDuration, 's');
    
    // Get video durations
    const videoDurations = await Promise.all(videoPaths.map(async (videoPath) => {
      const meta = await ffprobeAsync(videoPath);
      return Number(meta?.format?.duration || 0);
    }));
    const totalVideoDuration = videoDurations.reduce((sum, val) => sum + val, 0);
    
    // Calculate loops needed
    const videoLoops = Math.ceil(effectiveTargetDuration / totalVideoDuration) + 1;
    
    // Create concat file for videos
    const videoConcatFile = path.join(workDir, 'videos.txt');
    const videoLines = [];
    for (let i = 0; i < videoLoops; i++) {
      videoPaths.forEach(vPath => {
        videoLines.push(`file '${vPath.replace(/'/g, "'\\''")}'`);
      });
    }
    fs.writeFileSync(videoConcatFile, videoLines.join('\n'), 'utf8');
    console.log('[RENDER] Video concat file created:', videoLines.length, 'entries');
    
    // Merge videos first
    const mergedVideo = path.join(workDir, 'video-merged.mp4');
    console.log('[RENDER] Merging videos...');
    
    await runFfmpeg((cmd) => {
      return cmd
        .input(videoConcatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-t', String(effectiveTargetDuration),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-an'
        ])
        .output(mergedVideo);
    });
    
    console.log('[RENDER] Video merged ✓');
    
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
      
      // Calculate audio loops
      const audioLoops = Math.ceil(effectiveTargetDuration / totalAudioDuration) + 1;
      
      // Create concat file for audios
      const audioConcatFile = path.join(workDir, 'audios.txt');
      const audioLines = [];
      for (let i = 0; i < audioLoops; i++) {
        audioPaths.forEach(aPath => {
          audioLines.push(`file '${aPath.replace(/'/g, "'\\''")}'`);
        });
      }
      fs.writeFileSync(audioConcatFile, audioLines.join('\n'), 'utf8');
      console.log('[RENDER] Audio concat file created:', audioLines.length, 'entries');
      
      // Merge audios with advanced features
      const mergedAudio = path.join(workDir, 'audio-merged.aac');
      console.log('[RENDER] Merging audios...');
      
      // Build filter complex
      let filterComplex = '[0:a]';
      
      // Apply normalization
      if (audioSettings.normalize) {
        filterComplex += 'loudnorm,';
      }
      
      // Apply volume
      if (audioSettings.volume !== 100) {
        const volMultiplier = audioSettings.volume / 100;
        filterComplex += `volume=${volMultiplier},`;
      }
      
      // Apply fade in
      if (audioSettings.fadeIn > 0) {
        filterComplex += `afade=t=in:st=0:d=${audioSettings.fadeIn},`;
      }
      
      // Apply fade out
      if (audioSettings.fadeOut > 0) {
        const fadeOutStart = Math.max(0, effectiveTargetDuration - audioSettings.fadeOut);
        filterComplex += `afade=t=out:st=${fadeOutStart}:d=${audioSettings.fadeOut},`;
      }
      
      // Remove trailing comma
      if (filterComplex.endsWith(',')) {
        filterComplex = filterComplex.slice(0, -1);
      }
      
      filterComplex += '[final]';
      
      await runFfmpeg((cmd) => {
        return cmd
          .input(audioConcatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .complexFilter(filterComplex)
          .outputOptions([
            '-map', '[final]',
            '-t', String(effectiveTargetDuration),
            '-c:a', 'aac',
            '-b:a', '192k'
          ])
          .output(mergedAudio);
      });
      
      console.log('[RENDER] Audio merged ✓');
      
      // Combine video + audio
      console.log('[RENDER] Combining video + audio...');
      
      await runFfmpeg((cmd) => {
        return cmd
          .input(mergedVideo)
          .input(mergedAudio)
          .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart'
          ])
          .output(outputPath);
      }, { 
        onProgress: (p) => {
          const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
          onProgress?.(progress);
        }
      });
      
      console.log('[RENDER] Combined ✓');
      
      // Verify output
      if (fs.existsSync(outputPath)) {
        const outputMeta = await ffprobeAsync(outputPath);
        const hasAudioStream = outputMeta.streams.some(s => s.codec_type === 'audio');
        console.log('[RENDER] Output has audio:', hasAudioStream ? '✓' : '✗');
      }
    } else {
      // No audio, just copy video
      fs.copyFileSync(mergedVideo, outputPath);
      console.log('[RENDER] Video only (no audio)');
    }
    
    console.log('[RENDER] === COMPLETED ===');
    return outputPath;
    
  } catch (error) {
    console.error('[RENDER] ERROR:', error.message);
    console.error('[RENDER] Stack:', error.stack);
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

module.exports = { renderLoopVideo, loopVideoFast };
