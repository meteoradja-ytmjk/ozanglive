const Stream = require('../models/Stream');
const { parseScheduleDays } = require('../utils/scheduleValidator');
const { calculateDurationSeconds, formatDuration } = require('../utils/durationCalculator');
const { getWIBTime } = require('../utils/wibTime');

const scheduledTerminations = new Map();
const recentlyTriggeredStreams = new Map(); // Track recently triggered recurring streams
const SCHEDULE_LOOKAHEAD_SECONDS = 30; // Look ahead 30 seconds for upcoming starts
const RECURRING_CHECK_INTERVAL = 30 * 1000; // Check recurring schedules every 30 seconds (per-minute precision)
const ONCE_SCHEDULE_CHECK_INTERVAL = 30 * 1000; // Check one-time schedules every 30 seconds
const TRIGGER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minute cooldown to prevent double triggers within same window
const DURATION_CHECK_INTERVAL = 10 * 1000; // Check durations every 10 seconds for ACCURATE stop (was 30s)
const FORCE_STOP_BUFFER_MS = 30 * 1000; // 30 seconds buffer for force stop
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // Clean up stale entries every 6 hours

// RACE CONDITION FIX: Mutex to prevent concurrent stream starts
const startingStreams = new Set(); // Track streams currently being started

let streamingService = null;
let initialized = false;
let scheduleIntervalId = null;
let durationIntervalId = null;
let recurringIntervalId = null;
let cleanupIntervalId = null;

/**
 * Acquire lock for starting a stream (prevents race conditions)
 * @param {string} streamId - Stream ID
 * @returns {boolean} True if lock acquired, false if already locked
 */
function acquireStartLock(streamId) {
  if (startingStreams.has(streamId)) {
    return false; // Already being started
  }
  startingStreams.add(streamId);
  return true;
}

/**
 * Release lock for starting a stream
 * @param {string} streamId - Stream ID
 */
function releaseStartLock(streamId) {
  startingStreams.delete(streamId);
}

/**
 * Check if stream is currently being started
 * @param {string} streamId - Stream ID
 * @returns {boolean}
 */
function isStarting(streamId) {
  return startingStreams.has(streamId);
}

function init(streamingServiceInstance) {
  if (initialized) {
    console.log('Stream scheduler already initialized');
    return;
  }
  streamingService = streamingServiceInstance;
  initialized = true;
  console.log('[Scheduler] Stream scheduler initialized (WIB-based, 10s duration check for accuracy)');
  
  // Wrap interval callbacks with error handling to prevent crashes
  const safeCheckScheduledStreams = async () => {
    try {
      await checkScheduledStreams();
    } catch (error) {
      console.error('[Scheduler] Error in checkScheduledStreams interval:', error.message);
    }
  };
  
  const safeCheckStreamDurations = async () => {
    try {
      await checkStreamDurations();
    } catch (error) {
      console.error('[Scheduler] Error in checkStreamDurations interval:', error.message);
    }
  };
  
  const safeCheckRecurringSchedules = async () => {
    try {
      await checkRecurringSchedules();
    } catch (error) {
      console.error('[Scheduler] Error in checkRecurringSchedules interval:', error.message);
    }
  };
  
  // Schedule checks - balanced for accuracy and RAM
  scheduleIntervalId = setInterval(safeCheckScheduledStreams, ONCE_SCHEDULE_CHECK_INTERVAL);
  durationIntervalId = setInterval(safeCheckStreamDurations, DURATION_CHECK_INTERVAL);
  recurringIntervalId = setInterval(safeCheckRecurringSchedules, RECURRING_CHECK_INTERVAL);
  
  // MEMORY MANAGEMENT: Cleanup stale entries from Maps
  cleanupIntervalId = setInterval(cleanupStaleMaps, CLEANUP_INTERVAL);
  
  // Initial checks with error handling (run immediately on startup)
  safeCheckScheduledStreams();
  safeCheckStreamDurations();
  safeCheckRecurringSchedules();
}

 /**
 * Stop all interval timers and free resources.
 * Useful for graceful shutdown / unit tests.
 */
function shutdown() {
  if (scheduleIntervalId) clearInterval(scheduleIntervalId);
  if (durationIntervalId) clearInterval(durationIntervalId);
  if (recurringIntervalId) clearInterval(recurringIntervalId);
  if (cleanupIntervalId) clearInterval(cleanupIntervalId);
  scheduleIntervalId = durationIntervalId = recurringIntervalId = cleanupIntervalId = null;
  // Clear pending termination timeouts
  for (const timeoutId of scheduledTerminations.values()) {
    try { clearTimeout(timeoutId); } catch (_) { /* noop */ }
  }
  scheduledTerminations.clear();
  recentlyTriggeredStreams.clear();
  startingStreams.clear(); // Clear mutex state
  initialized = false;
}

