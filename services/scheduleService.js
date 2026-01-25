/**
 * Schedule Service for Recurring Broadcasts
 * Manages automatic broadcast creation based on templates with recurring enabled
 */

const fs = require('fs');
const path = require('path');
const BroadcastTemplate = require('../models/BroadcastTemplate');
const TitleSuggestion = require('../models/TitleSuggestion');
const YouTubeBroadcastSettings = require('../models/YouTubeBroadcastSettings');
const youtubeService = require('./youtubeService');
const { calculateNextRun, formatNextRunAt, replaceTitlePlaceholders, isScheduleMissed } = require('../utils/recurringUtils');
const { db } = require('../db/database');

/**
 * Get thumbnail index for a specific stream key
 * @param {string} userId - User ID
 * @param {string} streamKeyId - Stream Key ID
 * @returns {Promise<number>} Thumbnail index (default 0)
 */
async function getStreamKeyThumbnailIndex(userId, streamKeyId) {
  return new Promise((resolve) => {
    db.get(
      `SELECT thumbnail_index FROM stream_key_folder_mapping WHERE user_id = ? AND stream_key_id = ?`,
      [userId, streamKeyId],
      (err, row) => {
        if (err || !row) {
          return resolve(0);
        }
        resolve(row.thumbnail_index || 0);
      }
    );
  });
}

/**
 * Update thumbnail index for a specific stream key
 * @param {string} userId - User ID
 * @param {string} streamKeyId - Stream Key ID
 * @param {number} newIndex - New thumbnail index
 * @returns {Promise<boolean>}
 */
async function updateStreamKeyThumbnailIndex(userId, streamKeyId, newIndex) {
  return new Promise((resolve) => {
    // First try to update existing record
    db.run(
      `UPDATE stream_key_folder_mapping SET thumbnail_index = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND stream_key_id = ?`,
      [newIndex, userId, streamKeyId],
      function(err) {
        if (err) {
          console.error(`[ScheduleService] Error updating stream key thumbnail index:`, err.message);
          return resolve(false);
        }
        if (this.changes === 0) {
          // Record doesn't exist, create it
          db.run(
            `INSERT INTO stream_key_folder_mapping (user_id, stream_key_id, folder_name, thumbnail_index, updated_at) VALUES (?, ?, '', ?, CURRENT_TIMESTAMP)`,
            [userId, streamKeyId, newIndex],
            function(insertErr) {
              if (insertErr) {
                console.error(`[ScheduleService] Error creating stream key thumbnail index:`, insertErr.message);
                return resolve(false);
              }
              console.log(`[ScheduleService] Created stream key thumbnail index: ${streamKeyId} -> ${newIndex}`);
              resolve(true);
            }
          );
        } else {
          console.log(`[ScheduleService] Updated stream key thumbnail index: ${streamKeyId} -> ${newIndex}`);
          resolve(true);
        }
      }
    );
  });
}

/**
 * Get user title rotation settings from database
 * @param {string} userId - User ID
 * @returns {Promise<{enabled: boolean, folderId: string|null, currentIndex: number}>}
 */
async function getUserTitleRotationSettings(userId) {
  return new Promise((resolve) => {
    db.get(
      `SELECT * FROM user_title_rotation_settings WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err || !row) {
          return resolve({ enabled: false, folderId: null, currentIndex: 0 });
        }
        resolve({
          enabled: !!row.enabled,
          folderId: row.folder_id || null,
          currentIndex: row.current_index || 0
        });
      }
    );
  });
}

/**
 * Update user title rotation index
 * @param {string} userId - User ID
 * @param {number} newIndex - New index
 * @returns {Promise<boolean>}
 */
async function updateUserTitleRotationIndex(userId, newIndex) {
  return new Promise((resolve) => {
    db.run(
      `UPDATE user_title_rotation_settings SET current_index = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [newIndex, userId],
      function(err) {
        resolve(!err && this.changes > 0);
      }
    );
  });
}

/**
 * Get current time in Asia/Jakarta timezone (WIB)
 * Uses Intl.DateTimeFormat for accurate timezone conversion
 * @param {Date} date - Date object to convert
 * @returns {Object} Object with hours, minutes, seconds, day, year, month, dayOfMonth
 */
function getWIBTime(date = new Date()) {
  try {
    // Use Intl.DateTimeFormat for accurate timezone conversion
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    let hours = 0, minutes = 0, seconds = 0, dayName = '', year = 0, month = 0, dayOfMonth = 0;
    
    for (const part of parts) {
      if (part.type === 'hour') hours = parseInt(part.value, 10);
      if (part.type === 'minute') minutes = parseInt(part.value, 10);
      if (part.type === 'second') seconds = parseInt(part.value, 10);
      if (part.type === 'weekday') dayName = part.value;
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10) - 1; // 0-indexed
      if (part.type === 'day') dayOfMonth = parseInt(part.value, 10);
    }
    
    // Convert day name to number (0=Sun, 1=Mon, etc.)
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const day = dayMap[dayName] ?? date.getDay();
    
    return { hours, minutes, seconds, day, year, month, dayOfMonth };
  } catch (e) {
    // Fallback to manual calculation if Intl fails
    console.warn('[ScheduleService] Intl.DateTimeFormat failed, using manual WIB calculation');
    const wibOffset = 7 * 60 * 60 * 1000; // 7 hours in ms
    const wibDate = new Date(date.getTime() + wibOffset);
    
    return {
      hours: wibDate.getUTCHours(),
      minutes: wibDate.getUTCMinutes(),
      seconds: wibDate.getUTCSeconds(),
      day: wibDate.getUTCDay(),
      year: wibDate.getUTCFullYear(),
      month: wibDate.getUTCMonth(),
      dayOfMonth: wibDate.getUTCDate()
    };
  }
}

/**
 * Convert a WIB time to UTC Date object
 * @param {number} year - Year in WIB
 * @param {number} month - Month in WIB (0-indexed)
 * @param {number} dayOfMonth - Day of month in WIB
 * @param {number} hours - Hours in WIB (0-23)
 * @param {number} minutes - Minutes in WIB (0-59)
 * @returns {Date} UTC Date object
 */
function wibToUTC(year, month, dayOfMonth, hours, minutes) {
  // WIB is UTC+7, so subtract 7 hours to get UTC
  const utcHours = hours - 7;
  
  let adjustedDay = dayOfMonth;
  let adjustedMonth = month;
  let adjustedYear = year;
  let adjustedHours = utcHours;
  
  if (utcHours < 0) {
    adjustedHours = utcHours + 24;
    adjustedDay = dayOfMonth - 1;
    
    if (adjustedDay < 1) {
      adjustedMonth = month - 1;
      if (adjustedMonth < 0) {
        adjustedMonth = 11;
        adjustedYear = year - 1;
      }
      adjustedDay = new Date(adjustedYear, adjustedMonth + 1, 0).getDate();
    }
  }
  
  return new Date(Date.UTC(adjustedYear, adjustedMonth, adjustedDay, adjustedHours, minutes, 0, 0));
}

