/**
 * Backup Service for Stream Settings
 * Handles export and import of stream configurations
 * Extended for comprehensive backup including all data categories
 */

const Stream = require('../models/Stream');
const YouTubeCredentials = require('../models/YouTubeCredentials');
const BroadcastTemplate = require('../models/BroadcastTemplate');
const RecurringSchedule = require('../models/RecurringSchedule');
const StreamTemplate = require('../models/StreamTemplate');
const Playlist = require('../models/Playlist');

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

// YouTube Credentials export fields
const YOUTUBE_CREDENTIALS_FIELDS = [
  'channel_name',
  'channel_id',
  'client_id',
  'client_secret',
  'refresh_token',
  'is_primary'
];

// Broadcast Template export fields
const BROADCAST_TEMPLATE_FIELDS = [
  'name',
  'title',
  'description',
  'privacy_status',
  'tags',
  'category_id',
  'thumbnail_path',
  'stream_id',
  'account_id',
  'recurring_enabled',
  'recurring_pattern',
  'recurring_time',
  'recurring_days',
  'next_run_at',
  'last_run_at'
];

// Recurring Schedule export fields
const RECURRING_SCHEDULE_FIELDS = [
  'name',
  'pattern',
  'schedule_time',
  'days_of_week',
  'template_id',
  'account_id',
  'title_template',
  'description',
  'privacy_status',
  'tags',
  'category_id',
  'is_active',
  'next_run_at',
  'last_run_at'
];

// Stream Template export fields
const STREAM_TEMPLATE_FIELDS = [
  'name',
  'video_id',
  'audio_id',
  'duration_hours',
  'duration_minutes',
  'loop_video',
  'schedule_type',
  'recurring_time',
  'schedule_days'
];

// Playlist export fields
const PLAYLIST_FIELDS = [
  'name',
  'description',
  'is_shuffle'
];

