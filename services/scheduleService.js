/**
 * Schedule Service for Recurring Broadcasts
 * Manages automatic broadcast creation based on templates with recurring enabled
 */

const fs = require('fs');
const path = require('path');
const BroadcastTemplate = require('../models/BroadcastTemplate');
const TitleSuggestion = require('../models/TitleSuggestion');
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
        // Track title index for multi-broadcast rotation
        let currentTitleIndex = template.title_index || 0;
        
        for (let i = 0; i < broadcasts.length; i++) {
          const b = broadcasts[i];
          
          // Get title from rotation if streamId is set
          let finalTitle = b.title;
          if (b.streamId) {
            const titleResult = await this.getNextTitleForBroadcast(
              template.user_id,
              b.streamId,
              null, // No pinned title for individual broadcasts in multi-template
              currentTitleIndex
            );
            
            if (titleResult.title) {
              finalTitle = titleResult.title.title;
              console.log(`[ScheduleService] Broadcast ${i + 1} using rotated title: "${finalTitle}" (index: ${titleResult.currentPosition}/${titleResult.totalCount})`);
              
              // Update index for next broadcast (only if not pinned)
              if (!titleResult.isPinned) {
                currentTitleIndex = titleResult.nextIndex;
              }
              
              // Increment use count
              try {
                await TitleSuggestion.incrementUseCount(titleResult.title.id, template.user_id);
              } catch (err) {
                console.error(`[ScheduleService] Failed to increment title use count:`, err.message);
              }
            }
          }
          
          const title = replaceTitlePlaceholders(finalTitle, now);
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
            
            // Determine thumbnail folder from stream key mapping if available
            let thumbnailFolder = b.thumbnailFolder;
            if (!thumbnailFolder && b.streamId && template.stream_key_folder_mapping) {
              thumbnailFolder = template.stream_key_folder_mapping[b.streamId];
              if (thumbnailFolder !== undefined) {
                console.log(`[ScheduleService] Using mapped folder for stream key ${b.streamId}: ${thumbnailFolder || 'root'}`);
              }
            }
            
            // Upload thumbnail - use sequential selection from folder
            if (thumbnailFolder !== null && thumbnailFolder !== undefined || b.thumbnailPath || b.pinnedThumbnail) {
              // Calculate broadcast-specific index for multi-broadcast templates
              const broadcastIndex = (template.thumbnail_index || 0) + i;
              await this.uploadThumbnailForBroadcast(
                accessToken, 
                result.broadcastId || result.id, 
                b.thumbnailPath,
                thumbnailFolder,
                template.user_id,
                b.pinnedThumbnail,
                null, // Don't update index for individual broadcasts in multi-template
                broadcastIndex
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
        
        // Update thumbnail index for multi-broadcast template after all broadcasts
        if (template.thumbnail_folder !== null && template.thumbnail_folder !== undefined) {
          const newIndex = ((template.thumbnail_index || 0) + broadcasts.length);
          try {
            await BroadcastTemplate.updateThumbnailIndex(template.id, newIndex);
            console.log(`[ScheduleService] Updated multi-template ${template.id} thumbnail_index to ${newIndex}`);
          } catch (err) {
            console.error(`[ScheduleService] Failed to update thumbnail index:`, err.message);
          }
        }
        
        // Update title index for multi-broadcast template after all broadcasts
        if (currentTitleIndex !== (template.title_index || 0)) {
          try {
            await BroadcastTemplate.updateTitleIndex(template.id, currentTitleIndex);
            console.log(`[ScheduleService] Updated multi-template ${template.id} title_index to ${currentTitleIndex}`);
          } catch (err) {
            console.error(`[ScheduleService] Failed to update title index:`, err.message);
          }
        }
      } else {
        // Single broadcast template
        
        // Get title from rotation if stream_id is set
        let finalTitle = template.title;
        if (template.stream_id) {
          const titleResult = await this.getNextTitleForBroadcast(
            template.user_id,
            template.stream_id,
            template.pinned_title_id,
            template.title_index || 0
          );
          
          if (titleResult.title) {
            finalTitle = titleResult.title.title;
            console.log(`[ScheduleService] Using rotated title: "${finalTitle}" (index: ${titleResult.currentPosition}/${titleResult.totalCount}, pinned: ${titleResult.isPinned})`);
            
            // Update title index for next run (only if not pinned)
            if (!titleResult.isPinned && template.id) {
              try {
                await BroadcastTemplate.updateTitleIndex(template.id, titleResult.nextIndex);
                console.log(`[ScheduleService] Updated template ${template.id} title_index to ${titleResult.nextIndex}`);
              } catch (err) {
                console.error(`[ScheduleService] Failed to update title index:`, err.message);
              }
            }
            
            // Increment use count for the title
            try {
              await TitleSuggestion.incrementUseCount(titleResult.title.id, template.user_id);
            } catch (err) {
              console.error(`[ScheduleService] Failed to increment title use count:`, err.message);
            }
          }
        }
        
        const title = replaceTitlePlaceholders(finalTitle, now);
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
        
        // Determine thumbnail folder from stream key mapping if available
        let thumbnailFolder = template.thumbnail_folder;
        if (thumbnailFolder === null && template.stream_id && template.stream_key_folder_mapping) {
          const mappedFolder = template.stream_key_folder_mapping[template.stream_id];
          if (mappedFolder !== undefined) {
            thumbnailFolder = mappedFolder;
            console.log(`[ScheduleService] Using mapped folder for stream key ${template.stream_id}: ${thumbnailFolder || 'root'}`);
          }
        }
        
        // Upload thumbnail - use sequential selection from folder
        if (thumbnailFolder !== null && thumbnailFolder !== undefined || template.thumbnail_path || template.pinned_thumbnail) {
          await this.uploadThumbnailForBroadcast(
            accessToken, 
            result.broadcastId || result.id, 
            template.thumbnail_path,
            thumbnailFolder,
            template.user_id,
            template.pinned_thumbnail,
            template.id,
            template.thumbnail_index || 0
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
  async uploadThumbnailForBroadcast(accessToken, broadcastId, thumbnailPath, thumbnailFolder = null, userId = null, pinnedThumbnail = null, templateId = null, currentIndex = 0) {
    try {
      let fullPath = null;
      let newThumbnailIndex = currentIndex;
      
      // Priority 1: Use pinned thumbnail if set
      if (pinnedThumbnail && userId) {
        fullPath = path.join(__dirname, '..', 'public', pinnedThumbnail);
        if (fs.existsSync(fullPath)) {
          console.log(`[ScheduleService] Using pinned thumbnail: ${pinnedThumbnail}`);
        } else {
          console.warn(`[ScheduleService] Pinned thumbnail not found: ${fullPath}, falling back to sequential`);
          fullPath = null;
        }
      }
      
      // Priority 2: If thumbnail_folder is specified, select sequential thumbnail from that folder
      if (!fullPath && thumbnailFolder !== null && thumbnailFolder !== undefined && userId) {
        const result = await this.getSequentialThumbnailFromFolder(userId, thumbnailFolder, currentIndex);
        if (result.path) {
          fullPath = path.join(__dirname, '..', 'public', result.path);
          newThumbnailIndex = result.newIndex;
          console.log(`[ScheduleService] Selected sequential thumbnail from folder "${thumbnailFolder}": ${result.path} (index: ${currentIndex} -> ${newThumbnailIndex})`);
          
          // Update thumbnail index in template for next run
          if (templateId) {
            try {
              await BroadcastTemplate.updateThumbnailIndex(templateId, newThumbnailIndex);
              console.log(`[ScheduleService] Updated template ${templateId} thumbnail_index to ${newThumbnailIndex}`);
            } catch (err) {
              console.error(`[ScheduleService] Failed to update thumbnail index:`, err.message);
            }
          }
        }
      }
      
      // Priority 3: Fallback to specific thumbnail_path if no folder or sequential selection failed
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
   * Get sequential thumbnail from a user's folder (not random)
   * @param {string} userId - User ID
   * @param {string} folderName - Folder name (empty string for root)
   * @param {number} currentIndex - Current thumbnail index
   * @returns {Promise<{path: string|null, newIndex: number, totalCount: number}>} Thumbnail info
   */
  async getSequentialThumbnailFromFolder(userId, folderName, currentIndex = 0) {
    try {
      const basePath = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails', userId);
      let targetPath = basePath;
      
      if (folderName && folderName.trim()) {
        targetPath = path.join(basePath, folderName);
      }
      
      if (!fs.existsSync(targetPath)) {
        console.warn(`[ScheduleService] Thumbnail folder not found: ${targetPath}`);
        return { path: null, newIndex: 0, totalCount: 0 };
      }
      
      // Get all image files in the folder, sorted alphabetically for consistent order
      const files = fs.readdirSync(targetPath)
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png'].includes(ext);
        })
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      
      if (files.length === 0) {
        console.warn(`[ScheduleService] No thumbnails found in folder: ${targetPath}`);
        return { path: null, newIndex: 0, totalCount: 0 };
      }
      
      // Calculate the actual index (wrap around if needed)
      const actualIndex = currentIndex % files.length;
      const selectedFile = files[actualIndex];
      
      // Calculate next index for next run
      const newIndex = (actualIndex + 1) % files.length;
      
      console.log(`[ScheduleService] Sequential thumbnail: index ${actualIndex}/${files.length - 1}, file: ${selectedFile}, next index: ${newIndex}`);
      
      // Return relative path from /public
      let thumbnailPath;
      if (folderName && folderName.trim()) {
        thumbnailPath = `/uploads/thumbnails/${userId}/${folderName}/${selectedFile}`;
      } else {
        thumbnailPath = `/uploads/thumbnails/${userId}/${selectedFile}`;
      }
      
      return { path: thumbnailPath, newIndex, totalCount: files.length };
    } catch (error) {
      console.error(`[ScheduleService] Error getting sequential thumbnail:`, error.message);
      return { path: null, newIndex: 0, totalCount: 0 };
    }
  }

  /**
   * Get next title for broadcast using sequential rotation
   * @param {string} userId - User ID
   * @param {string} streamKeyId - Stream key ID
   * @param {string} pinnedTitleId - Pinned title ID (if any)
   * @param {number} currentIndex - Current title index
   * @returns {Promise<{title: Object|null, nextIndex: number, isPinned: boolean, totalCount: number, currentPosition: number}>}
   */
  async getNextTitleForBroadcast(userId, streamKeyId, pinnedTitleId = null, currentIndex = 0) {
    try {
      // Priority 1: Check for pinned title in template
      if (pinnedTitleId) {
        const pinnedTitle = await new Promise((resolve, reject) => {
          const { db } = require('../db/database');
          db.get(
            `SELECT * FROM title_suggestions WHERE id = ? AND user_id = ?`,
            [pinnedTitleId, userId],
            (err, row) => {
              if (err) return reject(err);
              resolve(row);
            }
          );
        });
        
        if (pinnedTitle) {
          console.log(`[ScheduleService] Using pinned title from template: "${pinnedTitle.title}"`);
          return {
            title: pinnedTitle,
            nextIndex: currentIndex,
            isPinned: true,
            totalCount: 1,
            currentPosition: 1
          };
        }
      }
      
      // Priority 2: Use TitleSuggestion.getNextTitle for sequential rotation
      const result = await TitleSuggestion.getNextTitle(userId, streamKeyId, currentIndex);
      
      if (result.title) {
        return {
          title: result.title,
          nextIndex: result.nextIndex,
          isPinned: result.isPinned,
          totalCount: result.totalCount || 1,
          currentPosition: result.currentPosition || 1
        };
      }
      
      // No title found
      return {
        title: null,
        nextIndex: 0,
        isPinned: false,
        totalCount: 0,
        currentPosition: 0
      };
    } catch (error) {
      console.error(`[ScheduleService] Error getting next title:`, error.message);
      return {
        title: null,
        nextIndex: currentIndex,
        isPinned: false,
        totalCount: 0,
        currentPosition: 0
      };
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
