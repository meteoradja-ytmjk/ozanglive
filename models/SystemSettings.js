const { db } = require('../db/database');

class SystemSettings {
  /**
   * Get a setting value by key
   * @param {string} key - Setting key
   * @returns {Promise<string|null>} Setting value or null if not found
   */
  static get(key) {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM system_settings WHERE key = ?', [key], (err, row) => {
        if (err) {
          console.error('Error getting system setting:', err.message);
          return reject(err);
        }
        resolve(row ? row.value : null);
      });
    });
  }

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {string} value - Setting value
   * @returns {Promise<Object>} Result with key and value
   */
  static set(key, value) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
        [key, value, value],
        function (err) {
          if (err) {
            console.error('Error setting system setting:', err.message);
            return reject(err);
          }
          resolve({ key, value });
        }
      );
    });
  }

  /**
   * Get the default live limit for all members
   * @returns {Promise<number>} Default live limit (1 if not configured)
   */
  static async getDefaultLiveLimit() {
    const value = await this.get('default_live_limit');
    if (value === null) {
      return 1; // Default value
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }

  /**
   * Set the default live limit for all members
   * @param {number} limit - Live limit value (must be >= 1)
   * @returns {Promise<Object>} Result with key and value
   */
  static async setDefaultLiveLimit(limit) {
    const validLimit = Math.max(1, parseInt(limit, 10) || 1);
    return this.set('default_live_limit', validLimit.toString());
  }
}

module.exports = SystemSettings;
