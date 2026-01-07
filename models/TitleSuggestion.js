const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

class TitleSuggestion {
  /**
   * Create a new title suggestion
   * @param {Object} data - Title data
   * @returns {Promise<Object>} Created title
   */
  static create(data) {
    const id = uuidv4();
    const { user_id, title, category = 'general' } = data;

    if (!user_id || !title) {
      return Promise.reject(new Error('user_id and title are required'));
    }

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO title_suggestions (id, user_id, title, category, use_count)
         VALUES (?, ?, ?, ?, 0)`,
        [id, user_id, title.trim(), category],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return reject(new Error('Title already exists'));
            }
            console.error('Error creating title suggestion:', err.message);
            return reject(err);
          }
          resolve({ id, user_id, title: title.trim(), category, use_count: 0 });
        }
      );
    });
  }

  /**
   * Find all titles for a user
   * @param {string} userId - User ID
   * @param {string} category - Optional category filter
   * @returns {Promise<Array>} Array of titles
   */
  static findByUserId(userId, category = null) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM title_suggestions WHERE user_id = ?`;
      const params = [userId];

      if (category) {
        query += ` AND category = ?`;
        params.push(category);
      }

      query += ` ORDER BY use_count DESC, created_at DESC`;

      db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error finding title suggestions:', err.message);
          return reject(err);
        }
        resolve(rows || []);
      });
    });
  }

  /**
   * Search titles by keyword
   * @param {string} userId - User ID
   * @param {string} keyword - Search keyword
   * @returns {Promise<Array>} Array of matching titles
   */
  static search(userId, keyword) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM title_suggestions 
         WHERE user_id = ? AND title LIKE ?
         ORDER BY use_count DESC, created_at DESC
         LIMIT 20`,
        [userId, `%${keyword}%`],
        (err, rows) => {
          if (err) {
            console.error('Error searching title suggestions:', err.message);
            return reject(err);
          }
          resolve(rows || []);
        }
      );
    });
  }

  /**
   * Increment use count for a title
   * @param {string} id - Title ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Update result
   */
  static incrementUseCount(id, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE title_suggestions 
         SET use_count = use_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [id, userId],
        function (err) {
          if (err) {
            console.error('Error incrementing use count:', err.message);
            return reject(err);
          }
          resolve({ success: true, updated: this.changes > 0 });
        }
      );
    });
  }

  /**
   * Update a title
   * @param {string} id - Title ID
   * @param {string} userId - User ID
   * @param {Object} data - Updated data
   * @returns {Promise<Object>} Update result
   */
  static update(id, userId, data) {
    const fields = [];
    const values = [];

    if (data.title) {
      fields.push('title = ?');
      values.push(data.title.trim());
    }
    if (data.category) {
      fields.push('category = ?');
      values.push(data.category);
    }

    if (fields.length === 0) {
      return Promise.resolve({ success: true, updated: false });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE title_suggestions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
        values,
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return reject(new Error('Title already exists'));
            }
            console.error('Error updating title suggestion:', err.message);
            return reject(err);
          }
          resolve({ success: true, updated: this.changes > 0 });
        }
      );
    });
  }

  /**
   * Delete a title
   * @param {string} id - Title ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Delete result
   */
  static delete(id, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM title_suggestions WHERE id = ? AND user_id = ?`,
        [id, userId],
        function (err) {
          if (err) {
            console.error('Error deleting title suggestion:', err.message);
            return reject(err);
          }
          resolve({ success: true, deleted: this.changes > 0 });
        }
      );
    });
  }

  /**
   * Get popular titles (most used)
   * @param {string} userId - User ID
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Array of popular titles
   */
  static getPopular(userId, limit = 10) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM title_suggestions 
         WHERE user_id = ? AND use_count > 0
         ORDER BY use_count DESC
         LIMIT ?`,
        [userId, limit],
        (err, rows) => {
          if (err) {
            console.error('Error getting popular titles:', err.message);
            return reject(err);
          }
          resolve(rows || []);
        }
      );
    });
  }
}

module.exports = TitleSuggestion;
