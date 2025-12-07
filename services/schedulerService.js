const Stream = require('../models/Stream');
const { parseScheduleDays } = require('../utils/scheduleValidator');

const scheduledTerminations = new Map();
const recentlyTriggeredStreams = new Map(); // Track recently triggered recurring streams
const SCHEDULE_LOOKAHEAD_SECONDS = 60;
const RECURRING_CHECK_INTERVAL = 60 * 1000; // Check every minute
const TRIGGER_COOLDOWN_MS = 2 * 60 * 1000; // 2 minute cooldown to prevent double triggers

let streamingService = null;
let initialized = false;
let scheduleIntervalId = null;
let durationIntervalId = null;
let recurringIntervalId = null;

function init(streamingServiceInstance) {
  if (initialized) {
    console.log('Stream scheduler already initialized');
    return;
  }
  streamingService = streamingServiceInstance;
  initialized = true;
  console.log('Stream scheduler initialized');
  scheduleIntervalId = setInterval(checkScheduledStreams, 60 * 1000);
  durationIntervalId = setInterval(checkStreamDurations, 60 * 1000);
  recurringIntervalId = setInterval(checkRecurringSchedules, RECURRING_CHECK_INTERVAL);
  checkScheduledStreams();
  checkStreamDurations();
  checkRecurringSchedules();
}
async function checkScheduledStreams() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    const now = new Date();
    const lookAheadTime = new Date(now.getTime() + SCHEDULE_LOOKAHEAD_SECONDS * 1000);
    const streams = await Stream.findScheduledInRange(now, lookAheadTime);
    if (streams.length > 0) {
      console.log(`Found ${streams.length} streams to schedule start`);
      for (const stream of streams) {
        console.log(`Starting scheduled stream: ${stream.id} - ${stream.title}`);
        const result = await streamingService.startStream(stream.id);
        if (result.success) {
          console.log(`Successfully started scheduled stream: ${stream.id}`);
        } else {
          console.error(`Failed to start scheduled stream ${stream.id}: ${result.error}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking scheduled streams:', error);
  }
}
async function checkStreamDurations() {
  try {
    if (!streamingService) {
      console.error('StreamingService not initialized in scheduler');
      return;
    }
    const liveStreams = await Stream.findAll(null, 'live');
    for (const stream of liveStreams) {
      // Skip if already has scheduled termination
      if (scheduledTerminations.has(stream.id)) {
        continue;
      }

      const now = new Date();
      let shouldEndAt = null;

      // Check duration-based end time (stream_duration_hours or duration in minutes)
      if (stream.start_time) {
        if (stream.stream_duration_hours && stream.stream_duration_hours > 0) {
          // Duration in hours
          const durationMs = stream.stream_duration_hours * 60 * 60 * 1000;
          const durationEndAt = new Date(new Date(stream.start_time).getTime() + durationMs);
          shouldEndAt = durationEndAt;
        } else if (stream.duration && stream.duration > 0) {
          // Duration in minutes (legacy)
          const durationMs = stream.duration * 60 * 1000;
          const durationEndAt = new Date(new Date(stream.start_time).getTime() + durationMs);
          shouldEndAt = durationEndAt;
        }
      }

      // Check schedule end time (for 'once' schedule type)
      if (stream.end_time) {
        const scheduleEndAt = new Date(stream.end_time);
        // Use the earlier of duration end or schedule end
        if (!shouldEndAt || scheduleEndAt < shouldEndAt) {
          shouldEndAt = scheduleEndAt;
        }
      }

      // If we have an end time, schedule termination
      if (shouldEndAt) {
        if (shouldEndAt <= now) {
          console.log(`[Scheduler] Stream ${stream.id} exceeded end time, stopping now`);
          await streamingService.stopStream(stream.id);
        } else {
          const timeUntilEnd = shouldEndAt.getTime() - now.getTime();
          const minutesUntilEnd = timeUntilEnd / 60000;
          console.log(`[Scheduler] Stream ${stream.id} will end at ${shouldEndAt.toISOString()} (${minutesUntilEnd.toFixed(1)} minutes)`);
          scheduleStreamTermination(stream.id, minutesUntilEnd);
        }
      }
    }
  } catch (error) {
    console.error('Error checking stream durations:', error);
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
  
  const currentHours = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // 1-minute tolerance for matching
  return Math.abs(currentTotalMinutes - scheduleMinutes) <= 1;
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

  // Check if current day is in schedule
  const currentDay = currentTime.getDay();
  if (!scheduleDays.includes(currentDay)) return false;

  // Check time match
  const [schedHours, schedMinutes] = stream.recurring_time.split(':').map(Number);
  const scheduleMinutes = schedHours * 60 + schedMinutes;
  
  const currentHours = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;

  // 1-minute tolerance for matching
  return Math.abs(currentTotalMinutes - scheduleMinutes) <= 1;
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
    const recurringStreams = await Stream.findRecurringSchedules();
    
    if (recurringStreams.length === 0) return;

    console.log(`[Scheduler] Checking ${recurringStreams.length} recurring schedules at ${now.toISOString()}`);

    for (const stream of recurringStreams) {
      // Skip if not enabled
      if (!stream.recurring_enabled) continue;

      // Skip if recently triggered
      if (wasRecentlyTriggered(stream.id)) {
        continue;
      }

      // Check if stream is already live
      if (stream.status === 'live') {
        console.log(`[Scheduler] Skipping recurring stream ${stream.id} - already live`);
        continue;
      }

      let shouldTrigger = false;

      if (stream.schedule_type === 'daily') {
        shouldTrigger = shouldTriggerDaily(stream, now);
      } else if (stream.schedule_type === 'weekly') {
        shouldTrigger = shouldTriggerWeekly(stream, now);
      }

      if (shouldTrigger) {
        console.log(`[Scheduler] Triggering recurring stream: ${stream.id} - ${stream.title} (${stream.schedule_type})`);
        
        // Mark as triggered to prevent double triggers
        markAsTriggered(stream.id);
        
        try {
          const result = await streamingService.startStream(stream.id);
          if (result.success) {
            console.log(`[Scheduler] Successfully started recurring stream: ${stream.id}`);
          } else {
            console.error(`[Scheduler] Failed to start recurring stream ${stream.id}: ${result.error}`);
          }
        } catch (error) {
          console.error(`[Scheduler] Error starting recurring stream ${stream.id}:`, error);
        }

        // Small delay between starting multiple streams
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking recurring schedules:', error);
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
