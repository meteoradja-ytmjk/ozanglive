const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const schedulerService = require('./schedulerService');
const LiveLimitService = require('./liveLimitService');
const youtubeStatusSync = require('./youtubeStatusSync');
const rtmpHealthMonitor = require('./rtmpHealthMonitor');
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
  try { ffmpegPath = require('ffmpeg-static'); } catch(e) { ffmpegPath = ffmpegInstaller.path; }
  console.log('Using bundled FFmpeg at:', ffmpegPath);
}
const Video = require('../models/Video');
const Audio = require('../models/Audio');
const activeStreams = new Map();
const streamLogs = new Map();
const streamRetryCount = new Map();
// IMPROVED: For unlimited streams (once without duration), allow infinite retries
// For timed streams, use standard retry limit
const MAX_RETRY_ATTEMPTS = 20; // Generous CONSECUTIVE-failure budget for timed streams (resets to 0 on each successful reconnect)
const MAX_RETRY_ATTEMPTS_UNLIMITED = 999; // Virtually infinite for unlimited streams
const manuallyStoppingStreams = new Set();
const MAX_LOG_LINES = 50; // OPTIMIZED: Reduced from 100 to 50 to save memory

// MEMORY LEAK FIX: Hard limits for all Maps to prevent unbounded growth
const MAX_STREAM_LOGS_SIZE = 100; // Maximum number of streams to keep logs for
const MAX_RETRY_COUNT_SIZE = 100; // Maximum retry count entries
const MAX_DURATION_INFO_SIZE = 200; // Maximum duration tracking entries
const MAX_ORIGINAL_TIMING_SIZE = 200; // Maximum original timing entries
const MAX_PIDS_SIZE = 200; // Maximum PID entries
const MAX_MANUAL_STOPPING_SIZE = 50; // Maximum manual stopping entries

// Duration tracking for automatic stream termination
// Structure: { streamId: { startTime: Date, durationMs: number, expectedEndTime: Date } }
const streamDurationInfo = new Map();

// Original start time tracking for reconnect duration calculation
// When a stream is started for the FIRST time, we store its start time here.
// On reconnect, we use this to calculate remaining duration instead of resetting.
// Structure: { streamId: { originalStartTime: Date, originalDurationMs: number } }
const streamOriginalTiming = new Map();

// PID tracking for FFmpeg process verification
// Structure: { streamId: pid }
const streamPids = new Map();

// MEMORY MANAGEMENT: Periodic cleanup of stale entries
// This prevents memory leaks from orphaned entries
const CLEANUP_INTERVAL = 2 * 60 * 60 * 1000; // Every 2 hours - more aggressive cleanup

// PROCESS HEALTH CHECK: Verify FFmpeg processes are still running
// This catches cases where FFmpeg dies without triggering exit event
// IMPROVED: Reduced from 5 minutes to 1 minute for faster detection on unlimited streams
const PROCESS_CHECK_INTERVAL = 1 * 60 * 1000; // Every 1 minute - faster detection for auto-reconnect

// Track cleanup and health check interval IDs for proper shutdown
let cleanupIntervalId = null;
let healthCheckIntervalId = null;

/**
 * Handle unlist replay on stream end
 * Checks if the stream has YouTube broadcast settings with unlistReplayOnEnd enabled
 * Uses delayed retry mechanism to wait for YouTube replay processing
 * @param {Object} stream - Stream object from database
 */
async function handleUnlistReplayOnEnd(stream) {
  if (!stream || !stream.youtube_broadcast_id) return;
  
  try {
    // Lazy require to avoid circular dependency
    const unlistReplayService = require('./unlistReplayService');
    
    // Use the new service which handles delayed retry logic
    await unlistReplayService.handleStreamEnd(stream);
  } catch (err) {
    console.error(`[StreamingService] Error handling unlist replay:`, err.message);
  }
}

/**
 * Clean up stale entries from Maps to prevent memory leaks
 * Only removes entries for streams that are no longer active
 * ENHANCED: Added hard limits to prevent unbounded growth
 */
