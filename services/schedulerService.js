const Stream = require('../models/Stream');
const { parseScheduleDays } = require('../utils/scheduleValidator');
const { calculateDurationSeconds, formatDuration } = require('../utils/durationCalculator');

const scheduledTerminations = new Map();
const recentlyTriggeredStreams = new Map(); // Track recently triggered recurring streams
const SCHEDULE_LOOKAHEAD_SECONDS = 180; // Look ahead 3 minutes for one-time schedules
const RECURRING_CHECK_INTERVAL = 60 * 1000; // Check recurring schedules every 1 minute (CRITICAL for accuracy)
const ONCE_SCHEDULE_CHECK_INTERVAL = 60 * 1000; // Check one-time schedules every 1 minute
const TRIGGER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minute cooldown to prevent double triggers (longer than any check interval)
const DURATION_CHECK_INTERVAL = 2 * 60 * 1000; // Check durations every 2 minutes
const FORCE_STOP_BUFFER_MS = 2 * 60 * 1000; // Force stop streams that exceed duration by more than 2 minutes
const CLEANUP_INTERVAL = 60 * 60 * 1000; // Clean up stale entries every 1 hour

let streamingService = null;
let initialized = false;
let scheduleIntervalId = null;
let durationIntervalId = null;
let recurringIntervalId = null;
let cleanupIntervalId = null;

