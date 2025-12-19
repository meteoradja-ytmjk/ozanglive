const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

class BroadcastTemplate {
  /**
   * Create a new broadcast template
   * @param {Object} templateData - Template data
   * @returns {Promise<Object>} Created template
   */
  static create(templateData) {
    const id = uuidv4();
    const {
      user_id,
      account_id,
      name,
      title,
      description = null,
      privacy_status = 'unlisted',
      tags = null,
      category_id = '20',
      thumbnail_path = null,
      stream_id = null
    } = templateData;

    // Validate required fields
    if (!user_id || !account_id || !name || !title) {
      return Promise.reject(new Error('Missing required fields: user_id, account_id, name, and title are required'));
    }

    // Validate name is not empty or whitespace
    if (!name.trim()) {
      return Promise.reject(new Error('Template name cannot be empty'));
    }

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : tags;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO broadcast_templates (
          id, user_id, account_id, name, title, description,
          privacy_status, tags, category_id, thumbnail_path, stream_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, user_id, account_id, name.trim(), title, description,
          privacy_status, tagsJson, category_id, thumbnail_path, stream_id
        ],
        function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return reject(new Error('Template name already exists'));
            }
            console.error('Error creating broadcast template:', err.message);
            return reject(err);
          }
          resolve({
            id,
            user_id,
            account_id,
            name: name.trim(),
            title,
            description,
            privacy_status,
            tags: Array.isArray(tags) ? tags : (tags ? JSON.parse(tags) : null),
            category_id,
            thumbnail_path,
            stream_id,
            created_at: new Date().toISOString()
          });
        }
      );
    });
  }

  /**
   * Find template by ID
   * @param {string} id - Template ID
   * @returns {Promise<Object|null>} Template or null
   */
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT bt.*, yc.channel_name
         FROM broadcast_templates bt
         LEFT JOIN youtube_credentials yc ON bt.account_id = yc.id
         WHERE bt.id = ?`,
        [id],
        (err, row) => {
          if (err) {
            console.error('Error finding broadcast template:', err.message);
            return reject(err);
          }
          if (row && row.tags) {
            try {
              row.tags = JSON.parse(row.tags);
            } catch (e) {
              row.tags = [];
            }
          }
          resolve(row || null);
        }
      );
    });
  }

  /**
   * Find all templates for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of templates
   */
  static findByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT bt.*, yc.channel_name
         FROM broadcast_templates bt
         LEFT JOIN youtube_credentials yc ON bt.account_id = yc.id
         WHERE bt.user_id = ?
         ORDER BY bt.created_at DESC`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('Error finding broadcast templates:', err.message);
            return reject(err);
          }
          if (rows) {
            rows.forEach(row => {
              if (row.tags) {
                try {
                  row.tags = JSON.parse(row.tags);
                } catch (e) {
                  row.tags = [];
                }
              }
            });
          }
          resolve(rows || []);
        }
      );
    });
  }

  /**
   * Find template by name for a user
   * @param {string} userId - User ID
   * @param {string} name - Template name
   * @returns {Promise<Object|null>} Template or null
   */
  static findByName(userId, name) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT bt.*, yc.channel_name
         FROM broadcast_templates bt
         LEFT JOIN youtube_credentials yc ON bt.account_id = yc.id
         WHERE bt.user_id = ? AND bt.name = ?`,
        [userId, name],
        (err, row) => {
          if (err) {
            console.error('Error finding broadcast template by name:', err.message);
            return reject(err);
          }
          if (row && row.tags) {
            try {
              row.tags = JSON.parse(row.tags);
            } catch (e) {
              row.tags = [];
            }
          }
          resolve(row || null);
        }
      );
    });
  }

  /**
   * Update a template
   * @param {string} id - Template ID
   * @param {Object} templateData - Updated template data
   * @returns {Promise<Object>} Updated template
   */
  static update(id, templateData) {
    const fields = [];
    const values = [];

    Object.entries(templateData).forEach(([key, value]) => {
      if (key === 'tags' && Array.isArray(value)) {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(value));
      } else if (key === 'name' && typeof value === 'string') {
        if (!value.trim()) {
          throw new Error('Template name cannot be empty');
        }
        fields.push(`${key} = ?`);
        values.push(value.trim());
      } else if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE broadcast_templates SET ${fields.join(', ')} WHERE id = ?`;

    return new Promise((resolve, reject) => {
      db.run(query, values, function (err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return reject(new Error('Template name already exists'));
          }
          console.error('Error updating broadcast template:', err.message);
          return reject(err);
        }
        resolve({ id, ...templateData, updated: this.changes > 0 });
      });
    });
  }

  /**
   * Delete a template
   * @param {string} id - Template ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Deletion result
   */
  static delete(id, userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM broadcast_templates WHERE id = ? AND user_id = ?',
        [id, userId],
        function (err) {
          if (err) {
            console.error('Error deleting broadcast template:', err.message);
            return reject(err);
          }
          resolve({ success: true, deleted: this.changes > 0 });
        }
      );
    });
  }

  /**
   * Check if template name exists for user
   * @param {string} userId - User ID
   * @param {string} name - Template name
   * @param {string} excludeId - Template ID to exclude (for updates)
   * @returns {Promise<boolean>} True if exists
   */
  static async nameExists(userId, name, excludeId = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT COUNT(*) as count FROM broadcast_templates WHERE user_id = ? AND name = ?';
      const params = [userId, name];

      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }

      db.get(query, params, (err, row) => {
        if (err) {
          console.error('Error checking template name:', err.message);
          return reject(err);
        }
        resolve(row.count > 0);
      });
    });
  }

  /**
   * Count templates for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Count of templates
   */
  static countByUserId(userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM broadcast_templates WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) {
            console.error('Error counting broadcast templates:', err.message);
            return reject(err);
          }
          resolve(row.count);
        }
      );
    });
  }
}

module.exports = BroadcastTemplate;
