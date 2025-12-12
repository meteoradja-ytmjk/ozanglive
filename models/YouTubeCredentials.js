const { db } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

class YouTubeCredentials {
  /**
   * Save or update YouTube credentials for a user
   * @param {string} userId - User ID
   * @param {Object} data - Credentials data
   * @returns {Promise<Object>} Saved credentials
   */
  static async save(userId, { clientId, clientSecret, refreshToken, channelName, channelId }) {
    return new Promise((resolve, reject) => {
      // Check if credentials already exist for this user
      db.get(
        'SELECT id FROM youtube_credentials WHERE user_id = ?',
        [userId],
        (err, existing) => {
          if (err) {
            reject(err);
            return;
          }

          if (existing) {
            // Update existing credentials
            db.run(
              `UPDATE youtube_credentials 
               SET client_id = ?, client_secret = ?, refresh_token = ?, 
                   channel_name = ?, channel_id = ?
               WHERE user_id = ?`,
              [clientId, clientSecret, refreshToken, channelName, channelId, userId],
              function(err) {
                if (err) {
                  reject(err);
                  return;
                }
                resolve({
                  id: existing.id,
                  userId,
                  clientId,
                  clientSecret,
                  refreshToken,
                  channelName,
                  channelId
                });
              }
            );
          } else {
            // Insert new credentials
            db.run(
              `INSERT INTO youtube_credentials 
               (user_id, client_id, client_secret, refresh_token, channel_name, channel_id)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [userId, clientId, clientSecret, refreshToken, channelName, channelId],
              function(err) {
                if (err) {
                  reject(err);
                  return;
                }
                resolve({
                  id: this.lastID,
                  userId,
                  clientId,
                  clientSecret,
                  refreshToken,
                  channelName,
                  channelId
                });
              }
            );
          }
        }
      );
    });
  }

  /**
   * Find YouTube credentials by user ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Credentials or null if not found
   */
  static async findByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT id, user_id, client_id, client_secret, refresh_token, 
                channel_name, channel_id, created_at
         FROM youtube_credentials 
         WHERE user_id = ?`,
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          if (!row) {
            resolve(null);
            return;
          }
          resolve({
            id: row.id,
            userId: row.user_id,
            clientId: row.client_id,
            clientSecret: row.client_secret,
            refreshToken: row.refresh_token,
            channelName: row.channel_name,
            channelId: row.channel_id,
            createdAt: row.created_at
          });
        }
      );
    });
  }

  /**
   * Delete YouTube credentials for a user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  static async delete(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM youtube_credentials WHERE user_id = ?',
        [userId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        }
      );
    });
  }

  /**
   * Check if user has YouTube credentials
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if credentials exist
   */
  static async exists(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT 1 FROM youtube_credentials WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(!!row);
        }
      );
    });
  }
}

module.exports = YouTubeCredentials;
