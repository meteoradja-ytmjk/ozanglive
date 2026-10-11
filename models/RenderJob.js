const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');

class RenderJob {
  static create(data) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO render_jobs (
          id, user_id, title, status, progress, target_duration_seconds,
          loop_mode, video_ids, audio_ids, output_path, error_message,
          target_account_id, auto_upload, youtube_video_id,
          scheduled_upload_at, visualizer_preset, follow_audio_duration,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.user_id,
          data.title,
          data.status || 'queued',
          data.progress || 0,
          data.target_duration_seconds,
          data.loop_mode || 'duration',
          JSON.stringify(data.video_ids || []),
          JSON.stringify(data.audio_ids || []),
          data.output_path || null,
          data.error_message || null,
          data.target_account_id || null,
          data.auto_upload ? 1 : 0,
          data.youtube_video_id || null,
          data.scheduled_upload_at || null,
          data.visualizer_preset || 'none',
          data.follow_audio_duration ? 1 : 0,
          now,
          now
        ],
        function (err) {
          if (err) return reject(err);
          resolve({ id, ...data, created_at: now, updated_at: now });
        }
      );
    });
  }

  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM render_jobs WHERE id = ?', [id], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  static findAllByUser(userId) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM render_jobs WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  static update(id, data) {
    const keys = Object.keys(data);
    const fields = keys.map((k) => `${k} = ?`);
    const values = keys.map((k) => data[k]);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    return new Promise((resolve, reject) => {
      db.run(`UPDATE render_jobs SET ${fields.join(', ')} WHERE id = ?`, values, (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  }

  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM render_jobs WHERE id = ?', [id], function (err) {
        if (err) return reject(err);
        resolve({ success: true, deleted: this.changes > 0 });
      });
    });
  }
}

module.exports = RenderJob;
