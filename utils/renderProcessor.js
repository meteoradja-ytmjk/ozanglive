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
    
    // OPTIMIZED PATH 1: Single video + single/no audio - FASTEST (stream copy)
    if (videoPaths.length === 1 && (!audioPaths || audioPaths.length <= 1) && visualizerPreset === 'none') {
      console.log('[RENDER] Using FAST path: stream copy mode');
      
      await runFfmpeg((cmd) => {
        cmd.input(videoPaths[0]).inputOptions(['-stream_loop', '-1']);
        
        if (audioPaths?.length === 1) {
          cmd.input(audioPaths[0]).inputOptions(['-stream_loop', '-1']);
        }
        
        const outputOptions = [
          '-t', String(effectiveTargetDuration),
          '-c:v', 'copy',
          '-movflags', '+faststart'
        ];
        
        if (audioPaths?.length === 1) {
          outputOptions.push('-c:a', 'copy', '-shortest');
        } else {
          outputOptions.push('-an');
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
    
    // OPTIMIZED PATH 2: Multiple videos/audios - Use filter_complex concat
    console.log('[RENDER] Using OPTIMIZED path: filter_complex concat');
    
    // Build filter_complex for efficient concatenation
    let filterComplex = '';
    
    // Concat videos
    for (let i = 0; i < videoPaths.length; i++) {
      filterComplex += `[${i}:v]`;
    }
    filterComplex += `concat=n=${videoPaths.length}:v=1:a=0[vout];`;
    
    // Loop the concatenated video
    filterComplex += `[vout]loop=loop=-1:size=1:start=0[vloop]`;
    
    // Concat audios if present
    let audioMap = '-an';
    if (audioPaths?.length > 0) {
      const audioStartIdx = videoPaths.length;
      for (let i = 0; i < audioPaths.length; i++) {
        filterComplex += `[${audioStartIdx + i}:a]`;
      }
      filterComplex += `concat=n=${audioPaths.length}:v=0:a=1[aout];`;
      filterComplex += `[aout]aloop=loop=-1:size=2e+09[aloop]`;
      audioMap = '[aloop]';
    }
    
    await runFfmpeg((cmd) => {
      // Add all video inputs
      videoPaths.forEach(vPath => cmd.input(vPath));
      
      // Add all audio inputs
      if (audioPaths?.length > 0) {
        audioPaths.forEach(aPath => cmd.input(aPath));
      }
      
      const outputOptions = [
        '-filter_complex', filterComplex,
        '-map', '[vloop]',
        '-t', String(effectiveTargetDuration),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-threads', '0'
      ];
      
      if (audioPaths?.length > 0) {
        outputOptions.push('-map', audioMap, '-c:a', 'aac', '-b:a', '192k', '-shortest');
      } else {
        outputOptions.push('-an');
      }
      
      return cmd.outputOptions(outputOptions).output(outputPath);
    }, { 
      onProgress: (p) => {
        const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
        onProgress?.(progress);
      }
    });
    
    console.log('[RENDER] Completed using OPTIMIZED path');
    return outputPath;
    
  } catch (error) {
    console.error('[RENDER] Error:', error.message);
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
