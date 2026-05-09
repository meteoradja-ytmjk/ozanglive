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

const writeConcatFile = (items, filePath) => {
  const content = items
    .map((item) => `file '${item.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
};

const parseTimeToSeconds = (timemark = '') => {
  const [h = 0, m = 0, s = 0] = String(timemark).split(':');
  return (parseFloat(h) * 3600) + (parseFloat(m) * 60) + parseFloat(s);
};

async function renderLoopVideo({ videoPaths, audioPaths, outputPath, targetDurationSeconds, visualizerPreset = 'none', followAudioDuration = false, onProgress }) {
  if (!videoPaths?.length) throw new Error('Minimal 1 video diperlukan');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-render-'));
  const repeatedVideoList = [];
  const repeatedAudioList = [];
  const audioDurations = await Promise.all((audioPaths || []).map(async (audioPath) => {
    const meta = await ffprobeAsync(audioPath);
    return Number(meta?.format?.duration || 0);
  }));
  const totalAudioDuration = audioDurations.reduce((sum, val) => sum + (Number.isFinite(val) && val > 0 ? val : 0), 0);
  const effectiveTargetDuration = followAudioDuration && totalAudioDuration > 0 ? Math.ceil(totalAudioDuration) : targetDurationSeconds;
  const simpleCopyMode = (videoPaths.length === 1) && (!audioPaths || audioPaths.length <= 1) && (visualizerPreset === 'none');

  if (simpleCopyMode) {
    await runFfmpeg((cmd) => {
      cmd.input(videoPaths[0]).inputOptions(['-stream_loop -1']);
      if (audioPaths?.length === 1) cmd.input(audioPaths[0]).inputOptions(['-stream_loop -1']);
      const out = ['-t', String(effectiveTargetDuration), '-c copy'];
      if (audioPaths?.length === 1) out.push('-shortest');
      else out.push('-an');
      return cmd.outputOptions(out).output(outputPath);
    }, { onProgress: (p) => onProgress?.(Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100))) });
    fs.rmSync(workDir, { recursive: true, force: true });
    return outputPath;
  }

  const videoDurations = await Promise.all(videoPaths.map(async (videoPath) => {
    const meta = await ffprobeAsync(videoPath);
    return Number(meta?.format?.duration || 0);
  }));
  const totalSourceVideoDuration = videoDurations.reduce((sum, val) => sum + (Number.isFinite(val) && val > 0 ? val : 0), 0);
  const safeDuration = totalSourceVideoDuration > 1 ? totalSourceVideoDuration : Math.max(30, targetDurationSeconds);
  const loops = Math.max(1, Math.ceil(effectiveTargetDuration / safeDuration));
  for (let i = 0; i < loops; i += 1) repeatedVideoList.push(...videoPaths);
  for (let i = 0; i < loops; i += 1) repeatedAudioList.push(...(audioPaths?.length ? audioPaths : []));

  const mergedVideo = path.join(workDir, 'video-merged.mp4');
  if (videoPaths.length === 1) {
    await runFfmpeg((cmd) => cmd
      .input(videoPaths[0])
      .inputOptions(['-stream_loop -1'])
      .outputOptions(['-t', String(effectiveTargetDuration), '-c copy', '-an'])
      .output(mergedVideo));
  } else {
    const videoConcatList = path.join(workDir, 'video.txt');
    writeConcatFile(repeatedVideoList, videoConcatList);
    try {
      await runFfmpeg((cmd) => cmd
        .input(videoConcatList)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy', '-an'])
        .output(mergedVideo));
    } catch (error) {
      await runFfmpeg((cmd) => cmd
        .input(videoConcatList)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c:v libx264', '-preset ultrafast', '-tune', 'zerolatency', '-pix_fmt yuv420p'])
        .output(mergedVideo));
    }
  }

  let finalAudio = null;
  if (repeatedAudioList.length > 0) {
    finalAudio = path.join(workDir, 'audio-merged.aac');
    if (audioPaths?.length === 1) {
      await runFfmpeg((cmd) => cmd
        .input(audioPaths[0])
        .inputOptions(['-stream_loop -1'])
        .outputOptions(['-vn', '-t', String(effectiveTargetDuration), '-c copy'])
        .output(finalAudio));
    } else {
      const audioConcatList = path.join(workDir, 'audio.txt');
      writeConcatFile(repeatedAudioList, audioConcatList);
      try {
        await runFfmpeg((cmd) => cmd
          .input(audioConcatList)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-vn', '-c copy'])
          .output(finalAudio));
      } catch (error) {
        await runFfmpeg((cmd) => cmd
          .input(audioConcatList)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-vn', '-c:a aac', '-b:a 192k'])
          .output(finalAudio));
      }
    }
  }

  const shouldUseOverlay = finalAudio && visualizerPreset && visualizerPreset !== 'none';
  if (!shouldUseOverlay) {
    try {
      await runFfmpeg((cmd) => {
        cmd.input(mergedVideo);
        if (finalAudio) cmd.input(finalAudio);
        const out = ['-t', String(effectiveTargetDuration), '-c copy'];
        if (finalAudio) out.push('-shortest');
        else out.push('-an');
        return cmd.outputOptions(out).output(outputPath);
      }, { onProgress: (p) => onProgress?.(Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100))) });
    } catch (error) {
      await runFfmpeg((cmd) => {
        cmd.input(mergedVideo);
        if (finalAudio) cmd.input(finalAudio);
        const out = ['-t', String(effectiveTargetDuration), '-c:v libx264', '-preset ultrafast', '-tune', 'zerolatency', '-pix_fmt yuv420p', '-threads', '0'];
        if (finalAudio) out.push('-c:a aac', '-shortest');
        else out.push('-an');
        return cmd.outputOptions(out).output(outputPath);
      }, { onProgress: (p) => onProgress?.(Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100))) });
    }
  } else {
    await runFfmpeg((cmd) => {
      cmd.input(mergedVideo);
      if (finalAudio) cmd.input(finalAudio);
      const out = ['-t', String(effectiveTargetDuration), '-c:v libx264', '-preset ultrafast', '-tune', 'zerolatency', '-pix_fmt yuv420p', '-threads', '0'];
      if (shouldUseOverlay) {
        const overlayFilter = visualizerPreset === 'wave'
          ? '[1:a]showwaves=s=1280x220:mode=line:colors=00d4ff,format=rgba[sw];[0:v][sw]overlay=0:H-h-20[v]'
          : visualizerPreset === 'bars'
            ? '[1:a]showfreqs=s=1280x220:mode=bar:ascale=lin:fscale=lin:colors=00e5ff|7c3aed,format=rgba[sf];[0:v][sf]overlay=0:H-h-20[v]'
            : '[1:a]showspectrum=s=1280x220:mode=combined:color=intensity:scale=lin,format=rgba[ss];[0:v][ss]overlay=0:H-h-20[v]';
        out.push('-filter_complex', overlayFilter, '-map', '[v]', '-map', '1:a');
      }
      if (finalAudio) out.push('-c:a aac', '-shortest');
      else out.push('-an');
      return cmd.outputOptions(out).output(outputPath);
    }, { onProgress: (p) => onProgress?.(Math.min(99, Math.round((parseTimeToSeconds(p.timemark) / effectiveTargetDuration) * 100))) });
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  return outputPath;
}

module.exports = { renderLoopVideo };
