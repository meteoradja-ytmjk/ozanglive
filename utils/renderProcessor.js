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

async function renderLoopVideo({ videoPaths, audioPaths, outputPath, targetDurationSeconds, visualizerPreset = 'none', followAudioDuration = false, advancedAudio = {}, onProgress }) {
  if (!videoPaths?.length) throw new Error('Minimal 1 video diperlukan');
  
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-render-'));
  
  try {
    // Parse advanced audio settings
    const audioSettings = {
      fadeIn: advancedAudio?.fadeIn || 0,
      fadeOut: advancedAudio?.fadeOut || 0,
      volume: advancedAudio?.volume || 100,
      crossfade: advancedAudio?.crossfade || 0,
      normalize: advancedAudio?.normalize || false,
      dualLayer: advancedAudio?.dualLayer || { enabled: false, bgVolume: 30, voiceVolume: 100 }
    };
    
    console.log('[RENDER] Advanced audio settings:', audioSettings);
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
    
    console.log(`[RENDER] Target duration: ${effectiveTargetDuration}s, Videos: ${videoPaths.length}, Audios: ${audioPaths?.length || 0}`);
    console.log('[RENDER] Video paths:', videoPaths);
    console.log('[RENDER] Audio paths:', audioPaths);
    
    // CRITICAL FIX: Always use concat demuxer for reliable audio/video sync
    // The old stream_loop approach caused audio sync issues
    console.log('[RENDER] Using concat demuxer for reliable audio/video sync');
    
    // Get video durations to calculate loops needed
    const videoDurations = await Promise.all(videoPaths.map(async (videoPath) => {
      const meta = await ffprobeAsync(videoPath);
      return Number(meta?.format?.duration || 0);
    }));
    const totalVideoDuration = videoDurations.reduce((sum, val) => sum + val, 0);
    
    // Calculate how many loops we need
    const videoLoops = Math.ceil(effectiveTargetDuration / totalVideoDuration) + 1; // +1 for safety
    
    // Create concat file for videos - FIXED: proper newline
    const videoConcatFile = path.join(workDir, 'videos.txt');
    const videoLines = [];
    for (let i = 0; i < videoLoops; i++) {
      videoPaths.forEach(vPath => {
        videoLines.push(`file '${vPath.replace(/'/g, "'\\''")}'`);
      });
    }
    fs.writeFileSync(videoConcatFile, videoLines.join('\n'), 'utf8');
    console.log('[RENDER] Video concat file created with', videoLines.length, 'entries');
    
    // Merge videos first
    const mergedVideo = path.join(workDir, 'video-merged.mp4');
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
          '-an' // No audio in this step
        ])
        .output(mergedVideo);
    });
    
    console.log('[RENDER] Video merged successfully');
    
    // Handle audio if present
    const hasAudio = audioPaths?.length > 0;
    if (hasAudio) {
      console.log('[RENDER] Processing audio...');
      console.log('[RENDER] Audio files:', audioPaths);
      
      // Get audio durations
      const audioDurations = await Promise.all(audioPaths.map(async (audioPath) => {
        console.log(`[RENDER] Checking audio file: ${audioPath}`);
        if (!fs.existsSync(audioPath)) {
          console.error(`[RENDER] ERROR: Audio file not found: ${audioPath}`);
          throw new Error(`Audio file not found: ${audioPath}`);
        }
        const meta = await ffprobeAsync(audioPath);
        const dur = Number(meta?.format?.duration || 0);
        console.log(`[RENDER] Audio duration: ${dur}s`);
        return dur;
      }));
      const totalAudioDuration = audioDurations.reduce((sum, val) => sum + val, 0);
      console.log(`[RENDER] Total audio duration: ${totalAudioDuration}s`);
      
      // Calculate audio loops needed
      const audioLoops = Math.ceil(effectiveTargetDuration / totalAudioDuration) + 1; // +1 for safety
      console.log(`[RENDER] Audio loops needed: ${audioLoops}`);
      
      // Create concat file for audios - FIXED: proper newline
      const audioConcatFile = path.join(workDir, 'audios.txt');
      const audioLines = [];
      for (let i = 0; i < audioLoops; i++) {
        audioPaths.forEach(aPath => {
          audioLines.push(`file '${aPath.replace(/'/g, "'\\''")}'`);
        });
      }
      const audioConcatContent = audioLines.join('\n');
      fs.writeFileSync(audioConcatFile, audioConcatContent, 'utf8');
      console.log('[RENDER] Audio concat file created with', audioLines.length, 'entries');
      console.log('[RENDER] Audio concat file path:', audioConcatFile);
      console.log('[RENDER] Audio concat content preview:', audioConcatContent.substring(0, 200));
      
      // Merge audios with advanced features
      const mergedAudio = path.join(workDir, 'audio-merged.aac');
      console.log('[RENDER] Merging audios to:', mergedAudio);
      
      // Build audio filter complex for advanced features
      const audioFilters = [];
      
      // Dual layer audio mixing
      if (audioSettings.dualLayer.enabled && audioPaths.length >= 2) {
        console.log('[RENDER] Applying dual layer audio mixing');
        // First audio = background music (lower volume)
        // Other audios = voiceover (full volume)
        const bgVolume = audioSettings.dualLayer.bgVolume / 100;
        const voiceVolume = audioSettings.dualLayer.voiceVolume / 100;
        
        await runFfmpeg((cmd) => {
          cmd.input(audioConcatFile).inputOptions(['-f', 'concat', '-safe', '0']);
          
          let filterComplex = `[0:a]volume=${bgVolume}[bg];`;
          
          // If we have multiple audios, split them
          if (audioPaths.length > 1) {
            filterComplex += `[0:a]asplit=${audioPaths.length}`;
            for (let i = 0; i < audioPaths.length; i++) {
              filterComplex += `[a${i}]`;
            }
            filterComplex += `;`;
            
            // Apply voice volume to non-background tracks
            for (let i = 1; i < audioPaths.length; i++) {
              filterComplex += `[a${i}]volume=${voiceVolume}[v${i}];`;
            }
            
            // Mix all tracks
            filterComplex += `[bg]`;
            for (let i = 1; i < audioPaths.length; i++) {
              filterComplex += `[v${i}]`;
            }
            filterComplex += `amix=inputs=${audioPaths.length}:duration=first[mixed];`;
          } else {
            filterComplex += `[bg]anull[mixed];`;
          }
          
          // Apply other effects
          if (audioSettings.normalize) {
            filterComplex += `[mixed]loudnorm[normalized];`;
          } else {
            filterComplex += `[mixed]anull[normalized];`;
          }
          
          // Apply volume
          if (audioSettings.volume !== 100) {
            const volMultiplier = audioSettings.volume / 100;
            filterComplex += `[normalized]volume=${volMultiplier}[vol];`;
          } else {
            filterComplex += `[normalized]anull[vol];`;
          }
          
          // Apply fade in/out
          let fadeFilter = '[vol]';
          if (audioSettings.fadeIn > 0) {
            fadeFilter += `afade=t=in:st=0:d=${audioSettings.fadeIn}`;
          }
          if (audioSettings.fadeOut > 0) {
            const fadeOutStart = Math.max(0, effectiveTargetDuration - audioSettings.fadeOut);
            if (audioSettings.fadeIn > 0) fadeFilter += ',';
            fadeFilter += `afade=t=out:st=${fadeOutStart}:d=${audioSettings.fadeOut}`;
          }
          fadeFilter += '[final]';
          
          if (audioSettings.fadeIn > 0 || audioSettings.fadeOut > 0) {
            filterComplex += fadeFilter;
          } else {
            filterComplex += `[vol]anull[final]`;
          }
          
          return cmd
            .complexFilter(filterComplex)
            .outputOptions([
              '-map', '[final]',
              '-t', String(effectiveTargetDuration),
              '-c:a', 'aac',
              '-b:a', '192k'
            ])
            .output(mergedAudio);
        });
      } else {
        // Standard audio merge with basic effects
        await runFfmpeg((cmd) => {
          cmd.input(audioConcatFile).inputOptions(['-f', 'concat', '-safe', '0']);
          
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
          
          return cmd
            .complexFilter(filterComplex)
            .outputOptions([
              '-map', '[final]',
              '-t', String(effectiveTargetDuration),
              '-c:a', 'aac',
              '-b:a', '192k'
            ])
            .output(mergedAudio);
        });
      }
      
      console.log('[RENDER] Audio merged successfully');
      console.log('[RENDER] Merged audio file exists:', fs.existsSync(mergedAudio));
      if (fs.existsSync(mergedAudio)) {
        const audioStats = fs.statSync(mergedAudio);
        console.log('[RENDER] Merged audio size:', (audioStats.size / 1024).toFixed(2), 'KB');
      }
      
      // Combine video + audio - CRITICAL: Use shortest stream to prevent issues
      console.log('[RENDER] Combining video and audio...');
      console.log('[RENDER] Video input:', mergedVideo);
      console.log('[RENDER] Audio input:', mergedAudio);
      console.log('[RENDER] Output:', outputPath);
      
      await runFfmpeg((cmd) => {
        return cmd
          .input(mergedVideo)
          .input(mergedAudio)
          .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'aac',  // Re-encode audio to ensure compatibility
            '-b:a', '192k',
            '-shortest',    // CRITICAL: Stop at shortest stream
            '-movflags', '+faststart'
          ])
          .output(outputPath);
      }, { 
        onProgress: (p) => {
          const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
          onProgress?.(progress);
        }
      });
      
      console.log('[RENDER] Video + Audio combined successfully');
      
      // Verify output has audio
      if (fs.existsSync(outputPath)) {
        try {
          const outputMeta = await ffprobeAsync(outputPath);
          const hasAudioStream = outputMeta.streams.some(s => s.codec_type === 'audio');
          console.log('[RENDER] Output file has audio stream:', hasAudioStream ? '✓ YES' : '✗ NO');
          if (!hasAudioStream) {
            console.error('[RENDER] WARNING: Output file has NO audio stream!');
          }
        } catch (probeErr) {
          console.error('[RENDER] Could not probe output file:', probeErr.message);
        }
      }
    } else {
      // No audio, just copy the video
      fs.copyFileSync(mergedVideo, outputPath);
      console.log('[RENDER] Video only (no audio selected)');
    }
    
    console.log('[RENDER] Completed using OPTIMIZED path');
    return outputPath;
    
  } catch (error) {
    console.error('[RENDER] Error:', error.message);
    console.error('[RENDER] Stack:', error.stack);
    throw error;
  } finally {
    // Cleanup temp directory
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error('[RENDER] Cleanup error:', err.message);
    }
  }
}

module.exports = { renderLoopVideo };

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
    // Get video duration for progress calculation
    const meta = await ffprobeAsync(inputPath);
    const duration = Number(meta?.format?.duration || 0);
    const totalDuration = duration * loopCount;
    
    // Create concat file with repeated entries
    const concatFile = path.join(workDir, 'concat.txt');
    const concatContent = Array(loopCount).fill(`file '${inputPath.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent, 'utf8');
    
    // Use concat demuxer with stream copy (FAST!)
    await runFfmpeg((cmd) => {
      return cmd
        .input(concatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c', 'copy',  // Stream copy - NO RE-ENCODING!
          '-movflags', '+faststart'
        ])
        .output(outputPath);
    }, {
      onProgress: (p) => {
        const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / totalDuration) * 100));
        onProgress?.(progress);
      }
    });
    
    console.log('[LOOP] Completed fast loop');
    return outputPath;
    
  } catch (error) {
    console.error('[LOOP] Error:', error.message);
    throw error;
  } finally {
    // Cleanup
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
