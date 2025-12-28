const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const schedulerService = require('./schedulerService');
const LiveLimitService = require('./liveLimitService');
const youtubeStatusSync = require('./youtubeStatusSync');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const Stream = require('../models/Stream');
const Playlist = require('../models/Playlist');
const { calculateDurationSeconds, calculateRemainingDuration, formatDuration } = require('../utils/durationCalculator');
let ffmpegPath;
if (fs.existsSync('/usr/bin/ffmpeg')) {
  ffmpegPath = '/usr/bin/ffmpeg';
  console.log('Using system FFmpeg at:', ffmpegPath);
} else {
  ffmpegPath = ffmpegInstaller.path;
  console.log('Using bundled FFmpeg at:', ffmpegPath);
}
const Video = require('../models/Video');
const Audio = require('../models/Audio');
const activeStreams = new Map();
const streamLogs = new Map();
const streamRetryCount = new Map();
const MAX_RETRY_ATTEMPTS = 3;
const manuallyStoppingStreams = new Set();
const MAX_LOG_LINES = 50; // OPTIMIZED: Reduced from 100 to 50 to save memory

// Duration tracking for automatic stream termination
// Structure: { streamId: { startTime: Date, durationMs: number, expectedEndTime: Date } }
const streamDurationInfo = new Map();

// MEMORY MANAGEMENT: Periodic cleanup of stale entries
// This prevents memory leaks from orphaned entries
const CLEANUP_INTERVAL = 30 * 60 * 1000; // Every 30 minutes

/**
 * Clean up stale entries from Maps to prevent memory leaks
 * Only removes entries for streams that are no longer active
 */
