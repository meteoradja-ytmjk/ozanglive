/**
 * Utility functions for recurring schedule validation and calculation
 */

const VALID_PATTERNS = ['daily', 'weekly'];
const VALID_DAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'
];
const DAY_INDEX_MAP = {
  'sunday': 0, 'minggu': 0,
  'monday': 1, 'senin': 1,
  'tuesday': 2, 'selasa': 2,
  'wednesday': 3, 'rabu': 3,
  'thursday': 4, 'kamis': 4,
  'friday': 5, 'jumat': 5,
  'saturday': 6, 'sabtu': 6
};

/**
 * Get current time in Asia/Jakarta timezone (WIB)
 * Uses Intl.DateTimeFormat for accurate timezone conversion
 * @param {Date} date - Date object to convert
 * @returns {Object} Object with hours, minutes, day, year, month, date
 */
function getWIBTime(date = new Date()) {
  try {
    // Use Intl.DateTimeFormat for accurate timezone conversion
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    let hours = 0, minutes = 0, dayName = '', year = 0, month = 0, dayOfMonth = 0;
    
    for (const part of parts) {
      if (part.type === 'hour') hours = parseInt(part.value, 10);
      if (part.type === 'minute') minutes = parseInt(part.value, 10);
      if (part.type === 'weekday') dayName = part.value;
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10) - 1; // 0-indexed
      if (part.type === 'day') dayOfMonth = parseInt(part.value, 10);
    }
    
    // Convert day name to number (0=Sun, 1=Mon, etc.)
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const day = dayMap[dayName] ?? date.getDay();
    
    return { hours, minutes, day, year, month, dayOfMonth };
  } catch (e) {
    // Fallback to manual calculation if Intl fails
    console.warn('[recurringUtils] Intl.DateTimeFormat failed, using manual WIB calculation');
    const wibOffset = 7 * 60 * 60 * 1000; // 7 hours in ms
    const wibDate = new Date(date.getTime() + wibOffset);
    
    return {
      hours: wibDate.getUTCHours(),
      minutes: wibDate.getUTCMinutes(),
      day: wibDate.getUTCDay(),
      year: wibDate.getUTCFullYear(),
      month: wibDate.getUTCMonth(),
      dayOfMonth: wibDate.getUTCDate()
    };
  }
}

/**
 * Create a Date object for a specific WIB time
 * @param {number} year - Year
 * @param {number} month - Month (0-indexed)
 * @param {number} day - Day of month
 * @param {number} hours - Hours (0-23)
 * @param {number} minutes - Minutes (0-59)
 * @returns {Date} Date object in UTC that represents the given WIB time
 */
function createWIBDate(year, month, day, hours, minutes) {
  // Create date in WIB, then convert to UTC
  // WIB is UTC+7, so subtract 7 hours to get UTC
  const utcHours = hours - 7;
  
  // Handle day rollover
  let adjustedDay = day;
  let adjustedMonth = month;
  let adjustedYear = year;
  let adjustedHours = utcHours;
  
  if (utcHours < 0) {
    adjustedHours = utcHours + 24;
    adjustedDay = day - 1;
    
    // Handle month rollover
    if (adjustedDay < 1) {
      adjustedMonth = month - 1;
      if (adjustedMonth < 0) {
        adjustedMonth = 11;
        adjustedYear = year - 1;
      }
      // Get last day of previous month
      adjustedDay = new Date(adjustedYear, adjustedMonth + 1, 0).getDate();
    }
  }
  
  return new Date(Date.UTC(adjustedYear, adjustedMonth, adjustedDay, adjustedHours, minutes, 0, 0));
}

/**
 * Validate recurring configuration
 * @param {Object} config - Recurring configuration
 * @param {boolean} config.recurring_enabled - Whether recurring is enabled
 * @param {string} config.recurring_pattern - Pattern: 'daily' or 'weekly'
 * @param {string} config.recurring_time - Time in HH:MM format
 * @param {string[]} config.recurring_days - Array of day names for weekly pattern
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
/**
 * Parse recurring time string or array into sorted array of valid HH:MM strings
 * Supports single time "08:00", comma-separated "08:00, 13:00, 19:00", JSON array, or Array
 * @param {string|string[]} recurringTime
 * @returns {string[]} Sorted array of valid HH:MM strings
 */
function parseRecurringTimes(recurringTime) {
  if (!recurringTime) return [];

  let rawList = [];
  if (Array.isArray(recurringTime)) {
    rawList = recurringTime;
  } else if (typeof recurringTime === 'string') {
    const trimmed = recurringTime.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) rawList = parsed;
      } catch (e) {
        rawList = trimmed.replace(/^\[|\]$/g, '').split(/[\s,]+/);
      }
    } else {
      rawList = trimmed.split(/[\s,]+/);
    }
  }

  const validTimes = rawList
    .map(t => typeof t === 'string' ? t.trim() : '')
    .filter(t => isValidTimeFormat(t));

  // Deduplicate and sort chronologically
  const unique = Array.from(new Set(validTimes));
  unique.sort((a, b) => {
    const [h1, m1] = a.split(':').map(Number);
    const [h2, m2] = b.split(':').map(Number);
    return (h1 * 60 + m1) - (h2 * 60 + m2);
  });

  return unique;
}