class ScheduleService {
  constructor() {
    this.jobs = new Map(); // Map of templateId -> job info
    this.checkInterval = null;
    this.initialized = false;
    this.executingTemplates = new Set(); // Track templates currently being executed to prevent duplicates
  }

  /**
   * Initialize the schedule service
   * Loads all templates with recurring enabled and starts checking
   */
  async init() {
    if (this.initialized) return;
    
    try {
      console.log('[ScheduleService] Initializing...');
      
      // Start the schedule checker (runs every minute)
      this.startChecker();
      
      // Load all templates with recurring enabled
      const templates = await BroadcastTemplate.findWithRecurringEnabled();
      console.log(`[ScheduleService] Found ${templates.length} templates with recurring enabled`);
      
      const now = new Date();
      let missedCount = 0;
      
      for (const template of templates) {
        // Check for missed schedules on startup
        if (this.shouldExecuteMissed(template, now)) {
          console.log(`[ScheduleService] Found missed schedule for template: ${template.name}`);
          missedCount++;
          try {
            await this.executeTemplate(template);
            console.log(`[ScheduleService] Executed missed schedule for: ${template.name}`);
          } catch (error) {
            console.error(`[ScheduleService] Failed to execute missed schedule for ${template.name}:`, error.message);
          }
        } else {
          await this.scheduleJob(template);
        }
      }
      
      if (missedCount > 0) {
        console.log(`[ScheduleService] Executed ${missedCount} missed schedules`);
      }
      
      this.initialized = true;
      console.log('[ScheduleService] Initialized successfully');
    } catch (error) {
      console.error('[ScheduleService] Initialization error:', error.message);
    }
  }

  /**
   * Start the schedule checker that runs every 30 seconds
   * More frequent checks ensure schedules are triggered within the 5-minute window
   */
  startChecker() {
    if (this.checkInterval) return;
    
    // Check every 30 seconds for more precise scheduling
    // This ensures we catch the schedule within the 5-minute execution window
    this.checkInterval = setInterval(async () => {
      await this.checkSchedules();
    }, 30000); // 30 seconds
    
    console.log('[ScheduleService] Schedule checker started (30 sec interval for WIB precision)');
    
    // Also run immediately on start
    setTimeout(() => this.checkSchedules(), 5000);
  }