async function cleanupStaleMaps() {
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
    
    // HARD LIMIT: If streamLogs exceeds max size, remove oldest entries
    if (streamLogs.size > MAX_STREAM_LOGS_SIZE) {
      const entriesToRemove = streamLogs.size - MAX_STREAM_LOGS_SIZE;
      const keys = Array.from(streamLogs.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        streamLogs.delete(keys[i]);
        cleaned++;
      }
      console.log(`[StreamingService] Hard limit: Removed ${entriesToRemove} old log entries`);
    }
    
    // Clean streamRetryCount for inactive streams
    for (const [id] of streamRetryCount) {
      if (!activeIds.has(id)) {
        streamRetryCount.delete(id);
        cleaned++;
      }
    }
    
    // HARD LIMIT: If streamRetryCount exceeds max size
    if (streamRetryCount.size > MAX_RETRY_COUNT_SIZE) {
      const entriesToRemove = streamRetryCount.size - MAX_RETRY_COUNT_SIZE;
      const keys = Array.from(streamRetryCount.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        streamRetryCount.delete(keys[i]);
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
    
    // HARD LIMIT: If streamDurationInfo exceeds max size
    if (streamDurationInfo.size > MAX_DURATION_INFO_SIZE) {
      const entriesToRemove = streamDurationInfo.size - MAX_DURATION_INFO_SIZE;
      const keys = Array.from(streamDurationInfo.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        streamDurationInfo.delete(keys[i]);
        cleaned++;
      }
    }
    
    // Clean streamOriginalTiming for inactive streams
    // IMPORTANT: Only clean if stream is also NOT in 'live' status in DB
    // During reconnect, stream is removed from activeStreams but originalTiming must persist
    for (const [id] of streamOriginalTiming) {
      if (!activeIds.has(id)) {
        try {
          const stream = await Stream.findById(id);
          if (!stream || stream.status !== 'live') {
            streamOriginalTiming.delete(id);
            cleaned++;
          }
        } catch (e) {
          // If we can't check DB, leave it alone to be safe
        }
      }
    }
    
    // HARD LIMIT: If streamOriginalTiming exceeds max size
    if (streamOriginalTiming.size > MAX_ORIGINAL_TIMING_SIZE) {
      const entriesToRemove = streamOriginalTiming.size - MAX_ORIGINAL_TIMING_SIZE;
      const keys = Array.from(streamOriginalTiming.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        streamOriginalTiming.delete(keys[i]);
        cleaned++;
      }
    }
    
    // Clean streamPids for inactive streams
    for (const [id] of streamPids) {
      if (!activeIds.has(id)) {
        streamPids.delete(id);
        cleaned++;
      }
    }
    
    // HARD LIMIT: If streamPids exceeds max size
    if (streamPids.size > MAX_PIDS_SIZE) {
      const entriesToRemove = streamPids.size - MAX_PIDS_SIZE;
      const keys = Array.from(streamPids.keys());
      for (let i = 0; i < entriesToRemove; i++) {
        streamPids.delete(keys[i]);
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
    
    // HARD LIMIT: If manuallyStoppingStreams exceeds max size
    if (manuallyStoppingStreams.size > MAX_MANUAL_STOPPING_SIZE) {
      const entriesToRemove = manuallyStoppingStreams.size - MAX_MANUAL_STOPPING_SIZE;
      const ids = Array.from(manuallyStoppingStreams);
      for (let i = 0; i < entriesToRemove; i++) {
        manuallyStoppingStreams.delete(ids[i]);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[StreamingService] Cleaned ${cleaned} stale entries from Maps`);
    }
    
    // Log memory usage after cleanup
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    console.log(`[StreamingService] Memory after cleanup: ${heapUsedMB}MB heap, ${activeStreams.size} active streams`);
  } catch (error) {
    console.error('[StreamingService] Error during cleanup:', error.message);
  }
}

// Start cleanup interval (will be tracked for proper shutdown)
cleanupIntervalId = setInterval(cleanupStaleMaps, CLEANUP_INTERVAL);

/**
 * Check if a specific process is still running by PID
 * @param {number} pid - Process ID to check
 * @returns {Promise<boolean>} True if process is running
 */
async function isProcessRunning(pid) {
  if (!pid) return false;
  
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows 
      ? `tasklist /FI "PID eq ${pid}" /NH`
      : `ps -p ${pid} -o pid=`;
    
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      // Check if PID is in output
      const hasProcess = stdout && stdout.includes(pid.toString());
      resolve(hasProcess);
    });
  });
}

/**
 * Periodic health check for all active streams
 * Verifies FFmpeg processes are still running and updates status if not
 * OPTIMIZED: Uses lightweight process.kill(pid, 0) first, only spawns external commands if needed
 */
async function checkStreamProcessHealth() {
  try {
    const activeStreamIds = Array.from(activeStreams.keys());
    
    if (activeStreamIds.length === 0) {
      return; // No active streams to check
    }
    
    console.log(`[ProcessHealthCheck] Checking ${activeStreamIds.length} active streams...`);
    
    for (const streamId of activeStreamIds) {
      try {
        const ffmpegProcess = activeStreams.get(streamId);
        
        // OPTIMIZED: Method 1 only - use process.kill(pid, 0) which is very lightweight
        // This is sufficient for processes we spawned ourselves
        let processAlive = false;
        if (ffmpegProcess && !ffmpegProcess.killed && ffmpegProcess.pid) {
          try {
            // Sending signal 0 checks if process exists without killing it
            // This is a synchronous, lightweight operation
            process.kill(ffmpegProcess.pid, 0);
            processAlive = true;
          } catch (e) {
            // Process doesn't exist (ESRCH) or no permission (EPERM)
            processAlive = false;
          }
        }
        
        if (!processAlive) {
          console.log(`[ProcessHealthCheck] Stream ${streamId}: FFmpeg process NOT running, checking if should reconnect`);
          
          // Check if stream still has remaining duration - if so, attempt reconnect
          const remainingMs = getOriginalRemainingMs(streamId);
          const shouldReconnect = remainingMs === null || remainingMs > 15000; // null = unlimited, or > 15s remaining
          
          if (shouldReconnect && !manuallyStoppingStreams.has(streamId)) {
            console.log(`[ProcessHealthCheck] Stream ${streamId}: Attempting auto-reconnect (remaining: ${remainingMs ? (remainingMs / 60000).toFixed(1) + ' min' : 'unlimited'})`);
            addStreamLog(streamId, `[AUTO-RECONNECT] Process health check detected FFmpeg stopped, reconnecting...`);
            
            // Clean up current state but preserve original timing for reconnect
            activeStreams.delete(streamId);
            streamPids.delete(streamId);
            clearDurationInfo(streamId);
            // DO NOT clear originalTiming - needed for reconnect duration calculation
            
            // Attempt reconnect
            try {
              const stream = await Stream.findById(streamId);
              if (stream && stream.status === 'live') {
                const retryCount = streamRetryCount.get(streamId) || 0;
                const maxRetries = getMaxRetryAttempts(stream);
                if (retryCount < maxRetries) {
                  streamRetryCount.set(streamId, retryCount + 1);
                  
                  // For unlimited streams, add exponential backoff with cap
                  const isUnlimited = isUnlimitedStream(stream);
                  const backoffDelay = isUnlimited 
                    ? Math.min(3000 + (retryCount * 2000), 30000) // 3s, 5s, 7s... max 30s
                    : 3000;
                  
                  console.log(`[ProcessHealthCheck] Stream ${streamId}: Waiting ${backoffDelay}ms before reconnect attempt #${retryCount + 1}${isUnlimited ? ' (unlimited mode)' : ''}`);
                  
                  await new Promise(resolve => setTimeout(resolve, backoffDelay));
                  
                  const result = await startStream(streamId);
                  if (result.success) {
                    console.log(`[ProcessHealthCheck] Stream ${streamId}: Auto-reconnect successful`);
                    addStreamLog(streamId, `[AUTO-RECONNECT] Reconnect successful (attempt #${retryCount + 1})`);
                    streamRetryCount.set(streamId, 0); // Reset retry count on success
                  } else {
                    console.error(`[ProcessHealthCheck] Stream ${streamId}: Auto-reconnect failed - ${result.error}`);
                    addStreamLog(streamId, `[AUTO-RECONNECT] Failed: ${result.error} (attempt #${retryCount + 1})`);
                  }
                } else {
                  console.log(`[ProcessHealthCheck] Stream ${streamId}: Max retry attempts reached (${maxRetries}), marking offline`);
                  addStreamLog(streamId, `[AUTO-RECONNECT] Max retries reached (${maxRetries}), stopping`);
                  clearOriginalTiming(streamId);
                  const newStatus = getStatusAfterStreamEnd(stream);
                  await Stream.updateStatus(streamId, newStatus, stream.user_id);
                  const updatedStream = await Stream.findById(streamId);
                  await saveStreamHistory(updatedStream);
                }
              } else {
                // Stream not found or not live - clean up
                clearOriginalTiming(streamId);
              }
            } catch (reconnectError) {
              console.error(`[ProcessHealthCheck] Stream ${streamId}: Reconnect error - ${reconnectError.message}`);
              // For unlimited streams, don't clear timing on error - we want to keep trying
              const stream = await Stream.findById(streamId).catch(() => null);
              if (!isUnlimitedStream(stream)) {
                clearOriginalTiming(streamId);
              }
            }
          } else {
            // Duration expired or manual stop - just clean up
            console.log(`[ProcessHealthCheck] Stream ${streamId}: FFmpeg not running, duration expired or manual stop`);
            activeStreams.delete(streamId);
            streamPids.delete(streamId);
            clearDurationInfo(streamId);
            clearOriginalTiming(streamId);
            
            // Update database status
            const stream = await Stream.findById(streamId);
            if (stream && stream.status === 'live') {
              const newStatus = getStatusAfterStreamEnd(stream);
              await Stream.updateStatus(streamId, newStatus, stream.user_id);
              console.log(`[ProcessHealthCheck] Updated stream ${streamId} status to '${newStatus}'`);
              addStreamLog(streamId, `Process health check: duration expired, status updated to '${newStatus}'`);
              
              // Save history
              const updatedStream = await Stream.findById(streamId);
              await saveStreamHistory(updatedStream);
              
              // Cancel any scheduled termination
              if (typeof schedulerService !== 'undefined' && schedulerService.handleStreamStopped) {
                schedulerService.handleStreamStopped(streamId);
              }
            }
          }
        } else {
          // Process is alive, log occasionally for debugging
          const durationInfo = getDurationInfo(streamId);
          if (durationInfo) {
            const remainingMs = getRemainingTime(streamId);
            const remainingMin = remainingMs ? (remainingMs / 60000).toFixed(1) : 'unlimited';
            console.log(`[ProcessHealthCheck] Stream ${streamId}: OK (remaining: ${remainingMin} min)`);
          }
        }
      } catch (streamError) {
        console.error(`[ProcessHealthCheck] Error checking stream ${streamId}:`, streamError.message);
      }
    }
    
    // OPTIMIZED: Removed heavy database check for "live" streams not in memory
    // This was spawning external processes for each orphaned stream
    // The cleanup is now handled by cleanupStaleMaps() which runs less frequently
  } catch (error) {
    console.error('[ProcessHealthCheck] Error during health check:', error.message);
  }
}

// Start process health check interval
healthCheckIntervalId = setInterval(checkStreamProcessHealth, PROCESS_CHECK_INTERVAL);

/**
 * Shutdown function to clean up all resources
 * Called during graceful shutdown from app.js
 */
