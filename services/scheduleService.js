/**
 * Schedule Service for Recurring Broadcasts
 * Manages automatic broadcast creation based on templates with recurring enabled
 */

const fs = require('fs');
const path = require('path');
const BroadcastTemplate = require('../models/BroadcastTemplate');
const youtubeService = require('./youtubeService');
const { calculateNextRun, formatNextRunAt, replaceTitlePlaceholders, isScheduleMissed } = require('../utils/recurringUtils');

class ScheduleService {
  constructor() {
    this.jobs = new Map(); // Map of templateId -> job info
    this.checkInterval = null;
    this.initialized = false;
  }

  /**
   * Initialize the schedule service
   * Loads all templates with recurring enabled and starts checking
   */
  async init() {
    if (this.initialized) return;
    
    try {
      console.log('[ScheduleService] Initializing...');
      
      // Start the schedule checker (runs every minute)
      this.startChecker();
      
      // Load all templates with recurring enabled
      const templates = await BroadcastTemplate.findWithRecurringEnabled();
      console.log(`[ScheduleService] Found ${templates.length} templates with recurring enabled`);
      
      const now = new Date();
      let missedCount = 0;
      
      for (const template of templates) {
        // Check for missed schedules on startup
        if (this.shouldExecuteMissed(template, now)) {
          console.log(`[ScheduleService] Found missed schedule for template: ${template.name}`);
          missedCount++;
          try {
            await this.executeTemplate(template);
            console.log(`[ScheduleService] Executed missed schedule for: ${template.name}`);
          } catch (error) {
            console.error(`[ScheduleService] Failed to execute missed schedule for ${template.name}:`, error.message);
          }
        } else {
          await this.scheduleJob(template);
        }
      }
      
      if (missedCount > 0) {
        console.log(`[ScheduleService] Executed ${missedCount} missed schedules`);
      }
      
      this.initialized = true;
      console.log('[ScheduleService] Initialized successfully');
    } catch (error) {
      console.error('[ScheduleService] Initialization error:', error.message);
    }
  }

  /**
   * Start the schedule checker that runs every 2 minutes
   */
  startChecker() {
    if (this.checkInterval) return;
    
    // Check every 2 minutes (broadcast creation is less time-critical)
    this.checkInterval = setInterval(async () => {
      await this.checkSchedules();
    }, 120000);
    
    console.log('[ScheduleService] Schedule checker started (2 min interval)');
  }