/**
 * Validate recurring configuration
 * @param {Object} config - Recurring configuration
 * @param {boolean} config.recurring_enabled - Whether recurring is enabled
 * @param {string} config.recurring_pattern - Pattern: 'daily' or 'weekly'
 * @param {string|string[]} config.recurring_time - Time or multiple times in HH:MM format
 * @param {string[]} config.recurring_days - Array of day names for weekly pattern
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
function validateRecurringConfig(config) {
  const errors = [];
  const { recurring_enabled, recurring_pattern, recurring_time, recurring_days } = config;

  // If not enabled, no validation needed
  if (!recurring_enabled) {
    return { valid: true, errors: [] };
  }

  // Validate pattern
  if (!recurring_pattern) {
    errors.push('Recurring pattern is required');
  } else if (!VALID_PATTERNS.includes(recurring_pattern)) {
    errors.push('Recurring pattern must be daily or weekly');
  }

  // Validate time format (supports single time or multi-time schedule bertingkat)
  const times = parseRecurringTimes(recurring_time);
  if (times.length === 0) {
    errors.push('Recurring time is required in HH:MM format (e.g. 08:00 or 08:00, 13:00)');
  }

  // Validate days for weekly pattern
  if (recurring_pattern === 'weekly') {
    if (!recurring_days || !Array.isArray(recurring_days) || recurring_days.length === 0) {
      errors.push('Weekly schedule requires at least one day selected');
    } else {
      const invalidDays = recurring_days.filter(day => !VALID_DAYS.includes(day.toLowerCase()));
      if (invalidDays.length > 0) {
        errors.push(`Invalid days: ${invalidDays.join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate time format (HH:MM)
 * @param {string} time - Time string
 * @returns {boolean} True if valid
 */
function isValidTimeFormat(time) {
  if (!time || typeof time !== 'string') return false;
  
  const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  return regex.test(time.trim());
}

/**
 * Parse time string to hours and minutes
 * @param {string} time - Time in HH:MM format
 * @returns {Object} { hours: number, minutes: number }
 */
function parseTime(time) {
  const [hours, minutes] = time.trim().split(':').map(Number);
  return { hours, minutes };
}

/**
 * Calculate next run time for daily pattern with schedule bertingkat support
 * Ensures next_run_at is always in the future
 * Uses WIB timezone for calculation
 * @param {string|string[]} timeInput - Time or multiple times in HH:MM format (WIB)
 * @param {Date} fromDate - Starting date (default: now)
 * @returns {Date} Next run date (always in the future)
 */
function calculateNextDailyRun(timeInput, fromDate = new Date()) {
  const times = parseRecurringTimes(timeInput);
  if (times.length === 0) {
    throw new Error('No valid time provided for daily schedule');
  }

  // Get current time in WIB
  const wibNow = getWIBTime(fromDate);
  const currentMinutes = wibNow.hours * 60 + wibNow.minutes;

  // Look for the next upcoming time TODAY
  for (const t of times) {
    const { hours, minutes } = parseTime(t);
    const scheduleMinutes = hours * 60 + minutes;
    if (scheduleMinutes > currentMinutes) {
      return createWIBDate(wibNow.year, wibNow.month, wibNow.dayOfMonth, hours, minutes);
    }
  }

  // If all times today have passed, pick the earliest time TOMORROW
  const earliestTime = parseTime(times[0]);
  const tempDate = new Date(Date.UTC(wibNow.year, wibNow.month, wibNow.dayOfMonth + 1));
  const targetYear = tempDate.getUTCFullYear();
  const targetMonth = tempDate.getUTCMonth();
  const targetDay = tempDate.getUTCDate();

  return createWIBDate(targetYear, targetMonth, targetDay, earliestTime.hours, earliestTime.minutes);
}

/**
 * Calculate next run time for weekly pattern with schedule bertingkat support
 * Ensures next_run_at is always in the future
 * Uses WIB timezone for calculation
 * @param {string|string[]} timeInput - Time or multiple times in HH:MM format (WIB)
 * @param {string[]} days - Array of day names
 * @param {Date} fromDate - Starting date (default: now)
 * @returns {Date} Next run date (always in the future)
 */