function shutdown() {
  console.log('[StreamingService] Starting shutdown...');
  
  // Clear intervals
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
  }
  
  // Kill all active FFmpeg processes
  for (const [streamId, process] of activeStreams.entries()) {
    try {
      if (process && !process.killed) {
        console.log(`[StreamingService] Killing FFmpeg process for stream ${streamId}`);
        process.kill('SIGTERM');
        // Force kill after 5 seconds if not responding
        setTimeout(() => {
          if (!process.killed) {
            process.kill('SIGKILL');
          }
        }, 5000);
      }
    } catch (err) {
      console.error(`[StreamingService] Error killing process for stream ${streamId}:`, err.message);
    }
  }
  
  // Clear all Maps
  activeStreams.clear();
  streamLogs.clear();
  streamRetryCount.clear();
  streamDurationInfo.clear();
  streamOriginalTiming.clear();
  streamPids.clear();
  manuallyStoppingStreams.clear();
  
  console.log('[StreamingService] Shutdown complete');
}

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
 * Check if a stream is configured for unlimited duration
 * A stream is unlimited if:
 * 1. schedule_type is 'once' (or not set)
 * 2. No stream_duration_minutes set (or set to 0/null)
 * 3. No end_time set
 * 
 * @param {Object} stream - Stream object from database
 * @returns {boolean} True if stream should run indefinitely
 */
function isUnlimitedStream(stream) {
  if (!stream) return false;
  
  // Only 'once' schedule type can be unlimited
  const isOnceSchedule = !stream.schedule_type || stream.schedule_type === 'once';
  if (!isOnceSchedule) return false;
  
  // Check if duration is set
  const hasDuration = stream.stream_duration_minutes && stream.stream_duration_minutes > 0;
  const hasEndTime = stream.end_time && new Date(stream.end_time) > new Date();
  
  return !hasDuration && !hasEndTime;
}

/**
 * Get the maximum retry attempts for a stream
 * Unlimited streams get virtually infinite retries
 * Timed streams get standard retry limit
 * 
 * @param {Object} stream - Stream object from database
 * @returns {number} Maximum retry attempts
 */
function getMaxRetryAttempts(stream) {
  if (isUnlimitedStream(stream)) {
    console.log(`[StreamingService] Stream ${stream?.id} is UNLIMITED - using infinite retry mode`);
    return MAX_RETRY_ATTEMPTS_UNLIMITED;
  }
  return MAX_RETRY_ATTEMPTS;
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

/**
 * Set original timing for a stream (called only on FIRST start, not on reconnect)
 * This preserves the user's intended start time and total duration across reconnects.
 * @param {string} streamId - Stream ID
 * @param {Date} originalStartTime - The first time the stream started
 * @param {number} originalDurationMs - The total duration the user configured (in ms)
 */
function setOriginalTiming(streamId, originalStartTime, originalDurationMs) {
  if (!originalDurationMs || originalDurationMs <= 0) return;
  streamOriginalTiming.set(streamId, {
    originalStartTime,
    originalDurationMs
  });
  console.log(`[StreamingService] Original timing saved for stream ${streamId}: start=${originalStartTime.toISOString()}, duration=${(originalDurationMs / 60000).toFixed(1)} min`);
}

/**
 * Get the remaining duration for a stream based on original start time.
 * Used during reconnect to calculate how much time the stream should still run.
 * @param {string} streamId - Stream ID
 * @returns {number|null} Remaining duration in ms, or null if no original timing
 */
function getOriginalRemainingMs(streamId) {
  const timing = streamOriginalTiming.get(streamId);
  if (!timing) return null;
  const elapsed = Date.now() - timing.originalStartTime.getTime();
  const remaining = Math.max(0, timing.originalDurationMs - elapsed);
  return remaining;
}

/**
 * Clear original timing for a stream (called when stream fully ends - not on reconnect)
 * @param {string} streamId - Stream ID
 */
function clearOriginalTiming(streamId) {
  if (streamOriginalTiming.has(streamId)) {
    streamOriginalTiming.delete(streamId);
    console.log(`[StreamingService] Original timing cleared for stream ${streamId}`);
  }
}

/**
 * Check if this is a reconnect (original timing exists)
 * @param {string} streamId - Stream ID
 * @returns {boolean}
 */
function isReconnect(streamId) {
  return streamOriginalTiming.has(streamId);
}

function resolvePublicMediaPath(mediaFilePath) {
  if (!mediaFilePath || typeof mediaFilePath !== 'string') {
    throw new Error('Media filepath is missing');
  }

  const projectRoot = path.resolve(__dirname, '..');
  const normalizedMediaPath = mediaFilePath.replace(/\\/g, '/');
  const relativeMediaPath = normalizedMediaPath.replace(/^[\/]+/, '');
  const isPublicRelativePath = relativeMediaPath === 'public' || relativeMediaPath.startsWith('public/');
  const publicCandidate = isPublicRelativePath
    ? path.join(projectRoot, relativeMediaPath)
    : path.join(projectRoot, 'public', relativeMediaPath);

  // Most DB values are URL-style paths like /uploads/videos/foo.mp4. Those are
  // absolute to the web server, not absolute filesystem paths, so resolve them
  // under public/ before considering them as OS paths.
  if (fs.existsSync(publicCandidate)) {
    return publicCandidate;
  }

  if (path.isAbsolute(mediaFilePath) && fs.existsSync(mediaFilePath)) {
    return mediaFilePath;
  }

  return publicCandidate;
}

function formatConcatFilePath(mediaFilePath) {
  return mediaFilePath.replace(/\\/g, '/').replace(/'/g, "\\'");
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

/**
 * Pre-render every audio file in a playlist into a single seamless AAC file.
 *
 * Why pre-render instead of relying on the concat demuxer at runtime?
 * MP3/AAC files have encoder delay/padding at file boundaries. The concat
 * demuxer just stitches packets, so listeners hear a small silence between
 * tracks. By decoding all inputs to PCM and re-encoding once, the track
 * boundaries become sample-accurate (gapless) and the resulting file can
 * then be looped cleanly during the live stream.
 *
 * Returns the path to the merged audio on success, or null on failure so the
 * caller can fall back to concat-demuxer mode without breaking the stream.
 */
function prerenderGaplessAudio(audioPaths, outputFile) {
  return new Promise((resolve) => {
    if (!Array.isArray(audioPaths) || audioPaths.length === 0) {
      return resolve(null);
    }

    const args = [];
    audioPaths.forEach((p) => {
      args.push('-i', p);
    });

    // concat filter joins decoded PCM streams sample-accurately
    const filter = audioPaths.map((_, i) => `[${i}:a:0]`).join('') +
      `concat=n=${audioPaths.length}:v=0:a=1[aout]`;

    args.push(
      '-filter_complex', filter,
      '-map', '[aout]',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-movflags', '+faststart',
      '-y',
      outputFile
    );

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderrTail = '';
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4096);
    });

    proc.on('error', (err) => {
      console.error('[StreamingService] prerenderGaplessAudio spawn error:', err.message);
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0) {
        resolve(outputFile);
      } else {
        console.error(`[StreamingService] prerenderGaplessAudio failed (exit=${code}). Last stderr:\n${stderrTail}`);
        try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile); } catch (_) { /* noop */ }
        resolve(null);
      }
    });
  });
}