/**
 * Clean up stale entries from Maps to prevent memory leaks
 */
function cleanupStaleMaps() {
  try {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean recentlyTriggeredStreams - remove entries older than 2x cooldown
    const maxAge = TRIGGER_COOLDOWN_MS * 2;
    for (const [streamId, timestamp] of recentlyTriggeredStreams) {
      if (now - timestamp > maxAge) {
        recentlyTriggeredStreams.delete(streamId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Scheduler] Cleaned ${cleaned} stale entries from recentlyTriggeredStreams`);
    }
  } catch (error) {
    console.error('[Scheduler] Error during cleanup:', error.message);
  }
}
async function checkScheduledStreams() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    const now = new Date();
    const lookAheadTime = new Date(now.getTime() + SCHEDULE_LOOKAHEAD_SECONDS * 1000);
    
    let streams = [];
    try {
      streams = await Stream.findScheduledInRange(now, lookAheadTime);
    } catch (dbError) {
      console.error('[Scheduler] Database error finding scheduled streams:', dbError.message);
      return; // Don't crash, just skip this check
    }
    
    if (streams.length === 0) return; // Hot path: no work, exit silently

    console.log(`[Scheduler] Found ${streams.length} 'once' streams in trigger window`);
    for (const stream of streams) {
      try {
        // RACE CONDITION FIX: Try to acquire lock before starting
        if (isStarting(stream.id)) {
          console.log(`[Scheduler] Stream ${stream.id} is already being started, skipping`);
          continue;
        }
        
        // Skip if recently triggered to prevent double starts
        if (wasRecentlyTriggered(stream.id)) {
          continue;
        }

        // Defensive: skip if already live (race protection)
        if (stream.status === 'live') {
          continue;
        }

        // Defensive: skip if already started before (start_time set)
        if (stream.start_time) {
          continue;
        }

        const scheduleTime = new Date(stream.schedule_time);
        const timeDiffMs = now.getTime() - scheduleTime.getTime();

        // CRITICAL: Only start AT or AFTER the scheduled time.
        // Allow at most 30 seconds early to compensate for the 30s polling interval.
        if (timeDiffMs < -30000) {
          continue; // not yet
        }

        const timeDiffMinutes = (timeDiffMs / 60000).toFixed(2);
        console.log(`[Scheduler] >>> START ONCE: ${stream.id} "${stream.title}" (scheduled=${stream.schedule_time}, diff=${timeDiffMinutes}min)`);

        // RACE CONDITION FIX: Acquire lock before starting
        if (!acquireStartLock(stream.id)) {
          console.log(`[Scheduler] Failed to acquire start lock for stream ${stream.id}, skipping`);
          continue;
        }

        // Mark as triggered BEFORE starting to be safe against re-entry
        markAsTriggered(stream.id);

        try {
          const result = await streamingService.startStream(stream.id);
          if (result.success) {
            console.log(`[Scheduler] >>> Started ONCE stream ${stream.id}`);
          } else {
            console.error(`[Scheduler] >>> Failed to start ONCE stream ${stream.id}: ${result.error}`);
            // Allow retry on next tick
            recentlyTriggeredStreams.delete(stream.id);
          }
        } finally {
          // RACE CONDITION FIX: Always release lock
          releaseStartLock(stream.id);
        }

        // Small delay between starts to avoid burst CPU
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (streamError) {
        console.error(`[Scheduler] Error processing stream ${stream.id}:`, streamError.message);
        // Release lock on error
        releaseStartLock(stream.id);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled streams:', error.message);
  }
}
async function checkStreamDurations() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    
    let liveStreams = [];
    try {
      liveStreams = await Stream.findAll(null, 'live');
    } catch (dbError) {
      console.error('[Scheduler] Database error finding live streams:', dbError.message);
      return; // Don't crash, just skip this check
    }
    
    const now = new Date();
    
    // OPTIMIZED: Only log when there are streams to check
    if (liveStreams.length === 0) {
      return; // No live streams, skip entirely
    }
    
    console.log(`[Scheduler] Checking durations for ${liveStreams.length} live stream(s)...`);
    
    for (const stream of liveStreams) {
      try {
        let shouldEndAt = null;

        // CRITICAL: Use actual start_time, not schedule_time for end time calculation
        if (!stream.start_time) {
          console.log(`[Scheduler] Stream ${stream.id} "${stream.title}" has no start_time - skipping duration check`);
          continue; // Skip - no start_time
        }

        const actualStartTime = new Date(stream.start_time);
        
        // Validate start_time is a valid date
        if (isNaN(actualStartTime.getTime())) {
          console.error(`[Scheduler] Stream ${stream.id} has invalid start_time: ${stream.start_time}`);
          continue;
        }
        
        // Use centralized duration calculator for consistent priority
        let durationSeconds = null;
        
        // Priority 1: stream_duration_minutes (most reliable for recurring streams)
        if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
          durationSeconds = stream.stream_duration_minutes * 60;
          console.log(`[Scheduler] Stream ${stream.id} "${stream.title}" duration: ${stream.stream_duration_minutes} minutes (${durationSeconds} seconds)`);
        } else {
          // Fallback to centralized calculator for other cases
          durationSeconds = calculateDurationSeconds(stream);
          if (durationSeconds) {
            console.log(`[Scheduler] Stream ${stream.id} "${stream.title}" duration (calculated): ${(durationSeconds / 60).toFixed(1)} minutes`);
          }
        }
        
        if (durationSeconds && durationSeconds > 0) {
          const durationMs = durationSeconds * 1000;
          shouldEndAt = new Date(actualStartTime.getTime() + durationMs);
          
          // Log detailed timing information
          const elapsed = now.getTime() - actualStartTime.getTime();
          const elapsedMinutes = elapsed / 60000;
          const remaining = shouldEndAt.getTime() - now.getTime();
          const remainingMinutes = remaining / 60000;
          
          console.log(`[Scheduler] Stream ${stream.id} "${stream.title}" timing:`);
          console.log(`  - Started: ${actualStartTime.toISOString()}`);
          console.log(`  - Should end: ${shouldEndAt.toISOString()}`);
          console.log(`  - Elapsed: ${elapsedMinutes.toFixed(2)} minutes`);
          console.log(`  - Remaining: ${remainingMinutes.toFixed(2)} minutes`);
        } else {
          console.log(`[Scheduler] Stream ${stream.id} "${stream.title}" has no duration limit - will run indefinitely`);
        }

        // If we have an end time, check if we need to take action
        if (shouldEndAt) {
          const timeOverdue = now.getTime() - shouldEndAt.getTime();
          const timeOverdueMinutes = timeOverdue / 60000;
          
          // FORCE STOP: If stream exceeds duration by more than 30 seconds, force stop immediately
          if (timeOverdue > FORCE_STOP_BUFFER_MS) {
            console.log(`[Scheduler] ⚠️ FORCE STOP: Stream ${stream.id} "${stream.title}" exceeded duration by ${timeOverdueMinutes.toFixed(1)} min`);
            console.log(`[Scheduler]   - Configured duration: ${stream.stream_duration_minutes} minutes`);
            console.log(`[Scheduler]   - Started: ${actualStartTime.toISOString()}`);
            console.log(`[Scheduler]   - Should have ended: ${shouldEndAt.toISOString()}`);
            console.log(`[Scheduler]   - Current time: ${now.toISOString()}`);
            try {
              await streamingService.stopStream(stream.id);
              cancelStreamTermination(stream.id);
              console.log(`[Scheduler] ✅ Stream ${stream.id} force stopped successfully`);
            } catch (stopError) {
              console.error(`[Scheduler] ❌ Error force stopping stream ${stream.id}:`, stopError.message);
            }
            continue;
          }
          
          // If stream has exceeded end time (within buffer), stop it immediately
          if (timeOverdue >= 0) {
            console.log(`[Scheduler] ⏰ Stopping stream ${stream.id} "${stream.title}" - duration reached`);
            console.log(`[Scheduler]   - Configured duration: ${stream.stream_duration_minutes} minutes`);
            console.log(`[Scheduler]   - Started: ${actualStartTime.toISOString()}`);
            console.log(`[Scheduler]   - Ended: ${now.toISOString()}`);
            try {
              await streamingService.stopStream(stream.id);
              cancelStreamTermination(stream.id);
              console.log(`[Scheduler] ✅ Stream ${stream.id} stopped successfully at correct time`);
            } catch (stopError) {
              console.error(`[Scheduler] ❌ Error stopping stream ${stream.id}:`, stopError.message);
            }
            continue;
          }
          
          // If no scheduled termination exists, create one (silently)
          if (!scheduledTerminations.has(stream.id)) {
            const timeUntilEnd = shouldEndAt.getTime() - now.getTime();
            const minutesUntilEnd = timeUntilEnd / 60000;
            scheduleStreamTermination(stream.id, minutesUntilEnd);
            console.log(`[Scheduler] 📅 Scheduled termination for stream ${stream.id} in ${minutesUntilEnd.toFixed(1)} minutes`);
          }
        }
      } catch (streamError) {
        console.error(`[Scheduler] Error checking duration for stream ${stream.id}:`, streamError.message);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking stream durations:', error.message);
    // Don't rethrow - let the scheduler continue running
  }
}
function scheduleStreamTermination(streamId, durationMinutes) {
  if (!streamingService) {
    console.error('StreamingService not initialized in scheduler');
    return;
  }
  if (typeof durationMinutes !== 'number' || Number.isNaN(durationMinutes)) {
    console.error(`Invalid duration provided for stream ${streamId}: ${durationMinutes}`);
    return;
  }
  if (scheduledTerminations.has(streamId)) {
    clearTimeout(scheduledTerminations.get(streamId));
  }
  const clampedMinutes = Math.max(0, durationMinutes);
  const durationMs = clampedMinutes * 60 * 1000;
  console.log(`Scheduling termination for stream ${streamId} after ${clampedMinutes} minutes`);
  const timeoutId = setTimeout(async () => {
    try {
      console.log(`Terminating stream ${streamId} after ${clampedMinutes} minute duration`);
      await streamingService.stopStream(streamId);
      scheduledTerminations.delete(streamId);
    } catch (error) {
      console.error(`Error terminating stream ${streamId}:`, error);
    }
  }, durationMs);
  scheduledTerminations.set(streamId, timeoutId);
}
function cancelStreamTermination(streamId) {
  if (scheduledTerminations.has(streamId)) {
    clearTimeout(scheduledTerminations.get(streamId));
    scheduledTerminations.delete(streamId);
    console.log(`Cancelled scheduled termination for stream ${streamId}`);
    return true;
  }
  return false;
}
function handleStreamStopped(streamId) {
  return cancelStreamTermination(streamId);
}

/**
 * Check if a daily schedule should trigger now
 * @param {Object} stream - Stream object with recurring_time
 * @param {Date} currentTime - Current time to check against
 * @returns {boolean} True if should trigger
 */
function shouldTriggerDaily(stream, currentTime = new Date()) {
  if (!stream.recurring_enabled) return false;
  if (stream.schedule_type !== 'daily') return false;
  if (!stream.recurring_time) return false;

  const [schedHours, schedMinutes] = stream.recurring_time.split(':').map(Number);
  const scheduleMinutes = schedHours * 60 + schedMinutes;
  
  // Use WIB time for comparison since user inputs time in WIB
  const wibTime = getWIBTime(currentTime);
  const currentTotalMinutes = wibTime.hours * 60 + wibTime.minutes;

  const timeDiff = currentTotalMinutes - scheduleMinutes;
  
  // Trigger window: 0 to 1 minute after the scheduled time.
  // 30s polling means we will catch the minute boundary reliably without firing early.
  const shouldTrigger = timeDiff >= 0 && timeDiff <= 1;
  
  if (shouldTrigger) {
    console.log(`[Scheduler] Daily trigger window matched: ${schedHours}:${String(schedMinutes).padStart(2,'0')} WIB`);
  }
  
  return shouldTrigger;
}

/**
 * Check if a weekly schedule should trigger now
 * @param {Object} stream - Stream object with recurring_time and schedule_days
 * @param {Date} currentTime - Current time to check against
 * @returns {boolean} True if should trigger
 */
function shouldTriggerWeekly(stream, currentTime = new Date()) {
  if (!stream.recurring_enabled) return false;
  if (stream.schedule_type !== 'weekly') return false;
  if (!stream.recurring_time) return false;
  
  const scheduleDays = Array.isArray(stream.schedule_days) 
    ? stream.schedule_days 
    : parseScheduleDays(stream.schedule_days);
  
  if (!scheduleDays || scheduleDays.length === 0) return false;

  const wibTime = getWIBTime(currentTime);

  // Check if current day (in WIB) is in schedule
  if (!scheduleDays.includes(wibTime.day)) return false;

  const [schedHours, schedMinutes] = stream.recurring_time.split(':').map(Number);
  const scheduleMinutes = schedHours * 60 + schedMinutes;
  const currentTotalMinutes = wibTime.hours * 60 + wibTime.minutes;
  const timeDiff = currentTotalMinutes - scheduleMinutes;

  const shouldTrigger = timeDiff >= 0 && timeDiff <= 1;
  
  if (shouldTrigger) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    console.log(`[Scheduler] Weekly trigger window matched: ${schedHours}:${String(schedMinutes).padStart(2,'0')} WIB (${dayNames[wibTime.day]})`);
  }
  
  return shouldTrigger;
}

/**
 * Check if stream was recently triggered (to prevent double triggers)
 * @param {string} streamId - Stream ID
 * @returns {boolean} True if recently triggered
 */
function wasRecentlyTriggered(streamId) {
  const lastTrigger = recentlyTriggeredStreams.get(streamId);
  if (!lastTrigger) return false;
  
  const now = Date.now();
  if (now - lastTrigger < TRIGGER_COOLDOWN_MS) {
    return true;
  }
  
  // Clean up old entry
  recentlyTriggeredStreams.delete(streamId);
  return false;
}

/**
 * Mark stream as recently triggered
 * @param {string} streamId - Stream ID
 */
function markAsTriggered(streamId) {
  recentlyTriggeredStreams.set(streamId, Date.now());
}

/**
 * Check and trigger recurring schedules (daily and weekly)
 */
async function checkRecurringSchedules() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }

    let recurringStreams = [];
    try {
      recurringStreams = await Stream.findRecurringSchedules();
    } catch (dbError) {
      console.error('[Scheduler] Database error finding recurring schedules:', dbError.message);
      return;
    }
    
    if (recurringStreams.length === 0) return; // Hot path

    const now = new Date();

    for (const stream of recurringStreams) {
      try {
        if (!stream.recurring_enabled) continue;
        if (wasRecentlyTriggered(stream.id)) continue;
        if (stream.status === 'live') continue;
        
        // RACE CONDITION FIX: Check if stream is already being started
        if (isStarting(stream.id)) {
          console.log(`[Scheduler] Stream ${stream.id} is already being started, skipping`);
          continue;
        }

        let shouldTrigger = false;
        if (stream.schedule_type === 'daily') {
          shouldTrigger = shouldTriggerDaily(stream, now);
        } else if (stream.schedule_type === 'weekly') {
          shouldTrigger = shouldTriggerWeekly(stream, now);
        }

        if (!shouldTrigger) continue;

        console.log(`[Scheduler] >>> TRIGGERING recurring: ${stream.id} "${stream.title}" (${stream.schedule_type})`);
        
        // RACE CONDITION FIX: Acquire lock before starting
        if (!acquireStartLock(stream.id)) {
          console.log(`[Scheduler] Failed to acquire start lock for recurring stream ${stream.id}, skipping`);
          continue;
        }
        
        // Mark as triggered to prevent double triggers within cooldown window
        markAsTriggered(stream.id);

        try {
          const result = await streamingService.startStream(stream.id);
          if (result.success) {
            console.log(`[Scheduler] >>> Started recurring stream ${stream.id}`);
          } else {
            console.error(`[Scheduler] >>> Failed to start recurring stream ${stream.id}: ${result.error}`);
          }
        } catch (startError) {
          console.error(`[Scheduler] >>> Error starting recurring stream ${stream.id}:`, startError.message);
        } finally {
          // RACE CONDITION FIX: Always release lock
          releaseStartLock(stream.id);
        }

        // Small delay between starts
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (streamError) {
        console.error(`[Scheduler] Error processing recurring stream ${stream.id}:`, streamError.message);
        // Release lock on error
        releaseStartLock(stream.id);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking recurring schedules:', error.message);
  }
}

/**
 * Calculate next run time for a recurring stream
 * @param {Object} stream - Stream object
 * @param {Date} fromTime - Calculate from this time
 * @returns {Date|null} Next run time or null
 */
function calculateNextRun(stream, fromTime = new Date()) {
  return Stream.getNextScheduledTime(stream);
}

module.exports = {
  init,
  shutdown,
  scheduleStreamTermination,
  cancelStreamTermination,
  handleStreamStopped,
  // Recurring schedule exports
  checkRecurringSchedules,
  shouldTriggerDaily,
  shouldTriggerWeekly,
  calculateNextRun
};
