/**
 * Utility functions for recurring schedule validation and calculation
 */

const VALID_PATTERNS = ['daily', 'weekly'];
const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_INDEX_MAP = {
  'sunday': 0,
  'monday': 1,
  'tuesday': 2,
  'wednesday': 3,
  'thursday': 4,
  'friday': 5,
  'saturday': 6
};

/**
 * Validate recurring configuration
 * @param {Object} config - Recurring configuration
 * @param {boolean} config.recurring_enabled - Whether recurring is enabled
 * @param {string} config.recurring_pattern - Pattern: 'daily' or 'weekly'
 * @param {string} config.recurring_time - Time in HH:MM format
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

  // Validate time format
  if (!recurring_time) {
    errors.push('Recurring time is required');
  } else if (!isValidTimeFormat(recurring_time)) {
    errors.push('Recurring time must be in HH:MM format');
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
  return regex.test(time);
}

/**
 * Parse time string to hours and minutes
 * @param {string} time - Time in HH:MM format
 * @returns {Object} { hours: number, minutes: number }
 */
function parseTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Calculate next run time for daily pattern
 * Ensures next_run_at is always in the future
 * @param {string} time - Time in HH:MM format
 * @param {Date} fromDate - Starting date (default: now)
 * @returns {Date} Next run date (always in the future)
 */
function calculateNextDailyRun(time, fromDate = new Date()) {
  const { hours, minutes } = parseTime(time);
  
  // Create a fresh date object to avoid mutation issues
  const now = new Date(fromDate.getTime());
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  
  // If the time has already passed today (or equals current time), schedule for tomorrow
  // Using >= ensures that if current time equals recurring_time, we schedule for tomorrow
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

/**
 * Calculate next run time for weekly pattern
 * Ensures next_run_at is always in the future
 * @param {string} time - Time in HH:MM format
 * @param {string[]} days - Array of day names
 * @param {Date} fromDate - Starting date (default: now)
 * @returns {Date} Next run date (always in the future)
 */
function calculateNextWeeklyRun(time, days, fromDate = new Date()) {
  const { hours, minutes } = parseTime(time);
  
  // Create a fresh date object to avoid mutation issues
  const now = new Date(fromDate.getTime());
  const currentDay = now.getDay();
  
  // Convert day names to day indices and sort
  const dayIndices = days
    .map(day => DAY_INDEX_MAP[day.toLowerCase()])
    .filter(idx => idx !== undefined)
    .sort((a, b) => a - b);
  
  if (dayIndices.length === 0) {
    throw new Error('No valid days provided');
  }
  
  // Check if we can run today (time hasn't passed yet)
  const todayScheduled = dayIndices.includes(currentDay);
  if (todayScheduled) {
    const todayRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    // Only return today if time is strictly in the future
    if (todayRun.getTime() > now.getTime()) {
      return todayRun;
    }
  }
  
  // Find next day in the week (after today)
  let daysToAdd = null;
  
  for (const dayIdx of dayIndices) {
    if (dayIdx > currentDay) {
      daysToAdd = dayIdx - currentDay;
      break;
    }
  }
  
  // If no day found this week, use first day of next week
  if (daysToAdd === null) {
    daysToAdd = 7 - currentDay + dayIndices[0];
  }
  
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, hours, minutes, 0, 0);
  
  return next;
}

/**
 * Calculate next run time based on pattern
 * Ensures next_run_at is always in the future
 * @param {Object} config - Recurring configuration
 * @param {string} config.recurring_pattern - Pattern: 'daily' or 'weekly'
 * @param {string} config.recurring_time - Time in HH:MM format
 * @param {string[]} config.recurring_days - Array of day names for weekly pattern
 * @param {Date} fromDate - Starting date (default: now)
 * @returns {Date|null} Next run date (always in the future), or null if invalid config
 */
function calculateNextRun(config, fromDate = new Date()) {
  const { recurring_pattern, recurring_time, recurring_days } = config;
  
  // Validate time format
  if (!recurring_time || !isValidTimeFormat(recurring_time)) {
    return null;
  }
  
  if (recurring_pattern === 'daily') {
    return calculateNextDailyRun(recurring_time, fromDate);
  } else if (recurring_pattern === 'weekly') {
    if (!recurring_days || !Array.isArray(recurring_days) || recurring_days.length === 0) {
      return null;
    }
    return calculateNextWeeklyRun(recurring_time, recurring_days, fromDate);
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
  validateRecurringConfig,
  isValidTimeFormat,
  parseTime,
  calculateNextDailyRun,
  calculateNextWeeklyRun,
  calculateNextRun,
  formatNextRunAt,
  replaceTitlePlaceholders,
  isScheduleMissed,
  VALID_PATTERNS,
  VALID_DAYS,
  DAY_INDEX_MAP
};