async function buildFFmpegArgsForPlaylist(stream, playlist, durationOverrideSeconds = null) {
  if (!playlist.videos || playlist.videos.length === 0) {
    throw new Error(`Playlist is empty for playlist_id: ${stream.video_id}`);
  }
  
  const projectRoot = path.resolve(__dirname, '..');
  const rtmpUrl = `${stream.rtmp_url.replace(/\/$/, '')}/${stream.stream_key}`;
  
  // Calculate duration - prioritize override (used for reconnect with remaining time)
  // Then fall back to stream_duration_minutes directly
  let durationSeconds = null;
  
  if (durationOverrideSeconds && durationOverrideSeconds > 0) {
    durationSeconds = durationOverrideSeconds;
    console.log(`[StreamingService] Playlist using duration override (reconnect): ${durationSeconds} seconds (${(durationSeconds / 60).toFixed(1)} minutes)`);
  } else if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
    // Priority 1: stream_duration_minutes (most reliable)
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
  
  const playlistVideos = playlist.is_shuffle || playlist.shuffle
    ? [...playlist.videos].sort(() => Math.random() - 0.5)
    : playlist.videos;
  const videoPaths = [];
  const missingVideos = [];

  playlistVideos.forEach((video) => {
    const videoPath = resolvePublicMediaPath(video.filepath);
    if (fs.existsSync(videoPath)) {
      videoPaths.push(videoPath);
      return;
    }

    missingVideos.push({ title: video.title || video.id || 'unknown', filepath: video.filepath, checkedPath: videoPath });
  });

  if (missingVideos.length > 0) {
    console.error(`[StreamingService] Playlist ${stream.video_id}: ${missingVideos.length} video file(s) missing.`);
    missingVideos.slice(0, 5).forEach((video) => {
      console.error(`[StreamingService] Missing playlist item: title=${video.title}, filepath=${video.filepath}, checked=${video.checkedPath}`);
    });
  }

  if (videoPaths.length === 0) {
    throw new Error('All playlist video files are missing on disk. Please re-upload or remove missing videos from this playlist.');
  }

  // Resolve audio files attached to the playlist (optional)
  const playlistAudios = Array.isArray(playlist.audios)
    ? (playlist.is_shuffle || playlist.shuffle
        ? [...playlist.audios].sort(() => Math.random() - 0.5)
        : playlist.audios)
    : [];
  const audioPaths = [];
  const missingAudios = [];

  playlistAudios.forEach((audio) => {
    const audioPath = resolvePublicMediaPath(audio.filepath);
    if (fs.existsSync(audioPath)) {
      audioPaths.push(audioPath);
      return;
    }
    missingAudios.push({ title: audio.title || audio.id || 'unknown', filepath: audio.filepath, checkedPath: audioPath });
  });

  if (missingAudios.length > 0) {
    console.error(`[StreamingService] Playlist ${stream.video_id}: ${missingAudios.length} audio file(s) missing on disk; they will be skipped.`);
    missingAudios.slice(0, 5).forEach((audio) => {
      console.error(`[StreamingService] Missing playlist audio: title=${audio.title}, filepath=${audio.filepath}, checked=${audio.checkedPath}`);
    });
  }
  
  const concatFile = path.join(projectRoot, 'temp', `playlist_${stream.id}.txt`);
  const audioConcatFile = path.join(projectRoot, 'temp', `playlist_${stream.id}_audio.txt`);
  
  const tempDir = path.dirname(concatFile);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Loop the playlist when the user enabled loop OR when a finite duration is set.
  // A finite duration means the stream MUST run for the full configured time, so the
  // playlist has to repeat to fill it. Without this, FFmpeg exits as soon as the
  // playlist ends — the "stream stops before the configured duration" bug.
  // We use the FFmpeg `-stream_loop -1` input flag (added to args below) for a true
  // infinite loop instead of repeating the concat list a fixed number of times, so it
  // works correctly for any duration (including very long ones).
  const shouldLoopPlaylist = !!stream.loop_video || (durationSeconds && durationSeconds > 0);

  let concatContent = '';
  videoPaths.forEach(videoPath => {
    concatContent += `file '${formatConcatFilePath(videoPath)}'\n`;
  });

  fs.writeFileSync(concatFile, concatContent);

  // Build a single seamless audio file when the playlist has audios.
  // We try pre-rendering with the concat filter first (sample-accurate, truly
  // gapless). If that fails for any reason, we fall back to the older concat
  // demuxer list so the live stream still gets audio.
  let usePlaylistAudio = false;
  let useGaplessAudio = false;
  let gaplessAudioFile = null;

  if (audioPaths.length > 0) {
    if (audioPaths.length === 1) {
      // Single track: nothing to "join" — use it directly, no pre-render needed.
      gaplessAudioFile = audioPaths[0];
      useGaplessAudio = true;
      usePlaylistAudio = true;
    } else {
      const mergedAudioFile = path.join(projectRoot, 'temp', `playlist_${stream.id}_audio_merged.m4a`);
      // Remove any stale merge output from a previous run before re-rendering
      try { if (fs.existsSync(mergedAudioFile)) fs.unlinkSync(mergedAudioFile); } catch (_) { /* noop */ }

      console.log(`[StreamingService] Pre-rendering ${audioPaths.length} playlist audio file(s) into a gapless track...`);
      const merged = await prerenderGaplessAudio(audioPaths, mergedAudioFile);
      if (merged) {
        gaplessAudioFile = merged;
        useGaplessAudio = true;
        usePlaylistAudio = true;
        console.log(`[StreamingService] Gapless audio ready: ${merged}`);
      } else {
        console.warn('[StreamingService] Gapless pre-render failed, falling back to concat-demuxer (may have small gaps between tracks).');

        let audioConcatContent = '';
        audioPaths.forEach(audioPath => {
          audioConcatContent += `file '${formatConcatFilePath(audioPath)}'\n`;
        });
        fs.writeFileSync(audioConcatFile, audioConcatContent);
        usePlaylistAudio = true;
      }
    }
  }

  // Make sure no stale audio concat file from a previous run lingers when we
  // are not using the demuxer fallback this time.
  if (!usePlaylistAudio || useGaplessAudio) {
    try {
      if (fs.existsSync(audioConcatFile)) fs.unlinkSync(audioConcatFile);
    } catch (_) { /* noop */ }
  }
  
  // Playlist streams are always normalized before RTMP output.
  // Copy mode is fragile for playlists because files can have different codecs,
  // resolutions, timestamps, or audio formats that FLV/RTMP cannot accept.
  const resolution = stream.resolution || '1280x720';
  const bitrate = stream.bitrate || 2500;
  const fps = stream.fps || 30;

  const args = [
    '-re',
  ];

  // Loop the concatenated playlist input when required (see shouldLoopPlaylist above).
  // -stream_loop must be placed BEFORE the -i it applies to.
  if (shouldLoopPlaylist) {
    args.push('-stream_loop', '-1');
  }

  args.push(
    '-fflags', '+genpts',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
  );

  if (usePlaylistAudio) {
    if (useGaplessAudio) {
      // Single pre-rendered seamless track. No concat demuxer here — just loop
      // the file. Because boundaries inside the merged file are sample-
      // accurate, looping back to the start is also gapless.
      args.push(
        '-stream_loop', '-1',
        '-i', gaplessAudioFile,
        '-map', '0:v:0',
        '-map', '1:a:0'
      );
    } else {
      // Fallback: concat demuxer (per-file, may show tiny gaps between tracks)
      args.push(
        '-stream_loop', '-1',
        '-f', 'concat',
        '-safe', '0',
        '-i', audioConcatFile,
        '-map', '0:v:0',
        '-map', '1:a:0'
      );
    }
  } else {
    args.push(
      '-map', '0:v:0',
      '-map', '0:a?'
    );
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', `${bitrate}k`,
    '-bufsize', `${bitrate * 2}k`,
    '-maxrate', `${Math.floor(bitrate * 1.5)}k`,
    '-pix_fmt', 'yuv420p',
    '-g', `${fps * 2}`,
    '-s', resolution,
    '-r', fps.toString(),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2'
  );

  // CRITICAL: -t must be placed BEFORE -f flv and output URL
  if (durationSeconds && durationSeconds > 0) {
    args.push('-t', durationSeconds.toString());
  }

  args.push('-f', 'flv');
  args.push(rtmpUrl);
  console.log(
    `[StreamingService] Playlist: normalized encoding mode${
      usePlaylistAudio
        ? useGaplessAudio
          ? ' with playlist audio (gapless pre-rendered)'
          : ` with playlist audio (${audioPaths.length} track(s), concat demuxer fallback)`
        : ''
    }`
  );
  return args;
}

