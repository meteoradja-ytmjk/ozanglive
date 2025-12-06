const { db } = require('../db/database');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');

class LiveLimitService {
  /**
   * Get the effective live limit for a user
   * Returns custom limit if set, otherwise returns default limit
   * @param {string} userId - User ID
   * @returns {Promise<number>} Effective live limit
   */
  static async getEffectiveLimit(userId) {
    const customLimit = await User.getLiveLimit(userId);
    if (customLimit !== null && customLimit > 0) {
      return customLimit;
    }
    return await SystemSettings.getDefaultLiveLimit();
  }

  /**
   * Count the number of active (live) streams for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of active streams
   */
  static countActiveStreams(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM streams WHERE user_id = ? AND status = 'live'",
        [userId],
        (err, row) => {
          if (err) {
            console.error('Error counting active streams:', err.message);
            return reject(err);
          }
          resolve(row ? row.count : 0);
        }
      );
    });
  }

  /**
   * Check if a user can start a new stream
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if user can start a new stream
   */
  static async canStartStream(userId) {
    const limit = await this.getEffectiveLimit(userId);
    const activeCount = await this.countActiveStreams(userId);
    return activeCount < limit;
  }

  /**
   * Get full validation info for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Validation info object
   */
  static async validateAndGetInfo(userId) {
    const customLimit = await User.getLiveLimit(userId);
    const defaultLimit = await SystemSettings.getDefaultLiveLimit();
    const isCustomLimit = customLimit !== null && customLimit > 0;
    const effectiveLimit = isCustomLimit ? customLimit : defaultLimit;
    const activeStreams = await this.countActiveStreams(userId);
    const canStart = activeStreams < effectiveLimit;

    return {
      userId,
      effectiveLimit,
      activeStreams,
      canStart,
      isCustomLimit,
      defaultLimit,
      customLimit,
      message: canStart ? null : 'Hubungi Admin Untuk Menambah Limit'
    };
  }
}

module.exports = LiveLimitService;
