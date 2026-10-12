const fs = require('fs');
const path = require('path');
const { db } = require('../db/database');

// Simple in-memory cache for storage limits
const storageLimitCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

class StorageService {
  /**
   * Normalize storage limit values from DB/API.
   * Treats invalid/non-positive values as unlimited (null).
   * Values are always stored and read in bytes.
   * @param {unknown} rawLimit
   * @returns {number|null}
   */
  static normalizeLimit(rawLimit) {
    if (rawLimit === null || rawLimit === undefined || rawLimit === '' || rawLimit === 'null') {
      return null;
    }

    const parsedLimit = Number(rawLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return null;
    }

    // All values are stored in bytes. Return as-is.
    return Math.floor(parsedLimit);
  }

  /**
   * Calculate total storage usage for a user
   * @param {string} userId - User ID
   * @returns {Promise<{totalBytes: number, videoBytes: number, audioBytes: number}>}
   */
  static async calculateUsage(userId) {
    return new Promise((resolve, reject) => {
      // Use single query with UNION for better performance
      const query = `
        SELECT 
          COALESCE((SELECT SUM(file_size) FROM videos WHERE user_id = ?), 0) as videoBytes,
          COALESCE((SELECT SUM(file_size) FROM audios WHERE user_id = ?), 0) as audioBytes
      `;

      db.get(query, [userId, userId], (err, result) => {
        if (err) {
          console.error('Error calculating storage:', err.message);
          return reject(err);
        }

        const videoBytes = Number(result?.videoBytes) || 0;
        const audioBytes = Number(result?.audioBytes) || 0;
        const totalBytes = videoBytes + audioBytes;

        resolve({
          totalBytes,
          videoBytes,
          audioBytes
        });
      });
    });
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted string (e.g., "1.5 GB")
   */
  static formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes === null || bytes === undefined) return 'Unlimited';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));

    return `${value} ${sizes[i]}`;
  }


  /**
   * Check if user can upload a file of given size
   * @param {string} userId - User ID
   * @param {number} fileSize - Size of file to upload in bytes
   * @returns {Promise<{allowed: boolean, currentUsage: number, limit: number|null, remaining: number|null}>}
   */
  static async canUpload(userId, fileSize) {
    const usage = await this.calculateUsage(userId);
    const limit = await this.getUserStorageLimit(userId);
    const normalizedFileSize = Number(fileSize);

    if (!Number.isFinite(normalizedFileSize) || normalizedFileSize <= 0) {
      return {
        allowed: false,
        currentUsage: usage.totalBytes,
        limit,
        remaining: limit === null ? null : Math.max(0, limit - usage.totalBytes)
      };
    }

    // If limit is null or 0, user has unlimited storage
    if (!limit) {
      return {
        allowed: true,
        currentUsage: usage.totalBytes,
        limit: null,
        remaining: null
      };
    }

    const remaining = Math.max(0, limit - usage.totalBytes);
    const allowed = (usage.totalBytes + normalizedFileSize) <= limit;

    return {
      allowed,
      currentUsage: usage.totalBytes,
      limit,
      remaining
    };
  }

  /**
   * Get user's storage limit from database (with caching)
   * @param {string} userId - User ID
   * @returns {Promise<number|null>}
   */
  static async getUserStorageLimit(userId) {
    // Check cache first
    const cached = storageLimitCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.limit;
    }

    return new Promise((resolve, reject) => {
      db.get('SELECT storage_limit FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
          console.error('Error getting storage limit:', err.message);
          return reject(err);
        }
        const limit = this.normalizeLimit(row?.storage_limit);
        
        // Cache the result
        storageLimitCache.set(userId, { limit, timestamp: Date.now() });
        
        resolve(limit);
      });
    });
  }

  /**
   * Clear storage limit cache for a user
   * @param {string} userId - User ID
   */
  static clearCache(userId) {
    if (userId) {
      storageLimitCache.delete(userId);
    } else {
      storageLimitCache.clear();
    }
  }

  /**
   * Get storage info for display
   * @param {string} userId - User ID
   * @returns {Promise<Object>}
   */
  static async getStorageInfo(userId) {
    const usage = await this.calculateUsage(userId);
    const limit = await this.getUserStorageLimit(userId);

    let percentage = null;
    let status = 'normal';
    let remaining = null;

    if (limit && limit > 0) {
      percentage = Math.round((usage.totalBytes / limit) * 100);
      remaining = Math.max(0, limit - usage.totalBytes);

      if (percentage >= 100) {
        status = 'critical';
      } else if (percentage >= 80) {
        status = 'warning';
      }
    }

    return {
      userId,
      usage: {
        total: usage.totalBytes,
        videos: usage.videoBytes,
        audios: usage.audioBytes
      },
      limit,
      remaining,
      percentage,
      formatted: {
        usage: this.formatBytes(usage.totalBytes),
        limit: limit ? this.formatBytes(limit) : 'Unlimited',
        remaining: remaining !== null ? this.formatBytes(remaining) : 'Unlimited',
        videos: this.formatBytes(usage.videoBytes),
        audios: this.formatBytes(usage.audioBytes)
      },
      status
    };
  }

  /**
   * Get default storage limit from system settings
   * @returns {Promise<number|null>}
   */
  static async getDefaultStorageLimit() {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM system_settings WHERE key = ?', ['default_storage_limit'], (err, row) => {
        if (err) {
          console.error('Error getting default storage limit:', err.message);
          return reject(err);
        }
        
        const limit = this.normalizeLimit(row?.value);
        resolve(limit);
      });
    });
  }

  /**
   * Set default storage limit in system settings
   * @param {number|null} limit - Default limit in bytes
   * @returns {Promise<void>}
   */
  static async setDefaultStorageLimit(limit) {
    return new Promise((resolve, reject) => {
      const value = limit === null || limit === 0 ? 'null' : String(limit);
      
      db.run(
        `INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
        ['default_storage_limit', value],
        function(err) {
          if (err) {
            console.error('Error setting default storage limit:', err.message);
            return reject(err);
          }
          resolve();
        }
      );
    });
  }

  /**
   * Automatically cleans up ghost files and temporary garbage from storage.
   * Cleans:
   * 1. temp/ (playlist_*.txt, *_merged.*, stream_*_merged.*) older than 10 mins
   * 2. tmp/upload-chunks/ (stale upload chunk fragments older than 30 mins)
   * 3. public/uploads/rendered/ (temp renders older than 24 hours)
   * 4. public/uploads/thumbnails/ (temporary thumb_* older than 2 hours and not in DB)
   * 5. Orphan records in youtube_broadcast_settings
   */
  static async cleanupGhostFiles() {
    let deletedFiles = 0;
    let freedBytes = 0;
    const now = Date.now();

    // 1. Clean temp/ directory
    try {
      const tempDir = path.join(__dirname, '../temp');
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          try {
            const stats = fs.statSync(filePath);
            const ageMs = now - stats.mtimeMs;
            if (ageMs > 10 * 60 * 1000) {
              freedBytes += stats.size;
              fs.unlinkSync(filePath);
              deletedFiles++;
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[StorageService] Error cleaning temp directory:', e.message);
    }

    // 2. Clean tmp/upload-chunks/
    try {
      const chunksDir = path.join(__dirname, '../tmp/upload-chunks');
      if (fs.existsSync(chunksDir)) {
        const files = fs.readdirSync(chunksDir);
        for (const file of files) {
          const filePath = path.join(chunksDir, file);
          try {
            const stats = fs.statSync(filePath);
            const ageMs = now - stats.mtimeMs;
            if (ageMs > 30 * 60 * 1000) {
              if (stats.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
              } else {
                freedBytes += stats.size;
                fs.unlinkSync(filePath);
              }
              deletedFiles++;
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[StorageService] Error cleaning chunks directory:', e.message);
    }

    // 3. Clean public/uploads/rendered/
    try {
      const renderedDir = path.join(__dirname, '../public/uploads/rendered');
      if (fs.existsSync(renderedDir)) {
        const files = fs.readdirSync(renderedDir);
        for (const file of files) {
          const filePath = path.join(renderedDir, file);
          try {
            const stats = fs.statSync(filePath);
            const ageMs = now - stats.mtimeMs;
            if (ageMs > 24 * 60 * 60 * 1000) {
              freedBytes += stats.size;
              fs.unlinkSync(filePath);
              deletedFiles++;
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[StorageService] Error cleaning rendered directory:', e.message);
    }

    // 4. Clean orphan temp upload thumbnails
    try {
      const thumbDir = path.join(__dirname, '../public/uploads/thumbnails');
      if (fs.existsSync(thumbDir)) {
        const files = fs.readdirSync(thumbDir);
        for (const file of files) {
          if (file.startsWith('thumb_')) {
            const filePath = path.join(thumbDir, file);
            try {
              const stats = fs.statSync(filePath);
              const ageMs = now - stats.mtimeMs;
              if (ageMs > 2 * 60 * 60 * 1000) {
                const relPath = `/uploads/thumbnails/${file}`;
                const isReferenced = await new Promise((resolve) => {
                  db.get(
                    `SELECT 1 FROM youtube_broadcast_settings WHERE thumbnail_path = ?
                     UNION
                     SELECT 1 FROM videos WHERE thumbnail_path = ?
                     LIMIT 1`,
                    [relPath, relPath],
                    (err, row) => resolve(Boolean(row))
                  );
                });
                if (!isReferenced) {
                  freedBytes += stats.size;
                  fs.unlinkSync(filePath);
                  deletedFiles++;
                }
              }
            } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.warn('[StorageService] Error cleaning thumbnails:', e.message);
    }

    // 5. Clean orphan records in youtube_broadcast_settings
    try {
      await new Promise((resolve) => {
        db.run(
          `DELETE FROM youtube_broadcast_settings 
           WHERE broadcast_id NOT IN (SELECT COALESCE(youtube_broadcast_id, '') FROM streams WHERE youtube_broadcast_id IS NOT NULL)
             AND broadcast_id LIKE 'scheduled_stream_%'
             AND broadcast_id NOT IN (SELECT 'scheduled_stream_' || id FROM streams)`,
          () => resolve()
        );
      });
    } catch (_) {}

    if (deletedFiles > 0) {
      console.log(`[StorageService] 🧹 Ghost files cleanup completed: Deleted ${deletedFiles} ghost files, freed ${(freedBytes / (1024 * 1024)).toFixed(2)} MB`);
    }

    return { deletedFiles, freedBytes };
  }
}

// Background sweeper to automatically clean up ghost files every 30 minutes
setInterval(() => {
  StorageService.cleanupGhostFiles().catch(() => {});
}, 30 * 60 * 1000);

// Initial ghost file cleanup 5 seconds after boot
setTimeout(() => {
  StorageService.cleanupGhostFiles().catch(() => {});
}, 5000);

module.exports = StorageService;
