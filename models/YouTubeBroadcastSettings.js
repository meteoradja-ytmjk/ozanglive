const { db } = require('../db/database');

class YouTubeBroadcastSettings {
  /**
   * Create or update broadcast settings
   * @param {Object} data - Settings data
   * @returns {Promise<Object>}
   */
  static async upsert(data) {
    const {
      broadcastId,
      userId,
      accountId = null,
      enableAutoStart = true,
      enableAutoStop = true,
      unlistReplayOnEnd = true,
      originalPrivacyStatus = 'public',
      thumbnailFolder = null,
      templateId = null,
      thumbnailIndex = 0,
      thumbnailPath = null,
      alteredContent = false,
      tags = null,
      dualStream = false,
      verticalStreamKey = null
    } = data;

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || null);
    const alteredContentInt = (alteredContent === true || alteredContent === 1 || alteredContent === 'true') ? 1 : 0;
    const dualStreamInt = (dualStream === true || dualStream === 1 || dualStream === 'true') ? 1 : 0;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO youtube_broadcast_settings 
         (broadcast_id, user_id, account_id, enable_auto_start, enable_auto_stop, unlist_replay_on_end, original_privacy_status, thumbnail_folder, template_id, thumbnail_index, thumbnail_path, altered_content, tags, dual_stream, vertical_stream_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(broadcast_id) DO UPDATE SET
           enable_auto_start = excluded.enable_auto_start,
           enable_auto_stop = excluded.enable_auto_stop,
           unlist_replay_on_end = excluded.unlist_replay_on_end,
           original_privacy_status = excluded.original_privacy_status,
           thumbnail_folder = excluded.thumbnail_folder,
           template_id = excluded.template_id,
           thumbnail_index = excluded.thumbnail_index,
           thumbnail_path = excluded.thumbnail_path,
           altered_content = excluded.altered_content,
           tags = excluded.tags,
           dual_stream = excluded.dual_stream,
           vertical_stream_key = excluded.vertical_stream_key`,
        [
          broadcastId,
          userId,
          accountId,
          enableAutoStart ? 1 : 0,
          enableAutoStop ? 1 : 0,
          unlistReplayOnEnd ? 1 : 0,
          originalPrivacyStatus,
          thumbnailFolder,
          templateId,
          thumbnailIndex || 0,
          thumbnailPath,
          alteredContentInt,
          tagsJson,
          dualStreamInt,
          verticalStreamKey || null
        ],
        function(err) {
          if (err) {
            console.error('[YouTubeBroadcastSettings.upsert] Error:', err.message);
            return reject(err);
          }
          resolve({
            id: this.lastID,
            broadcastId,
            userId,
            accountId,
            enableAutoStart,
            enableAutoStop,
            unlistReplayOnEnd,
            originalPrivacyStatus,
            thumbnailFolder,
            templateId,
            thumbnailIndex,
            thumbnailPath,
            alteredContent: alteredContentInt === 1,
            tags: tagsJson,
            dualStream: dualStreamInt === 1
          });
        }
      );
    });
  }

  /**
   * Update only thumbnail folder for a broadcast
   * @param {string} broadcastId - YouTube broadcast ID
   * @param {string} thumbnailFolder - Folder name (empty string for root)
   * @returns {Promise<boolean>}
   */
  static async updateThumbnailFolder(broadcastId, thumbnailFolder) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE youtube_broadcast_settings SET thumbnail_folder = ? WHERE broadcast_id = ?`,
        [thumbnailFolder, broadcastId],
        function(err) {
          if (err) {
            console.error('[YouTubeBroadcastSettings.updateThumbnailFolder] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Update thumbnail index and path for a broadcast
   * @param {string} broadcastId - YouTube broadcast ID
   * @param {number} thumbnailIndex - Thumbnail index (0-based)
   * @param {string} thumbnailPath - Thumbnail path
   * @returns {Promise<boolean>}
   */
  static async updateThumbnailSelection(broadcastId, thumbnailIndex, thumbnailPath) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE youtube_broadcast_settings SET thumbnail_index = ?, thumbnail_path = ? WHERE broadcast_id = ?`,
        [thumbnailIndex || 0, thumbnailPath, broadcastId],
        function(err) {
          if (err) {
            console.error('[YouTubeBroadcastSettings.updateThumbnailSelection] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Find settings by broadcast ID
   * @param {string} broadcastId - YouTube broadcast ID
   * @returns {Promise<Object|null>}
   */
  static async findByBroadcastId(broadcastId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM youtube_broadcast_settings WHERE broadcast_id = ?`,
        [broadcastId],
        (err, row) => {
          if (err) {
            console.error('[YouTubeBroadcastSettings.findByBroadcastId] Error:', err.message);
            return reject(err);
          }
          if (row) {
            row.enableAutoStart = row.enable_auto_start === 1;
            row.enableAutoStop = row.enable_auto_stop === 1;
            row.unlistReplayOnEnd = row.unlist_replay_on_end === 1;
            row.originalPrivacyStatus = row.original_privacy_status;
            row.thumbnailFolder = row.thumbnail_folder;
            row.templateId = row.template_id;
            row.thumbnailIndex = row.thumbnail_index || 0;
            row.thumbnailPath = row.thumbnail_path;
          }
          resolve(row);
        }
      );
    });
  }

  /**
   * Delete settings by broadcast ID
   * @param {string} broadcastId - YouTube broadcast ID
   * @returns {Promise<boolean>}
   */
  static async deleteByBroadcastId(broadcastId) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM youtube_broadcast_settings WHERE broadcast_id = ?`,
        [broadcastId],
        function(err) {
          if (err) {
            console.error('[YouTubeBroadcastSettings.deleteByBroadcastId] Error:', err.message);
            return reject(err);
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Find all settings by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  static async findByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM youtube_broadcast_settings WHERE user_id = ?`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[YouTubeBroadcastSettings.findByUserId] Error:', err.message);
            return reject(err);
          }
          const result = rows.map(row => ({
            ...row,
            enableAutoStart: row.enable_auto_start === 1,
            enableAutoStop: row.enable_auto_stop === 1,
            unlistReplayOnEnd: row.unlist_replay_on_end === 1,
            originalPrivacyStatus: row.original_privacy_status
          }));
          resolve(result);
        }
      );
    });
  }
}

module.exports = YouTubeBroadcastSettings;