async function buildFFmpegArgs(stream, durationOverrideSeconds = null) {
  const streamWithVideo = await Stream.getStreamWithVideo(stream.id);
  
  if (streamWithVideo && streamWithVideo.video_type === 'playlist') {
    const Playlist = require('../models/Playlist');
    const playlist = await Playlist.findByIdWithMedia(stream.video_id);
    
    if (!playlist) {
      throw new Error(`Playlist not found for playlist_id: ${stream.video_id}`);
    }
    
    return await buildFFmpegArgsForPlaylist(stream, playlist, durationOverrideSeconds);
  }
  
  const video = await Video.findById(stream.video_id);
  if (!video) {
    throw new Error(`Video record not found in database for video_id: ${stream.video_id}`);
  }
  
  const videoPath = resolvePublicMediaPath(video.filepath);
  
  if (!fs.existsSync(videoPath)) {
    console.error(`[StreamingService] CRITICAL: Video file not found on disk.`);
    console.error(`[StreamingService] Checked path: ${videoPath}`);
    console.error(`[StreamingService] stream.video_id: ${stream.video_id}`);
    console.error(`[StreamingService] video.filepath (from DB): ${video.filepath}`);
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
    audioPath = resolvePublicMediaPath(audio.filepath);
    if (!fs.existsSync(audioPath)) {
      console.error(`[StreamingService] CRITICAL: Audio file not found on disk.`);
      console.error(`[StreamingService] Checked path: ${audioPath}`);
      throw new Error('Audio file not found on disk. Please check paths and file existence.');
    }
  }
  
  const rtmpUrl = `${stream.rtmp_url.replace(/\/$/, '')}/${stream.stream_key}`;
  
  // Calculate duration - prioritize override (used for reconnect with remaining time)
  // Then fall back to stream_duration_minutes directly
  // This is critical for recurring streams where schedule_time/end_time may be stale
  let durationSeconds = null;
  
  if (durationOverrideSeconds && durationOverrideSeconds > 0) {
    durationSeconds = durationOverrideSeconds;
    console.log(`[StreamingService] FFmpeg using duration override (reconnect): ${durationSeconds} seconds (${(durationSeconds / 60).toFixed(1)} minutes)`);
  } else if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
    // Priority 1: stream_duration_minutes (most reliable)
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
 * 
 * MINIMAL CPU (~1%) - Full copy mode
 * 
 * IMPORTANT: -t parameter must be placed BEFORE the output URL to limit output duration
 * When using -stream_loop -1, FFmpeg will loop input infinitely, but -t limits the OUTPUT duration
 */
function buildFFmpegArgsWithAudio(videoPath, audioPath, rtmpUrl, durationSeconds, loopVideo) {
  const args = ['-re'];
  
  // Loop the video when the user enabled loop OR when a finite duration is set.
  // If a duration is configured, the stream must run for that full duration, so a
  // short video has to loop to fill it. Otherwise FFmpeg (with -shortest) ends as
  // soon as the single video playthrough finishes — the "stops before the configured
  // duration" bug. -t still cuts the output at the exact requested duration.
  const shouldLoopVideo = loopVideo || (durationSeconds && durationSeconds > 0);
  if (shouldLoopVideo) {
    args.push('-stream_loop', '-1');
  }
  args.push('-i', videoPath);
  
  // Audio input with loop
  args.push('-stream_loop', '-1');
  args.push('-i', audioPath);
  
  args.push('-map', '0:v:0', '-map', '1:a:0');
  args.push('-c', 'copy');  // Copy both
  args.push('-shortest');
  
  // CRITICAL: -t must be placed BEFORE -f flv and output URL
  // This limits the OUTPUT duration correctly
  if (durationSeconds && durationSeconds > 0) {
    args.push('-t', durationSeconds.toString());
    console.log(`[StreamingService] Audio-merge: duration limit set to ${durationSeconds} seconds (${durationSeconds / 60} minutes)`);
  }
  
  args.push('-f', 'flv');
  args.push(rtmpUrl);
  console.log('[StreamingService] Audio-merge: minimal copy');
  return args;
}

/**
 * Build FFmpeg args for video only streaming
 * 
 * MINIMAL CPU (~1%) - Full copy mode
 * 
 * IMPORTANT: -t parameter must be placed BEFORE the output URL to limit output duration
 * When using -stream_loop -1, FFmpeg will loop input infinitely, but -t limits the OUTPUT duration
 */
function buildFFmpegArgsVideoOnly(videoPath, rtmpUrl, durationSeconds, loopVideo) {
  const args = ['-re'];
  
  // Loop the video when the user enabled loop OR when a finite duration is set.
  // A configured duration means the stream must run for that full time, so a short
  // video has to loop to fill it. Without this FFmpeg exits when the single video
  // playthrough finishes — the "stops before the configured duration" bug.
  // -t still cuts the output at the exact requested duration.
  const shouldLoopVideo = loopVideo || (durationSeconds && durationSeconds > 0);
  if (shouldLoopVideo) {
    args.push('-stream_loop', '-1');
  }
  args.push('-i', videoPath);
  args.push('-c', 'copy');
  
  // CRITICAL: -t must be placed BEFORE -f flv and output URL
  // This limits the OUTPUT duration correctly
  if (durationSeconds && durationSeconds > 0) {
    args.push('-t', durationSeconds.toString());
    console.log(`[StreamingService] Video-only: duration limit set to ${durationSeconds} seconds (${durationSeconds / 60} minutes)`);
  }
  
  args.push('-f', 'flv');
  args.push(rtmpUrl);
  console.log('[StreamingService] Video-only: minimal copy');
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
    
    // If this is a reconnect, calculate remaining duration for FFmpeg -t parameter
    let durationOverrideSeconds = null;
    const reconnecting = isReconnect(streamId);
    if (reconnecting) {
      const remainingMs = getOriginalRemainingMs(streamId);
      if (remainingMs !== null && remainingMs > 0) {
        durationOverrideSeconds = Math.ceil(remainingMs / 1000);
        console.log(`[StreamingService] RECONNECT: FFmpeg will use remaining duration: ${(remainingMs / 60000).toFixed(1)} minutes`);
      } else if (remainingMs !== null && remainingMs <= 0) {
        // Duration already exceeded - don't start
        console.log(`[StreamingService] RECONNECT: Duration already exceeded for stream ${streamId}, not starting`);
        clearOriginalTiming(streamId);
        return { success: false, error: 'Stream duration already exceeded' };
      }
    }
    
    const ffmpegArgs = await buildFFmpegArgs(stream, durationOverrideSeconds);
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
    let earlyStderrBuffer = '';

    ffmpegProcess.stderr.on('data', (data) => {
      if (!streamConfirmed) {
        earlyStderrBuffer = `${earlyStderrBuffer}${data.toString()}`.slice(-1500);
      }
    });

    // Set up early exit detection
    const earlyExitPromise = new Promise((resolve) => {
      ffmpegProcess.once('exit', (code, signal) => {
        if (!streamConfirmed) {
          const stderrDetails = earlyStderrBuffer.trim();
          earlyExitError = `FFmpeg exited early with code ${code}, signal: ${signal}${stderrDetails ? `: ${stderrDetails}` : ''}`;
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
      streamPids.delete(streamId);
      return { success: false, error: earlyExitError || 'FFmpeg failed to start' };
    }
    
    // FFmpeg is confirmed running, now update status
    activeStreams.set(streamId, ffmpegProcess);
    // Track PID for process health monitoring
    if (ffmpegProcess.pid) {
      streamPids.set(streamId, ffmpegProcess.pid);
      console.log(`[StreamingService] Stream ${streamId} PID: ${ffmpegProcess.pid}`);
    }
    await Stream.updateStatus(streamId, 'live', stream.user_id, { 
      startTimeOverride: reconnecting ? null : startTimeIso,
      preserveStartTime: reconnecting
    });
    console.log(`[StreamingService] Stream ${streamId} confirmed running, status updated to live${reconnecting ? ' (reconnect - preserving original start_time)' : ''}`);
    
    // CRITICAL: Set duration tracking for automatic termination
    // Check if this is a RECONNECT (original timing preserved from first start)
    
    if (reconnecting) {
      // RECONNECT: Use remaining duration based on original start time
      const remainingMs = getOriginalRemainingMs(streamId);
      if (remainingMs !== null && remainingMs > 0) {
        setDurationInfo(streamId, streamStartTime, remainingMs);
        console.log(`[StreamingService] RECONNECT: Duration tracking set for stream ${streamId}: ${(remainingMs / 60000).toFixed(1)} minutes remaining`);
        addStreamLog(streamId, `Reconnect: ${(remainingMs / 60000).toFixed(1)} minutes remaining from original duration`);
      } else if (remainingMs !== null && remainingMs <= 0) {
        // Duration already exceeded during reconnect delay - stop immediately
        console.log(`[StreamingService] RECONNECT: Stream ${streamId} duration already exceeded, will stop`);
        addStreamLog(streamId, `Reconnect: duration already exceeded, stopping`);
        clearOriginalTiming(streamId);
      } else {
        console.log(`[StreamingService] RECONNECT: No duration limit for stream ${streamId} - will run indefinitely`);
        addStreamLog(streamId, `Reconnect: no duration set - stream will run indefinitely`);
      }
    } else {
      // FIRST START: Use full configured duration and save original timing
      if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
        const durationMs = stream.stream_duration_minutes * 60 * 1000;
        setDurationInfo(streamId, streamStartTime, durationMs);
        setOriginalTiming(streamId, streamStartTime, durationMs);
        console.log(`[StreamingService] Duration tracking set for stream ${streamId}: ${stream.stream_duration_minutes} minutes (${durationMs}ms)`);
        addStreamLog(streamId, `Duration tracking set: ${stream.stream_duration_minutes} minutes`);
      } else {
        // Fallback to calculated duration from durationCalculator
        const durationSeconds = calculateDurationSeconds(stream);
        if (durationSeconds && durationSeconds > 0) {
          const durationMs = durationSeconds * 1000;
          setDurationInfo(streamId, streamStartTime, durationMs);
          setOriginalTiming(streamId, streamStartTime, durationMs);
          console.log(`[StreamingService] Duration tracking set for stream ${streamId}: ${durationSeconds / 60} minutes (${durationMs}ms) [calculated]`);
          addStreamLog(streamId, `Duration tracking set: ${durationSeconds / 60} minutes (calculated)`);
        } else {
          console.log(`[StreamingService] No duration set for stream ${streamId} - will run indefinitely`);
          addStreamLog(streamId, `No duration set - stream will run indefinitely`);
        }
      }
    }
    
    // Start YouTube status sync if platform is YouTube
    if (stream.platform === 'YouTube' && stream.stream_key) {
      try {
        youtubeStatusSync.setStreamingService(module.exports);
        youtubeStatusSync.setRTMPHealthMonitor(rtmpHealthMonitor);
        await youtubeStatusSync.startMonitoring(streamId, stream.user_id, stream.stream_key);
      } catch (ytErr) {
        console.log(`[StreamingService] YouTube status sync not started: ${ytErr.message}`);
        // Continue without sync - not critical
      }
    }
    
    // Start RTMP health monitoring for auto-reconnect
    // This ensures the stream stays connected for the full duration
    try {
      rtmpHealthMonitor.setStreamingService(module.exports);
      // For reconnect, use remaining duration; for first start, use full duration
      let durationForMonitor;
      const streamIsUnlimited = isUnlimitedStream(stream);
      
      if (reconnecting) {
        const remainingMs = getOriginalRemainingMs(streamId);
        durationForMonitor = remainingMs;
      } else {
        durationForMonitor = stream.stream_duration_minutes 
          ? stream.stream_duration_minutes * 60 * 1000 
          : (calculateDurationSeconds(stream) ? calculateDurationSeconds(stream) * 1000 : null);
      }
      
      // Pass isUnlimited flag for enhanced monitoring
      rtmpHealthMonitor.startMonitoring(streamId, streamStartTime, durationForMonitor, streamIsUnlimited);
      console.log(`[StreamingService] RTMP health monitoring started for stream ${streamId}${streamIsUnlimited ? ' (UNLIMITED MODE)' : ''}`);
    } catch (healthErr) {
      console.log(`[StreamingService] RTMP health monitor not started: ${healthErr.message}`);
      // Continue without health monitoring - not critical
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
        
        // Detect RTMP connection errors that might cause YouTube to disconnect
        const connectionErrors = [
          'Connection refused',
          'Connection timed out',
          'Connection reset',
          'Broken pipe',
          'RTMP_Connect',
          'RTMP_ReadPacket',
          'Server error',
          'Failed to connect'
        ];
        
        const hasConnectionError = connectionErrors.some(err => 
          message.toLowerCase().includes(err.toLowerCase())
        );
        
        if (hasConnectionError) {
          console.error(`[StreamingService] RTMP connection error detected for stream ${streamId}: ${message}`);
          addStreamLog(streamId, `[WARNING] RTMP connection error detected - may need reconnect`);
        }
      }
    });
    ffmpegProcess.on('exit', async (code, signal) => {
      addStreamLog(streamId, `Stream ended with code ${code}, signal: ${signal}`);
      console.log(`[FFMPEG_EXIT] ${streamId}: Code=${code}, Signal=${signal}`);
      const wasActive = activeStreams.delete(streamId);
      streamPids.delete(streamId); // Clean up PID tracking
      
      // Stop RTMP health monitoring on exit
      rtmpHealthMonitor.stopMonitoring(streamId);
      
      const isManualStop = manuallyStoppingStreams.has(streamId);
      
      // Check if duration was exceeded - if so, this is a normal termination
      const durationExceeded = isStreamDurationExceeded(streamId);
      if (durationExceeded) {
        console.log(`[StreamingService] Stream ${streamId} stop reason: duration reached`);
        addStreamLog(streamId, `Stream stop reason: duration reached`);
        clearDurationInfo(streamId);
        clearOriginalTiming(streamId);
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
        clearOriginalTiming(streamId);
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
      
      // Decide whether the stream should keep running after this (unexpected) exit.
      // The user wants the actual end-live time to match the duration they configured,
      // so ANY early exit (clean or error) must reconnect while time still remains.
      const remainingTime = getRemainingTime(streamId);
      const streamData = await Stream.findById(streamId);
      const isUnlimited = isUnlimitedStream(streamData);

      // Authoritative remaining time: anchored to the ORIGINAL start time + full
      // configured duration, so it stays correct across multiple reconnect cycles.
      // Falls back to the live duration-info value if original timing isn't tracked.
      const originalRemainingMs = getOriginalRemainingMs(streamId);
      const effectiveRemainingMs = (originalRemainingMs !== null) ? originalRemainingMs : remainingTime;

      // Below this we treat the stream as genuinely finished. Reconnecting in the final
      // seconds adds no value and risks a connect/disconnect flap right at the end.
      const RECONNECT_MIN_REMAINING_MS = 15000; // 15 seconds

      // Keep running if unlimited, or if a finite duration still has meaningful time left.
      const streamShouldKeepRunning = isUnlimited
        || (effectiveRemainingMs !== null && effectiveRemainingMs > RECONNECT_MIN_REMAINING_MS);

      // Legacy flag used by the SIGSEGV / error branches below.
      const shouldNotRestart = !streamShouldKeepRunning;
      
      if (signal === 'SIGSEGV') {
        if (shouldNotRestart) {
          console.log(`[StreamingService] Stream ${streamId} crashed but duration almost reached (${remainingTime}ms remaining) - NOT restarting`);
          addStreamLog(streamId, `Stream crashed but duration almost reached - not restarting`);
          clearDurationInfo(streamId);
          clearOriginalTiming(streamId);
          if (wasActive) {
            try {
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
        const maxRetries = getMaxRetryAttempts(streamData);
        if (retryCount < maxRetries) {
          streamRetryCount.set(streamId, retryCount + 1);
          console.log(`[StreamingService] FFmpeg crashed with SIGSEGV. Attempting restart #${retryCount + 1}${isUnlimited ? ' (unlimited mode)' : ''} for stream ${streamId}`);
          addStreamLog(streamId, `FFmpeg crashed with SIGSEGV. Attempting restart #${retryCount + 1}${isUnlimited ? ' (unlimited mode)' : ''}`);
          // Clear duration info before restart - it will be recalculated
          clearDurationInfo(streamId);
          
          // For unlimited streams, use exponential backoff
          const backoffDelay = isUnlimited 
            ? Math.min(3000 + (retryCount * 2000), 30000) 
            : 3000;
          
          setTimeout(async () => {
            try {
              const streamInfo = await Stream.findById(streamId);
              if (streamInfo) {
                const result = await startStream(streamId);
                if (result.success) {
                  streamRetryCount.set(streamId, 0); // Reset on success
                } else {
                  console.error(`[StreamingService] Failed to restart stream: ${result.error}`);
                  // Only update status if not unlimited or max retries reached
                  if (!isUnlimitedStream(streamInfo) || (streamRetryCount.get(streamId) || 0) >= getMaxRetryAttempts(streamInfo)) {
                    const newStatus = getStatusAfterStreamEnd(streamInfo);
                    await Stream.updateStatus(streamId, newStatus);
                  }
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
          clearOriginalTiming(streamId);
        }
      }
      else {
        let errorMessage = '';
        if (code !== 0 && code !== null) {
          // Check if we should not restart due to duration (already calculated above with streamData)
          if (shouldNotRestart) {
            console.log(`[StreamingService] Stream ${streamId} exited with error but duration almost reached - NOT restarting`);
            addStreamLog(streamId, `Stream exited with error but duration almost reached - not restarting`);
            clearDurationInfo(streamId);
            clearOriginalTiming(streamId);
            if (wasActive) {
              try {
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
          const maxRetries = getMaxRetryAttempts(streamData);
          if (retryCount < maxRetries) {
            streamRetryCount.set(streamId, retryCount + 1);
            console.log(`[StreamingService] FFmpeg exited with code ${code}. Attempting restart #${retryCount + 1}${isUnlimited ? ' (unlimited mode)' : ''} for stream ${streamId}`);
            // Clear duration info before restart
            clearDurationInfo(streamId);
            
            // For unlimited streams, use exponential backoff
            const backoffDelay = isUnlimited 
              ? Math.min(3000 + (retryCount * 2000), 30000) 
              : 3000;
            
            setTimeout(async () => {
              try {
                const streamInfo = await Stream.findById(streamId);
                if (streamInfo) {
                  const result = await startStream(streamId);
                  if (result.success) {
                    streamRetryCount.set(streamId, 0); // Reset on success
                  } else {
                    console.error(`[StreamingService] Failed to restart stream: ${result.error}`);
                    // Only update status if not unlimited or max retries reached
                    if (!isUnlimitedStream(streamInfo) || (streamRetryCount.get(streamId) || 0) >= getMaxRetryAttempts(streamInfo)) {
                      const newStatus = getStatusAfterStreamEnd(streamInfo);
                      await Stream.updateStatus(streamId, newStatus);
                    }
                  }
                }
              } catch (error) {
                console.error(`[StreamingService] Error during stream restart: ${error.message}`);
                // For unlimited streams, don't immediately set offline
                const streamCheck = await Stream.findById(streamId).catch(() => null);
                if (!isUnlimitedStream(streamCheck)) {
                  await Stream.updateStatus(streamId, 'offline');
                }
              }
            }, backoffDelay);
            return;
          }
        }
        
        // Normal exit (code 0). FFmpeg's -t makes it exit 0 exactly when the configured
        // duration is reached (that genuine end is already handled by the durationExceeded
        // check at the top of this handler). If we reach here with code 0 but the stream
        // SHOULD still be running, FFmpeg stopped early (RTMP/YouTube closed the connection,
        // input read ended, a -stream_loop boundary glitch, etc.). We MUST reconnect so the
        // real end-live time matches the duration the user configured. This applies to BOTH
        // unlimited streams AND timed streams (Once/Daily/Weekly) that still have time left.
        if (code === 0 && streamShouldKeepRunning) {
          const retryCount = streamRetryCount.get(streamId) || 0;
          const maxRetries = getMaxRetryAttempts(streamData);
          if (retryCount < maxRetries) {
            streamRetryCount.set(streamId, retryCount + 1);
            const remainingLabel = isUnlimited
              ? 'unlimited'
              : `${(effectiveRemainingMs / 60000).toFixed(1)} min remaining`;
            console.log(`[StreamingService] Stream ${streamId} exited early (code 0) but should keep running (${remainingLabel}). Reconnecting #${retryCount + 1}...`);
            addStreamLog(streamId, `Stopped early (code 0) but ${remainingLabel} - auto-reconnecting #${retryCount + 1}`);
            // Preserve original timing so the reconnect uses the correct remaining duration.
            clearDurationInfo(streamId);
            const backoffDelay = isUnlimited
              ? Math.min(3000 + (retryCount * 2000), 30000)
              : 3000;
            setTimeout(async () => {
              try {
                const streamInfo = await Stream.findById(streamId);
                if (streamInfo && streamInfo.status === 'live') {
                  const result = await startStream(streamId);
                  if (result.success) {
                    console.log(`[StreamingService] Stream ${streamId} reconnected successfully after early exit`);
                    streamRetryCount.set(streamId, 0);
                  } else {
                    console.error(`[StreamingService] Failed to reconnect stream ${streamId} after early exit: ${result.error}`);
                    // Give up only after exhausting the consecutive-failure budget.
                    if ((streamRetryCount.get(streamId) || 0) >= getMaxRetryAttempts(streamInfo)) {
                      const newStatus = getStatusAfterStreamEnd(streamInfo);
                      await Stream.updateStatus(streamId, newStatus, streamInfo.user_id);
                      clearOriginalTiming(streamId);
                    }
                  }
                } else {
                  // No longer live (e.g. manually stopped meanwhile) - clean up timing.
                  clearOriginalTiming(streamId);
                }
              } catch (error) {
                console.error(`[StreamingService] Error reconnecting stream ${streamId} after early exit: ${error.message}`);
              }
            }, backoffDelay);
            return;
          }
          console.error(`[StreamingService] Stream ${streamId} exited early (code 0) but max reconnect attempts (${maxRetries}) reached - giving up`);
          addStreamLog(streamId, `Max reconnect attempts reached after early exit, stopping`);
        }
        
        if (code === 0) {
          console.log(`[StreamingService] Stream ${streamId} ended normally with exit code 0`);
          addStreamLog(streamId, `Stream ended normally`);
        }
        
        clearDurationInfo(streamId);
        clearOriginalTiming(streamId);
        if (wasActive) {
          try {
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
      streamPids.delete(streamId); // Clean up PID tracking
      clearDurationInfo(streamId); // Clean up duration tracking
      clearOriginalTiming(streamId); // Clean up original timing
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
    // Duration tracking was already set up above (reconnect-aware).
    // This section handles the scheduler termination backup.
    const now = Date.now();
    let durationSeconds = null;
    let durationMs = null;
    
    if (reconnecting) {
      // For reconnect, use remaining time
      const remainingMs = getOriginalRemainingMs(streamId);
      if (remainingMs !== null && remainingMs > 0) {
        durationMs = remainingMs;
        durationSeconds = Math.ceil(remainingMs / 1000);
        console.log(`[StreamingService] Stream ${streamId} reconnect duration: ${(remainingMs / 60000).toFixed(1)} minutes remaining`);
      }
    } else {
      // For first start, use configured duration
      if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
        durationSeconds = stream.stream_duration_minutes * 60;
        console.log(`[StreamingService] Using stream_duration_minutes: ${stream.stream_duration_minutes} minutes (${durationSeconds} seconds)`);
      } else {
        durationSeconds = calculateDurationSeconds(stream);
      }
      durationMs = durationSeconds ? durationSeconds * 1000 : null;
    }
    
    // Log all duration-related fields for debugging
    console.log(`[StreamingService] Stream ${streamId} duration fields: stream_duration_minutes=${stream.stream_duration_minutes}, schedule_time=${stream.schedule_time}, end_time=${stream.end_time}, duration=${stream.duration}`);
    console.log(`[StreamingService] Stream ${streamId} effective duration: ${durationSeconds ? formatDuration(durationSeconds) : 'not set (unlimited)'}`);
    
    // Schedule stream termination based on duration
    // FIXED: No buffer added - FFmpeg -t parameter handles exact duration
    // The scheduler termination is a backup in case FFmpeg -t fails
    if (typeof schedulerService !== 'undefined' && durationMs && durationMs > 0) {
      const shouldEndAt = new Date(streamStartTime.getTime() + durationMs);
      const remainingMs = Math.max(0, shouldEndAt.getTime() - now);
      const remainingMinutes = remainingMs / 60000;
      
      console.log(`[StreamingService] Scheduling termination for stream ${streamId} at ${shouldEndAt.toISOString()} (${remainingMinutes.toFixed(2)} minutes exact)`);
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
    
    // Stop RTMP health monitoring
    rtmpHealthMonitor.stopMonitoring(streamId);
    
    const ffmpegProcess = activeStreams.get(streamId);
    const isActive = ffmpegProcess !== undefined;
    console.log(`[StreamingService] Stop request for stream ${streamId}, isActive: ${isActive}`);
    
    // Get stream info first - we need it for both active and inactive cases
    const stream = await Stream.findById(streamId);
    
    if (!isActive) {
      if (stream && stream.status === 'live') {
        console.log(`[StreamingService] Stream ${streamId} not active in memory but status is 'live' in DB.`);
        
        // CRITICAL FIX: Try to kill any FFmpeg process streaming to this key
        // This handles cases where app restarted but FFmpeg is still running
        if (stream.stream_key) {
          const killed = await killFFmpegByStreamKey(stream.stream_key);
          if (killed) {
            console.log(`[StreamingService] Successfully killed FFmpeg process for stream key: ${stream.stream_key.substring(0, 8)}...`);
          } else {
            console.log(`[StreamingService] No FFmpeg process found for stream key (may have already stopped)`);
          }
        }
        
        // FIXED: Use correct status based on schedule type
        const newStatus = getStatusAfterStreamEnd(stream);
        await Stream.updateStatus(streamId, newStatus, stream.user_id);
        // Clean up duration tracking
        clearDurationInfo(streamId);
        clearOriginalTiming(streamId);
        if (typeof schedulerService !== 'undefined' && schedulerService.cancelStreamTermination) {
          schedulerService.handleStreamStopped(streamId);
        }
        
        // Save history
        const updatedStream = await Stream.findById(streamId);
        await saveStreamHistory(updatedStream);
        
        // Handle unlist replay on end for YouTube streams
        await handleUnlistReplayOnEnd(stream);
        
        return { success: true, message: 'Stream stopped (was not in memory but FFmpeg killed if running)' };
      }
      return { success: false, error: 'Stream is not active' };
    }
    addStreamLog(streamId, 'Stopping stream...');
    console.log(`[StreamingService] Stopping active stream ${streamId}`);
    manuallyStoppingStreams.add(streamId);
    try {
      ffmpegProcess.kill('SIGTERM');
      
      // Wait a bit and force kill if still running
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!ffmpegProcess.killed) {
        console.log(`[StreamingService] FFmpeg didn't respond to SIGTERM, sending SIGKILL`);
        ffmpegProcess.kill('SIGKILL');
      }
    } catch (killError) {
      console.error(`[StreamingService] Error killing FFmpeg process: ${killError.message}`);
      manuallyStoppingStreams.delete(streamId);
      
      // Fallback: try to kill by stream key
      if (stream && stream.stream_key) {
        await killFFmpegByStreamKey(stream.stream_key);
      }
    }
    activeStreams.delete(streamId);
    streamPids.delete(streamId); // Clean up PID tracking
    
    // Clean up duration tracking
    clearDurationInfo(streamId);
    clearOriginalTiming(streamId);
    
    const tempConcatFile = path.join(__dirname, '..', 'temp', `playlist_${streamId}.txt`);
    const tempAudioConcatFile = path.join(__dirname, '..', 'temp', `playlist_${streamId}_audio.txt`);
    const tempMergedAudioFile = path.join(__dirname, '..', 'temp', `playlist_${streamId}_audio_merged.m4a`);
    try {
      if (fs.existsSync(tempConcatFile)) {
        fs.unlinkSync(tempConcatFile);
        console.log(`[StreamingService] Cleaned up temporary playlist file: ${tempConcatFile}`);
      }
      if (fs.existsSync(tempAudioConcatFile)) {
        fs.unlinkSync(tempAudioConcatFile);
        console.log(`[StreamingService] Cleaned up temporary playlist audio file: ${tempAudioConcatFile}`);
      }
      if (fs.existsSync(tempMergedAudioFile)) {
        fs.unlinkSync(tempMergedAudioFile);
        console.log(`[StreamingService] Cleaned up merged playlist audio file: ${tempMergedAudioFile}`);
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
      
      // Handle unlist replay on end for YouTube streams
      await handleUnlistReplayOnEnd(stream);
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

/**
 * Kill FFmpeg process by stream key
 * This is used when the process is not tracked in memory (e.g., after app restart)
 * @param {string} streamKey - The stream key to search for
 * @returns {Promise<boolean>} True if a process was killed
 */
async function killFFmpegByStreamKey(streamKey) {
  if (!streamKey) return false;
  
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // On Windows, use wmic to find and kill FFmpeg processes with this stream key
      exec(`wmic process where "name='ffmpeg.exe'" get processid,commandline /format:csv`, { timeout: 10000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve(false);
          return;
        }
        
        // Parse CSV output to find PIDs with matching stream key
        const lines = stdout.split('\n').filter(line => line.includes(streamKey));
        if (lines.length === 0) {
          resolve(false);
          return;
        }
        
        // Extract PIDs and kill them
        let killed = false;
        for (const line of lines) {
          const parts = line.split(',');
          const pid = parts[parts.length - 1]?.trim();
          if (pid && /^\d+$/.test(pid)) {
            try {
              exec(`taskkill /F /PID ${pid}`, (killErr) => {
                if (!killErr) {
                  console.log(`[StreamingService] Killed FFmpeg process PID ${pid}`);
                  killed = true;
                }
              });
            } catch (e) {
              // Ignore kill errors
            }
          }
        }
        
        // Wait a bit for kills to complete
        setTimeout(() => resolve(killed), 1000);
      });
    } else {
      // On Linux/Mac, use pkill with pattern matching
      exec(`pkill -f "ffmpeg.*${streamKey}"`, { timeout: 5000 }, (err) => {
        // pkill returns 0 if processes were killed, 1 if no processes matched
        resolve(!err);
      });
    }
  });
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
            streamPids.delete(streamId); // Clean up PID tracking
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

// Process health check runs every 30 seconds to detect dead FFmpeg processes
// This catches cases where FFmpeg dies without triggering exit event
// Status is now managed by:
// 1. startStream() - sets to 'live'
// 2. stopStream() - sets to 'offline' or 'scheduled'
// 3. FFmpeg exit event - handles normal exits
// 4. checkStreamProcessHealth() - catches zombie/dead processes
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

/**
 * Get RTMP health monitor status for a stream
 * @param {string} streamId - Stream ID
 * @returns {Object|null}
 */
function getRTMPHealthStatus(streamId) {
  return rtmpHealthMonitor.getMonitorStatus(streamId);
}

/**
 * Check if a stream is being monitored for RTMP health
 * @param {string} streamId - Stream ID
 * @returns {boolean}
 */
function isRTMPHealthMonitored(streamId) {
  return rtmpHealthMonitor.isMonitoring(streamId);
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
  // Unlimited stream detection
  isUnlimitedStream,
  getMaxRetryAttempts,
  // YouTube status sync exports
  getYouTubeStatus,
  isYouTubeMonitored,
  // RTMP health monitor exports
  getRTMPHealthStatus,
  isRTMPHealthMonitored,
  // Shutdown function for graceful cleanup
  shutdown,
  // Export for testing
  buildFFmpegArgsWithAudio,
  buildFFmpegArgsVideoOnly
};
