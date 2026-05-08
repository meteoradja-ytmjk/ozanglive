const fs = require('fs');
const path = require('path');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

ffmpeg.setFfmpegPath(ffmpegPath);

const runFfmpeg = (configure) => new Promise((resolve, reject) => {
  const cmd = configure(ffmpeg());
  cmd.on('end', resolve).on('error', reject).run();
});

const writeConcatFile = (items, filePath) => {
  const content = items
    .map((item) => `file '${item.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
};

async function renderLoopVideo({ videoPaths, audioPaths, outputPath, targetDurationSeconds }) {
  if (!videoPaths?.length) throw new Error('Minimal 1 video diperlukan');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ozang-render-'));
  const repeatedVideoList = [];
  const repeatedAudioList = [];

  const loops = Math.max(1, Math.ceil(targetDurationSeconds / 60));
  for (let i = 0; i < loops; i += 1) repeatedVideoList.push(...videoPaths);
  for (let i = 0; i < loops; i += 1) repeatedAudioList.push(...(audioPaths?.length ? audioPaths : []));

  const videoConcatList = path.join(workDir, 'video.txt');
  writeConcatFile(repeatedVideoList, videoConcatList);
  const mergedVideo = path.join(workDir, 'video-merged.mp4');

  await runFfmpeg((cmd) => cmd
    .input(videoConcatList)
    .inputOptions(['-f concat', '-safe 0'])
    .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-an'])
    .output(mergedVideo));

  let finalAudio = null;
  if (repeatedAudioList.length > 0) {
    const audioConcatList = path.join(workDir, 'audio.txt');
    writeConcatFile(repeatedAudioList, audioConcatList);
    finalAudio = path.join(workDir, 'audio-merged.aac');
    await runFfmpeg((cmd) => cmd
      .input(audioConcatList)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-vn', '-c:a aac', '-b:a 192k'])
      .output(finalAudio));
  }

  await runFfmpeg((cmd) => {
    cmd.input(mergedVideo);
    if (finalAudio) cmd.input(finalAudio);
    const out = ['-t', String(targetDurationSeconds), '-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p'];
    if (finalAudio) out.push('-c:a aac', '-shortest');
    else out.push('-an');
    return cmd.outputOptions(out).output(outputPath);
  });

  fs.rmSync(workDir, { recursive: true, force: true });
  return outputPath;
}

module.exports = { renderLoopVideo };