function calculateNextWeeklyRun(timeInput, days, fromDate = new Date()) {
  const times = parseRecurringTimes(timeInput);
  if (times.length === 0) {
    throw new Error('No valid time provided for weekly schedule');
  }

  // Get current time in WIB
  const wibNow = getWIBTime(fromDate);
  const currentDay = wibNow.day; // 0=Sun, 1=Mon, etc.
  const currentMinutes = wibNow.hours * 60 + wibNow.minutes;

  // Convert day names to day indices and sort
  const dayIndices = days
    .map(day => DAY_INDEX_MAP[day.toLowerCase()])
    .filter(idx => idx !== undefined)
    .sort((a, b) => a - b);

  if (dayIndices.length === 0) {
    throw new Error('No valid days provided');
  }

  // Check if today is scheduled and has an upcoming time slot
  const todayScheduled = dayIndices.includes(currentDay);
  if (todayScheduled) {
    for (const t of times) {
      const { hours, minutes } = parseTime(t);
      const scheduleMinutes = hours * 60 + minutes;
      if (scheduleMinutes > currentMinutes) {
        return createWIBDate(wibNow.year, wibNow.month, wibNow.dayOfMonth, hours, minutes);
      }
    }
  }

  // Find next scheduled day
  let daysToAdd = null;
  for (const dayIdx of dayIndices) {
    if (dayIdx > currentDay) {
      daysToAdd = dayIdx - currentDay;
      break;
    }
  }

  // If no day found later this week, wrap to next week
  if (daysToAdd === null) {
    daysToAdd = (7 - currentDay) + dayIndices[0];
  }

  const earliestTime = parseTime(times[0]);
  const tempDate = new Date(Date.UTC(wibNow.year, wibNow.month, wibNow.dayOfMonth + daysToAdd));
  const targetYear = tempDate.getUTCFullYear();
  const targetMonth = tempDate.getUTCMonth();
  const targetDay = tempDate.getUTCDate();

  return createWIBDate(targetYear, targetMonth, targetDay, earliestTime.hours, earliestTime.minutes);
}

/**
 * Calculate next run time based on pattern
 * Ensures next_run_at is always in the future
 * @param {Object} config - Recurring configuration
 * @param {string} config.recurring_pattern - Pattern: 'daily' or 'weekly'
 * @param {string|string[]} config.recurring_time - Time or multiple times in HH:MM format
 * @param {string[]} config.recurring_days - Array of day names for weekly pattern
 * @param {Date} fromDate - Starting date (default: now)
 * @returns {Date|null} Next run date (always in the future), or null if invalid config
 */
function calculateNextRun(config, fromDate = new Date()) {
  const { recurring_pattern, recurring_time, recurring_days } = config;

  const times = parseRecurringTimes(recurring_time);
  if (times.length === 0) {
    return null;
  }

  if (recurring_pattern === 'daily') {
    return calculateNextDailyRun(times, fromDate);
  } else if (recurring_pattern === 'weekly') {
    if (!recurring_days || !Array.isArray(recurring_days) || recurring_days.length === 0) {
      return null;
    }
    return calculateNextWeeklyRun(times, recurring_days, fromDate);
  }

  return null;
}

/**
 * Format next run date to ISO string
 * @param {Date} date - Date to format
 * @returns {string} ISO string
 */
function formatNextRunAt(date) {
  return date.toISOString();
}

/**
 * Replace placeholders in title with actual date/time values
 * Supports: {date}, {time}, {day}, {month}, {year}, {datetime}, {iso}, {DD}, {MM}, {YYYY}, {HH}, {mm}
 * @param {string} titleTemplate - Title with placeholders
 * @param {Date} scheduledDate - Scheduled date
 * @returns {string} Title with replaced placeholders
 */
function replaceTitlePlaceholders(titleTemplate, scheduledDate = new Date()) {
  if (!titleTemplate || typeof titleTemplate !== 'string') {
    return titleTemplate || '';
  }
  
  const date = new Date(scheduledDate);
  
  // Pad number with leading zero
  const pad = (num) => num.toString().padStart(2, '0');
  
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear().toString();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  
  // Build replacements map with DD/MM/YYYY and HH:mm formats as per requirements
  const replacements = {
    '{date}': day + '/' + month + '/' + year,
    '{time}': hours + ':' + minutes,
    '{day}': date.toLocaleDateString('id-ID', { weekday: 'long' }),
    '{month}': date.toLocaleDateString('id-ID', { month: 'long' }),
    '{year}': year,
    '{datetime}': day + '/' + month + '/' + year + ' ' + hours + ':' + minutes,
    '{iso}': date.toISOString().split('T')[0],
    '{DD}': day,
    '{MM}': month,
    '{YYYY}': year,
    '{HH}': hours,
    '{mm}': minutes
  };
  
  let result = titleTemplate;
  
  // Use simple string replacement (more reliable than regex for this use case)
  for (const [placeholder, value] of Object.entries(replacements)) {
    // Replace all occurrences using split and join
    result = result.split(placeholder).join(value);
  }
  
  return result;
}

/**
 * Check if a schedule was missed (next_run_at is in the past)
 * @param {string} nextRunAt - ISO timestamp of next scheduled run
 * @param {Date} now - Current time (default: now)
 * @returns {boolean} True if schedule was missed
 */
function isScheduleMissed(nextRunAt, now = new Date()) {
  if (!nextRunAt) return false;
  
  const scheduledTime = new Date(nextRunAt);
  return scheduledTime.getTime() < now.getTime();
}

module.exports = {
  parseRecurringTimes,
  validateRecurringConfig,
  isValidTimeFormat,
  parseTime,
  calculateNextDailyRun,
  calculateNextWeeklyRun,
  calculateNextRun,
  formatNextRunAt,
  replaceTitlePlaceholders,
  isScheduleMissed,
  getWIBTime,
  createWIBDate,
  VALID_PATTERNS,
  VALID_DAYS,
  DAY_INDEX_MAP
};
