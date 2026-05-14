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
  const startTime = Date.now();
  
  try {
    console.log('[RENDER] ========================================');
    console.log('[RENDER] START - Render Job');
    console.log('[RENDER] Videos:', videoPaths.length);
    console.log('[RENDER] Audios:', audioPaths?.length || 0);
    console.log('[RENDER] Target Duration:', targetDurationSeconds, 's');
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
    
    // SPECIAL CASE: Single video + single audio = DIRECT COMBINE (SUPER FAST!)
    if (videoPaths.length === 1 && audioPaths?.length === 1) {
      console.log('[RENDER] ⚡ FAST MODE: Single video + audio - Direct combine!');
      const videoPath = videoPaths[0];
      const audioPath = audioPaths[0];
      
      // Check if files exist
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
      
      // If video and audio are already long enough, just combine!
      if (videoDuration >= effectiveTargetDuration && audioDuration >= effectiveTargetDuration) {
        console.log('[RENDER] ⚡⚡⚡ ULTRA FAST: Direct stream copy!');
        
        await runFfmpeg((cmd) => {
          return cmd
            .input(videoPath)
            .input(audioPath)
            .outputOptions([
              '-t', String(effectiveTargetDuration),
              '-c:v', 'copy',
              '-c:a', 'copy',
              '-map', '0:v:0',
              '-map', '1:a:0',
              '-shortest'
            ])
            .output(outputPath);
        }, {
          onProgress: (p) => {
            const progress = Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100));
            onProgress?.(progress);
          }
        });
        
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
        console.log('[RENDER] ========================================');
        console.log('[RENDER] ⚡ COMPLETED IN', elapsedSeconds, 'SECONDS!');
        console.log('[RENDER] ========================================');
        return outputPath;
      }
    }
    
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
      return cmd
        .input(videoConcatFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-t', String(effectiveTargetDuration),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-an'
        ])
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
      
      await runFfmpeg((cmd) => {
        return cmd
          .input(mergedVideo)
          .input(mergedAudio)
          .outputOptions([
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-shortest'
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
      // No audio, just copy video
      fs.copyFileSync(mergedVideo, outputPath);
      console.log('[RENDER] Video only');
    }
    
    console.log('[RENDER] COMPLETED');
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log('[RENDER] ========================================');
    console.log('[RENDER] Total Time:', elapsedSeconds, 'seconds');
    console.log('[RENDER] Output:', outputPath);
    console.log('[RENDER] ========================================');
    return outputPath;
    
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

module.exports = { renderLoopVideo, loopVideoFast };
