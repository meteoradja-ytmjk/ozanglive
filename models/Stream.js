const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
class Stream {
  static create(streamData) {
    const id = uuidv4();
    const {
      title,
      video_id,
      audio_id = null,
      rtmp_url,
      stream_key,
      platform,
      platform_icon,
      bitrate = 2500,
      resolution,
      fps = 30,
      orientation = 'horizontal',
      loop_video = true,
      schedule_time = null,
      end_time = null,
      duration = null,
      stream_duration_minutes = null,
      schedule_type = 'once',
      schedule_days = null,
      recurring_time = null,
      recurring_enabled = true,
      original_settings = null,
      status,
      user_id
    } = streamData;
    const loop_video_int = loop_video ? 1 : 0;
    const recurring_enabled_int = recurring_enabled ? 1 : 0;
    const schedule_days_json = schedule_days ? JSON.stringify(schedule_days) : null;
    const original_settings_json = original_settings ? JSON.stringify(original_settings) : null;
    
    // Determine final status based on schedule type
    let final_status = status;
    if (!final_status) {
      if (schedule_type === 'daily' || schedule_type === 'weekly') {
        final_status = 'scheduled';
      } else if (schedule_time) {
        final_status = 'scheduled';
      } else {
        final_status = 'offline';
      }
    }
    const status_updated_at = new Date().toISOString();
    
    console.log(`[Stream.create] Creating stream with duration: ${stream_duration_minutes} minutes`);
    
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO streams (
          id, title, video_id, audio_id, rtmp_url, stream_key, platform, platform_icon,
          bitrate, resolution, fps, orientation, loop_video,
          schedule_time, end_time, duration, stream_duration_minutes,
          schedule_type, schedule_days, recurring_time, recurring_enabled,
          original_settings, status, status_updated_at, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, title, video_id, audio_id, rtmp_url, stream_key, platform, platform_icon,
          bitrate, resolution, fps, orientation, loop_video_int,
          schedule_time, end_time, duration, stream_duration_minutes,
          schedule_type, schedule_days_json, recurring_time, recurring_enabled_int,
          original_settings_json, final_status, status_updated_at, user_id
        ],
        function (err) {
          if (err) {
            console.error('Error creating stream:', err.message);
            return reject(err);
          }
          resolve({ id, ...streamData, status: final_status, status_updated_at });
        }
      );
    });
  }
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT s.*, 
                v.title AS video_title,
                a.title AS audio_title
         FROM streams s
         LEFT JOIN videos v ON s.video_id = v.id
         LEFT JOIN audios a ON s.audio_id = a.id
         WHERE s.id = ?`,
        [id],
        (err, row) => {
          if (err) {
            console.error('Error finding stream:', err.message);
            return reject(err);
          }
          if (row) {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            row.recurring_enabled = row.recurring_enabled === 1;
            // Parse schedule_days JSON if present
            if (row.schedule_days && typeof row.schedule_days === 'string') {
              try {
                row.schedule_days = JSON.parse(row.schedule_days);
              } catch (e) {
                row.schedule_days = [];
              }
            }
          }
          resolve(row);
        }
      );
    });
  }
  static findAll(userId = null, filter = null) {
    return new Promise((resolve, reject) => {
      // Query without playlist join to avoid errors if table doesn't exist
      let query = `
        SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath,
               v.thumbnail_path AS video_thumbnail, 
               v.duration AS video_duration,
               v.resolution AS video_resolution,  
               v.bitrate AS video_bitrate,        
               v.fps AS video_fps,
               a.title AS audio_title,
               'video' AS video_type
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        LEFT JOIN audios a ON s.audio_id = a.id
      `;
      const params = [];
      const conditions = [];
      
      if (userId) {
        conditions.push('s.user_id = ?');
        params.push(userId);
      }
      
      // FIXED: Apply filter regardless of userId
      if (filter) {
        if (filter === 'live') {
          conditions.push("s.status = 'live'");
        } else if (filter === 'scheduled') {
          conditions.push("s.status = 'scheduled'");
        } else if (filter === 'offline') {
          conditions.push("s.status = 'offline'");
        }
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY s.created_at DESC';
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error finding streams:', err.message);
          return reject(err);
        }
        if (rows) {
          rows.forEach(row => {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            row.recurring_enabled = row.recurring_enabled === 1;
            // Parse schedule_days JSON if present
            if (row.schedule_days && typeof row.schedule_days === 'string') {
              try {
                row.schedule_days = JSON.parse(row.schedule_days);
              } catch (e) {
                row.schedule_days = [];
              }
            }
          });
        }
        resolve(rows || []);
      });
    });
  }
  static update(id, streamData) {
    const fields = [];
    const values = [];
    Object.entries(streamData).forEach(([key, value]) => {
      if (key === 'loop_video' && typeof value === 'boolean') {
        fields.push(`${key} = ?`);
        values.push(value ? 1 : 0);
      } else {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    const query = `UPDATE streams SET ${fields.join(', ')} WHERE id = ?`;
    return new Promise((resolve, reject) => {
      db.run(query, values, function (err) {
        if (err) {
          console.error('Error updating stream:', err.message);
          return reject(err);
        }
        resolve({ id, ...streamData });
      });
    });
  }
  static delete(id, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM streams WHERE id = ? AND user_id = ?',
        [id, userId],
        function (err) {
          if (err) {
            console.error('Error deleting stream:', err.message);
            return reject(err);
          }
          resolve({ success: true, deleted: this.changes > 0 });
        }
      );
    });
  }
  static updateStatus(id, status, userId, options = {}) {
    const status_updated_at = new Date().toISOString();
    const { startTimeOverride = null, endTimeOverride = null } = options;
    let start_time = null;
    let end_time = null;
    let clear_start_time = false;
    
    if (status === 'live') {
      start_time = startTimeOverride || new Date().toISOString();
    } else if (status === 'offline') {
      end_time = endTimeOverride || new Date().toISOString();
    } else if (status === 'scheduled') {
      // FIXED: Clear start_time when status changes to 'scheduled'
      // This is important for recurring streams to prevent duration check
      // from using old start_time values
      clear_start_time = true;
    }
    
    // FIXED: Always update by id only to avoid user_id mismatch issues
    // The user_id check was causing status updates to fail when scheduler starts streams
    // FIXED: Clear start_time when status is 'scheduled' to prevent stale duration checks
    const query = `UPDATE streams SET 
        status = ?, 
        status_updated_at = ?, 
        start_time = CASE 
          WHEN ? = 1 THEN NULL 
          WHEN ? IS NOT NULL THEN ? 
          ELSE start_time 
        END, 
        end_time = CASE WHEN ? IS NOT NULL THEN ? ELSE end_time END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`;
    
    const params = [status, status_updated_at, clear_start_time ? 1 : 0, start_time, start_time, end_time, end_time, id];
    
    return new Promise((resolve, reject) => {
      db.run(query, params,
        function (err) {
          if (err) {
            console.error('Error updating stream status:', err.message);
            return reject(err);
          }
          
          if (this.changes === 0) {
            console.warn(`[Stream.updateStatus] WARNING: No rows updated for stream ${id} to status '${status}'`);
          } else {
            console.log(`[Stream.updateStatus] Updated stream ${id} to status '${status}'${clear_start_time ? ' (start_time cleared)' : ''}, rows affected: ${this.changes}`);
          }
          
          resolve({
            id,
            status,
            status_updated_at,
            start_time: clear_start_time ? null : start_time,
            end_time,
            updated: this.changes > 0
          });
        }
      );
    });
  }
  static async getStreamWithVideo(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT s.*, 
                v.title AS video_title, 
                v.filepath AS video_filepath, 
                v.thumbnail_path AS video_thumbnail, 
                v.duration AS video_duration,
                'video' AS video_type
         FROM streams s
         LEFT JOIN videos v ON s.video_id = v.id
         WHERE s.id = ?`,
        [id],
        (err, row) => {
          if (err) {
            console.error('Error fetching stream with video:', err.message);
            return reject(err);
          }
          if (row) {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            row.recurring_enabled = row.recurring_enabled === 1;
            // Parse schedule_days JSON if present
            if (row.schedule_days && typeof row.schedule_days === 'string') {
              try {
                row.schedule_days = JSON.parse(row.schedule_days);
              } catch (e) {
                row.schedule_days = [];
              }
            }
          }
          resolve(row);
        }
      );
    });
  }
  static findScheduledInRange(startTime, endTime) {
    return new Promise((resolve, reject) => {
      const endTimeStr = endTime.toISOString();
      // FIXED: Include streams that are scheduled but may have been missed
      // Look for streams scheduled up to 5 minutes in the past to catch any that were missed
      const missedWindowMs = 5 * 60 * 1000; // 5 minutes
      const missedStartTime = new Date(startTime.getTime() - missedWindowMs);
      const missedStartTimeStr = missedStartTime.toISOString();
      
      // FIXED: Use datetime() function for proper ISO string comparison in SQLite
      // This ensures timezone-aware comparison works correctly
      const query = `
        SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath,
               v.thumbnail_path AS video_thumbnail, 
               v.duration AS video_duration,
               v.resolution AS video_resolution,
               v.bitrate AS video_bitrate,
               v.fps AS video_fps  
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        WHERE s.status = 'scheduled'
        AND s.schedule_type = 'once'
        AND s.schedule_time IS NOT NULL
        AND datetime(s.schedule_time) >= datetime(?)
        AND datetime(s.schedule_time) <= datetime(?)
      `;
      console.log(`[Stream.findScheduledInRange] Searching from ${missedStartTimeStr} to ${endTimeStr}`);
      console.log(`[Stream.findScheduledInRange] Current time: ${startTime.toISOString()}`);
      db.all(query, [missedStartTimeStr, endTimeStr], (err, rows) => {
        if (err) {
          console.error('Error finding scheduled streams:', err.message);
          return reject(err);
        }
        if (rows) {
          rows.forEach(row => {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            console.log(`[Stream.findScheduledInRange] Found stream: id=${row.id}, schedule_time=${row.schedule_time}, status=${row.status}`);
          });
          console.log(`[Stream.findScheduledInRange] Found ${rows.length} scheduled streams`);
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Find all recurring schedules by type (daily or weekly)
   * @param {string} scheduleType - 'daily' or 'weekly'
   * @returns {Promise<Array>} Array of streams with recurring schedules
   */
  static findRecurringSchedules(scheduleType = null) {
    return new Promise((resolve, reject) => {
      // OPTIMIZED: Exclude live streams at DB level to reduce processing
      // Include 'scheduled' and 'offline' status for recurring streams
      // (offline status may occur if stream was stopped manually or due to error)
      let query = `
        SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath,
               v.thumbnail_path AS video_thumbnail, 
               v.duration AS video_duration,
               v.resolution AS video_resolution,
               v.bitrate AS video_bitrate,
               v.fps AS video_fps
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        WHERE s.recurring_enabled = 1
        AND s.schedule_type IN ('daily', 'weekly')
        AND s.status IN ('scheduled', 'offline')
      `;
      const params = [];
      if (scheduleType) {
        query += ' AND s.schedule_type = ?';
        params.push(scheduleType);
      }
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error finding recurring schedules:', err.message);
          return reject(err);
        }
        if (rows) {
          rows.forEach(row => {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            row.recurring_enabled = row.recurring_enabled === 1;
            // Parse schedule_days JSON
            if (row.schedule_days) {
              try {
                row.schedule_days = JSON.parse(row.schedule_days);
              } catch (e) {
                row.schedule_days = [];
              }
            } else {
              row.schedule_days = [];
            }
          });
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Update recurring_enabled status for a stream
   * @param {string} id - Stream ID
   * @param {boolean} enabled - Enable or disable recurring
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated stream info
   */
  static updateRecurringEnabled(id, enabled, userId) {
    const recurring_enabled_int = enabled ? 1 : 0;
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE streams SET 
          recurring_enabled = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [recurring_enabled_int, id, userId],
        function (err) {
          if (err) {
            console.error('Error updating recurring_enabled:', err.message);
            return reject(err);
          }
          resolve({
            id,
            recurring_enabled: enabled,
            updated: this.changes > 0
          });
        }
      );
    });
  }

  /**
   * Calculate next scheduled time for a recurring stream
   * @param {Object} stream - Stream object with schedule_type, recurring_time, schedule_days
   * @returns {Date|null} Next scheduled time or null if not applicable
   */
  static getNextScheduledTime(stream) {
    if (!stream || !stream.recurring_time) {
      return null;
    }

    const now = new Date();
    const [hours, minutes] = stream.recurring_time.split(':').map(Number);

    if (stream.schedule_type === 'daily') {
      const nextRun = new Date(now);
      nextRun.setHours(hours, minutes, 0, 0);
      
      // If time has passed today, schedule for tomorrow
      if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      return nextRun;
    }

    if (stream.schedule_type === 'weekly') {
      const scheduleDays = Array.isArray(stream.schedule_days) 
        ? stream.schedule_days 
        : (stream.schedule_days ? JSON.parse(stream.schedule_days) : []);
      
      if (scheduleDays.length === 0) {
        return null;
      }

      // Sort days for easier processing
      const sortedDays = [...scheduleDays].sort((a, b) => a - b);
      const currentDay = now.getDay();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const scheduleTime = hours * 60 + minutes;

      // Find next occurrence
      for (let i = 0; i < 7; i++) {
        const checkDay = (currentDay + i) % 7;
        if (sortedDays.includes(checkDay)) {
          const nextRun = new Date(now);
          nextRun.setDate(now.getDate() + i);
          nextRun.setHours(hours, minutes, 0, 0);
          
          // If it's today but time has passed, continue to next day
          if (i === 0 && scheduleTime <= currentTime) {
            continue;
          }
          return nextRun;
        }
      }

      // If no day found in current week, get first day of next week
      const daysUntilNext = (7 - currentDay + sortedDays[0]) % 7 || 7;
      const nextRun = new Date(now);
      nextRun.setDate(now.getDate() + daysUntilNext);
      nextRun.setHours(hours, minutes, 0, 0);
      return nextRun;
    }

    return null;
  }

  /**
   * Serialize schedule configuration to JSON
   * @param {Object} scheduleConfig - Schedule configuration object
   * @returns {string} JSON string
   */
  static serializeScheduleConfig(scheduleConfig) {
    return JSON.stringify({
      schedule_type: scheduleConfig.schedule_type || 'once',
      recurring_time: scheduleConfig.recurring_time || null,
      schedule_days: scheduleConfig.schedule_days || [],
      recurring_enabled: scheduleConfig.recurring_enabled !== false
    });
  }

  /**
   * Deserialize schedule configuration from JSON
   * @param {string} jsonString - JSON string
   * @returns {Object} Schedule configuration object
   */
  static deserializeScheduleConfig(jsonString) {
    try {
      const config = JSON.parse(jsonString);
      return {
        schedule_type: config.schedule_type || 'once',
        recurring_time: config.recurring_time || null,
        schedule_days: Array.isArray(config.schedule_days) ? config.schedule_days : [],
        recurring_enabled: config.recurring_enabled !== false
      };
    } catch (e) {
      return {
        schedule_type: 'once',
        recurring_time: null,
        schedule_days: [],
        recurring_enabled: true
      };
    }
  }

  /**
   * Find all scheduled streams for a user (once, daily, weekly)
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of scheduled streams grouped by type
   */
  static findAllScheduled(userId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT s.*, 
               v.title AS video_title, 
               v.filepath AS video_filepath,
               v.thumbnail_path AS video_thumbnail, 
               v.duration AS video_duration,
               v.resolution AS video_resolution,
               v.bitrate AS video_bitrate,
               v.fps AS video_fps,
               a.title AS audio_title,
               'video' AS video_type
        FROM streams s
        LEFT JOIN videos v ON s.video_id = v.id
        LEFT JOIN audios a ON s.audio_id = a.id
        WHERE s.user_id = ?
        AND (
          (s.schedule_type = 'once' AND s.schedule_time IS NOT NULL)
          OR (s.schedule_type IN ('daily', 'weekly') AND s.recurring_enabled = 1)
        )
        ORDER BY 
          CASE s.schedule_type 
            WHEN 'once' THEN 1 
            WHEN 'daily' THEN 2 
            WHEN 'weekly' THEN 3 
          END,
          s.schedule_time ASC,
          s.recurring_time ASC
      `;
      
      db.all(query, [userId], (err, rows) => {
        if (err) {
          console.error('Error finding all scheduled streams:', err.message);
          return reject(err);
        }
        if (rows) {
          rows.forEach(row => {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            row.recurring_enabled = row.recurring_enabled === 1;
            // Parse schedule_days JSON
            if (row.schedule_days) {
              try {
                row.schedule_days = JSON.parse(row.schedule_days);
              } catch (e) {
                row.schedule_days = [];
              }
            } else {
              row.schedule_days = [];
            }
          });
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Group streams by schedule type
   * @param {Array} streams - Array of stream objects
   * @returns {Object} Streams grouped by schedule_type
   */
  static groupByScheduleType(streams) {
    return {
      once: streams.filter(s => s.schedule_type === 'once'),
      daily: streams.filter(s => s.schedule_type === 'daily'),
      weekly: streams.filter(s => s.schedule_type === 'weekly')
    };
  }

  /**
   * Filter streams scheduled for today
   * @param {Array} streams - Array of stream objects
   * @returns {Array} Streams scheduled for today, sorted by time
   */
  static filterTodaySchedules(streams) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayStreams = streams.filter(stream => {
      if (stream.schedule_type === 'once' && stream.schedule_time) {
        const scheduleDate = new Date(stream.schedule_time);
        return scheduleDate >= today && scheduleDate < tomorrow;
      }
      if (stream.schedule_type === 'daily' && stream.recurring_enabled) {
        return true; // Daily streams run every day
      }
      if (stream.schedule_type === 'weekly' && stream.recurring_enabled) {
        const currentDay = now.getDay();
        const scheduleDays = Array.isArray(stream.schedule_days) ? stream.schedule_days : [];
        return scheduleDays.includes(currentDay);
      }
      return false;
    });

    // Sort by time
    return todayStreams.sort((a, b) => {
      const timeA = a.schedule_type === 'once' 
        ? new Date(a.schedule_time).getTime()
        : Stream.getTimeInMinutes(a.recurring_time);
      const timeB = b.schedule_type === 'once'
        ? new Date(b.schedule_time).getTime()
        : Stream.getTimeInMinutes(b.recurring_time);
      return timeA - timeB;
    });
  }

  /**
   * Convert HH:MM time string to minutes since midnight
   * @param {string} timeStr - Time string in HH:MM format
   * @returns {number} Minutes since midnight
   */
  static getTimeInMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Reset stream to original imported settings
   * @param {string} id - Stream ID
   * @param {string} userId - User ID
   * @returns {Promise<{success: boolean, reset: boolean}>}
   */
  static resetToOriginal(id, userId) {
    return new Promise((resolve, reject) => {
      // First get the stream with original_settings
      db.get(
        'SELECT id, original_settings FROM streams WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, stream) => {
          if (err) {
            console.error('Error finding stream for reset:', err.message);
            return reject(err);
          }

          if (!stream) {
            return resolve({ success: false, reset: false, reason: 'Stream not found' });
          }

          if (!stream.original_settings) {
            return resolve({ success: true, reset: false, reason: 'No original settings' });
          }

          // Parse original settings
          let originalSettings;
          try {
            originalSettings = JSON.parse(stream.original_settings);
          } catch (e) {
            console.error('Error parsing original_settings:', e.message);
            return resolve({ success: false, reset: false, reason: 'Invalid original settings' });
          }

          // Prepare schedule_days for storage
          const schedule_days_json = originalSettings.schedule_days 
            ? JSON.stringify(originalSettings.schedule_days) 
            : null;

          // Update stream with original values
          db.run(
            `UPDATE streams SET 
              schedule_time = ?,
              recurring_time = ?,
              stream_duration_minutes = ?,
              schedule_type = ?,
              schedule_days = ?,
              recurring_enabled = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?`,
            [
              originalSettings.schedule_time,
              originalSettings.recurring_time,
              originalSettings.stream_duration_minutes,
              originalSettings.schedule_type || 'once',
              schedule_days_json,
              originalSettings.recurring_enabled !== false ? 1 : 0,
              id,
              userId
            ],
            function (err) {
              if (err) {
                console.error('Error resetting stream:', err.message);
                return reject(err);
              }
              resolve({ success: true, reset: this.changes > 0 });
            }
          );
        }
      );
    });
  }

  /**
   * Reset all streams to original settings for a user
   * @param {string} userId - User ID
   * @returns {Promise<{resetCount: number, skippedCount: number}>}
   */
  static async resetAllToOriginal(userId) {
    return new Promise((resolve, reject) => {
      // Get all streams for user
      db.all(
        'SELECT id, original_settings FROM streams WHERE user_id = ?',
        [userId],
        async (err, streams) => {
          if (err) {
            console.error('Error finding streams for reset:', err.message);
            return reject(err);
          }

          let resetCount = 0;
          let skippedCount = 0;

          for (const stream of streams) {
            try {
              const result = await Stream.resetToOriginal(stream.id, userId);
              if (result.reset) {
                resetCount++;
              } else {
                skippedCount++;
              }
            } catch (error) {
              console.error(`Error resetting stream ${stream.id}:`, error.message);
              skippedCount++;
            }
          }

          resolve({ resetCount, skippedCount });
        }
      );
    });
  }

  /**
   * Find stream by stream_key for a specific user
   * @param {string} streamKey - The stream key to search for
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Stream object if found, null otherwise
   */
  static findByStreamKey(streamKey, userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT s.*, 
                v.title AS video_title,
                a.title AS audio_title
         FROM streams s
         LEFT JOIN videos v ON s.video_id = v.id
         LEFT JOIN audios a ON s.audio_id = a.id
         WHERE s.stream_key = ? AND s.user_id = ?`,
        [streamKey, userId],
        (err, row) => {
          if (err) {
            console.error('Error finding stream by stream_key:', err.message);
            return reject(err);
          }
          if (row) {
            row.loop_video = row.loop_video === 1;
            row.use_advanced_settings = row.use_advanced_settings === 1;
            row.recurring_enabled = row.recurring_enabled === 1;
            // Parse schedule_days JSON if present
            if (row.schedule_days && typeof row.schedule_days === 'string') {
              try {
                row.schedule_days = JSON.parse(row.schedule_days);
              } catch (e) {
                row.schedule_days = [];
              }
            }
          }
          resolve(row || null);
        }
      );
    });
  }
}
module.exports = Stream;