  /**
   * Stop the schedule checker
   */
  stopChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }


  /**
   * Check all templates with recurring and execute if it's time
   * Uses WIB timezone for all time comparisons
   */
  async checkSchedules() {
    try {
      const templates = await BroadcastTemplate.findWithRecurringEnabled();
      const now = new Date();
      const wibTime = getWIBTime(now);
      const nowMs = now.getTime();
      
      // Log current WIB time for debugging (with seconds for precision)
      const wibTimeStr = `${String(wibTime.hours).padStart(2,'0')}:${String(wibTime.minutes).padStart(2,'0')}:${String(wibTime.seconds || 0).padStart(2,'0')}`;
      const wibDateStr = `${wibTime.year}-${String(wibTime.month + 1).padStart(2,'0')}-${String(wibTime.dayOfMonth).padStart(2,'0')}`;
      const dayNamesLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      console.log(`[ScheduleService] ========== SCHEDULE CHECK ==========`);
      console.log(`[ScheduleService] Current WIB: ${wibDateStr} ${wibTimeStr} (${dayNamesLong[wibTime.day]})`);
      console.log(`[ScheduleService] Current UTC: ${now.toISOString()}`);
      console.log(`[ScheduleService] Templates with recurring enabled: ${templates.length}`);
      
      if (templates.length === 0) {
        console.log(`[ScheduleService] No templates to check`);
        return;
      }
      
      // Day names for comparison (lowercase)
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayWIB = dayNames[wibTime.day];
      
      for (const template of templates) {
        try {
          // Skip if this template is currently being executed (prevent duplicate execution)
          if (this.executingTemplates.has(template.id)) {
            console.log(`[ScheduleService]   SKIP: Template "${template.name}" is currently being executed`);
            continue;
          }
          
          // Log template info for debugging
          const nextRunStr = template.next_run_at ? new Date(template.next_run_at).toISOString() : 'not set';
          const lastRunStr = template.last_run_at ? new Date(template.last_run_at).toISOString() : 'never';
          const hasRunToday = this.hasRunToday(template, now);
          
          console.log(`[ScheduleService] --- Template: "${template.name}" ---`);
          console.log(`[ScheduleService]   Pattern: ${template.recurring_pattern}, Time: ${template.recurring_time} WIB`);
          console.log(`[ScheduleService]   Days: ${JSON.stringify(template.recurring_days)}`);
          console.log(`[ScheduleService]   Next run (UTC): ${nextRunStr}`);
          console.log(`[ScheduleService]   Last run (UTC): ${lastRunStr}`);
          console.log(`[ScheduleService]   Has run today (WIB): ${hasRunToday}`);
          console.log(`[ScheduleService]   Has credentials: ${!!(template.client_id && template.refresh_token)}`);
          
          // Skip if already run today (in WIB timezone)
          if (hasRunToday) {
            console.log(`[ScheduleService]   SKIP: Already run today (WIB)`);
            continue;
          }
          
          // Check if today is a valid day for this schedule (in WIB)
          let isTodayValid = false;
          
          if (template.recurring_pattern === 'daily') {
            isTodayValid = true;
          } else if (template.recurring_pattern === 'weekly') {
            const scheduledDays = (template.recurring_days || []).map(d => d.toLowerCase());
            isTodayValid = scheduledDays.includes(todayWIB);
            console.log(`[ScheduleService]   Today WIB: ${todayWIB}, Scheduled days: [${scheduledDays.join(', ')}]`);
            console.log(`[ScheduleService]   Today is scheduled: ${isTodayValid}`);
          }
          
          if (!isTodayValid) {
            console.log(`[ScheduleService]   SKIP: Today (${todayWIB}) is not a scheduled day`);
            continue;
          }
          
          // Parse scheduled time (in WIB)
          if (!template.recurring_time) {
            console.log(`[ScheduleService]   SKIP: No recurring_time set`);
            continue;
          }
          
          const [schedHour, schedMin] = template.recurring_time.split(':').map(Number);
          
          // Calculate scheduled time in WIB minutes from midnight
          const scheduleMinutesWIB = schedHour * 60 + schedMin;
          const currentMinutesWIB = wibTime.hours * 60 + wibTime.minutes;
          const timeDiffMinutes = currentMinutesWIB - scheduleMinutesWIB;
          
          console.log(`[ScheduleService]   Scheduled: ${String(schedHour).padStart(2,'0')}:${String(schedMin).padStart(2,'0')} WIB (${scheduleMinutesWIB} min)`);
          console.log(`[ScheduleService]   Current: ${String(wibTime.hours).padStart(2,'0')}:${String(wibTime.minutes).padStart(2,'0')} WIB (${currentMinutesWIB} min)`);
          console.log(`[ScheduleService]   Time diff: ${timeDiffMinutes} minutes (positive = past scheduled time)`);
          
          // EXECUTE CONDITIONS (in order of priority):
          // 1. Scheduled time has passed today but not run yet - EXECUTE
          // 2. Scheduled time is coming up within 2 minutes - EXECUTE (early trigger)
          // 3. next_run_at is overdue - EXECUTE
          
          // Condition 1: Scheduled time has passed today (0 to 720 minutes = 12 hours)
          // If it's past the scheduled time today and hasn't run, execute it
          if (timeDiffMinutes >= 0 && timeDiffMinutes <= 720) {
            console.log(`[ScheduleService]   >>> EXECUTING (scheduled time passed ${timeDiffMinutes} min ago)`);
            await this.executeTemplate(template);
            continue;
          }
          
          // Condition 2: Early trigger - within 2 minutes before scheduled time
          // This helps ensure we don't miss the exact time
          if (timeDiffMinutes >= -2 && timeDiffMinutes < 0) {
            console.log(`[ScheduleService]   >>> EXECUTING (early trigger, ${Math.abs(timeDiffMinutes)} min before scheduled time)`);
            await this.executeTemplate(template);
            continue;
          }
          
          // Condition 3: Check next_run_at for schedules from previous days
          if (template.next_run_at) {
            const nextRunAt = new Date(template.next_run_at);
            const timeDiffMs = nowMs - nextRunAt.getTime();
            const timeDiffFromNextRun = Math.floor(timeDiffMs / (1000 * 60));
            
            console.log(`[ScheduleService]   next_run_at diff: ${timeDiffFromNextRun} minutes`);
            
            // Execute if next_run_at is overdue but within 24 hours
            if (timeDiffFromNextRun > 0 && timeDiffFromNextRun <= 1440) {
              console.log(`[ScheduleService]   >>> EXECUTING (next_run_at overdue by ${timeDiffFromNextRun} min)`);
              await this.executeTemplate(template);
              continue;
            }
            
            // If overdue by more than 24 hours, update next_run_at to future
            if (timeDiffFromNextRun > 1440) {
              console.log(`[ScheduleService]   next_run_at too old (${timeDiffFromNextRun} min), updating to future`);
              await this.updateNextRunToFuture(template);
            }
          }
          
          // Log waiting status
          if (timeDiffMinutes < -2) {
            console.log(`[ScheduleService]   WAITING: ${Math.abs(timeDiffMinutes)} minutes until scheduled time`);
          } else if (timeDiffMinutes > 720) {
            console.log(`[ScheduleService]   MISSED: ${timeDiffMinutes} minutes past (>12 hours, updating next_run_at)`);
            await this.updateNextRunToFuture(template);
          }
        } catch (templateError) {
          console.error(`[ScheduleService] Error processing template "${template.name}":`, templateError.message);
          // Continue with next template
        }
      }
      
      console.log(`[ScheduleService] ========== CHECK COMPLETE ==========`);
    } catch (error) {
      console.error('[ScheduleService] Check schedules error:', error.message);
      console.error(error.stack);
    }
  }

  /**
   * Check if a missed schedule should be executed
   * Uses WIB timezone for all comparisons
   * @param {Object} template - Template object with recurring config
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  shouldExecuteMissed(template, now) {
    // If already run today (in WIB), skip
    if (this.hasRunToday(template, now)) {
      return false;
    }
    
    const wibTime = getWIBTime(now);
    
    // Check if today is a valid day for this schedule (in WIB)
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayWIB = dayNames[wibTime.day];
    let isTodayValid = false;
    
    if (template.recurring_pattern === 'daily') {
      isTodayValid = true;
    } else if (template.recurring_pattern === 'weekly') {
      const scheduledDays = (template.recurring_days || []).map(d => d.toLowerCase());
      isTodayValid = scheduledDays.includes(todayWIB);
    }
    
    // Check if scheduled time has passed today (in WIB)
    if (isTodayValid && template.recurring_time) {
      const [schedHour, schedMin] = template.recurring_time.split(':').map(Number);
      const scheduleMinutesWIB = schedHour * 60 + schedMin;
      const currentMinutesWIB = wibTime.hours * 60 + wibTime.minutes;
      const timeDiffMinutes = currentMinutesWIB - scheduleMinutesWIB;
      
      // If scheduled time has passed today (within 12 hours), execute
      if (timeDiffMinutes >= 0 && timeDiffMinutes <= 720) {
        console.log(`[ScheduleService] Detected missed schedule for template: ${template.name}`);
        console.log(`[ScheduleService]   Scheduled: ${template.recurring_time} WIB`);
        console.log(`[ScheduleService]   Current: ${String(wibTime.hours).padStart(2,'0')}:${String(wibTime.minutes).padStart(2,'0')} WIB`);
        console.log(`[ScheduleService]   Missed by: ${timeDiffMinutes} minutes`);
        return true;
      }
    }
    
    // Also check next_run_at for schedules from previous days
    if (template.next_run_at) {
      const nextRunAt = new Date(template.next_run_at);
      const overdueMs = now.getTime() - nextRunAt.getTime();
      const overdueMinutes = Math.floor(overdueMs / (1000 * 60));
      
      // If next_run_at is overdue but less than 24 hours
      if (overdueMinutes > 0 && overdueMinutes <= 1440) {
        console.log(`[ScheduleService] Detected OVERDUE schedule for template: ${template.name}`);
        console.log(`[ScheduleService]   next_run_at: ${template.next_run_at}`);
        console.log(`[ScheduleService]   Overdue by: ${overdueMinutes} minutes`);
        return true;
      } else if (overdueMinutes > 1440) {
        console.log(`[ScheduleService] Skipping very old schedule for template: ${template.name} (overdue ${overdueMinutes} min > 24h)`);
        // Update next_run_at to future date
        this.updateNextRunToFuture(template);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Update next_run_at to future date when schedule is too old
   * @param {Object} template - Template object
   */
  async updateNextRunToFuture(template) {
    try {
      const { calculateNextRun, formatNextRunAt } = require('../utils/recurringUtils');
      const nextRun = calculateNextRun({
        recurring_pattern: template.recurring_pattern,
        recurring_time: template.recurring_time,
        recurring_days: template.recurring_days
      });
      
      if (nextRun) {
        await BroadcastTemplate.update(template.id, { next_run_at: formatNextRunAt(nextRun) });
        console.log(`[ScheduleService] Updated next_run_at for template ${template.name} to ${formatNextRunAt(nextRun)}`);
      }
    } catch (error) {
      console.error(`[ScheduleService] Failed to update next_run_at for template ${template.name}:`, error.message);
    }
  }

  /**
   * Check if a template should execute now
   * Uses WIB timezone for all comparisons
   * @param {Object} template - Template object with recurring config
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  shouldExecute(template, now) {
    if (!template.recurring_time) return false;
    
    const [schedHour, schedMin] = template.recurring_time.split(':').map(Number);
    
    // Get current time in WIB
    const wibTime = getWIBTime(now);
    
    // Calculate time difference in minutes (WIB)
    const scheduleMinutesWIB = schedHour * 60 + schedMin;
    const currentMinutesWIB = wibTime.hours * 60 + wibTime.minutes;
    const timeDiffMinutes = currentMinutesWIB - scheduleMinutesWIB;
    
    // Trigger if within 0-5 minutes of scheduled time
    // This means: current time is AT or UP TO 5 minutes AFTER scheduled time
    if (timeDiffMinutes < 0 || timeDiffMinutes > 5) {
      return false;
    }
    
    // For daily, always execute at the right time
    if (template.recurring_pattern === 'daily') {
      const shouldRun = !this.hasRunToday(template, now);
      if (shouldRun) {
        console.log(`[ScheduleService] Daily trigger: ${String(schedHour).padStart(2,'0')}:${String(schedMin).padStart(2,'0')} WIB`);
        console.log(`[ScheduleService]   Current: ${String(wibTime.hours).padStart(2,'0')}:${String(wibTime.minutes).padStart(2,'0')} WIB, diff: ${timeDiffMinutes} min`);
      }
      return shouldRun;
    }
    
    // For weekly, check if today is a scheduled day (in WIB)
    if (template.recurring_pattern === 'weekly') {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const todayWIB = dayNames[wibTime.day];
      const scheduledDays = (template.recurring_days || []).map(d => d.toLowerCase());
      
      if (!scheduledDays.includes(todayWIB)) {
        return false;
      }
      
      const shouldRun = !this.hasRunToday(template, now);
      if (shouldRun) {
        console.log(`[ScheduleService] Weekly trigger: ${String(schedHour).padStart(2,'0')}:${String(schedMin).padStart(2,'0')} WIB (${todayWIB})`);
        console.log(`[ScheduleService]   Current: ${String(wibTime.hours).padStart(2,'0')}:${String(wibTime.minutes).padStart(2,'0')} WIB, diff: ${timeDiffMinutes} min`);
      }
      return shouldRun;
    }
    
    return false;
  }

  /**
   * Check if template has already run today (in WIB timezone)
   * @param {Object} template - Template object
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  hasRunToday(template, now) {
    if (!template.last_run_at) return false;
    
    const lastRun = new Date(template.last_run_at);
    
    // Get date strings in WIB for comparison
    const nowDateStr = this.getWIBDateString(now);
    const lastRunDateStr = this.getWIBDateString(lastRun);
    
    const result = nowDateStr === lastRunDateStr;
    
    if (result) {
      console.log(`[ScheduleService]   hasRunToday: YES (last run: ${lastRunDateStr} WIB, today: ${nowDateStr} WIB)`);
    }
    
    return result;
  }

  /**
   * Get date string in WIB timezone (YYYY-MM-DD format)
   * Uses Intl.DateTimeFormat for accurate timezone conversion
   * @param {Date} date - Date object
   * @returns {string} Date string in WIB (YYYY-MM-DD)
   */
  getWIBDateString(date) {
    try {
      // Use en-CA locale which outputs YYYY-MM-DD format
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(date);
    } catch (e) {
      // Fallback: manually calculate WIB date
      const wibTime = getWIBTime(date);
      return `${wibTime.year}-${String(wibTime.month + 1).padStart(2,'0')}-${String(wibTime.dayOfMonth).padStart(2,'0')}`;
    }
  }

  /**
   * Schedule a job for a specific template
   * @param {Object} template - Template object with recurring config
   */
  async scheduleJob(template) {
    // Calculate and update next run time
    const nextRun = calculateNextRun({
      recurring_pattern: template.recurring_pattern,
      recurring_time: template.recurring_time,
      recurring_days: template.recurring_days
    });
    
    if (nextRun) {
      await BroadcastTemplate.update(template.id, { next_run_at: formatNextRunAt(nextRun) });
    }
    
    this.jobs.set(template.id, { template, nextRun });
    console.log(`[ScheduleService] Scheduled: ${template.name} - Next run: ${nextRun?.toISOString() || 'N/A'}`);
  }

  /**
   * Cancel a scheduled job
   * @param {string} templateId - Template ID
   */
  cancelJob(templateId) {
    if (this.jobs.has(templateId)) {
      this.jobs.delete(templateId);
      console.log(`[ScheduleService] Cancelled job: ${templateId}`);
    }
  }

  /**
   * Execute a template - create broadcast(s)
   * Handles token errors gracefully and updates next_run_at even on failure
   * @param {Object} template - Template object with recurring config
   * @param {number} retryCount - Current retry count
   */
  async executeTemplate(template, retryCount = 0) {
    const maxRetries = 3;
    const now = new Date();
    
    // CRITICAL: Check if this template is already being executed (prevent duplicate execution)
    if (this.executingTemplates.has(template.id)) {
      console.log(`[ScheduleService] BLOCKED: Template "${template.name}" (${template.id}) is already being executed`);
      return { error: 'ALREADY_EXECUTING', template: template.name };
    }
    
    // Mark template as executing BEFORE any async operations
    this.executingTemplates.add(template.id);
    console.log(`[ScheduleService] LOCKED: Template "${template.name}" (${template.id}) - starting execution`);
    
    // Helper function to release lock
    const releaseLock = () => {
      this.executingTemplates.delete(template.id);
      console.log(`[ScheduleService] UNLOCKED: Template "${template.name}" (${template.id})`);
    };
    
    // Helper function to update next_run_at on failure
    const updateNextRunOnFailure = async (reason) => {
      try {
        const { calculateNextRun, formatNextRunAt } = require('../utils/recurringUtils');
        const nextRun = calculateNextRun({
          recurring_pattern: template.recurring_pattern,
          recurring_time: template.recurring_time,
          recurring_days: template.recurring_days
        });
        
        if (nextRun) {
          await BroadcastTemplate.updateLastRun(
            template.id,
            now.toISOString(),
            formatNextRunAt(nextRun)
          );
          console.log(`[ScheduleService] Updated next_run_at for template "${template.name}" to ${formatNextRunAt(nextRun)} (${reason})`);
        }
      } catch (err) {
        console.error(`[ScheduleService] Failed to update next_run_at:`, err.message);
      }
    };
    
    try {
      // Check if credentials are available
      if (!template.client_id || !template.client_secret || !template.refresh_token) {
        console.error(`[ScheduleService] Cannot execute template "${template.name}": YouTube credentials not found or invalid (account_id: ${template.account_id})`);
        await updateNextRunOnFailure('credentials missing');
        releaseLock();
        return { error: 'YouTube credentials not found', template: template.name };
      }
      
      // Get access token from credentials with error handling
      let accessToken;
      try {
        accessToken = await youtubeService.getAccessToken(
          template.client_id,
          template.client_secret,
          template.refresh_token
        );
      } catch (tokenError) {
        const errorMsg = tokenError.message || 'Unknown token error';
        console.error(`[ScheduleService] Token error for template "${template.name}": ${errorMsg}`);
        
        // Check if token is expired/revoked
        if (errorMsg.includes('TOKEN_EXPIRED') || errorMsg.includes('invalid_grant') || errorMsg.includes('revoked')) {
          console.error(`[ScheduleService] Token expired for template "${template.name}" - user needs to reconnect YouTube account`);
          await updateNextRunOnFailure('token expired');
          releaseLock();
          return { error: 'TOKEN_EXPIRED', template: template.name, message: 'YouTube token expired - please reconnect account' };
        }
        
        // For network errors, retry (but release lock first so retry can re-acquire)
        if (retryCount < maxRetries - 1) {
          console.log(`[ScheduleService] Retrying token fetch in 30 seconds... (attempt ${retryCount + 1}/${maxRetries})`);
          releaseLock();
          await new Promise(resolve => setTimeout(resolve, 30000));
          return this.executeTemplate(template, retryCount + 1);
        }
        
        await updateNextRunOnFailure('token fetch failed');
        releaseLock();
        return { error: errorMsg, template: template.name };
      }
      
      // Check if this is a multi-broadcast template
      let broadcasts = [];
      try {
        if (template.description && template.description.startsWith('[')) {
          broadcasts = JSON.parse(template.description);
          console.log(`[ScheduleService] Multi-broadcast template detected: ${broadcasts.length} broadcasts`);
        }
      } catch (e) {
        // Not a multi-broadcast template
      }
      
      const results = [];
      
      if (broadcasts.length > 0) {
        // Multi-broadcast template - create all broadcasts
        // Check user title rotation settings first
        let titleFolderId = template.title_folder_id || null;
        let currentTitleIndex = template.title_index || 0;
        let useUserRotation = false;
        
        if (!titleFolderId) {
          const userRotationSettings = await getUserTitleRotationSettings(template.user_id);
          if (userRotationSettings.enabled) {
            titleFolderId = userRotationSettings.folderId;
            currentTitleIndex = userRotationSettings.currentIndex;
            useUserRotation = true;
            console.log(`[ScheduleService] Multi-broadcast using user title rotation: folder=${titleFolderId || 'all'}, index=${currentTitleIndex}`);
          }
        }
        
        for (let i = 0; i < broadcasts.length; i++) {
          const b = broadcasts[i];
          
          // Get title from rotation
          let finalTitle = b.title;
          const titleResult = await this.getNextTitleForBroadcast(
            template.user_id,
            currentTitleIndex,
            titleFolderId
          );
          
          if (titleResult.title) {
            finalTitle = titleResult.title.title;
            console.log(`[ScheduleService] Broadcast ${i + 1} using rotated title: "${finalTitle}" (index: ${titleResult.currentPosition}/${titleResult.totalCount})`);
            
            // Update index for next broadcast (only if not pinned)
            if (!titleResult.isPinned) {
              currentTitleIndex = titleResult.nextIndex;
            }
            
            // Increment use count
            try {
              await TitleSuggestion.incrementUseCount(titleResult.title.id, template.user_id);
            } catch (err) {
              console.error(`[ScheduleService] Failed to increment title use count:`, err.message);
            }
          }
          
          const title = replaceTitlePlaceholders(finalTitle, now);
          const description = b.description ? replaceTitlePlaceholders(b.description, now) : '';
          
          // Calculate scheduled start time (10 + i*2 minutes from now to stagger)
          const scheduledStartTime = new Date(now.getTime() + (10 + i * 2) * 60 * 1000);
          
          // Log broadcast privacy status for debugging
          console.log(`[ScheduleService] Broadcast ${i + 1} privacyStatus from template: ${b.privacyStatus}`);
          
          const broadcastData = {
            title,
            description,
            scheduledStartTime: scheduledStartTime.toISOString(),
            privacyStatus: b.privacyStatus || 'unlisted',
            tags: b.tags || [],
            categoryId: b.categoryId || '20',
            streamId: b.streamId || null,  // Use saved stream ID
            // IMPORTANT: Always enable auto-start when creating from recurring template
            // This ensures YouTube broadcast starts automatically when stream begins
            enableAutoStart: true,
            enableAutoStop: true
          };
          
          console.log(`[ScheduleService] Creating broadcast ${i + 1}/${broadcasts.length}: ${title}`);
          console.log(`[ScheduleService] Using privacyStatus: ${broadcastData.privacyStatus}`);
          console.log(`[ScheduleService] Using streamId: ${b.streamId || 'none (will create new)'}`);
          
          try {
            const result = await youtubeService.createBroadcast(accessToken, broadcastData);
            results.push(result);
            console.log(`[ScheduleService] Broadcast ${i + 1} created: ${result.broadcastId || result.id}`);
            
            // Determine thumbnail folder from stream key mapping if available
            // Priority: stream_key_folder_mapping > b.thumbnailFolder
            let thumbnailFolder = null;
            
            // First check stream_key_folder_mapping for this stream key
            if (b.streamId && template.stream_key_folder_mapping) {
              const mappedFolder = template.stream_key_folder_mapping[b.streamId];
              if (mappedFolder !== undefined) {
                thumbnailFolder = mappedFolder;
                console.log(`[ScheduleService] Using mapped folder for stream key ${b.streamId}: ${thumbnailFolder === '' ? 'root' : thumbnailFolder}`);
              }
            }
            
            // Fallback to b.thumbnailFolder if no mapping found
            if (thumbnailFolder === null && b.thumbnailFolder !== null && b.thumbnailFolder !== undefined) {
              thumbnailFolder = b.thumbnailFolder;
              console.log(`[ScheduleService] Using broadcast thumbnailFolder: ${thumbnailFolder === '' ? 'root' : thumbnailFolder}`);
            }
            
            // Save broadcast settings including thumbnail folder
            try {
              await YouTubeBroadcastSettings.upsert({
                broadcastId: result.broadcastId || result.id,
                userId: template.user_id,
                accountId: template.account_id || null,
                enableAutoStart: true,
                enableAutoStop: true,
                unlistReplayOnEnd: false,
                originalPrivacyStatus: b.privacyStatus || 'unlisted',
                thumbnailFolder: thumbnailFolder !== null ? thumbnailFolder : null,
                templateId: template.id
              });
              console.log(`[ScheduleService] Saved broadcast settings for ${result.broadcastId || result.id}, thumbnailFolder: ${thumbnailFolder !== null ? (thumbnailFolder === '' ? 'root' : thumbnailFolder) : 'null'}, templateId: ${template.id}`);
            } catch (settingsErr) {
              console.error(`[ScheduleService] Failed to save broadcast settings:`, settingsErr.message);
            }
            
            // Upload thumbnail - use sequential selection from folder with per-stream-key index
            if (thumbnailFolder !== null || b.thumbnailPath || b.pinnedThumbnail) {
              // Get thumbnail index for this specific stream key
              let thumbnailIndex = 0;
              if (b.streamId) {
                thumbnailIndex = await getStreamKeyThumbnailIndex(template.user_id, b.streamId);
                console.log(`[ScheduleService] Stream key ${b.streamId} current thumbnail_index: ${thumbnailIndex}`);
              }
              
              const uploadResult = await this.uploadThumbnailForBroadcast(
                accessToken, 
                result.broadcastId || result.id, 
                b.thumbnailPath,
                thumbnailFolder,
                template.user_id,
                b.pinnedThumbnail,
                null, // Don't update template index
                thumbnailIndex
              );
              
              // Update thumbnail index for this stream key after successful upload
              if (uploadResult && uploadResult.newIndex !== undefined && b.streamId) {
                await updateStreamKeyThumbnailIndex(template.user_id, b.streamId, uploadResult.newIndex);
              }
            }
          } catch (err) {
            console.error(`[ScheduleService] Failed to create broadcast ${i + 1}:`, err.message);
          }
          
          // Small delay between broadcasts to avoid rate limiting
          if (i < broadcasts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Update title index for multi-broadcast template after all broadcasts
        if (currentTitleIndex !== (template.title_index || 0)) {
          if (useUserRotation) {
            // Update user-level rotation index
            try {
              await updateUserTitleRotationIndex(template.user_id, currentTitleIndex);
              console.log(`[ScheduleService] Updated user title rotation index to ${currentTitleIndex}`);
            } catch (err) {
              console.error(`[ScheduleService] Failed to update user title rotation index:`, err.message);
            }
          } else {
            // Update template-level rotation index
            try {
              await BroadcastTemplate.updateTitleIndex(template.id, currentTitleIndex);
              console.log(`[ScheduleService] Updated multi-template ${template.id} title_index to ${currentTitleIndex}`);
            } catch (err) {
              console.error(`[ScheduleService] Failed to update title index:`, err.message);
            }
          }
        }
      } else {
        // Single broadcast template
        
        // Get title from rotation
        // Priority: 1. Template title_folder_id, 2. User title rotation settings, 3. All titles
        let finalTitle = template.title;
        let titleFolderId = template.title_folder_id || null;
        let titleIndex = template.title_index || 0;
        let useUserRotation = false;
        
        // If template doesn't have specific folder, check user title rotation settings
        if (!titleFolderId) {
          const userRotationSettings = await getUserTitleRotationSettings(template.user_id);
          if (userRotationSettings.enabled) {
            titleFolderId = userRotationSettings.folderId;
            titleIndex = userRotationSettings.currentIndex;
            useUserRotation = true;
            console.log(`[ScheduleService] Using user title rotation settings: folder=${titleFolderId || 'all'}, index=${titleIndex}`);
          }
        }
        
        const titleResult = await this.getNextTitleForBroadcast(
          template.user_id,
          titleIndex,
          titleFolderId
        );
        
        if (titleResult.title) {
          finalTitle = titleResult.title.title;
          console.log(`[ScheduleService] Using rotated title: "${finalTitle}" (index: ${titleResult.currentPosition}/${titleResult.totalCount}, pinned: ${titleResult.isPinned}, folder: ${titleFolderId || 'all'})`);
          
          // Update title index for next run (only if not pinned)
          if (!titleResult.isPinned) {
            if (useUserRotation) {
              // Update user-level rotation index
              try {
                await updateUserTitleRotationIndex(template.user_id, titleResult.nextIndex);
                console.log(`[ScheduleService] Updated user title rotation index to ${titleResult.nextIndex}`);
              } catch (err) {
                console.error(`[ScheduleService] Failed to update user title rotation index:`, err.message);
              }
            } else if (template.id) {
              // Update template-level rotation index
              try {
                await BroadcastTemplate.updateTitleIndex(template.id, titleResult.nextIndex);
                console.log(`[ScheduleService] Updated template ${template.id} title_index to ${titleResult.nextIndex}`);
              } catch (err) {
                console.error(`[ScheduleService] Failed to update title index:`, err.message);
              }
            }
          }
          
          // Increment use count for the title
          try {
            await TitleSuggestion.incrementUseCount(titleResult.title.id, template.user_id);
          } catch (err) {
            console.error(`[ScheduleService] Failed to increment title use count:`, err.message);
          }
        } else {
          console.log(`[ScheduleService] No titles found for rotation, using template title: "${template.title}"`);
        }
        
        const title = replaceTitlePlaceholders(finalTitle, now);
        const description = template.description ? replaceTitlePlaceholders(template.description, now) : '';
        
        // Calculate scheduled start time (10 minutes from now)
        const scheduledStartTime = new Date(now.getTime() + 10 * 60 * 1000);
        
        // Log template privacy_status for debugging
        console.log(`[ScheduleService] Template privacy_status: ${template.privacy_status}`);
        
        const broadcastData = {
          title,
          description,
          scheduledStartTime: scheduledStartTime.toISOString(),
          privacyStatus: template.privacy_status || 'unlisted',
          tags: template.tags || [],
          categoryId: template.category_id || '20',
          streamId: template.stream_id || null,
          // IMPORTANT: Always enable auto-start when creating from recurring template
          // This ensures YouTube broadcast starts automatically when stream begins
          enableAutoStart: true,
          enableAutoStop: true
        };
        
        console.log(`[ScheduleService] Creating single broadcast: ${title}`);
        console.log(`[ScheduleService] Using privacyStatus: ${broadcastData.privacyStatus}`);
        console.log(`[ScheduleService] Using streamId: ${template.stream_id || 'none (will create new)'}`);
        
        const result = await youtubeService.createBroadcast(accessToken, broadcastData);
        results.push(result);
        console.log(`[ScheduleService] Broadcast created: ${result.broadcastId || result.id}`);
        
        // Determine thumbnail folder from stream key mapping if available
        // Priority: stream_key_folder_mapping > template.thumbnail_folder
        let thumbnailFolder = null;
        
        // First check stream_key_folder_mapping for this stream key
        if (template.stream_id && template.stream_key_folder_mapping) {
          const mappedFolder = template.stream_key_folder_mapping[template.stream_id];
          if (mappedFolder !== undefined) {
            thumbnailFolder = mappedFolder;
            console.log(`[ScheduleService] Using mapped folder for stream key ${template.stream_id}: ${thumbnailFolder === '' ? 'root' : thumbnailFolder}`);
          }
        }
        
        // Fallback to template.thumbnail_folder if no mapping found
        if (thumbnailFolder === null && template.thumbnail_folder !== null && template.thumbnail_folder !== undefined) {
          thumbnailFolder = template.thumbnail_folder;
          console.log(`[ScheduleService] Using template thumbnail_folder: ${thumbnailFolder === '' ? 'root' : thumbnailFolder}`);
        }
        
        // Save broadcast settings including thumbnail folder
        try {
          await YouTubeBroadcastSettings.upsert({
            broadcastId: result.broadcastId || result.id,
            userId: template.user_id,
            accountId: template.account_id || null,
            enableAutoStart: true,
            enableAutoStop: true,
            unlistReplayOnEnd: false,
            originalPrivacyStatus: template.privacy_status || 'unlisted',
            thumbnailFolder: thumbnailFolder !== null ? thumbnailFolder : null,
            templateId: template.id
          });
          console.log(`[ScheduleService] Saved broadcast settings for ${result.broadcastId || result.id}, thumbnailFolder: ${thumbnailFolder !== null ? (thumbnailFolder === '' ? 'root' : thumbnailFolder) : 'null'}, templateId: ${template.id}`);
        } catch (settingsErr) {
          console.error(`[ScheduleService] Failed to save broadcast settings:`, settingsErr.message);
        }
        
        // Upload thumbnail - use sequential selection from folder with per-stream-key index
        if (thumbnailFolder !== null || template.thumbnail_path || template.pinned_thumbnail) {
          // Get thumbnail index for this specific stream key (if stream_id exists)
          let thumbnailIndex = template.thumbnail_index || 0;
          if (template.stream_id) {
            thumbnailIndex = await getStreamKeyThumbnailIndex(template.user_id, template.stream_id);
            console.log(`[ScheduleService] Stream key ${template.stream_id} current thumbnail_index: ${thumbnailIndex}`);
          }
          
          console.log(`[ScheduleService] Uploading thumbnail: folder=${thumbnailFolder || 'none'}, currentIndex=${thumbnailIndex}`);
          const uploadResult = await this.uploadThumbnailForBroadcast(
            accessToken, 
            result.broadcastId || result.id, 
            template.thumbnail_path,
            thumbnailFolder,
            template.user_id,
            template.pinned_thumbnail,
            template.stream_id ? null : template.id, // Only update template index if no stream_id
            thumbnailIndex
          );
          
          // Update thumbnail index for this stream key after successful upload
          if (uploadResult && uploadResult.newIndex !== undefined && template.stream_id) {
            await updateStreamKeyThumbnailIndex(template.user_id, template.stream_id, uploadResult.newIndex);
          }
        } else {
          console.log(`[ScheduleService] No thumbnail to upload (folder=${thumbnailFolder}, path=${template.thumbnail_path}, pinned=${template.pinned_thumbnail})`);
        }
      }
      
      // Update last run and calculate next run
      const nextRun = calculateNextRun({
        recurring_pattern: template.recurring_pattern,
        recurring_time: template.recurring_time,
        recurring_days: template.recurring_days
      });
      
      await BroadcastTemplate.updateLastRun(
        template.id,
        now.toISOString(),
        nextRun ? formatNextRunAt(nextRun) : null
      );
      
      console.log(`[ScheduleService] Template ${template.name}: Created ${results.length} broadcast(s)`);
      console.log(`[ScheduleService] Next run: ${nextRun?.toISOString() || 'N/A'}`);
      
      releaseLock();
      return results;
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`[ScheduleService] Execute error for "${template.name}" (attempt ${retryCount + 1}/${maxRetries}):`, errorMsg);
      
      // Check for token-related errors - don't retry these
      if (errorMsg.includes('TOKEN_EXPIRED') || errorMsg.includes('invalid_grant') || errorMsg.includes('revoked')) {
        console.error(`[ScheduleService] Token error - not retrying. User needs to reconnect YouTube account.`);
        // Still update next_run_at so schedule continues
        try {
          const nextRun = calculateNextRun({
            recurring_pattern: template.recurring_pattern,
            recurring_time: template.recurring_time,
            recurring_days: template.recurring_days
          });
          if (nextRun) {
            await BroadcastTemplate.updateLastRun(
              template.id,
              new Date().toISOString(),
              formatNextRunAt(nextRun)
            );
            console.log(`[ScheduleService] Updated next_run_at despite token error: ${formatNextRunAt(nextRun)}`);
          }
        } catch (updateErr) {
          console.error(`[ScheduleService] Failed to update next_run_at:`, updateErr.message);
        }
        releaseLock();
        return { error: 'TOKEN_EXPIRED', template: template.name };
      }
      
      // For other errors, retry if attempts remaining (release lock first so retry can re-acquire)
      if (retryCount < maxRetries - 1) {
        console.log(`[ScheduleService] Retrying in 30 seconds...`);
        releaseLock();
        await new Promise(resolve => setTimeout(resolve, 30000));
        return this.executeTemplate(template, retryCount + 1);
      }
      
      // All retries failed - still update next_run_at so schedule continues
      console.error(`[ScheduleService] All retries failed for template: ${template.name}`);
      try {
        const nextRun = calculateNextRun({
          recurring_pattern: template.recurring_pattern,
          recurring_time: template.recurring_time,
          recurring_days: template.recurring_days
        });
        if (nextRun) {
          await BroadcastTemplate.updateLastRun(
            template.id,
            new Date().toISOString(),
            formatNextRunAt(nextRun)
          );
          console.log(`[ScheduleService] Updated next_run_at after all retries failed: ${formatNextRunAt(nextRun)}`);
        }
      } catch (updateErr) {
        console.error(`[ScheduleService] Failed to update next_run_at:`, updateErr.message);
      }
      
      releaseLock();
      return { error: errorMsg, template: template.name };
    }
  }

  /**
   * Upload thumbnail for a broadcast
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID to upload thumbnail for
   * @param {string} thumbnailPath - Path to thumbnail file relative to /public
   * @param {string} thumbnailFolder - Folder name for thumbnail selection
   * @param {string} userId - User ID for folder-based thumbnail lookup
   * @param {string} pinnedThumbnail - Pinned thumbnail path (highest priority)
   * @param {string} templateId - Template ID for updating thumbnail index (null if using per-stream-key index)
   * @param {number} currentIndex - Current thumbnail index for sequential mode
   * @returns {Promise<{success: boolean, newIndex: number}|false>} Result with newIndex or false on failure
   */
  async uploadThumbnailForBroadcast(accessToken, broadcastId, thumbnailPath, thumbnailFolder = null, userId = null, pinnedThumbnail = null, templateId = null, currentIndex = 0) {
    try {
      let fullPath = null;
      let newThumbnailIndex = currentIndex;
      
      // Priority 1: Use pinned thumbnail if set
      if (pinnedThumbnail && userId) {
        fullPath = path.join(__dirname, '..', 'public', pinnedThumbnail);
        if (fs.existsSync(fullPath)) {
          console.log(`[ScheduleService] Using pinned thumbnail: ${pinnedThumbnail}`);
        } else {
          console.warn(`[ScheduleService] Pinned thumbnail not found: ${fullPath}, falling back to sequential`);
          fullPath = null;
        }
      }
      
      // Priority 2: If thumbnail_folder is specified, select thumbnail sequentially from that folder
      if (!fullPath && thumbnailFolder !== null && thumbnailFolder !== undefined && userId) {
        const result = await this.getSequentialThumbnailFromFolder(userId, thumbnailFolder, currentIndex);
        if (result.path) {
          fullPath = path.join(__dirname, '..', 'public', result.path);
          newThumbnailIndex = result.newIndex;
          console.log(`[ScheduleService] Selected sequential thumbnail from folder "${thumbnailFolder}": ${result.path} (index: ${currentIndex} -> ${newThumbnailIndex})`);
          
          // Update thumbnail index in template for next run (only if templateId provided)
          if (templateId) {
            try {
              await BroadcastTemplate.updateThumbnailIndex(templateId, newThumbnailIndex);
              console.log(`[ScheduleService] Updated template ${templateId} thumbnail_index to ${newThumbnailIndex}`);
            } catch (err) {
              console.error(`[ScheduleService] Failed to update thumbnail index:`, err.message);
            }
          }
        }
      }
      
      // Priority 3: Fallback to specific thumbnail_path if no folder or selection failed
      if (!fullPath && thumbnailPath) {
        fullPath = path.join(__dirname, '..', 'public', thumbnailPath);
      }
      
      if (!fullPath) {
        return false;
      }

      // Check if file exists before reading
      if (!fs.existsSync(fullPath)) {
        console.warn(`[ScheduleService] Thumbnail not found: ${fullPath}`);
        return false;
      }

      const thumbnailBuffer = fs.readFileSync(fullPath);
      await youtubeService.uploadThumbnail(accessToken, broadcastId, thumbnailBuffer);
      console.log(`[ScheduleService] Thumbnail uploaded for broadcast: ${broadcastId}`);
      
      // Return success with newIndex for caller to update per-stream-key index
      return { success: true, newIndex: newThumbnailIndex };
    } catch (error) {
      console.error(`[ScheduleService] Thumbnail upload failed for ${broadcastId}:`, error.message);
      // Continue without failing - thumbnail is optional
      return false;
    }
  }

  /**
   * Get sequential thumbnail from a user's folder
   * @param {string} userId - User ID
   * @param {string} folderName - Folder name (empty string for root)
   * @param {number} currentIndex - Current thumbnail index
   * @returns {Promise<{path: string|null, newIndex: number, totalCount: number}>} Thumbnail info
   */
  async getSequentialThumbnailFromFolder(userId, folderName, currentIndex = 0) {
    try {
      const basePath = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails', userId);
      let targetPath = basePath;
      
      if (folderName && folderName.trim()) {
        targetPath = path.join(basePath, folderName);
      }
      
      if (!fs.existsSync(targetPath)) {
        console.warn(`[ScheduleService] Thumbnail folder not found: ${targetPath}`);
        return { path: null, newIndex: 0, totalCount: 0 };
      }
      
      // Get all image files in the folder, sorted alphabetically for consistent order
      const files = fs.readdirSync(targetPath)
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png'].includes(ext);
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      
      if (files.length === 0) {
        console.warn(`[ScheduleService] No thumbnails found in folder: ${targetPath}`);
        return { path: null, newIndex: 0, totalCount: 0 };
      }
      
      // Calculate the actual index (wrap around if needed)
      const actualIndex = currentIndex % files.length;
      const selectedFile = files[actualIndex];
      
      // Calculate next index for next run
      const newIndex = (actualIndex + 1) % files.length;
      
      console.log(`[ScheduleService] Sequential thumbnail: index ${actualIndex}/${files.length - 1}, file: ${selectedFile}, next index: ${newIndex}`);
      
      // Return relative path from /public
      let thumbnailPath;
      if (folderName && folderName.trim()) {
        thumbnailPath = `/uploads/thumbnails/${userId}/${folderName}/${selectedFile}`;
      } else {
        thumbnailPath = `/uploads/thumbnails/${userId}/${selectedFile}`;
      }
      
      return { path: thumbnailPath, newIndex, totalCount: files.length };
    } catch (error) {
      console.error(`[ScheduleService] Error getting sequential thumbnail:`, error.message);
      return { path: null, newIndex: 0, totalCount: 0 };
    }
  }

  /**
   * Get next title for broadcast using sequential rotation
   * @param {string} userId - User ID
   * @param {number} currentIndex - Current title index
   * @param {string} folderId - Optional folder ID to filter titles
   * @returns {Promise<{title: Object|null, nextIndex: number, isPinned: boolean, totalCount: number, currentPosition: number}>}
   */
  async getNextTitleForBroadcast(userId, currentIndex = 0, folderId = null) {
    try {
      // Use TitleSuggestion.getNextTitle for sequential rotation with optional folder filter
      const result = await TitleSuggestion.getNextTitle(userId, currentIndex, folderId);
      
      if (result.title) {
        return {
          title: result.title,
          nextIndex: result.nextIndex,
          isPinned: result.isPinned,
          totalCount: result.totalCount || 1,
          currentPosition: result.currentPosition || 1
        };
      }
      
      // No title found
      return {
        title: null,
        nextIndex: 0,
        isPinned: false,
        totalCount: 0,
        currentPosition: 0
      };
    } catch (error) {
      console.error(`[ScheduleService] Error getting next title:`, error.message);
      return {
        title: null,
        nextIndex: currentIndex,
        isPinned: false,
        totalCount: 0,
        currentPosition: 0
      };
    }
  }

  /**
   * Reload a specific template
   * @param {string} templateId - Template ID
   */
  async reloadTemplate(templateId) {
    this.cancelJob(templateId);
    
    const template = await BroadcastTemplate.findById(templateId);
    if (template && template.recurring_enabled) {
      await this.scheduleJob(template);
    }
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    this.stopChecker();
    this.jobs.clear();
    this.executingTemplates.clear(); // Clear execution locks
    this.initialized = false;
    console.log('[ScheduleService] Shutdown complete');
  }
}

// Export singleton instance
module.exports = new ScheduleService();
