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

async function renderLoopVideo({ videoPaths, audioPaths, outputPath, targetDurationSeconds, visualizerPreset = 'none', followAudioDuration = false, onProgress }) {
  if (!videoPaths?.length) throw new Error('Minimal 1 video diperlukan');
  
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-render-'));
  
  try {
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
    
    // OPTIMIZED PATH 1: Single video + single/no audio - FASTEST (stream copy)
    if (videoPaths.length === 1 && (!audioPaths || audioPaths.length <= 1) && visualizerPreset === 'none') {
      console.log('[RENDER] Using FAST path: stream copy mode');
      
      await runFfmpeg((cmd) => {
        cmd.input(videoPaths[0]).inputOptions(['-stream_loop', '-1']);
        
        if (audioPaths?.length === 1) {
          console.log('[RENDER] Adding audio input:', audioPaths[0]);
          cmd.input(audioPaths[0]).inputOptions(['-stream_loop', '-1']);
        }
        
        const outputOptions = [
          '-t', String(effectiveTargetDuration),
          '-c:v', 'copy',
          '-movflags', '+faststart'
        ];
        
        if (audioPaths?.length === 1) {
          outputOptions.push('-c:a', 'copy');
          console.log('[RENDER] Audio codec: copy');
        } else {
          outputOptions.push('-an');
          console.log('[RENDER] No audio selected');
        }
        
        return cmd.outputOptions(outputOptions).output(outputPath);
      }, { 
        onProgress: (p) => {
          const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
          onProgress?.(progress);
        }
      });
      
      console.log('[RENDER] Completed using FAST path');
      return outputPath;
    }
    
    // OPTIMIZED PATH 2: Multiple videos/audios - Use concat demuxer (more reliable)
    console.log('[RENDER] Using OPTIMIZED path: concat demuxer');
    
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
      
      // Get audio durations
      const audioDurations = await Promise.all(audioPaths.map(async (audioPath) => {
        const meta = await ffprobeAsync(audioPath);
        const dur = Number(meta?.format?.duration || 0);
        console.log(`[RENDER] Audio ${audioPath}: ${dur}s`);
        return dur;
      }));
      const totalAudioDuration = audioDurations.reduce((sum, val) => sum + val, 0);
      
      // Calculate audio loops needed
      const audioLoops = Math.ceil(effectiveTargetDuration / totalAudioDuration) + 1; // +1 for safety
      
      // Create concat file for audios - FIXED: proper newline
      const audioConcatFile = path.join(workDir, 'audios.txt');
      const audioLines = [];
      for (let i = 0; i < audioLoops; i++) {
        audioPaths.forEach(aPath => {
          audioLines.push(`file '${aPath.replace(/'/g, "'\\''")}'`);
        });
      }
      fs.writeFileSync(audioConcatFile, audioLines.join('\n'), 'utf8');
      console.log('[RENDER] Audio concat file created with', audioLines.length, 'entries');
      
      // Merge audios
      const mergedAudio = path.join(workDir, 'audio-merged.aac');
      await runFfmpeg((cmd) => {
        return cmd
          .input(audioConcatFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions([
            '-t', String(effectiveTargetDuration),
            '-vn',
            '-c:a', 'aac',
            '-b:a', '192k'
          ])
          .output(mergedAudio);
      });
      
      console.log('[RENDER] Audio merged successfully');
      
      // Combine video + audio
      await runFfmpeg((cmd) => {
        return cmd
          .input(mergedVideo)
          .input(mergedAudio)
          .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'copy',
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