  /**
   * Stop the schedule checker
   */
  stopChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }


  /**
   * Check all templates with recurring and execute if it's time
   */
  async checkSchedules() {
    try {
      const templates = await BroadcastTemplate.findWithRecurringEnabled();
      const now = new Date();
      
      for (const template of templates) {
        // Check for missed schedules first
        if (this.shouldExecuteMissed(template, now)) {
          console.log(`[ScheduleService] Executing missed schedule for template: ${template.name}`);
          await this.executeTemplate(template);
          continue;
        }
        
        // Check if it's time to execute
        if (this.shouldExecute(template, now)) {
          console.log(`[ScheduleService] Executing template: ${template.name}`);
          await this.executeTemplate(template);
        }
      }
    } catch (error) {
      console.error('[ScheduleService] Check schedules error:', error.message);
    }
  }

  /**
   * Check if a missed schedule should be executed
   * @param {Object} template - Template object with recurring config
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  shouldExecuteMissed(template, now) {
    // Check if next_run_at is in the past (missed schedule)
    if (!template.next_run_at) return false;
    
    const nextRunAt = new Date(template.next_run_at);
    
    // Only execute missed schedules from today
    if (nextRunAt.toDateString() !== now.toDateString()) {
      // If missed schedule is from a previous day, just recalculate next_run_at
      if (nextRunAt.getTime() < now.getTime()) {
        return false; // Will be handled by recalculating next_run_at
      }
      return false;
    }
    
    // Check if it's missed (past time) and hasn't run today
    return isScheduleMissed(template.next_run_at, now) && !this.hasRunToday(template, now);
  }

  /**
   * Check if a template should execute now
   * @param {Object} template - Template object with recurring config
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  shouldExecute(template, now) {
    if (!template.recurring_time) return false;
    
    const [schedHour, schedMin] = template.recurring_time.split(':').map(Number);
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    
    // Check if time matches (within the same minute)
    if (currentHour !== schedHour || currentMin !== schedMin) {
      return false;
    }
    
    // For daily, always execute at the right time
    if (template.recurring_pattern === 'daily') {
      return !this.hasRunToday(template, now);
    }
    
    // For weekly, check if today is a scheduled day
    if (template.recurring_pattern === 'weekly') {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = dayNames[now.getDay()];
      const scheduledDays = template.recurring_days || [];
      
      // Normalize day names to lowercase for comparison
      const normalizedDays = scheduledDays.map(d => d.toLowerCase());
      
      if (!normalizedDays.includes(today)) {
        return false;
      }
      
      return !this.hasRunToday(template, now);
    }
    
    return false;
  }

  /**
   * Check if template has already run today
   * @param {Object} template - Template object
   * @param {Date} now - Current time
   * @returns {boolean}
   */
  hasRunToday(template, now) {
    if (!template.last_run_at) return false;
    
    const lastRun = new Date(template.last_run_at);
    return lastRun.toDateString() === now.toDateString();
  }

  /**
   * Schedule a job for a specific template
   * @param {Object} template - Template object with recurring config
   */
  async scheduleJob(template) {
    // Calculate and update next run time
    const nextRun = calculateNextRun({
      recurring_pattern: template.recurring_pattern,
      recurring_time: template.recurring_time,
      recurring_days: template.recurring_days
    });
    
    if (nextRun) {
      await BroadcastTemplate.update(template.id, { next_run_at: formatNextRunAt(nextRun) });
    }
    
    this.jobs.set(template.id, { template, nextRun });
    console.log(`[ScheduleService] Scheduled: ${template.name} - Next run: ${nextRun?.toISOString() || 'N/A'}`);
  }

  /**
   * Cancel a scheduled job
   * @param {string} templateId - Template ID
   */
  cancelJob(templateId) {
    if (this.jobs.has(templateId)) {
      this.jobs.delete(templateId);
      console.log(`[ScheduleService] Cancelled job: ${templateId}`);
    }
  }

  /**
   * Execute a template - create broadcast(s)
   * @param {Object} template - Template object with recurring config
   * @param {number} retryCount - Current retry count
   */
  async executeTemplate(template, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      const now = new Date();
      
      // Get access token from credentials (joined from youtube_credentials)
      const accessToken = await youtubeService.getAccessToken(
        template.client_id,
        template.client_secret,
        template.refresh_token
      );
      
      // Check if this is a multi-broadcast template
      let broadcasts = [];
      try {
        if (template.description && template.description.startsWith('[')) {
          broadcasts = JSON.parse(template.description);
          console.log(`[ScheduleService] Multi-broadcast template detected: ${broadcasts.length} broadcasts`);
        }
      } catch (e) {
        // Not a multi-broadcast template
      }
      
      const results = [];
      
      if (broadcasts.length > 0) {
        // Multi-broadcast template - create all broadcasts
        for (let i = 0; i < broadcasts.length; i++) {
          const b = broadcasts[i];
          const title = replaceTitlePlaceholders(b.title, now);
          const description = b.description ? replaceTitlePlaceholders(b.description, now) : '';
          
          // Calculate scheduled start time (10 + i*2 minutes from now to stagger)
          const scheduledStartTime = new Date(now.getTime() + (10 + i * 2) * 60 * 1000);
          
          // Log broadcast privacy status for debugging
          console.log(`[ScheduleService] Broadcast ${i + 1} privacyStatus from template: ${b.privacyStatus}`);
          
          const broadcastData = {
            title,
            description,
            scheduledStartTime: scheduledStartTime.toISOString(),
            privacyStatus: b.privacyStatus || 'unlisted',
            tags: b.tags || [],
            categoryId: b.categoryId || '20',
            streamId: b.streamId || null,  // Use saved stream ID
            // IMPORTANT: Always enable auto-start when creating from recurring template
            // This ensures YouTube broadcast starts automatically when stream begins
            enableAutoStart: true,
            enableAutoStop: true
          };
          
          console.log(`[ScheduleService] Creating broadcast ${i + 1}/${broadcasts.length}: ${title}`);
          console.log(`[ScheduleService] Using privacyStatus: ${broadcastData.privacyStatus}`);
          console.log(`[ScheduleService] Using streamId: ${b.streamId || 'none (will create new)'}`);
          
          try {
            const result = await youtubeService.createBroadcast(accessToken, broadcastData);
            results.push(result);
            console.log(`[ScheduleService] Broadcast ${i + 1} created: ${result.broadcastId || result.id}`);
            
            // Upload thumbnail - use folder for random selection if available
            if (b.thumbnailFolder || b.thumbnailPath) {
              await this.uploadThumbnailForBroadcast(
                accessToken, 
                result.broadcastId || result.id, 
                b.thumbnailPath,
                b.thumbnailFolder,
                template.user_id
              );
            }
          } catch (err) {
            console.error(`[ScheduleService] Failed to create broadcast ${i + 1}:`, err.message);
          }
          
          // Small delay between broadcasts to avoid rate limiting
          if (i < broadcasts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      } else {
        // Single broadcast template
        const title = replaceTitlePlaceholders(template.title, now);
        const description = template.description ? replaceTitlePlaceholders(template.description, now) : '';
        
        // Calculate scheduled start time (10 minutes from now)
        const scheduledStartTime = new Date(now.getTime() + 10 * 60 * 1000);
        
        // Log template privacy_status for debugging
        console.log(`[ScheduleService] Template privacy_status: ${template.privacy_status}`);
        
        const broadcastData = {
          title,
          description,
          scheduledStartTime: scheduledStartTime.toISOString(),
          privacyStatus: template.privacy_status || 'unlisted',
          tags: template.tags || [],
          categoryId: template.category_id || '20',
          streamId: template.stream_id || null,
          // IMPORTANT: Always enable auto-start when creating from recurring template
          // This ensures YouTube broadcast starts automatically when stream begins
          enableAutoStart: true,
          enableAutoStop: true
        };
        
        console.log(`[ScheduleService] Creating single broadcast: ${title}`);
        console.log(`[ScheduleService] Using privacyStatus: ${broadcastData.privacyStatus}`);
        console.log(`[ScheduleService] Using streamId: ${template.stream_id || 'none (will create new)'}`);
        
        const result = await youtubeService.createBroadcast(accessToken, broadcastData);
        results.push(result);
        console.log(`[ScheduleService] Broadcast created: ${result.broadcastId || result.id}`);
        
        // Upload thumbnail - use folder for random selection if available
        if (template.thumbnail_folder || template.thumbnail_path) {
          await this.uploadThumbnailForBroadcast(
            accessToken, 
            result.broadcastId || result.id, 
            template.thumbnail_path,
            template.thumbnail_folder,
            template.user_id
          );
        }
      }
      
      // Update last run and calculate next run
      const nextRun = calculateNextRun({
        recurring_pattern: template.recurring_pattern,
        recurring_time: template.recurring_time,
        recurring_days: template.recurring_days
      });
      
      await BroadcastTemplate.updateLastRun(
        template.id,
        now.toISOString(),
        nextRun ? formatNextRunAt(nextRun) : null
      );
      
      console.log(`[ScheduleService] Template ${template.name}: Created ${results.length} broadcast(s)`);
      console.log(`[ScheduleService] Next run: ${nextRun?.toISOString() || 'N/A'}`);
      
      return results;
    } catch (error) {
      console.error(`[ScheduleService] Execute error (attempt ${retryCount + 1}):`, error.message);
      
      if (retryCount < maxRetries - 1) {
        console.log(`[ScheduleService] Retrying in 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
        return this.executeTemplate(template, retryCount + 1);
      }
      
      console.error(`[ScheduleService] All retries failed for template: ${template.name}`);
      throw error;
    }
  }

  /**
   * Upload thumbnail for a broadcast
   * @param {string} accessToken - YouTube access token
   * @param {string} broadcastId - Broadcast ID to upload thumbnail for
   * @param {string} thumbnailPath - Path to thumbnail file relative to /public
   * @param {string} thumbnailFolder - Folder name for random thumbnail selection
   * @param {string} userId - User ID for folder-based thumbnail lookup
   * @returns {Promise<boolean>} True if upload successful, false otherwise
   */
  async uploadThumbnailForBroadcast(accessToken, broadcastId, thumbnailPath, thumbnailFolder = null, userId = null) {
    try {
      let fullPath = null;
      
      // If thumbnail_folder is specified, select random thumbnail from that folder
      if (thumbnailFolder && userId) {
        const randomThumbnail = await this.getRandomThumbnailFromFolder(userId, thumbnailFolder);
        if (randomThumbnail) {
          fullPath = path.join(__dirname, '..', 'public', randomThumbnail);
          console.log(`[ScheduleService] Selected random thumbnail from folder "${thumbnailFolder}": ${randomThumbnail}`);
        }
      }
      
      // Fallback to specific thumbnail_path if no folder or random selection failed
      if (!fullPath && thumbnailPath) {
        fullPath = path.join(__dirname, '..', 'public', thumbnailPath);
      }
      
      if (!fullPath) {
        return false;
      }

      // Check if file exists before reading
      if (!fs.existsSync(fullPath)) {
        console.warn(`[ScheduleService] Thumbnail not found: ${fullPath}`);
        return false;
      }

      const thumbnailBuffer = fs.readFileSync(fullPath);
      await youtubeService.uploadThumbnail(accessToken, broadcastId, thumbnailBuffer);
      console.log(`[ScheduleService] Thumbnail uploaded for broadcast: ${broadcastId}`);
      return true;
    } catch (error) {
      console.error(`[ScheduleService] Thumbnail upload failed for ${broadcastId}:`, error.message);
      // Continue without failing - thumbnail is optional
      return false;
    }
  }

  /**
   * Get random thumbnail from a user's folder
   * @param {string} userId - User ID
   * @param {string} folderName - Folder name (empty string for root)
   * @returns {Promise<string|null>} Thumbnail path or null
   */
  async getRandomThumbnailFromFolder(userId, folderName) {
    try {
      const basePath = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails', userId);
      let targetPath = basePath;
      
      if (folderName && folderName.trim()) {
        targetPath = path.join(basePath, folderName);
      }
      
      if (!fs.existsSync(targetPath)) {
        console.warn(`[ScheduleService] Thumbnail folder not found: ${targetPath}`);
        return null;
      }
      
      // Get all image files in the folder
      const files = fs.readdirSync(targetPath).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png'].includes(ext);
      });
      
      if (files.length === 0) {
        console.warn(`[ScheduleService] No thumbnails found in folder: ${targetPath}`);
        return null;
      }
      
      // Select random file
      const randomIndex = Math.floor(Math.random() * files.length);
      const randomFile = files[randomIndex];
      
      // Return relative path from /public
      if (folderName && folderName.trim()) {
        return `/uploads/thumbnails/${userId}/${folderName}/${randomFile}`;
      }
      return `/uploads/thumbnails/${userId}/${randomFile}`;
    } catch (error) {
      console.error(`[ScheduleService] Error getting random thumbnail:`, error.message);
      return null;
    }
  }

  /**
   * Reload a specific template
   * @param {string} templateId - Template ID
   */
  async reloadTemplate(templateId) {
    this.cancelJob(templateId);
    
    const template = await BroadcastTemplate.findById(templateId);
    if (template && template.recurring_enabled) {
      await this.scheduleJob(template);
    }
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    this.stopChecker();
    this.jobs.clear();
    this.initialized = false;
    console.log('[ScheduleService] Shutdown complete');
  }
}

// Export singleton instance
module.exports = new ScheduleService();
