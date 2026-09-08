const fs = require('fs');
const path = require('path');

/**
 * Universal FFmpeg path resolver.
 * Priority:
 * 1. process.env.FFMPEG_PATH (custom path if configured)
 * 2. /usr/bin/ffmpeg (system FFmpeg on Ubuntu/Debian VPS via apt)
 * 3. /usr/local/bin/ffmpeg (custom compiled system FFmpeg)
 * 4. ffmpeg-static npm package
 * 5. @ffmpeg-installer/ffmpeg npm package
 * 6. 'ffmpeg' (fallback to system PATH)
 */
function getFFmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    return '/usr/bin/ffmpeg';
  }
  if (fs.existsSync('/usr/local/bin/ffmpeg')) {
    return '/usr/local/bin/ffmpeg';
  }
  try {
    const staticPath = require('ffmpeg-static');
    if (staticPath && fs.existsSync(staticPath)) return staticPath;
  } catch (e) {}
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) return installer.path;
  } catch (e) {}
  return 'ffmpeg';
}

/**
 * Universal FFprobe path resolver.
 * Priority:
 * 1. process.env.FFPROBE_PATH
 * 2. /usr/bin/ffprobe
 * 3. /usr/local/bin/ffprobe
 * 4. Sibling ffprobe binary next to resolved ffmpeg
 * 5. @ffprobe-installer/ffprobe npm package
 * 6. 'ffprobe' (fallback to system PATH)
 */
function getFFprobePath() {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }
  if (fs.existsSync('/usr/bin/ffprobe')) {
    return '/usr/bin/ffprobe';
  }
  if (fs.existsSync('/usr/local/bin/ffprobe')) {
    return '/usr/local/bin/ffprobe';
  }
  const ffmpegP = getFFmpegPath();
  if (ffmpegP && ffmpegP !== 'ffmpeg') {
    const guessed = ffmpegP.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    if (fs.existsSync(guessed)) {
      return guessed;
    }
  }
  try {
    const installer = require('@ffprobe-installer/ffprobe');
    if (installer && installer.path && fs.existsSync(installer.path)) return installer.path;
  } catch (e) {}
  return 'ffprobe';
}

module.exports = {
  getFFmpegPath,
  getFFprobePath
};