function cleanupStaleMaps() {
  try {
    const activeIds = new Set(activeStreams.keys());
    let cleaned = 0;
    
    // Clean streamLogs for inactive streams (keep last 10 entries for debugging)
    for (const [id] of streamLogs) {
      if (!activeIds.has(id)) {
        streamLogs.delete(id);
        cleaned++;
      }
    }
    
    // Clean streamRetryCount for inactive streams
    for (const [id] of streamRetryCount) {
      if (!activeIds.has(id)) {
        streamRetryCount.delete(id);
        cleaned++;
      }
    }
    
    // Clean streamDurationInfo for inactive streams
    for (const [id] of streamDurationInfo) {
      if (!activeIds.has(id)) {
        streamDurationInfo.delete(id);
        cleaned++;
      }
    }
    
    // Clean manuallyStoppingStreams for inactive streams
    for (const id of manuallyStoppingStreams) {
      if (!activeIds.has(id)) {
        manuallyStoppingStreams.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[StreamingService] Cleaned ${cleaned} stale entries from Maps`);
    }
  } catch (error) {
    console.error('[StreamingService] Error during cleanup:', error.message);
  }
}

// Start cleanup interval (will be tracked by app.js global override)
setInterval(cleanupStaleMaps, CLEANUP_INTERVAL);

/**
 * Check if any FFmpeg process is currently running
 * @returns {Promise<boolean>} True if any FFmpeg process is running
 */
async function isAnyFFmpegRunning() {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows 
      ? `tasklist /FI "IMAGENAME eq ffmpeg.exe" /NH`
      : `pgrep -x ffmpeg`;
    
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      // Check if any FFmpeg process found
      const hasFFmpeg = stdout && stdout.trim().length > 0;
      resolve(hasFFmpeg);
    });
  });
}

/**
 * Check if FFmpeg is streaming to a specific RTMP URL
 * Uses multiple methods to detect running FFmpeg processes
 * @param {string} streamKey - The stream key to search for
 * @returns {Promise<boolean>} True if FFmpeg process found streaming to this key
 */
async function isFFmpegStreamingToKey(streamKey) {
  if (!streamKey) return false;
  
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    
    // On Linux, use ps with wide output to see full command line
    // Escape special characters in stream key for grep
    const escapedKey = streamKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const cmd = isWindows 
      ? `wmic process where "name='ffmpeg.exe'" get commandline /format:list`
      : `ps auxww | grep ffmpeg | grep -v grep`;
    
    exec(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        // Command failed - assume FFmpeg might still be running
        // Don't change status on error
        console.log(`[StreamingService] FFmpeg check command failed: ${error.message}`);
        resolve(true); // Assume running to be safe
        return;
      }
      
      if (!stdout || stdout.trim().length === 0) {
        // No FFmpeg processes at all
        resolve(false);
        return;
      }
      
      // Check if output contains the stream key
      const found = stdout.includes(streamKey);
      if (found) {
        console.log(`[StreamingService] Found FFmpeg process with stream key: ${streamKey.substring(0, 8)}...`);
      }
      resolve(found);
    });
  });
}

/**
 * Determine the correct status after a stream ends
 * For recurring streams (daily/weekly), status should be 'scheduled' so they can run again
 * For one-time streams, status should be 'offline'
 * 
 * @param {Object} stream - Stream object from database
 * @returns {string} The status to set ('offline' or 'scheduled')
 */
function getStatusAfterStreamEnd(stream) {
  if (!stream) return 'offline';
  
  // Handle recurring_enabled as both boolean and integer (SQLite stores as 0/1)
  const isRecurringEnabled = stream.recurring_enabled === true || stream.recurring_enabled === 1;
  
  // For recurring streams (daily/weekly) that are enabled, set back to 'scheduled'
  if ((stream.schedule_type === 'daily' || stream.schedule_type === 'weekly') && isRecurringEnabled) {
    console.log(`[StreamingService] Recurring stream ${stream.id} (${stream.schedule_type}) - setting status to 'scheduled'`);
    return 'scheduled';
  }
  
  // For one-time streams or disabled recurring streams, set to 'offline'
  return 'offline';
}

/**
 * Set duration info for a stream
 * @param {string} streamId - Stream ID
 * @param {Date} startTime - Stream start time
 * @param {number} durationMs - Duration in milliseconds
 * @returns {boolean} True if duration was set successfully
 */
function setDurationInfo(streamId, startTime, durationMs) {
  // Validate durationMs is positive
  if (!durationMs || durationMs <= 0) {
    console.log(`[StreamingService] Duration tracking skipped for stream ${streamId}: invalid duration (${durationMs}ms)`);
    return false;
  }
  
  const expectedEndTime = new Date(startTime.getTime() + durationMs);
  const minutes = durationMs / 60000;
  const seconds = durationMs / 1000;
  
  streamDurationInfo.set(streamId, {
    startTime,
    durationMs,
    expectedEndTime,
    originalDurationMs: durationMs // Store original for restart calculation
  });
  
  // Log with consistent format: "Duration set: X minutes (Y seconds)"
  console.log(`[StreamingService] Duration set: ${minutes.toFixed(1)} minutes (${seconds} seconds)`);
  console.log(`[StreamingService] Stream ${streamId} expected end: ${expectedEndTime.toISOString()}`);
  
  return true;
}

/**
 * Get duration info for a stream
 * @param {string} streamId - Stream ID
 * @returns {Object|null} Duration info or null if not set
 */
function getDurationInfo(streamId) {
  return streamDurationInfo.get(streamId) || null;
}

/**
 * Clear duration info for a stream
 * @param {string} streamId - Stream ID
 */
function clearDurationInfo(streamId) {
  if (streamDurationInfo.has(streamId)) {
    streamDurationInfo.delete(streamId);
    console.log(`[StreamingService] Duration tracking cleared for stream ${streamId}`);
  }
}

/**
 * Check if stream duration has been exceeded
 * @param {string} streamId - Stream ID
 * @returns {boolean} True if duration exceeded
 */
function isStreamDurationExceeded(streamId) {
  const info = getDurationInfo(streamId);
  if (!info || !info.expectedEndTime) return false;
  return new Date() >= info.expectedEndTime;
}

/**
 * Get remaining time for a stream in milliseconds
 * @param {string} streamId - Stream ID
 * @returns {number|null} Remaining time in ms, or null if no duration set
 */
function getRemainingTime(streamId) {
  const info = getDurationInfo(streamId);
  if (!info || !info.expectedEndTime) return null;
  return Math.max(0, info.expectedEndTime.getTime() - Date.now());
}

/**
 * Check if stream is ending soon (less than 5 minutes remaining)
 * @param {string} streamId - Stream ID
 * @returns {boolean} True if ending soon
 */
function isStreamEndingSoon(streamId) {
  const remainingMs = getRemainingTime(streamId);
  if (remainingMs === null) return false;
  return remainingMs < 300000; // 5 minutes in ms
}

/**
 * Get original duration for a stream (for restart calculation)
 * @param {string} streamId - Stream ID
 * @returns {number|null} Original duration in ms, or null if not set
 */
function getOriginalDurationMs(streamId) {
  const info = getDurationInfo(streamId);
  if (!info) return null;
  return info.originalDurationMs || info.durationMs || null;
}

/**
 * Calculate remaining duration for stream restart
 * Uses the original start time and duration to calculate how much time is left
 * @param {string} streamId - Stream ID
 * @returns {number} Remaining duration in milliseconds (minimum 0)
 */
function calculateStreamRemainingDuration(streamId) {
  const info = getDurationInfo(streamId);
  if (!info || !info.startTime || !info.originalDurationMs) {
    return 0;
  }
  return calculateRemainingDuration(info.startTime, info.originalDurationMs);
}
function addStreamLog(streamId, message) {
  if (!streamLogs.has(streamId)) {
    streamLogs.set(streamId, []);
  }
  const logs = streamLogs.get(streamId);
  logs.push({
    timestamp: new Date().toISOString(),
    message
  });
  if (logs.length > MAX_LOG_LINES) {
    logs.shift();
  }
}
async function buildFFmpegArgsForPlaylist(stream, playlist) {
  if (!playlist.videos || playlist.videos.length === 0) {
    throw new Error(`Playlist is empty for playlist_id: ${stream.video_id}`);
  }
  
  const projectRoot = path.resolve(__dirname, '..');
  const rtmpUrl = `${stream.rtmp_url.replace(/\/$/, '')}/${stream.stream_key}`;
  
  // Calculate duration - prioritize stream_duration_minutes directly
  // This is critical for recurring streams where schedule_time/end_time may be stale
  let durationSeconds = null;
  
  // Priority 1: stream_duration_minutes (most reliable)
  if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
    durationSeconds = stream.stream_duration_minutes * 60;
    console.log(`[StreamingService] Playlist using stream_duration_minutes: ${stream.stream_duration_minutes} minutes (${durationSeconds} seconds)`);
  } else {
    // Fallback to centralized calculator
    durationSeconds = calculateDurationSeconds(stream);
    if (durationSeconds) {
      console.log(`[StreamingService] Playlist using calculated duration: ${formatDuration(durationSeconds)}`);
    }
  }
  
  if (durationSeconds) {
    console.log(`[StreamingService] Playlist FFmpeg -t will be set to: ${durationSeconds} seconds (${durationSeconds / 60} minutes)`);
  } else {
    console.log('[StreamingService] No duration set for playlist - stream will run until playlist ends or loop exhausts');
  }
  
  let videoPaths = [];
  
  if (playlist.is_shuffle || playlist.shuffle) {
    const shuffledVideos = [...playlist.videos].sort(() => Math.random() - 0.5);
    videoPaths = shuffledVideos.map(video => {
      const relativeVideoPath = video.filepath.startsWith('/') ? video.filepath.substring(1) : video.filepath;
      return path.join(projectRoot, 'public', relativeVideoPath);
    });
  } else {
    videoPaths = playlist.videos.map(video => {
      const relativeVideoPath = video.filepath.startsWith('/') ? video.filepath.substring(1) : video.filepath;
      return path.join(projectRoot, 'public', relativeVideoPath);
    });
  }
  
  for (const videoPath of videoPaths) {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
  }
  
  const concatFile = path.join(projectRoot, 'temp', `playlist_${stream.id}.txt`);
  
  const tempDir = path.dirname(concatFile);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  let concatContent = '';
  if (stream.loop_video) {
    for (let i = 0; i < 1000; i++) {
      videoPaths.forEach(videoPath => {
        concatContent += `file '${videoPath.replace(/\\/g, '/')}'\n`;
      });
    }
  } else {
    videoPaths.forEach(videoPath => {
      concatContent += `file '${videoPath.replace(/\\/g, '/')}'\n`;
    });
  }
  
  fs.writeFileSync(concatFile, concatContent);
  
  // Non-advanced mode uses copy (minimal CPU) with proper buffering for smooth audio
  if (!stream.use_advanced_settings) {
    console.log('[StreamingService] Using playlist mode: copy, bufsize=2M');
    const args = [
      // CPU optimization: limit threads per stream
      '-threads', '2',
      '-thread_queue_size', '2048',     // FIXED: Increased to prevent audio drops
      '-hwaccel', 'auto',
      // FIXED: Proper probesize and analyzeduration for audio sync
      '-probesize', '5000000',          // 5MB
      '-analyzeduration', '5000000',    // 5 seconds
      '-loglevel', 'error',
      '-re',
      // Handle corrupt frames gracefully - REMOVED nobuffer
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-flags', '+global_header',
      '-bufsize', '2000k',              // FIXED: Increased for smooth playback
      '-max_muxing_queue_size', '4096', // FIXED: Increased to prevent audio drops
      '-flvflags', 'no_duration_filesize',
      '-f', 'flv'
    ];
    
    // CRITICAL: Add duration limit just before output URL
    if (durationSeconds && durationSeconds > 0) {
      console.log(`[StreamingService] Playlist FFmpeg -t parameter set: ${durationSeconds} seconds`);
      args.push('-t', durationSeconds.toString());
    }
    
    args.push(rtmpUrl);
    return args;
  }
  
  // Advanced mode uses ultrafast preset with proper buffering for smooth audio
  const resolution = stream.resolution || '1280x720';
  const bitrate = stream.bitrate || 2500;
  const fps = stream.fps || 30;
  
  console.log('[StreamingService] Using playlist mode: ultrafast preset, encoding');
  const advancedArgs = [
    // CPU optimization: limit threads per stream
    '-threads', '2',
    '-thread_queue_size', '2048',       // FIXED: Increased to prevent audio drops
    '-hwaccel', 'auto',
    // FIXED: Proper probesize and analyzeduration for audio sync
    '-probesize', '5000000',            // 5MB
    '-analyzeduration', '5000000',      // 5 seconds
    '-loglevel', 'error',
    '-re',
    // Handle corrupt frames gracefully - REMOVED nobuffer
    '-fflags', '+genpts+discardcorrupt',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-profile:v', 'baseline',
    '-tune', 'zerolatency',
    '-b:v', `${bitrate}k`,
    '-maxrate', `${bitrate * 1.5}k`,
    '-bufsize', `${Math.max(bitrate * 2, 4000)}k`, // FIXED: Minimum 4M buffer
    '-pix_fmt', 'yuv420p',
    '-g', `${fps * 2}`,
    '-s', resolution,
    '-r', fps.toString(),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-flvflags', 'no_duration_filesize',
    '-f', 'flv'
  ];
  
  // CRITICAL: Add duration limit just before output URL
  if (durationSeconds && durationSeconds > 0) {
    console.log(`[StreamingService] Playlist (advanced) FFmpeg -t parameter set: ${durationSeconds} seconds`);
    advancedArgs.push('-t', durationSeconds.toString());
  }
  
  advancedArgs.push(rtmpUrl);
  return advancedArgs;
}

async function buildFFmpegArgs(stream) {
  const streamWithVideo = await Stream.getStreamWithVideo(stream.id);
  
  if (streamWithVideo && streamWithVideo.video_type === 'playlist') {
    const Playlist = require('../models/Playlist');
    const playlist = await Playlist.findByIdWithVideos(stream.video_id);
    
    if (!playlist) {
      throw new Error(`Playlist not found for playlist_id: ${stream.video_id}`);
    }
    
    return await buildFFmpegArgsForPlaylist(stream, playlist);
  }
  
  const video = await Video.findById(stream.video_id);
  if (!video) {
    throw new Error(`Video record not found in database for video_id: ${stream.video_id}`);
  }
  
  const relativeVideoPath = video.filepath.startsWith('/') ? video.filepath.substring(1) : video.filepath;
  const projectRoot = path.resolve(__dirname, '..');
  const videoPath = path.join(projectRoot, 'public', relativeVideoPath);
  
  if (!fs.existsSync(videoPath)) {
    console.error(`[StreamingService] CRITICAL: Video file not found on disk.`);
    console.error(`[StreamingService] Checked path: ${videoPath}`);
    console.error(`[StreamingService] stream.video_id: ${stream.video_id}`);
    console.error(`[StreamingService] video.filepath (from DB): ${video.filepath}`);
    console.error(`[StreamingService] Calculated relativeVideoPath: ${relativeVideoPath}`);
    console.error(`[StreamingService] process.cwd(): ${process.cwd()}`);
    throw new Error('Video file not found on disk. Please check paths and file existence.');
  }
  
  // Check if audio is selected
  let audioPath = null;
  if (stream.audio_id) {
    const audio = await Audio.findById(stream.audio_id);
    if (!audio) {
      throw new Error(`Audio not found for audio_id: ${stream.audio_id}`);
    }
    const relativeAudioPath = audio.filepath.startsWith('/') ? audio.filepath.substring(1) : audio.filepath;
    audioPath = path.join(projectRoot, 'public', relativeAudioPath);
    if (!fs.existsSync(audioPath)) {
      console.error(`[StreamingService] CRITICAL: Audio file not found on disk.`);
      console.error(`[StreamingService] Checked path: ${audioPath}`);
      throw new Error('Audio file not found on disk. Please check paths and file existence.');
    }
  }
  
  const rtmpUrl = `${stream.rtmp_url.replace(/\/$/, '')}/${stream.stream_key}`;
  
  // Calculate duration - prioritize stream_duration_minutes directly
  // This is critical for recurring streams where schedule_time/end_time may be stale
  let durationSeconds = null;
  
  // Priority 1: stream_duration_minutes (most reliable)
  if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
    durationSeconds = stream.stream_duration_minutes * 60;
    console.log(`[StreamingService] FFmpeg using stream_duration_minutes: ${stream.stream_duration_minutes} minutes (${durationSeconds} seconds)`);
  } else {
    // Fallback to centralized calculator for other cases
    durationSeconds = calculateDurationSeconds(stream);
    if (durationSeconds) {
      console.log(`[StreamingService] FFmpeg using calculated duration: ${formatDuration(durationSeconds)}`);
    }
  }
  
  if (durationSeconds) {
    console.log(`[StreamingService] FFmpeg -t will be set to: ${durationSeconds} seconds (${durationSeconds / 60} minutes)`);
  } else {
    console.log('[StreamingService] No duration set for FFmpeg - stream will run indefinitely');
  }
  
  // Build FFmpeg args based on whether audio is selected
  if (audioPath) {
    // Video + Audio merge with looping
    return buildFFmpegArgsWithAudio(videoPath, audioPath, rtmpUrl, durationSeconds, stream.loop_video);
  } else {
    // Video only (preserve original audio)
    return buildFFmpegArgsVideoOnly(videoPath, rtmpUrl, durationSeconds, stream.loop_video);
  }
}

/**
 * Build FFmpeg args for video + separate audio streaming
 * Both video and audio will loop independently until duration is reached
 * 
 * OPTIMIZED for low CPU usage:
 * - Thread limiting (2 threads per stream)
 * - Video copy mode (no re-encoding)
 * - Audio encoding at 128k AAC (required for merge)
 * - Reduced buffer sizes
 * 
 * IMPORTANT: The -t parameter must be placed AFTER all encoding options
 * and BEFORE the output URL to properly limit output duration.
 * This ensures FFmpeg stops outputting after the specified duration,
 * even when input streams are looping infinitely (-stream_loop -1).
 */
function buildFFmpegArgsWithAudio(videoPath, audioPath, rtmpUrl, durationSeconds, loopVideo) {
  // Check if audio is already AAC (can be copied without re-encoding)
  const audioExt = path.extname(audioPath).toLowerCase();
  const canCopyAudio = ['.aac', '.m4a'].includes(audioExt);
  
  const args = [
    // CPU optimization: limit threads per stream
    '-threads', '2',
    '-thread_queue_size', '2048',       // FIXED: Increased from 512 to prevent audio drops
    '-hwaccel', 'auto',
    // FIXED: Increased probesize and analyzeduration for better audio sync
    '-probesize', '5000000',            // 5MB - enough to analyze audio properly
    '-analyzeduration', '5000000',      // 5 seconds - analyze audio/video sync
    '-loglevel', 'error',
    '-re',
    // Handle corrupt frames gracefully - REMOVED nobuffer to prevent audio stuttering
    '-fflags', '+genpts+igndts+discardcorrupt',
    '-avoid_negative_ts', 'make_zero'
  ];
  
  // Video input with looping
  if (loopVideo) {
    args.push('-stream_loop', '-1');
  }
  args.push('-i', videoPath);
  
  // Audio input with looping (always loop audio to match video duration)
  args.push('-stream_loop', '-1');
  args.push('-i', audioPath);
  
  // Map video from first input, audio from second input
  args.push('-map', '0:v:0');
  args.push('-map', '1:a:0');
  
  // Video codec - copy to avoid re-encoding (minimal CPU)
  args.push('-c:v', 'copy');
  
  // Audio codec - try copy first for AAC files, otherwise encode with good quality
  if (canCopyAudio) {
    // AAC audio can be copied directly (ZERO CPU for audio)
    args.push('-c:a', 'copy');
    console.log('[StreamingService] Audio is AAC - using copy mode (zero CPU)');
  } else {
    // Need to encode to AAC - use good quality settings to prevent stuttering
    args.push('-c:a', 'aac');
    args.push('-b:a', '128k');          // FIXED: Increased from 96k for better quality
    args.push('-ar', '44100');
    args.push('-ac', '2');              // Stereo
    args.push('-profile:a', 'aac_low'); // LC-AAC profile for compatibility
    console.log('[StreamingService] Audio needs encoding - using AAC encoder at 128k');
  }
  
  // Output settings - balanced for quality and performance
  args.push('-flags', '+global_header');
  args.push('-bufsize', '2000k');           // FIXED: Increased buffer for smoother playback
  args.push('-max_muxing_queue_size', '4096'); // FIXED: Increased to prevent audio drops
  args.push('-flvflags', 'no_duration_filesize');
  args.push('-f', 'flv');
  
  // CRITICAL: Duration limit (-t) must be placed just before output URL
  if (durationSeconds && durationSeconds > 0) {
    console.log(`[StreamingService] FFmpeg -t parameter set: ${durationSeconds} seconds`);
    args.push('-t', durationSeconds.toString());
  }
  
  args.push(rtmpUrl);
  
  console.log(`[StreamingService] Using audio-merge mode: video copy, audio ${canCopyAudio ? 'copy' : 'aac-128k'}, bufsize=2M`);
  
  return args;
}

/**
 * Build FFmpeg args for video only streaming (preserve original audio)
 * 
 * OPTIMIZED for low CPU usage:
 * - Thread limiting (2 threads per stream)
 * - Reduced buffer sizes for lower memory footprint
 * - Copy mode preserves original quality with minimal CPU
 * 
 * IMPORTANT: The -t parameter must be placed AFTER all encoding options
 * and BEFORE the output URL to properly limit output duration.
 * This ensures FFmpeg stops outputting after the specified duration,
 * even when input streams are looping infinitely (-stream_loop -1).
 */
function buildFFmpegArgsVideoOnly(videoPath, rtmpUrl, durationSeconds, loopVideo) {
  const args = [
    // CPU optimization: limit threads per stream (allows more concurrent streams)
    '-threads', '2',
    '-thread_queue_size', '2048',       // FIXED: Increased from 512 to prevent audio drops
    '-hwaccel', 'auto',
    // FIXED: Increased probesize and analyzeduration for better audio sync
    '-probesize', '5000000',            // 5MB - enough to analyze audio properly
    '-analyzeduration', '5000000',      // 5 seconds - analyze audio/video sync
    '-loglevel', 'error',
    '-re',
    // Handle corrupt frames gracefully - REMOVED nobuffer to prevent audio stuttering
    '-fflags', '+genpts+igndts+discardcorrupt',
    '-avoid_negative_ts', 'make_zero'
  ];
  
  // Video input with looping
  if (loopVideo) {
    args.push('-stream_loop', '-1');
  } else {
    args.push('-stream_loop', '0');
  }
  args.push('-i', videoPath);
  
  // Copy both video and audio from original (NO re-encoding = minimal CPU)
  args.push('-c:v', 'copy');
  args.push('-c:a', 'copy');
  
  // Output settings - balanced for quality and performance
  args.push('-flags', '+global_header');
  args.push('-bufsize', '2000k');           // FIXED: Increased buffer for smoother playback
  args.push('-max_muxing_queue_size', '4096'); // FIXED: Increased to prevent audio drops
  args.push('-flvflags', 'no_duration_filesize');
  args.push('-f', 'flv');
  
  // CRITICAL: Duration limit (-t) must be placed just before output URL
  if (durationSeconds && durationSeconds > 0) {
    console.log(`[StreamingService] FFmpeg -t parameter set: ${durationSeconds} seconds`);
    args.push('-t', durationSeconds.toString());
  }
  
  args.push(rtmpUrl);
  
  console.log('[StreamingService] Using video-only mode: copy mode, bufsize=2M');
  
  return args;
}
async function startStream(streamId) {
  try {
    streamRetryCount.set(streamId, 0);
    if (activeStreams.has(streamId)) {
      return { success: false, error: 'Stream is already active' };
    }
    const stream = await Stream.findById(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }
    
    // Check live limit before starting stream
    const limitInfo = await LiveLimitService.validateAndGetInfo(stream.user_id);
    if (!limitInfo.canStart) {
      console.log(`[StreamingService] User ${stream.user_id} has reached live limit (${limitInfo.activeStreams}/${limitInfo.effectiveLimit})`);
      return { 
        success: false, 
        error: limitInfo.message,
        limitReached: true,
        activeStreams: limitInfo.activeStreams,
        effectiveLimit: limitInfo.effectiveLimit
      };
    }
    
    const startTimeIso = new Date().toISOString();
    const streamStartTime = new Date(startTimeIso);
    const ffmpegArgs = await buildFFmpegArgs(stream);
    const fullCommand = `${ffmpegPath} ${ffmpegArgs.join(' ')}`;
    addStreamLog(streamId, `Starting stream with command: ${fullCommand}`);
    console.log(`Starting stream: ${fullCommand}`);
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Wait for FFmpeg to confirm it's running before updating status
    let streamConfirmed = false;
    let earlyExitError = null;
    
    // Set up early exit detection
    const earlyExitPromise = new Promise((resolve) => {
      ffmpegProcess.once('exit', (code, signal) => {
        if (!streamConfirmed) {
          earlyExitError = `FFmpeg exited early with code ${code}, signal: ${signal}`;
          resolve(false);
        }
      });
      ffmpegProcess.once('error', (err) => {
        if (!streamConfirmed) {
          earlyExitError = `FFmpeg error: ${err.message}`;
          resolve(false);
        }
      });
    });
    
    // Wait a short time to detect early failures
    const confirmationTimeout = new Promise((resolve) => {
      setTimeout(() => {
        if (!earlyExitError) {
          streamConfirmed = true;
          resolve(true);
        }
      }, 2000); // Wait 2 seconds to confirm FFmpeg is running
    });
    
    const isRunning = await Promise.race([earlyExitPromise, confirmationTimeout]);
    
    if (!isRunning || earlyExitError) {
      console.error(`[StreamingService] FFmpeg failed to start for stream ${streamId}: ${earlyExitError}`);
      addStreamLog(streamId, `Failed to start: ${earlyExitError}`);
      activeStreams.delete(streamId);
      return { success: false, error: earlyExitError || 'FFmpeg failed to start' };
    }
    
    // FFmpeg is confirmed running, now update status
    activeStreams.set(streamId, ffmpegProcess);
    await Stream.updateStatus(streamId, 'live', stream.user_id, { startTimeOverride: startTimeIso });
    console.log(`[StreamingService] Stream ${streamId} confirmed running, status updated to live`);
    
    // CRITICAL: Set duration tracking for automatic termination
    // Use stream_duration_minutes as the primary source (most reliable for recurring streams)
    if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
      const durationMs = stream.stream_duration_minutes * 60 * 1000;
      setDurationInfo(streamId, streamStartTime, durationMs);
      console.log(`[StreamingService] Duration tracking set for stream ${streamId}: ${stream.stream_duration_minutes} minutes (${durationMs}ms)`);
      addStreamLog(streamId, `Duration tracking set: ${stream.stream_duration_minutes} minutes`);
    } else {
      // Fallback to calculated duration from durationCalculator
      const durationSeconds = calculateDurationSeconds(stream);
      if (durationSeconds && durationSeconds > 0) {
        const durationMs = durationSeconds * 1000;
        setDurationInfo(streamId, streamStartTime, durationMs);
        console.log(`[StreamingService] Duration tracking set for stream ${streamId}: ${durationSeconds / 60} minutes (${durationMs}ms) [calculated]`);
        addStreamLog(streamId, `Duration tracking set: ${durationSeconds / 60} minutes (calculated)`);
      } else {
        console.log(`[StreamingService] No duration set for stream ${streamId} - will run indefinitely`);
        addStreamLog(streamId, `No duration set - stream will run indefinitely`);
      }
    }
    
    // Start YouTube status sync if platform is YouTube
    if (stream.platform === 'YouTube' && stream.stream_key) {
      try {
        youtubeStatusSync.setStreamingService(module.exports);
        await youtubeStatusSync.startMonitoring(streamId, stream.user_id, stream.stream_key);
      } catch (ytErr) {
        console.log(`[StreamingService] YouTube status sync not started: ${ytErr.message}`);
        // Continue without sync - not critical
      }
    }
    
    ffmpegProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addStreamLog(streamId, `[OUTPUT] ${message}`);
        console.log(`[FFMPEG_STDOUT] ${streamId}: ${message}`);
      }
    });
    ffmpegProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addStreamLog(streamId, `[FFmpeg] ${message}`);
        if (!message.includes('frame=')) {
          console.error(`[FFMPEG_STDERR] ${streamId}: ${message}`);
        }
      }
    });
    ffmpegProcess.on('exit', async (code, signal) => {
      addStreamLog(streamId, `Stream ended with code ${code}, signal: ${signal}`);
      console.log(`[FFMPEG_EXIT] ${streamId}: Code=${code}, Signal=${signal}`);
      const wasActive = activeStreams.delete(streamId);
      const isManualStop = manuallyStoppingStreams.has(streamId);
      
      // Check if duration was exceeded - if so, this is a normal termination
      const durationExceeded = isStreamDurationExceeded(streamId);
      if (durationExceeded) {
        console.log(`[StreamingService] Stream ${streamId} stop reason: duration reached`);
        addStreamLog(streamId, `Stream stop reason: duration reached`);
        clearDurationInfo(streamId);
        if (wasActive) {
          try {
            const streamData = await Stream.findById(streamId);
            if (streamData) {
              // FIXED: Use correct status based on schedule type
              const newStatus = getStatusAfterStreamEnd(streamData);
              await Stream.updateStatus(streamId, newStatus, streamData.user_id);
              const updatedStream = await Stream.findById(streamId);
              await saveStreamHistory(updatedStream);
            }
            if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
              schedulerService.handleStreamStopped(streamId);
            }
          } catch (error) {
            console.error(`[StreamingService] Error updating stream status after duration completion: ${error.message}`);
          }
        }
        return;
      }
      
      if (isManualStop) {
        console.log(`[StreamingService] Stream ${streamId} stop reason: manual stop`);
        addStreamLog(streamId, `Stream stop reason: manual stop`);
        manuallyStoppingStreams.delete(streamId);
        clearDurationInfo(streamId);
        if (wasActive) {
          try {
            // FIXED: Use correct status based on schedule type
            const streamData = await Stream.findById(streamId);
            const newStatus = getStatusAfterStreamEnd(streamData);
            await Stream.updateStatus(streamId, newStatus, streamData?.user_id);
            if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
              schedulerService.handleStreamStopped(streamId);
            }
          } catch (error) {
            console.error(`[StreamingService] Error updating stream status after manual stop: ${error.message}`);
          }
        }
        return;
      }
      
      // For SIGSEGV or error exits, check if duration is close to being exceeded
      // If remaining time is less than 1 minute, don't restart
      const remainingTime = getRemainingTime(streamId);
      const shouldNotRestart = remainingTime !== null && remainingTime < 60000; // Less than 1 minute
      
      if (signal === 'SIGSEGV') {
        if (shouldNotRestart) {
          console.log(`[StreamingService] Stream ${streamId} crashed but duration almost reached (${remainingTime}ms remaining) - NOT restarting`);
          addStreamLog(streamId, `Stream crashed but duration almost reached - not restarting`);
          clearDurationInfo(streamId);
          if (wasActive) {
            try {
              const streamData = await Stream.findById(streamId);
              if (streamData) {
                // FIXED: Use correct status based on schedule type
                const newStatus = getStatusAfterStreamEnd(streamData);
                await Stream.updateStatus(streamId, newStatus, streamData.user_id);
              }
              if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
                schedulerService.handleStreamStopped(streamId);
              }
            } catch (error) {
              console.error(`[StreamingService] Error updating stream status: ${error.message}`);
            }
          }
          return;
        }
        
        const retryCount = streamRetryCount.get(streamId) || 0;
        if (retryCount < MAX_RETRY_ATTEMPTS) {
          streamRetryCount.set(streamId, retryCount + 1);
          console.log(`[StreamingService] FFmpeg crashed with SIGSEGV. Attempting restart #${retryCount + 1} for stream ${streamId}`);
          addStreamLog(streamId, `FFmpeg crashed with SIGSEGV. Attempting restart #${retryCount + 1}`);
          // Clear duration info before restart - it will be recalculated
          clearDurationInfo(streamId);
          setTimeout(async () => {
            try {
              const streamInfo = await Stream.findById(streamId);
              if (streamInfo) {
                const result = await startStream(streamId);
                if (!result.success) {
                  console.error(`[StreamingService] Failed to restart stream: ${result.error}`);
                  // FIXED: Use correct status based on schedule type
                  const newStatus = getStatusAfterStreamEnd(streamInfo);
                  await Stream.updateStatus(streamId, newStatus);
                }
              } else {
                console.error(`[StreamingService] Cannot restart stream ${streamId}: not found in database`);
              }
            } catch (error) {
              console.error(`[StreamingService] Error during stream restart: ${error.message}`);
              try {
                // Fallback to offline if we can't determine schedule type
                await Stream.updateStatus(streamId, 'offline');
              } catch (dbError) {
                console.error(`Error updating stream status: ${dbError.message}`);
              }
            }
          }, 3000);
          return;
        } else {
          console.error(`[StreamingService] Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached for stream ${streamId}`);
          addStreamLog(streamId, `Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) reached, stopping stream`);
          clearDurationInfo(streamId);
        }
      }
      else {
        let errorMessage = '';
        if (code !== 0 && code !== null) {
          // Check if we should not restart due to duration
          if (shouldNotRestart) {
            console.log(`[StreamingService] Stream ${streamId} exited with error but duration almost reached - NOT restarting`);
            addStreamLog(streamId, `Stream exited with error but duration almost reached - not restarting`);
            clearDurationInfo(streamId);
            if (wasActive) {
              try {
                const streamData = await Stream.findById(streamId);
                if (streamData) {
                  // FIXED: Use correct status based on schedule type
                  const newStatus = getStatusAfterStreamEnd(streamData);
                  await Stream.updateStatus(streamId, newStatus, streamData.user_id);
                }
                if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
                  schedulerService.handleStreamStopped(streamId);
                }
              } catch (error) {
                console.error(`[StreamingService] Error updating stream status: ${error.message}`);
              }
            }
            return;
          }
          
          errorMessage = `FFmpeg process exited with error code ${code}`;
          addStreamLog(streamId, errorMessage);
          console.error(`[StreamingService] ${errorMessage} for stream ${streamId}`);
          const retryCount = streamRetryCount.get(streamId) || 0;
          if (retryCount < MAX_RETRY_ATTEMPTS) {
            streamRetryCount.set(streamId, retryCount + 1);
            console.log(`[StreamingService] FFmpeg exited with code ${code}. Attempting restart #${retryCount + 1} for stream ${streamId}`);
            // Clear duration info before restart
            clearDurationInfo(streamId);
            setTimeout(async () => {
              try {
                const streamInfo = await Stream.findById(streamId);
                if (streamInfo) {
                  const result = await startStream(streamId);
                  if (!result.success) {
                    console.error(`[StreamingService] Failed to restart stream: ${result.error}`);
                    // FIXED: Use correct status based on schedule type
                    const newStatus = getStatusAfterStreamEnd(streamInfo);
                    await Stream.updateStatus(streamId, newStatus);
                  }
                }
              } catch (error) {
                console.error(`[StreamingService] Error during stream restart: ${error.message}`);
                await Stream.updateStatus(streamId, 'offline');
              }
            }, 3000);
            return;
          }
        }
        
        // Normal exit (code 0) - this could be FFmpeg -t parameter working correctly
        if (code === 0) {
          console.log(`[StreamingService] Stream ${streamId} ended normally with exit code 0`);
          addStreamLog(streamId, `Stream ended normally`);
        }
        
        clearDurationInfo(streamId);
        if (wasActive) {
          try {
            const streamData = await Stream.findById(streamId);
            // FIXED: Use correct status based on schedule type
            const newStatus = getStatusAfterStreamEnd(streamData);
            console.log(`[StreamingService] Updating stream ${streamId} status to '${newStatus}' after FFmpeg exit`);
            if (streamData) {
              await Stream.updateStatus(streamId, newStatus, streamData.user_id);
              const updatedStream = await Stream.findById(streamId);
              await saveStreamHistory(updatedStream);
            }
            if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
              schedulerService.handleStreamStopped(streamId);
            }
          } catch (error) {
            console.error(`[StreamingService] Error updating stream status after exit: ${error.message}`);
          }
        }
      }
    });
    ffmpegProcess.on('error', async (err) => {
      addStreamLog(streamId, `Error in stream process: ${err.message}`);
      console.error(`[FFMPEG_PROCESS_ERROR] ${streamId}: ${err.message}`);
      activeStreams.delete(streamId);
      try {
        // FIXED: Try to get stream data to determine correct status
        const streamData = await Stream.findById(streamId);
        const newStatus = getStatusAfterStreamEnd(streamData);
        await Stream.updateStatus(streamId, newStatus);
      } catch (error) {
        console.error(`Error updating stream status: ${error.message}`);
      }
    });
    ffmpegProcess.unref();
    
    // Calculate and track stream duration
    // IMPORTANT: For recurring streams, prioritize stream_duration_minutes directly
    // because schedule_time/end_time may contain old values from previous runs
    const now = Date.now();
    let durationSeconds = null;
    
    // Priority 1: stream_duration_minutes (most reliable)
    if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
      durationSeconds = stream.stream_duration_minutes * 60;
      console.log(`[StreamingService] Using stream_duration_minutes: ${stream.stream_duration_minutes} minutes (${durationSeconds} seconds)`);
    } else {
      // Fallback to centralized calculator
      durationSeconds = calculateDurationSeconds(stream);
    }
    
    const durationMs = durationSeconds ? durationSeconds * 1000 : null;
    
    // Log all duration-related fields for debugging
    console.log(`[StreamingService] Stream ${streamId} duration fields: stream_duration_minutes=${stream.stream_duration_minutes}, schedule_time=${stream.schedule_time}, end_time=${stream.end_time}, duration=${stream.duration}`);
    console.log(`[StreamingService] Stream ${streamId} calculated duration: ${durationSeconds ? formatDuration(durationSeconds) : 'not set'}`);
    
    // Set duration tracking if duration is specified
    if (durationMs && durationMs > 0) {
      const trackingSet = setDurationInfo(streamId, streamStartTime, durationMs);
      if (trackingSet) {
        addStreamLog(streamId, `Duration tracking enabled: ${formatDuration(durationSeconds)}`);
        console.log(`[StreamingService] Duration tracking set: stream will end at ${new Date(streamStartTime.getTime() + durationMs).toISOString()}`);
      }
    } else {
      addStreamLog(streamId, `No duration set - stream will run indefinitely`);
      console.log(`[StreamingService] WARNING: No duration set for stream ${streamId} - will run indefinitely`);
    }
    
    // Schedule stream termination based on duration
    if (typeof schedulerService !== 'undefined' && durationMs && durationMs > 0) {
      const shouldEndAt = new Date(streamStartTime.getTime() + durationMs);
      const remainingMs = Math.max(0, shouldEndAt.getTime() - now);
      const bufferMs = 30000; // 30 second buffer to let FFmpeg -t work first
      const remainingWithBufferMs = remainingMs + bufferMs;
      const remainingMinutes = remainingWithBufferMs / 60000;
      
      console.log(`[StreamingService] Scheduling termination for stream ${streamId} at ${shouldEndAt.toISOString()} (${remainingMinutes.toFixed(1)} minutes with 30s buffer)`);
      schedulerService.scheduleStreamTermination(streamId, remainingMinutes);
    }
    return {
      success: true,
      message: 'Stream started successfully',
      isAdvancedMode: stream.use_advanced_settings
    };
  } catch (error) {
    addStreamLog(streamId, `Failed to start stream: ${error.message}`);
    console.error(`Error starting stream ${streamId}:`, error);
    return { success: false, error: error.message };
  }
}
async function stopStream(streamId) {
  try {
    // Stop YouTube status sync monitoring first
    youtubeStatusSync.stopMonitoring(streamId);
    
    const ffmpegProcess = activeStreams.get(streamId);
    const isActive = ffmpegProcess !== undefined;
    console.log(`[StreamingService] Stop request for stream ${streamId}, isActive: ${isActive}`);
    if (!isActive) {
      const stream = await Stream.findById(streamId);
      if (stream && stream.status === 'live') {
        console.log(`[StreamingService] Stream ${streamId} not active in memory but status is 'live' in DB. Fixing status.`);
        // FIXED: Use correct status based on schedule type
        const newStatus = getStatusAfterStreamEnd(stream);
        await Stream.updateStatus(streamId, newStatus, stream.user_id);
        // Clean up duration tracking
        clearDurationInfo(streamId);
        if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
          schedulerService.handleStreamStopped(streamId);
        }
        return { success: true, message: 'Stream status fixed (was not active but marked as live)' };
      }
      return { success: false, error: 'Stream is not active' };
    }
    addStreamLog(streamId, 'Stopping stream...');
    console.log(`[StreamingService] Stopping active stream ${streamId}`);
    manuallyStoppingStreams.add(streamId);
    try {
      ffmpegProcess.kill('SIGTERM');
    } catch (killError) {
      console.error(`[StreamingService] Error killing FFmpeg process: ${killError.message}`);
      manuallyStoppingStreams.delete(streamId);
    }
    const stream = await Stream.findById(streamId);
    activeStreams.delete(streamId);
    
    // Clean up duration tracking
    clearDurationInfo(streamId);
    
    const tempConcatFile = path.join(__dirname, '..', 'temp', `playlist_${streamId}.txt`);
    try {
      if (fs.existsSync(tempConcatFile)) {
        fs.unlinkSync(tempConcatFile);
        console.log(`[StreamingService] Cleaned up temporary playlist file: ${tempConcatFile}`);
      }
    } catch (cleanupError) {
      console.error(`[StreamingService] Error cleaning up temporary file: ${cleanupError.message}`);
    }
    
    if (stream) {
      // FIXED: Use correct status based on schedule type
      const newStatus = getStatusAfterStreamEnd(stream);
      await Stream.updateStatus(streamId, newStatus, stream.user_id);
      const updatedStream = await Stream.findById(streamId);
      await saveStreamHistory(updatedStream);
    }
    if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
      schedulerService.handleStreamStopped(streamId);
    }
    return { success: true, message: 'Stream stopped successfully' };
  } catch (error) {
    manuallyStoppingStreams.delete(streamId);
    // Clean up duration tracking even on error
    clearDurationInfo(streamId);
    console.error(`[StreamingService] Error stopping stream ${streamId}:`, error);
    return { success: false, error: error.message };
  }
}
async function syncStreamStatuses() {
  try {
    console.log('[StreamingService] Syncing stream statuses...');
    
    // First check if ANY FFmpeg is running
    const anyFFmpegRunning = await isAnyFFmpegRunning();
    console.log(`[StreamingService] Any FFmpeg running: ${anyFFmpegRunning}`);
    
    let liveStreams = [];
    try {
      liveStreams = await Stream.findAll(null, 'live');
    } catch (dbError) {
      console.error('[StreamingService] Database error finding live streams:', dbError.message);
      return; // Don't crash, just skip this sync
    }
    
    if (liveStreams.length === 0) {
      console.log('[StreamingService] No live streams in database');
    } else {
      console.log(`[StreamingService] Found ${liveStreams.length} live streams in database`);
    }
    
    for (const stream of liveStreams) {
      try {
        const isInMemory = activeStreams.has(stream.id);
        
        if (isInMemory) {
          // Stream is in memory - it's definitely running from this app instance
          console.log(`[StreamingService] Stream ${stream.id} is active in memory - status OK`);
          continue;
        }
        
        // Stream not in memory - be VERY careful before changing status
        // If ANY FFmpeg is running, check if it's this stream's key
        if (anyFFmpegRunning) {
          const isThisStreamRunning = await isFFmpegStreamingToKey(stream.stream_key);
          
          if (isThisStreamRunning) {
            // FFmpeg is running with this stream key - keep status as 'live'
            console.log(`[StreamingService] Stream ${stream.id} - FFmpeg running with this key - keeping 'live'`);
            continue;
          }
          
          // FFmpeg is running but not with this stream's key
          // Still be conservative - maybe the check failed
          // Only update if stream has been "live" for more than 30 minutes without activity
          const startTime = stream.start_time ? new Date(stream.start_time) : null;
          const now = new Date();
          const runningMinutes = startTime ? (now - startTime) / 60000 : 0;
          
          // If stream started recently (< 30 min), don't change status
          // This prevents false positives during app restarts
          if (runningMinutes < 30) {
            console.log(`[StreamingService] Stream ${stream.id} started ${runningMinutes.toFixed(0)} min ago - keeping 'live' (conservative)`);
            continue;
          }
        }
        
        // No FFmpeg running at all, or stream has been "live" for a long time
        // Safe to update status
        console.log(`[StreamingService] Stream ${stream.id}: no FFmpeg detected - updating status`);
        const newStatus = getStatusAfterStreamEnd(stream);
        await Stream.updateStatus(stream.id, newStatus);
        console.log(`[StreamingService] Updated stream ${stream.id} status to '${newStatus}'`);
        
      } catch (streamError) {
        console.error(`[StreamingService] Error syncing stream ${stream.id}:`, streamError.message);
        // On error, DON'T change status - be conservative
      }
    }
    
    const activeStreamIds = Array.from(activeStreams.keys());
    for (const streamId of activeStreamIds) {
      try {
        const stream = await Stream.findById(streamId);
        if (!stream || stream.status !== 'live') {
          console.log(`[StreamingService] Found inconsistent stream ${streamId}: active in memory but not 'live' in DB`);
          if (stream) {
            await Stream.updateStatus(streamId, 'live');
            console.log(`[StreamingService] Updated stream ${streamId} status to 'live'`);
          } else {
            console.log(`[StreamingService] Stream ${streamId} not found in DB, removing from active streams`);
            const ffmpegProcess = activeStreams.get(streamId);
            if (ffmpegProcess) {
              try {
                ffmpegProcess.kill('SIGTERM');
              } catch (killError) {
                console.error(`[StreamingService] Error killing orphaned process: ${killError.message}`);
              }
            }
            activeStreams.delete(streamId);
          }
        }
      } catch (streamError) {
        console.error(`[StreamingService] Error syncing active stream ${streamId}:`, streamError.message);
        // Continue with next stream
      }
    }
    console.log(`[StreamingService] Stream status sync completed. Active streams: ${activeStreamIds.length}`);
  } catch (error) {
    console.error('[StreamingService] Error syncing stream statuses:', error.message);
    // Don't rethrow - let the sync continue on next interval
  }
}
// REMOVED: Automatic sync interval - was causing status to change incorrectly
// Status is now only managed by:
// 1. startStream() - sets to 'live'
// 2. stopStream() - sets to 'offline' or 'scheduled'
// 3. FFmpeg exit event - handles crashes
// syncStreamStatuses() can still be called manually if needed
function isStreamActive(streamId) {
  return activeStreams.has(streamId);
}
function getActiveStreams() {
  return Array.from(activeStreams.keys());
}
function getStreamLogs(streamId) {
  return streamLogs.get(streamId) || [];
}
async function saveStreamHistory(stream) {
  try {
    if (!stream.start_time) {
      console.log(`[StreamingService] Not saving history for stream ${stream.id} - no start time recorded`);
      return false;
    }
    const startTime = new Date(stream.start_time);
    const endTime = stream.end_time ? new Date(stream.end_time) : new Date();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);
    if (durationSeconds < 1) {
      console.log(`[StreamingService] Not saving history for stream ${stream.id} - duration too short (${durationSeconds}s)`);
      return false;
    }
    const videoDetails = stream.video_id ? await Video.findById(stream.video_id) : null;
    const historyData = {
      id: uuidv4(),
      stream_id: stream.id,
      title: stream.title,
      platform: stream.platform || 'Custom',
      platform_icon: stream.platform_icon,
      video_id: stream.video_id,
      video_title: videoDetails ? videoDetails.title : null,
      resolution: stream.resolution,
      bitrate: stream.bitrate,
      fps: stream.fps,
      start_time: stream.start_time,
      end_time: stream.end_time || new Date().toISOString(),
      duration: durationSeconds,
      use_advanced_settings: stream.use_advanced_settings ? 1 : 0,
      schedule_type: stream.schedule_type || 'once',
      user_id: stream.user_id
    };
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO stream_history (
          id, stream_id, title, platform, platform_icon, video_id, video_title,
          resolution, bitrate, fps, start_time, end_time, duration, use_advanced_settings, schedule_type, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          historyData.id, historyData.stream_id, historyData.title,
          historyData.platform, historyData.platform_icon, historyData.video_id, historyData.video_title,
          historyData.resolution, historyData.bitrate, historyData.fps,
          historyData.start_time, historyData.end_time, historyData.duration,
          historyData.use_advanced_settings, historyData.schedule_type, historyData.user_id
        ],
        function (err) {
          if (err) {
            console.error('[StreamingService] Error saving stream history:', err.message);
            return reject(err);
          }
          console.log(`[StreamingService] Stream history saved for stream ${stream.id}, duration: ${durationSeconds}s`);
          resolve(historyData);
        }
      );
    });
  } catch (error) {
    console.error('[StreamingService] Failed to save stream history:', error);
    return false;
  }
}
/**
 * Get YouTube status for a stream
 * @param {string} streamId - Stream ID
 * @returns {{lifeCycleStatus: string, displayStatus: string, lastChecked: Date} | null}
 */
function getYouTubeStatus(streamId) {
  return youtubeStatusSync.getYouTubeStatus(streamId);
}

/**
 * Check if a stream is being monitored for YouTube status
 * @param {string} streamId - Stream ID
 * @returns {boolean}
 */
function isYouTubeMonitored(streamId) {
  return youtubeStatusSync.isMonitoring(streamId);
}

module.exports = {
  startStream,
  stopStream,
  isStreamActive,
  getActiveStreams,
  getStreamLogs,
  syncStreamStatuses,
  saveStreamHistory,
  isFFmpegStreamingToKey, // Check if FFmpeg is running for a stream key
  isAnyFFmpegRunning, // Check if any FFmpeg process is running
  // Duration tracking exports
  getDurationInfo,
  getRemainingTime,
  isStreamEndingSoon,
  isStreamDurationExceeded,
  // YouTube status sync exports
  getYouTubeStatus,
  isYouTubeMonitored,
  // Export for testing
  buildFFmpegArgsWithAudio,
  buildFFmpegArgsVideoOnly
};