// All available categories for comprehensive export
const ALL_CATEGORIES = [
  'streams',
  'youtube_credentials',
  'broadcast_templates',
  'recurring_schedules',
  'stream_templates',
  'playlists'
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

/**
 * Export YouTube credentials for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of exported credentials
 */
async function exportYouTubeCredentials(userId) {
  const credentials = await YouTubeCredentials.findAllByUserId(userId);
  
  return credentials.map(cred => {
    const exported = {};
    YOUTUBE_CREDENTIALS_FIELDS.forEach(field => {
      // Map camelCase to snake_case for some fields
      const sourceField = field === 'channel_name' ? 'channelName' :
                         field === 'channel_id' ? 'channelId' :
                         field === 'client_id' ? 'clientId' :
                         field === 'client_secret' ? 'clientSecret' :
                         field === 'refresh_token' ? 'refreshToken' :
                         field === 'is_primary' ? 'isPrimary' : field;
      
      if (cred[sourceField] !== undefined) {
        exported[field] = cred[sourceField];
      }
    });
    return exported;
  });
}

/**
 * Export broadcast templates for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of exported templates
 */
async function exportBroadcastTemplates(userId) {
  const templates = await BroadcastTemplate.findByUserId(userId);
  
  return templates.map(template => {
    const exported = {};
    BROADCAST_TEMPLATE_FIELDS.forEach(field => {
      if (template[field] !== undefined) {
        exported[field] = template[field];
      }
    });
    return exported;
  });
}

/**
 * Export recurring schedules for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of exported schedules
 */
async function exportRecurringSchedules(userId) {
  const schedules = await RecurringSchedule.findByUserId(userId);
  
  return schedules.map(schedule => {
    const exported = {};
    RECURRING_SCHEDULE_FIELDS.forEach(field => {
      if (schedule[field] !== undefined) {
        exported[field] = schedule[field];
      }
    });
    return exported;
  });
}

/**
 * Export stream templates for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of exported templates
 */
async function exportStreamTemplates(userId) {
  const templates = await StreamTemplate.findByUserId(userId);
  
  return templates.map(template => {
    const exported = {};
    STREAM_TEMPLATE_FIELDS.forEach(field => {
      if (template[field] !== undefined) {
        exported[field] = template[field];
      }
    });
    return exported;
  });
}

/**
 * Export playlists with video associations for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of exported playlists with videos
 */
async function exportPlaylists(userId) {
  const playlists = await Playlist.findAll(userId);
  
  const exportedPlaylists = [];
  for (const playlist of playlists) {
    const exported = {};
    PLAYLIST_FIELDS.forEach(field => {
      if (playlist[field] !== undefined) {
        exported[field] = playlist[field];
      }
    });
    
    // Get videos with positions
    const playlistWithVideos = await Playlist.findByIdWithVideos(playlist.id);
    if (playlistWithVideos && playlistWithVideos.videos) {
      exported.videos = playlistWithVideos.videos.map(v => ({
        video_id: v.id,
        position: v.position
      }));
    } else {
      exported.videos = [];
    }
    
    exportedPlaylists.push(exported);
  }
  
  return exportedPlaylists;
}

/**
 * Export streams only (for backward compatibility, returns just streams array)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of exported streams
 */
async function exportStreamsOnly(userId) {
  const streams = await Stream.findAll(userId);
  
  return streams.map(stream => {
    const exportedStream = {};
    EXPORT_FIELDS.forEach(field => {
      if (stream[field] !== undefined) {
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
}

/**
 * Comprehensive export of all user data
 * @param {string} userId - User ID
 * @param {Array<string>|null} categories - Categories to export (null = all)
 * @returns {Promise<Object>} Comprehensive backup object
 */
async function comprehensiveExport(userId, categories = null) {
  const selectedCategories = categories && categories.length > 0 
    ? categories.filter(c => ALL_CATEGORIES.includes(c))
    : ALL_CATEGORIES;

  const backup = {
    metadata: {
      exportDate: new Date().toISOString(),
      appVersion: '1.0.0',
      exportType: 'comprehensive',
      counts: {}
    }
  };

  // Export each selected category
  for (const category of selectedCategories) {
    switch (category) {
      case 'streams':
        backup.streams = await exportStreamsOnly(userId);
        backup.metadata.counts.streams = backup.streams.length;
        break;
      case 'youtube_credentials':
        backup.youtube_credentials = await exportYouTubeCredentials(userId);
        backup.metadata.counts.youtube_credentials = backup.youtube_credentials.length;
        break;
      case 'broadcast_templates':
        backup.broadcast_templates = await exportBroadcastTemplates(userId);
        backup.metadata.counts.broadcast_templates = backup.broadcast_templates.length;
        break;
      case 'recurring_schedules':
        backup.recurring_schedules = await exportRecurringSchedules(userId);
        backup.metadata.counts.recurring_schedules = backup.recurring_schedules.length;
        break;
      case 'stream_templates':
        backup.stream_templates = await exportStreamTemplates(userId);
        backup.metadata.counts.stream_templates = backup.stream_templates.length;
        break;
      case 'playlists':
        backup.playlists = await exportPlaylists(userId);
        backup.metadata.counts.playlists = backup.playlists.length;
        break;
    }
  }

  return backup;
}

/**
 * Format backup as pretty-printed JSON string
 * @param {Object} backup - Backup object
 * @returns {string} Pretty-printed JSON
 */
function formatBackupJson(backup) {
  return JSON.stringify(backup, null, 2);
}

/**
 * Validate comprehensive backup format
 * @param {Object} data - Parsed JSON data
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateComprehensiveBackup(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid backup format: data must be an object');
    return { valid: false, errors };
  }

  // Check for metadata
  if (!data.metadata) {
    errors.push('Invalid backup format: missing metadata');
    return { valid: false, errors };
  }

  // Check for at least one category
  const hasCategory = ALL_CATEGORIES.some(cat => Array.isArray(data[cat]));
  if (!hasCategory) {
    errors.push('Invalid backup format: no valid data categories found');
    return { valid: false, errors };
  }

  return { valid: true, errors };
}

/**
 * Validate YouTube credential for import
 * @param {Object} cred - Credential object
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateYouTubeCredential(cred) {
  const errors = [];
  
  if (!cred.refresh_token || cred.refresh_token.trim() === '') {
    errors.push('Missing required field: refresh_token');
  }
  if (!cred.channel_id || cred.channel_id.trim() === '') {
    errors.push('Missing required field: channel_id');
  }
  if (!cred.client_id || cred.client_id.trim() === '') {
    errors.push('Missing required field: client_id');
  }
  if (!cred.client_secret || cred.client_secret.trim() === '') {
    errors.push('Missing required field: client_secret');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate broadcast template for import
 * @param {Object} template - Template object
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateBroadcastTemplate(template) {
  const errors = [];
  
  if (!template.name || template.name.trim() === '') {
    errors.push('Missing required field: name');
  }
  if (!template.title || template.title.trim() === '') {
    errors.push('Missing required field: title');
  }
  
  // Validate recurring config if enabled
  if (template.recurring_enabled) {
    if (!template.recurring_pattern || !['daily', 'weekly'].includes(template.recurring_pattern)) {
      errors.push('Invalid recurring_pattern: must be daily or weekly');
    }
    if (!template.recurring_time) {
      errors.push('Missing recurring_time when recurring is enabled');
    }
    if (template.recurring_pattern === 'weekly') {
      if (!template.recurring_days || !Array.isArray(template.recurring_days) || template.recurring_days.length === 0) {
        errors.push('Weekly schedule requires at least one day selected');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Import YouTube credentials from backup
 * @param {Array} credentials - Array of credentials to import
 * @param {string} userId - User ID
 * @param {Object} options - Import options
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importYouTubeCredentialsData(credentials, userId, options = {}) {
  const result = { imported: 0, skipped: 0, errors: [] };
  
  if (!Array.isArray(credentials)) return result;

  for (let i = 0; i < credentials.length; i++) {
    const cred = credentials[i];
    const validation = validateYouTubeCredential(cred);

    if (!validation.valid) {
      result.skipped++;
      result.errors.push(`youtube_credentials[${i}]: ${validation.errors.join(', ')}`);
      continue;
    }

    try {
      // Check for duplicate
      const exists = await YouTubeCredentials.existsByChannel(userId, cred.channel_id);
      if (exists) {
        if (options.skipDuplicates) {
          result.skipped++;
          continue;
        }
        // TODO: Implement overwrite if needed
      }

      await YouTubeCredentials.create(userId, {
        clientId: cred.client_id,
        clientSecret: cred.client_secret,
        refreshToken: cred.refresh_token,
        channelName: cred.channel_name || 'Unknown Channel',
        channelId: cred.channel_id
      });
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`youtube_credentials[${i}]: ${error.message}`);
    }
  }

  return result;
}

/**
 * Import broadcast templates from backup
 * @param {Array} templates - Array of templates to import
 * @param {string} userId - User ID
 * @param {Object} options - Import options
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importBroadcastTemplatesData(templates, userId, options = {}) {
  const result = { imported: 0, skipped: 0, errors: [] };
  
  if (!Array.isArray(templates)) return result;

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const validation = validateBroadcastTemplate(template);

    if (!validation.valid) {
      result.skipped++;
      result.errors.push(`broadcast_templates[${i}]: ${validation.errors.join(', ')}`);
      continue;
    }

    try {
      // Check for duplicate by name
      const exists = await BroadcastTemplate.findByName(userId, template.name);
      if (exists) {
        if (options.skipDuplicates) {
          result.skipped++;
          continue;
        }
      }

      await BroadcastTemplate.create({
        user_id: userId,
        account_id: template.account_id,
        name: template.name,
        title: template.title,
        description: template.description,
        privacy_status: template.privacy_status || 'unlisted',
        tags: template.tags,
        category_id: template.category_id || '20',
        thumbnail_path: template.thumbnail_path,
        stream_id: template.stream_id,
        recurring_enabled: template.recurring_enabled || false,
        recurring_pattern: template.recurring_pattern,
        recurring_time: template.recurring_time,
        recurring_days: template.recurring_days,
        next_run_at: template.next_run_at
      });
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`broadcast_templates[${i}]: ${error.message}`);
    }
  }

  return result;
}

/**
 * Import recurring schedules from backup
 * @param {Array} schedules - Array of schedules to import
 * @param {string} userId - User ID
 * @param {Object} options - Import options
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importRecurringSchedulesData(schedules, userId, options = {}) {
  const result = { imported: 0, skipped: 0, errors: [] };
  
  if (!Array.isArray(schedules)) return result;

  for (let i = 0; i < schedules.length; i++) {
    const schedule = schedules[i];

    try {
      await RecurringSchedule.create({
        user_id: userId,
        account_id: schedule.account_id,
        name: schedule.name,
        pattern: schedule.pattern,
        schedule_time: schedule.schedule_time,
        days_of_week: schedule.days_of_week,
        template_id: schedule.template_id,
        title_template: schedule.title_template,
        description: schedule.description,
        privacy_status: schedule.privacy_status || 'unlisted',
        tags: schedule.tags,
        category_id: schedule.category_id || '20',
        is_active: schedule.is_active !== false,
        next_run_at: schedule.next_run_at
      });
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`recurring_schedules[${i}]: ${error.message}`);
    }
  }

  return result;
}

/**
 * Import stream templates from backup
 * @param {Array} templates - Array of templates to import
 * @param {string} userId - User ID
 * @param {Object} options - Import options
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importStreamTemplatesData(templates, userId, options = {}) {
  const result = { imported: 0, skipped: 0, errors: [] };
  
  if (!Array.isArray(templates)) return result;

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];

    try {
      // Check for duplicate by name
      const exists = await StreamTemplate.findByName(userId, template.name);
      if (exists) {
        if (options.skipDuplicates) {
          result.skipped++;
          continue;
        }
      }

      await StreamTemplate.create({
        user_id: userId,
        name: template.name,
        video_id: template.video_id,
        audio_id: template.audio_id,
        duration_hours: template.duration_hours || 0,
        duration_minutes: template.duration_minutes || 0,
        loop_video: template.loop_video !== false,
        schedule_type: template.schedule_type || 'once',
        recurring_time: template.recurring_time,
        schedule_days: template.schedule_days
      });
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`stream_templates[${i}]: ${error.message}`);
    }
  }

  return result;
}

/**
 * Import playlists from backup
 * @param {Array} playlists - Array of playlists to import
 * @param {string} userId - User ID
 * @param {Object} options - Import options
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importPlaylistsData(playlists, userId, options = {}) {
  const result = { imported: 0, skipped: 0, errors: [] };
  
  if (!Array.isArray(playlists)) return result;

  for (let i = 0; i < playlists.length; i++) {
    const playlist = playlists[i];

    try {
      const created = await Playlist.create({
        user_id: userId,
        name: playlist.name,
        description: playlist.description,
        is_shuffle: playlist.is_shuffle ? 1 : 0
      });

      // Add videos if present
      if (playlist.videos && Array.isArray(playlist.videos)) {
        for (const video of playlist.videos) {
          try {
            await Playlist.addVideo(created.id, video.video_id, video.position);
          } catch (videoErr) {
            // Log warning but continue
            result.errors.push(`playlists[${i}]: Warning - could not add video ${video.video_id}`);
          }
        }
      }

      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`playlists[${i}]: ${error.message}`);
    }
  }

  return result;
}

/**
 * Comprehensive import of all user data
 * @param {Object} backupData - Backup data object
 * @param {string} userId - User ID
 * @param {Object} options - Import options (skipDuplicates, overwrite)
 * @returns {Promise<Object>} Import results
 */
async function comprehensiveImport(backupData, userId, options = {}) {
  const results = {
    success: true,
    results: {},
    warnings: []
  };

  // Validate backup format
  const validation = validateComprehensiveBackup(backupData);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Validation failed',
      details: validation.errors
    };
  }

  // Import in correct order for referential integrity
  // 1. YouTube credentials first (referenced by templates)
  if (backupData.youtube_credentials) {
    results.results.youtube_credentials = await importYouTubeCredentialsData(
      backupData.youtube_credentials, userId, options
    );
  }

  // 2. Streams (independent)
  if (backupData.streams) {
    results.results.streams = await importStreams({ streams: backupData.streams }, userId);
  }

  // 3. Broadcast templates (may reference credentials)
  if (backupData.broadcast_templates) {
    results.results.broadcast_templates = await importBroadcastTemplatesData(
      backupData.broadcast_templates, userId, options
    );
  }

  // 4. Stream templates (independent)
  if (backupData.stream_templates) {
    results.results.stream_templates = await importStreamTemplatesData(
      backupData.stream_templates, userId, options
    );
  }

  // 5. Recurring schedules (may reference templates and credentials)
  if (backupData.recurring_schedules) {
    results.results.recurring_schedules = await importRecurringSchedulesData(
      backupData.recurring_schedules, userId, options
    );
  }

  // 6. Playlists (may reference videos)
  if (backupData.playlists) {
    results.results.playlists = await importPlaylistsData(
      backupData.playlists, userId, options
    );
  }

  return results;
}

// Template-only export fields (excludes account-specific and system fields)
const TEMPLATE_EXPORT_FIELDS = [
  'name',
  'title',
  'description',
  'privacy_status',
  'tags',
  'category_id',
  'thumbnail_path',
  'recurring_enabled',
  'recurring_pattern',
  'recurring_time',
  'recurring_days'
];

/**
 * Export templates only (standalone template backup)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Template backup object with metadata
 */
async function exportTemplatesOnly(userId) {
  const templates = await BroadcastTemplate.findByUserId(userId);
  
  const exportedTemplates = templates.map(template => {
    const exported = {};
    TEMPLATE_EXPORT_FIELDS.forEach(field => {
      if (template[field] !== undefined) {
        exported[field] = template[field];
      }
    });
    return exported;
  });

  return {
    metadata: {
      exportDate: new Date().toISOString(),
      appVersion: '1.0.0',
      exportType: 'templates',
      totalTemplates: exportedTemplates.length
    },
    templates: exportedTemplates
  };
}

/**
 * Validate template backup file format
 * @param {Object} data - Parsed JSON data
 * @returns {{valid: boolean, errors: string[], templateCount: number}}
 */
function validateTemplateBackup(data) {
  const errors = [];
  let templateCount = 0;

  if (!data || typeof data !== 'object') {
    errors.push('Invalid backup format: data must be an object');
    return { valid: false, errors, templateCount: 0 };
  }

  // Check for metadata
  if (!data.metadata) {
    errors.push('Invalid backup format: missing metadata');
    return { valid: false, errors, templateCount: 0 };
  }

  // Check for templates array
  if (!Array.isArray(data.templates)) {
    errors.push('Invalid backup format: missing templates array');
    return { valid: false, errors, templateCount: 0 };
  }

  templateCount = data.templates.length;

  return { valid: true, errors, templateCount };
}

/**
 * Validate single template for import
 * @param {Object} template - Template object
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTemplateForImport(template) {
  const errors = [];
  
  // Check required fields
  if (!template.name || (typeof template.name === 'string' && template.name.trim() === '')) {
    errors.push('Missing required field: name');
  }
  if (!template.title || (typeof template.title === 'string' && template.title.trim() === '')) {
    errors.push('Missing required field: title');
  }
  
  // Validate recurring config if enabled
  if (template.recurring_enabled) {
    if (!template.recurring_pattern || !['daily', 'weekly'].includes(template.recurring_pattern)) {
      errors.push('Invalid recurring_pattern: must be daily or weekly');
    }
    if (!template.recurring_time) {
      errors.push('Missing recurring_time when recurring is enabled');
    }
    if (template.recurring_pattern === 'weekly') {
      if (!template.recurring_days || !Array.isArray(template.recurring_days) || template.recurring_days.length === 0) {
        errors.push('Weekly schedule requires at least one day selected');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Import templates only (standalone template import)
 * @param {Object} backupData - Parsed backup JSON
 * @param {string} userId - User ID
 * @param {string} accountId - Default account ID for imported templates
 * @param {Object} options - Import options (skipDuplicates)
 * @returns {Promise<{imported: number, skipped: number, errors: string[]}>}
 */
async function importTemplatesOnly(backupData, userId, accountId, options = {}) {
  const result = { imported: 0, skipped: 0, errors: [] };
  
  // Validate backup format first
  const formatValidation = validateTemplateBackup(backupData);
  if (!formatValidation.valid) {
    result.errors = formatValidation.errors;
    return result;
  }

  if (!Array.isArray(backupData.templates)) {
    return result;
  }

  for (let i = 0; i < backupData.templates.length; i++) {
    const template = backupData.templates[i];
    const validation = validateTemplateForImport(template);

    if (!validation.valid) {
      result.skipped++;
      result.errors.push(`templates[${i}]: ${validation.errors.join(', ')}`);
      continue;
    }

    try {
      // Check for duplicate by name
      const exists = await BroadcastTemplate.findByName(userId, template.name);
      if (exists) {
        if (options.skipDuplicates) {
          result.skipped++;
          result.errors.push(`templates[${i}]: Template "${template.name}" already exists (skipped)`);
          continue;
        }
        // If not skipping, still skip but with different message
        result.skipped++;
        result.errors.push(`templates[${i}]: Template "${template.name}" already exists`);
        continue;
      }

      await BroadcastTemplate.create({
        user_id: userId,
        account_id: accountId,
        name: template.name,
        title: template.title,
        description: template.description || null,
        privacy_status: template.privacy_status || 'unlisted',
        tags: template.tags || null,
        category_id: template.category_id || '20',
        thumbnail_path: template.thumbnail_path || null,
        recurring_enabled: template.recurring_enabled || false,
        recurring_pattern: template.recurring_pattern || null,
        recurring_time: template.recurring_time || null,
        recurring_days: template.recurring_days || null
      });
      result.imported++;
    } catch (error) {
      result.skipped++;
      result.errors.push(`templates[${i}]: ${error.message}`);
    }
  }

  return result;
}

/**
 * Format template backup as pretty-printed JSON string
 * @param {Object} backup - Backup object
 * @returns {string} Pretty-printed JSON
 */
function formatTemplateBackupJson(backup) {
  return JSON.stringify(backup, null, 2);
}

module.exports = {
  exportStreams,
  importStreams,
  validateBackupFormat,
  validateStreamConfig,
  determineImportStatus,
  exportYouTubeCredentials,
  exportBroadcastTemplates,
  exportRecurringSchedules,
  exportStreamTemplates,
  exportPlaylists,
  comprehensiveExport,
  comprehensiveImport,
  validateComprehensiveBackup,
  formatBackupJson,
  // Template-specific functions
  exportTemplatesOnly,
  validateTemplateBackup,
  validateTemplateForImport,
  importTemplatesOnly,
  formatTemplateBackupJson,
  TEMPLATE_EXPORT_FIELDS,
  // Constants
  EXPORT_FIELDS,
  REQUIRED_FIELDS,
  EXCLUDED_FIELDS,
  YOUTUBE_CREDENTIALS_FIELDS,
  BROADCAST_TEMPLATE_FIELDS,
  RECURRING_SCHEDULE_FIELDS,
  STREAM_TEMPLATE_FIELDS,
  PLAYLIST_FIELDS,
  ALL_CATEGORIES
};
