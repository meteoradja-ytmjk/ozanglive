const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const schedulerService = require('./schedulerService');
const LiveLimitService = require('./liveLimitService');
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
const MAX_LOG_LINES = 100;

// Duration tracking for automatic stream termination
// Structure: { streamId: { startTime: Date, durationMs: number, expectedEndTime: Date } }
const streamDurationInfo = new Map();

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
  
  // OPTIMIZED: Non-advanced mode uses copy (minimal CPU)
  if (!stream.use_advanced_settings) {
    console.log('[StreamingService] Using OPTIMIZED playlist mode: threads=2, bufsize=1M, copy mode');
    return [
      // CPU optimization: limit threads per stream
      '-threads', '2',
      '-thread_queue_size', '512',
      '-hwaccel', 'auto',
      '-loglevel', 'error',
      '-re',
      // Handle corrupt frames gracefully
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-flags', '+global_header',
      '-bufsize', '1M',              // Reduced from 4M
      '-max_muxing_queue_size', '2048', // Reduced from 7000
      '-flvflags', 'no_duration_filesize', // Reduce FLV overhead
      '-f', 'flv',
      rtmpUrl
    ];
  }
  
  // OPTIMIZED: Advanced mode uses ultrafast preset (lower CPU than veryfast)
  const resolution = stream.resolution || '1280x720';
  const bitrate = stream.bitrate || 2500;
  const fps = stream.fps || 30;
  
  console.log('[StreamingService] Using OPTIMIZED playlist mode: threads=2, ultrafast preset, encoding');
  return [
    // CPU optimization: limit threads per stream
    '-threads', '2',
    '-thread_queue_size', '512',
    '-hwaccel', 'auto',
    '-loglevel', 'error',
    '-re',
    // Handle corrupt frames gracefully
    '-fflags', '+genpts+discardcorrupt',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',         // Changed from veryfast for lower CPU
    '-profile:v', 'baseline',       // YouTube compatible, lowest CPU
    '-tune', 'zerolatency',
    '-b:v', `${bitrate}k`,
    '-maxrate', `${bitrate * 1.5}k`,
    '-bufsize', `${Math.min(bitrate * 2, 2000)}k`, // Cap buffer size
    '-pix_fmt', 'yuv420p',
    '-g', `${fps * 2}`,
    '-s', resolution,
    '-r', fps.toString(),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-flvflags', 'no_duration_filesize', // Reduce FLV overhead
    '-f', 'flv',
    rtmpUrl
  ];
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
  
  // Calculate duration using centralized calculator
  // Priority: stream_duration_minutes > schedule calculation > stream_duration_hours > duration
  const durationSeconds = calculateDurationSeconds(stream);
  
  if (durationSeconds) {
    console.log(`[StreamingService] FFmpeg duration: ${formatDuration(durationSeconds)}`);
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
  const args = [
    // CPU optimization: limit threads per stream
    '-threads', '2',
    '-thread_queue_size', '512',
    '-hwaccel', 'auto',
    '-loglevel', 'error',
    '-re',
    // Handle corrupt frames gracefully
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
  
  // Audio codec - encode to AAC for compatibility (required for merge)
  args.push('-c:a', 'aac');
  args.push('-b:a', '128k');
  args.push('-ar', '44100');
  
  // Output settings - OPTIMIZED for low memory and CPU
  args.push('-flags', '+global_header');
  args.push('-bufsize', '1M');              // Reduced from 4M
  args.push('-max_muxing_queue_size', '2048'); // Reduced from 7000
  args.push('-flvflags', 'no_duration_filesize'); // Reduce FLV overhead
  args.push('-f', 'flv');
  
  // CRITICAL: Duration limit (-t) must be placed just before output URL
  // This limits the OUTPUT duration, not input duration
  // When placed here, FFmpeg will stop writing to output after durationSeconds
  if (durationSeconds && durationSeconds > 0) {
    console.log(`[StreamingService] FFmpeg -t parameter set: ${durationSeconds} seconds`);
    args.push('-t', durationSeconds.toString());
  }
  
  args.push(rtmpUrl);
  
  console.log('[StreamingService] Using OPTIMIZED audio-merge mode: threads=2, bufsize=1M, video copy + audio AAC');
  
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
    '-thread_queue_size', '512',
    '-hwaccel', 'auto',
    '-loglevel', 'error',
    '-re',
    // Handle corrupt frames gracefully to prevent sudden stops
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
  
  // Output settings - OPTIMIZED for low memory and CPU
  args.push('-flags', '+global_header');
  args.push('-bufsize', '1M');              // Reduced from 4M
  args.push('-max_muxing_queue_size', '2048'); // Reduced from 7000
  args.push('-flvflags', 'no_duration_filesize'); // Reduce FLV overhead
  args.push('-f', 'flv');
  
  // CRITICAL: Duration limit (-t) must be placed just before output URL
  // This limits the OUTPUT duration, not input duration
  // When placed here, FFmpeg will stop writing to output after durationSeconds
  if (durationSeconds && durationSeconds > 0) {
    console.log(`[StreamingService] FFmpeg -t parameter set: ${durationSeconds} seconds`);
    args.push('-t', durationSeconds.toString());
  }
  
  args.push(rtmpUrl);
  
  console.log('[StreamingService] Using OPTIMIZED video-only mode: threads=2, bufsize=1M, copy mode');
  
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
              await Stream.updateStatus(streamId, 'offline', streamData.user_id);
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
            await Stream.updateStatus(streamId, 'offline');
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
                await Stream.updateStatus(streamId, 'offline', streamData.user_id);
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
                  await Stream.updateStatus(streamId, 'offline');
                }
              } else {
                console.error(`[StreamingService] Cannot restart stream ${streamId}: not found in database`);
              }
            } catch (error) {
              console.error(`[StreamingService] Error during stream restart: ${error.message}`);
              try {
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
                  await Stream.updateStatus(streamId, 'offline', streamData.user_id);
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
                    await Stream.updateStatus(streamId, 'offline');
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
            console.log(`[StreamingService] Updating stream ${streamId} status to offline after FFmpeg exit`);
            const streamData = await Stream.findById(streamId);
            if (streamData) {
              await Stream.updateStatus(streamId, 'offline', streamData.user_id);
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
        await Stream.updateStatus(streamId, 'offline');
      } catch (error) {
        console.error(`Error updating stream status: ${error.message}`);
      }
    });
    ffmpegProcess.unref();
    
    // Calculate and track stream duration using centralized calculator
    const now = Date.now();
    const durationSeconds = calculateDurationSeconds(stream);
    const durationMs = durationSeconds ? durationSeconds * 1000 : null;
    
    // Set duration tracking if duration is specified
    if (durationMs && durationMs > 0) {
      const trackingSet = setDurationInfo(streamId, streamStartTime, durationMs);
      if (trackingSet) {
        addStreamLog(streamId, `Duration tracking enabled: ${formatDuration(durationSeconds)}`);
      }
    } else {
      addStreamLog(streamId, `No duration set - stream will run indefinitely`);
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
    const ffmpegProcess = activeStreams.get(streamId);
    const isActive = ffmpegProcess !== undefined;
    console.log(`[StreamingService] Stop request for stream ${streamId}, isActive: ${isActive}`);
    if (!isActive) {
      const stream = await Stream.findById(streamId);
      if (stream && stream.status === 'live') {
        console.log(`[StreamingService] Stream ${streamId} not active in memory but status is 'live' in DB. Fixing status.`);
        await Stream.updateStatus(streamId, 'offline', stream.user_id);
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
      await Stream.updateStatus(streamId, 'offline', stream.user_id);
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
    const liveStreams = await Stream.findAll(null, 'live');
    for (const stream of liveStreams) {
      const isReallyActive = activeStreams.has(stream.id);
      if (!isReallyActive) {
        console.log(`[StreamingService] Found inconsistent stream ${stream.id}: marked as 'live' in DB but not active in memory`);
        await Stream.updateStatus(stream.id, 'offline');
        console.log(`[StreamingService] Updated stream ${stream.id} status to 'offline'`);
      }
    }
    const activeStreamIds = Array.from(activeStreams.keys());
    for (const streamId of activeStreamIds) {
      const stream = await Stream.findById(streamId);
      if (!stream || stream.status !== 'live') {
        console.log(`[StreamingService] Found inconsistent stream ${streamId}: active in memory but not 'live' in DB`);
        if (stream) {
          await Stream.updateStatus(streamId, 'live');
          console.log(`[StreamingService] Updated stream ${streamId} status to 'live'`);
        } else {
          console.log(`[StreamingService] Stream ${streamId} not found in DB, removing from active streams`);
          const process = activeStreams.get(streamId);
          if (process) {
            try {
              process.kill('SIGTERM');
            } catch (error) {
              console.error(`[StreamingService] Error killing orphaned process: ${error.message}`);
            }
          }
          activeStreams.delete(streamId);
        }
      }
    }
    console.log(`[StreamingService] Stream status sync completed. Active streams: ${activeStreamIds.length}`);
  } catch (error) {
    console.error('[StreamingService] Error syncing stream statuses:', error);
  }
}
// OPTIMIZED: Increased from 5 to 10 minutes to reduce CPU overhead
setInterval(syncStreamStatuses, 10 * 60 * 1000);
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
module.exports = {
  startStream,
  stopStream,
  isStreamActive,
  getActiveStreams,
  getStreamLogs,
  syncStreamStatuses,
  saveStreamHistory,
  // Duration tracking exports
  getDurationInfo,
  getRemainingTime,
  isStreamEndingSoon,
  isStreamDurationExceeded,
  // Export for testing
  buildFFmpegArgsWithAudio,
  buildFFmpegArgsVideoOnly
};
