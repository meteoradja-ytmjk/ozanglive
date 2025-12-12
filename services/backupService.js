/**
 * Backup Service for Stream Settings
 * Handles export and import of stream configurations
 */

const Stream = require('../models/Stream');

// Fields to include in export (non-sensitive configuration fields)
const EXPORT_FIELDS = [
  'title',
  'rtmp_url',
  'stream_key',
  'platform',
  'platform_icon',
  'bitrate',
  'resolution',
  'fps',
  'orientation',
  'loop_video',
  'schedule_type',
  'schedule_days',
  'schedule_time',           // Added: for one-time schedule
  'recurring_time',
  'recurring_enabled',
  'stream_duration_hours',
  'stream_duration_minutes'  // Added: for duration in minutes
];

// Required fields for import validation
const REQUIRED_FIELDS = ['title', 'rtmp_url', 'stream_key'];

// Fields to exclude (sensitive/system fields)
const EXCLUDED_FIELDS = [
  'id',
  'user_id',
  'video_id',
  'audio_id',
  'status',
  'status_updated_at',
  'start_time',
  'end_time',
  'duration',
  'created_at',
  'updated_at'
];

/**
 * Export streams to backup format
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Backup data object
 */
async function exportStreams(userId) {
  const streams = await Stream.findAll(userId);
  
  const exportedStreams = streams.map(stream => {
    const exportedStream = {};
    EXPORT_FIELDS.forEach(field => {
      if (stream[field] !== undefined) {
        // Parse schedule_days from JSON string to array if it's a string
        if (field === 'schedule_days' && typeof stream[field] === 'string') {
          try {
            exportedStream[field] = JSON.parse(stream[field]);
          } catch (e) {
            exportedStream[field] = stream[field];
          }
        } else {
          exportedStream[field] = stream[field];
        }
      }
    });
    return exportedStream;
  });

  return {
    metadata: {
      exportDate: new Date().toISOString(),
      appVersion: '1.0.0',
      totalStreams: exportedStreams.length
    },
    streams: exportedStreams
  };
}

/**
 * Validate backup file structure
 * @param {Object} data - Parsed JSON data
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateBackupFormat(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid backup format: data must be an object');
    return { valid: false, errors };
  }

  if (!Array.isArray(data.streams)) {
    errors.push('Invalid backup format: missing streams array');
    return { valid: false, errors };
  }

  return { valid: true, errors };
}

/**
 * Determine the appropriate status for an imported stream
 * @param {Object} streamConfig - Stream configuration object
 * @returns {string} Status: 'scheduled' or 'offline'
 */
function determineImportStatus(streamConfig) {
  // Recurring schedules (daily/weekly) should be scheduled
  if (streamConfig.schedule_type === 'daily' || streamConfig.schedule_type === 'weekly') {
    return 'scheduled';
  }
  
  // One-time schedule with schedule_time should be scheduled
  if (streamConfig.schedule_time) {
    return 'scheduled';
  }
  
  // Default to offline
  return 'offline';
}

/**
 * Validate single stream configuration
 * @param {Object} streamConfig - Stream configuration object
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateStreamConfig(streamConfig) {
  const errors = [];

  if (!streamConfig || typeof streamConfig !== 'object') {
    errors.push('Stream configuration must be an object');
    return { valid: false, errors };
  }

  REQUIRED_FIELDS.forEach(field => {
    if (!streamConfig[field] || (typeof streamConfig[field] === 'string' && streamConfig[field].trim() === '')) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Import streams from backup data
 * @param {Object} backupData - Parsed backup JSON
 * @param {string} userId - User ID
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importStreams(backupData, userId) {
  const result = {
    imported: 0,
    skipped: 0,
    errors: []
  };

  // Validate backup format
  const formatValidation = validateBackupFormat(backupData);
  if (!formatValidation.valid) {
    result.errors = formatValidation.errors;
    return result;
  }

  // Process each stream
  for (let i = 0; i < backupData.streams.length; i++) {
    const streamConfig = backupData.streams[i];
    const validation = validateStreamConfig(streamConfig);

    if (!validation.valid) {
      result.skipped++;
      result.errors.push(`Stream ${i + 1}: ${validation.errors.join(', ')}`);
      continue;
    }

    try {
      // Parse schedule_days - ensure it's an array
      let scheduleDays = streamConfig.schedule_days;
      if (typeof scheduleDays === 'string') {
        try {
          scheduleDays = JSON.parse(scheduleDays);
        } catch (e) {
          scheduleDays = null;
        }
      }
      // Ensure it's an array or null
      if (scheduleDays && !Array.isArray(scheduleDays)) {
        scheduleDays = null;
      }

      // Capture original settings for reset functionality
      const originalSettings = {
        schedule_time: streamConfig.schedule_time || null,
        recurring_time: streamConfig.recurring_time || null,
        stream_duration_minutes: streamConfig.stream_duration_minutes || 
          (streamConfig.stream_duration_hours ? streamConfig.stream_duration_hours * 60 : null),
        schedule_type: streamConfig.schedule_type || 'once',
        schedule_days: scheduleDays,
        recurring_enabled: streamConfig.recurring_enabled !== false
      };

      // Determine status based on schedule configuration
      const status = determineImportStatus(streamConfig);

      // Prepare stream data for creation
      const streamData = {
        title: streamConfig.title,
        rtmp_url: streamConfig.rtmp_url,
        stream_key: streamConfig.stream_key,
        platform: streamConfig.platform || 'YouTube',
        platform_icon: streamConfig.platform_icon || 'youtube',
        bitrate: streamConfig.bitrate || 2500,
        resolution: streamConfig.resolution || '1920x1080',
        fps: streamConfig.fps || 30,
        orientation: streamConfig.orientation || 'horizontal',
        loop_video: streamConfig.loop_video !== false,
        schedule_type: streamConfig.schedule_type || 'once',
        schedule_days: scheduleDays,  // Use parsed schedule_days
        schedule_time: streamConfig.schedule_time || null,
        recurring_time: streamConfig.recurring_time || null,
        recurring_enabled: streamConfig.recurring_enabled !== false,
        stream_duration_minutes: streamConfig.stream_duration_minutes || 
          (streamConfig.stream_duration_hours ? streamConfig.stream_duration_hours * 60 : null),
        original_settings: originalSettings,
        user_id: userId,
        status: status
      };

      await Stream.create(streamData);
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`Stream ${i + 1}: Failed to create - ${error.message}`);
    }
  }

  return result;
}

module.exports = {
  exportStreams,
  importStreams,
  validateBackupFormat,
  validateStreamConfig,
  determineImportStatus,
  EXPORT_FIELDS,
  REQUIRED_FIELDS,
  EXCLUDED_FIELDS
};