function init(streamingServiceInstance) {
  if (initialized) {
    console.log('Stream scheduler already initialized');
    return;
  }
  streamingService = streamingServiceInstance;
  initialized = true;
  console.log('[Scheduler] Stream scheduler initialized');
  
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
  
  // Schedule checks - more frequent for better accuracy
  scheduleIntervalId = setInterval(safeCheckScheduledStreams, ONCE_SCHEDULE_CHECK_INTERVAL); // Every 1 minute for one-time schedules
  durationIntervalId = setInterval(safeCheckStreamDurations, DURATION_CHECK_INTERVAL); // Every 2 minutes for duration checks
  recurringIntervalId = setInterval(safeCheckRecurringSchedules, RECURRING_CHECK_INTERVAL); // Every 1 minute for recurring schedules
  
  // MEMORY MANAGEMENT: Cleanup stale entries from Maps
  cleanupIntervalId = setInterval(cleanupStaleMaps, CLEANUP_INTERVAL);
  
  console.log('[Scheduler] Intervals set: once-schedules=1min, recurring=1min, duration=2min, cleanup=1hr');
  
  // Initial checks with error handling (run immediately on startup)
  safeCheckScheduledStreams();
  safeCheckStreamDurations();
  safeCheckRecurringSchedules();
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
    
    // Log every check to help debugging
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    console.log(`[Scheduler] Checking once schedules at ${currentHours}:${String(currentMinutes).padStart(2, '0')} local, lookAhead=${SCHEDULE_LOOKAHEAD_SECONDS}s`);
    
    let streams = [];
    try {
      streams = await Stream.findScheduledInRange(now, lookAheadTime);
    } catch (dbError) {
      console.error('[Scheduler] Database error finding scheduled streams:', dbError.message);
      return; // Don't crash, just skip this check
    }
    
    if (streams.length > 0) {
      console.log(`[Scheduler] Found ${streams.length} 'once' streams to start`);
      for (const stream of streams) {
        try {
          // Check if stream was recently triggered to prevent double starts
          if (wasRecentlyTriggered(stream.id)) {
            console.log(`[Scheduler] SKIP: stream ${stream.id} - recently triggered (cooldown active)`);
            continue;
          }
          
          const scheduleTime = new Date(stream.schedule_time);
          const timeDiffMs = now.getTime() - scheduleTime.getTime();
          const timeDiffMinutes = timeDiffMs / 60000;
          
          console.log(`[Scheduler] Starting scheduled stream: ${stream.id} - ${stream.title}`);
          console.log(`[Scheduler]   Scheduled: ${stream.schedule_time}, Diff: ${timeDiffMinutes.toFixed(1)} minutes`);
          
          // Mark as triggered before starting
          markAsTriggered(stream.id);
          
          const result = await streamingService.startStream(stream.id);
          if (result.success) {
            console.log(`[Scheduler] Successfully started scheduled stream: ${stream.id}`);
          } else {
            console.error(`[Scheduler] Failed to start scheduled stream ${stream.id}: ${result.error}`);
            // Remove from triggered list if failed so it can retry
            recentlyTriggeredStreams.delete(stream.id);
          }
          
          // Small delay between starting multiple streams
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (streamError) {
          console.error(`[Scheduler] Error processing stream ${stream.id}:`, streamError.message);
          // Continue with next stream, don't crash
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking scheduled streams:', error.message);
    // Don't rethrow - let the scheduler continue running
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
    
    // OPTIMIZED: Log more frequently when streams are close to ending
    // Always log if there are live streams to help debugging duration issues
    if (liveStreams.length > 0) {
      console.log(`[Scheduler] Checking durations for ${liveStreams.length} live streams at ${now.toISOString()}`);
    }
    
    for (const stream of liveStreams) {
      try {
        let shouldEndAt = null;

        // CRITICAL: Use actual start_time, not schedule_time for end time calculation
        if (!stream.start_time) {
          console.log(`[Scheduler] Stream ${stream.id} has no start_time set, skipping duration check`);
          continue;
        }

        const actualStartTime = new Date(stream.start_time);
        
        // Use centralized duration calculator for consistent priority
        // IMPORTANT: For recurring streams, we must use stream_duration_minutes directly
        // because schedule_time/end_time may contain old values from previous runs
        let durationSeconds = null;
        
        // Priority 1: stream_duration_minutes (most reliable for recurring streams)
        if (stream.stream_duration_minutes && stream.stream_duration_minutes > 0) {
          durationSeconds = stream.stream_duration_minutes * 60;
          console.log(`[Scheduler] Stream ${stream.id}: Using stream_duration_minutes: ${stream.stream_duration_minutes} minutes (${durationSeconds} seconds)`);
        } else {
          // Fallback to centralized calculator for other cases
          durationSeconds = calculateDurationSeconds(stream);
        }
        
        if (durationSeconds && durationSeconds > 0) {
          const durationMs = durationSeconds * 1000;
          shouldEndAt = new Date(actualStartTime.getTime() + durationMs);
          const remainingMs = shouldEndAt.getTime() - now.getTime();
          const remainingMinutes = remainingMs / 60000;
          console.log(`[Scheduler] Stream ${stream.id}: start=${actualStartTime.toISOString()}, duration=${formatDuration(durationSeconds)}, end=${shouldEndAt.toISOString()}, remaining=${remainingMinutes.toFixed(1)} minutes`);
        } else {
          console.log(`[Scheduler] Stream ${stream.id} has no duration set - will run indefinitely`);
        }

        // If we have an end time, check if we need to take action
        if (shouldEndAt) {
          const timeOverdue = now.getTime() - shouldEndAt.getTime();
          const timeOverdueMinutes = timeOverdue / 60000;
          
          // Log duration fields for debugging
          console.log(`[Scheduler] Stream ${stream.id} duration fields: stream_duration_minutes=${stream.stream_duration_minutes}, schedule_time=${stream.schedule_time}, end_time=${stream.end_time}`);
          
          // FORCE STOP: If stream exceeds duration by more than 2 minutes, force stop immediately
          // This is a safety net in case FFmpeg -t and scheduled timer both failed
          if (timeOverdue > FORCE_STOP_BUFFER_MS) {
            console.log(`[Scheduler] FORCE STOP: Stream ${stream.id} exceeded end time by ${timeOverdueMinutes.toFixed(1)} minutes, forcing stop now`);
            try {
              await streamingService.stopStream(stream.id);
              // Cancel any existing scheduled termination
              cancelStreamTermination(stream.id);
            } catch (stopError) {
              console.error(`[Scheduler] Error force stopping stream ${stream.id}:`, stopError.message);
            }
            continue;
          }
          
          // If stream has exceeded end time (but within buffer), stop it
          if (shouldEndAt <= now) {
            console.log(`[Scheduler] Stream ${stream.id} exceeded end time by ${timeOverdueMinutes.toFixed(1)} minutes, stopping now`);
            try {
              await streamingService.stopStream(stream.id);
              cancelStreamTermination(stream.id);
            } catch (stopError) {
              console.error(`[Scheduler] Error stopping overdue stream ${stream.id}:`, stopError.message);
            }
            continue;
          }
          
          // If no scheduled termination exists, create one
          if (!scheduledTerminations.has(stream.id)) {
            const timeUntilEnd = shouldEndAt.getTime() - now.getTime();
            const minutesUntilEnd = timeUntilEnd / 60000;
            console.log(`[Scheduler] Stream ${stream.id} will end at ${shouldEndAt.toISOString()} (${minutesUntilEnd.toFixed(1)} minutes)`);
            scheduleStreamTermination(stream.id, minutesUntilEnd);
          }
        }
      } catch (streamError) {
        console.error(`[Scheduler] Error checking duration for stream ${stream.id}:`, streamError.message);
        // Continue with next stream, don't crash
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
 * Get current time in Asia/Jakarta timezone (WIB)
 * Uses Intl.DateTimeFormat for accurate timezone conversion
 * @param {Date} date - Date object to convert
 * @returns {Object} Object with hours, minutes, day
 */
function getWIBTime(date = new Date()) {
  try {
    // Use Intl.DateTimeFormat for accurate timezone conversion
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    let hours = 0, minutes = 0, dayName = '';
    
    for (const part of parts) {
      if (part.type === 'hour') hours = parseInt(part.value, 10);
      if (part.type === 'minute') minutes = parseInt(part.value, 10);
      if (part.type === 'weekday') dayName = part.value;
    }
    
    // Convert day name to number (0=Sun, 1=Mon, etc.)
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const day = dayMap[dayName] ?? date.getDay();
    
    return { hours, minutes, day };
  } catch (e) {
    // Fallback to manual calculation if Intl fails
    console.warn('[Scheduler] Intl.DateTimeFormat failed, using manual WIB calculation');
    const wibOffset = 7 * 60; // 7 hours in minutes
    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    const wibMinutes = (utcMinutes + wibOffset) % (24 * 60);
    
    const hours = Math.floor(wibMinutes / 60);
    const minutes = wibMinutes % 60;
    
    // Calculate day in WIB
    const utcDay = date.getUTCDay();
    const utcHours = date.getUTCHours();
    let day = utcDay;
    if (utcHours + 7 >= 24) {
      day = (utcDay + 1) % 7;
    }
    
    return { hours, minutes, day };
  }
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

  // Calculate time difference (positive = current time is after scheduled time)
  const timeDiff = currentTotalMinutes - scheduleMinutes;
  
  // Trigger if:
  // - Within 2 minutes before scheduled time (early trigger for accuracy)
  // - Up to 10 minutes after scheduled time (catch missed schedules due to app restart, etc.)
  // This ensures we don't miss schedules due to timing issues
  const shouldTrigger = timeDiff >= -2 && timeDiff <= 10;
  
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
  
  if (scheduleDays.length === 0) return false;

  // Use WIB time for comparison since user inputs time in WIB
  const wibTime = getWIBTime(currentTime);
  
  // Check if current day (in WIB) is in schedule
  if (!scheduleDays.includes(wibTime.day)) return false;

  // Check time match
  const [schedHours, schedMinutes] = stream.recurring_time.split(':').map(Number);
  const scheduleMinutes = schedHours * 60 + schedMinutes;
  const currentTotalMinutes = wibTime.hours * 60 + wibTime.minutes;

  // Calculate time difference (positive = current time is after scheduled time)
  const timeDiff = currentTotalMinutes - scheduleMinutes;
  
  // Trigger if:
  // - Within 2 minutes before scheduled time (early trigger for accuracy)
  // - Up to 10 minutes after scheduled time (catch missed schedules due to app restart, etc.)
  // This ensures we don't miss schedules due to timing issues
  const shouldTrigger = timeDiff >= -2 && timeDiff <= 10;
  
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

    const now = new Date();
    const wibTime = getWIBTime(now);
    const currentHours = wibTime.hours;
    const currentMinutes = wibTime.minutes;
    const currentDay = wibTime.day;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    let recurringStreams = [];
    try {
      recurringStreams = await Stream.findRecurringSchedules();
    } catch (dbError) {
      console.error('[Scheduler] Database error finding recurring schedules:', dbError.message);
      return; // Don't crash, just skip this check
    }
    
    if (recurringStreams.length === 0) {
      // Log every time to help debugging
      console.log(`[Scheduler] No recurring schedules found at ${currentHours}:${String(currentMinutes).padStart(2, '0')} WIB (${dayNames[currentDay]})`);
      return;
    }

    console.log(`[Scheduler] ========== RECURRING CHECK ==========`);
    console.log(`[Scheduler] Current time: ${currentHours}:${String(currentMinutes).padStart(2, '0')} WIB (${dayNames[currentDay]}) [UTC: ${now.toISOString()}]`);
    console.log(`[Scheduler] Found ${recurringStreams.length} recurring schedules to check`);

    for (const stream of recurringStreams) {
      try {
        // Always log stream details for debugging
        console.log(`[Scheduler] Checking stream: id=${stream.id}, title="${stream.title}", type=${stream.schedule_type}, recurring_time=${stream.recurring_time}, enabled=${stream.recurring_enabled}, status=${stream.status}, days=${JSON.stringify(stream.schedule_days)}`);
        
        // Skip if not enabled
        if (!stream.recurring_enabled) {
          console.log(`[Scheduler] SKIP: stream ${stream.id} - recurring_enabled is false`);
          continue;
        }

        // Skip if recently triggered
        if (wasRecentlyTriggered(stream.id)) {
          console.log(`[Scheduler] SKIP: stream ${stream.id} - recently triggered (cooldown active)`);
          continue;
        }

        // Check if stream is already live
        if (stream.status === 'live') {
          console.log(`[Scheduler] SKIP: stream ${stream.id} - already live`);
          continue;
        }

        let shouldTrigger = false;

        if (stream.schedule_type === 'daily') {
          shouldTrigger = shouldTriggerDaily(stream, now);
          // Always log time comparison for daily
          if (stream.recurring_time) {
            const [schedHours, schedMinutes] = stream.recurring_time.split(':').map(Number);
            const scheduleMinutes = schedHours * 60 + schedMinutes;
            const currentTotalMinutes = currentHours * 60 + currentMinutes;
            const timeDiff = Math.abs(currentTotalMinutes - scheduleMinutes);
            console.log(`[Scheduler] Daily time check: scheduled=${schedHours}:${String(schedMinutes).padStart(2, '0')} WIB (${scheduleMinutes}min), current=${currentHours}:${String(currentMinutes).padStart(2, '0')} WIB (${currentTotalMinutes}min), diff=${timeDiff}min, shouldTrigger=${shouldTrigger}`);
          }
        } else if (stream.schedule_type === 'weekly') {
          shouldTrigger = shouldTriggerWeekly(stream, now);
          // Always log time and day comparison for weekly
          if (stream.recurring_time) {
            const [schedHours, schedMinutes] = stream.recurring_time.split(':').map(Number);
            const scheduleMinutes = schedHours * 60 + schedMinutes;
            const currentTotalMinutes = currentHours * 60 + currentMinutes;
            const timeDiff = Math.abs(currentTotalMinutes - scheduleMinutes);
            const scheduleDays = Array.isArray(stream.schedule_days) ? stream.schedule_days : [];
            const dayMatch = scheduleDays.includes(currentDay);
            console.log(`[Scheduler] Weekly time check: scheduled=${schedHours}:${String(schedMinutes).padStart(2, '0')} WIB on days=[${scheduleDays.join(',')}], current=${currentHours}:${String(currentMinutes).padStart(2, '0')} WIB (${dayNames[currentDay]}=${currentDay}), dayMatch=${dayMatch}, timeDiff=${timeDiff}min, shouldTrigger=${shouldTrigger}`);
          }
        }

        if (shouldTrigger) {
          console.log(`[Scheduler] >>> TRIGGERING recurring stream: ${stream.id} - ${stream.title} (${stream.schedule_type})`);
          
          // Mark as triggered to prevent double triggers
          markAsTriggered(stream.id);
          
          try {
            const result = await streamingService.startStream(stream.id);
            if (result.success) {
              console.log(`[Scheduler] >>> Successfully started recurring stream: ${stream.id}`);
            } else {
              console.error(`[Scheduler] >>> Failed to start recurring stream ${stream.id}: ${result.error}`);
            }
          } catch (startError) {
            console.error(`[Scheduler] >>> Error starting recurring stream ${stream.id}:`, startError.message);
          }

          // Small delay between starting multiple streams
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (streamError) {
        console.error(`[Scheduler] Error processing recurring stream ${stream.id}:`, streamError.message);
        // Continue with next stream, don't crash
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking recurring schedules:', error.message);
    // Don't rethrow - let the scheduler continue running
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
  scheduleStreamTermination,
  cancelStreamTermination,
  handleStreamStopped,
  // Recurring schedule exports
  checkRecurringSchedules,
  shouldTriggerDaily,
  shouldTriggerWeekly,
  calculateNextRun
};
