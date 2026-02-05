const YouTubeScheduledTask = require('../models/YouTubeScheduledTask');
const YouTubeCredentials = require('../models/YouTubeCredentials');
const youtubeService = require('./youtubeService');

/**
 * YouTube Task Scheduler Service
 * Handles scheduled tasks for YouTube videos (privacy changes, metadata updates)
 */
class YouTubeTaskScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.checkInterval = 60000; // Check every 1 minute
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[YouTubeTaskScheduler] Already running');
      return;
    }

    console.log('[YouTubeTaskScheduler] Starting scheduler...');
    this.isRunning = true;

    // Run immediately
    this.processTasks();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.processTasks();
    }, this.checkInterval);

    console.log('[YouTubeTaskScheduler] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[YouTubeTaskScheduler] Stopping scheduler...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[YouTubeTaskScheduler] Scheduler stopped');
  }

  /**
   * Process due tasks
   */
  async processTasks() {
    try {
      const tasks = await YouTubeScheduledTask.findDueTasks();

      if (tasks.length === 0) {
        return;
      }

      console.log(`[YouTubeTaskScheduler] Processing ${tasks.length} due tasks`);

      for (const task of tasks) {
        await this.executeTask(task);
      }
    } catch (error) {
      console.error('[YouTubeTaskScheduler] Error processing tasks:', error.message);
    }
  }

  /**
   * Execute a single task
   * @param {Object} task - Task to execute
   */
  async executeTask(task) {
    try {
      console.log(`[YouTubeTaskScheduler] Executing task ${task.id} (${task.task_type}) for video ${task.video_id}`);

      // Get credentials for the account
      const credentials = await YouTubeCredentials.findByAccountId(task.account_id);
      if (!credentials) {
        throw new Error('YouTube credentials not found for account');
      }

      // Get access token
      const accessToken = await youtubeService.getAccessToken(
        credentials.client_id,
        credentials.client_secret,
        credentials.refresh_token
      );

      // Execute based on task type
      switch (task.task_type) {
        case 'privacy_change':
          await this.executePrivacyChange(accessToken, task);
          break;
        
        case 'metadata_update':
          await this.executeMetadataUpdate(accessToken, task);
          break;
        
        case 'bulk_update':
          await this.executeBulkUpdate(accessToken, task);
          break;
        
        default:
          throw new Error(`Unknown task type: ${task.task_type}`);
      }

      // Mark task as completed
      await YouTubeScheduledTask.updateStatus(task.id, 'completed');
      console.log(`[YouTubeTaskScheduler] Task ${task.id} completed successfully`);

    } catch (error) {
      console.error(`[YouTubeTaskScheduler] Error executing task ${task.id}:`, error.message);
      
      // Mark task as failed
      await YouTubeScheduledTask.updateStatus(task.id, 'failed', error.message);
    }
  }

  /**
   * Execute privacy change task
   * @param {string} accessToken - Access token
   * @param {Object} task - Task data
   */
  async executePrivacyChange(accessToken, task) {
    const { privacyStatus } = task.task_data;

    await youtubeService.updateVideoMetadata(accessToken, task.video_id, {
      privacyStatus
    });

    console.log(`[YouTubeTaskScheduler] Changed privacy of video ${task.video_id} to ${privacyStatus}`);
  }

  /**
   * Execute metadata update task
   * @param {string} accessToken - Access token
   * @param {Object} task - Task data
   */
  async executeMetadataUpdate(accessToken, task) {
    const updates = task.task_data;

    await youtubeService.updateVideoMetadata(accessToken, task.video_id, updates);

    console.log(`[YouTubeTaskScheduler] Updated metadata for video ${task.video_id}`);
  }

  /**
   * Execute bulk update task
   * @param {string} accessToken - Access token
   * @param {Object} task - Task data
   */
  async executeBulkUpdate(accessToken, task) {
    const { videoIds, updates } = task.task_data;

    const results = await youtubeService.bulkUpdateVideos(accessToken, videoIds, updates);

    console.log(`[YouTubeTaskScheduler] Bulk update completed: ${results.success} success, ${results.failed} failed`);
  }

  /**
   * Schedule a privacy change
   * @param {string} videoId - Video ID
   * @param {number} accountId - Account ID
   * @param {string} privacyStatus - New privacy status
   * @param {Date} scheduledTime - When to execute
   * @returns {Promise<Object>}
   */
  async schedulePrivacyChange(videoId, accountId, privacyStatus, scheduledTime) {
    return await YouTubeScheduledTask.create({
      video_id: videoId,
      account_id: accountId,
      task_type: 'privacy_change',
      scheduled_time: scheduledTime.toISOString(),
      task_data: { privacyStatus }
    });
  }

  /**
   * Schedule a metadata update
   * @param {string} videoId - Video ID
   * @param {number} accountId - Account ID
   * @param {Object} updates - Metadata updates
   * @param {Date} scheduledTime - When to execute
   * @returns {Promise<Object>}
   */
  async scheduleMetadataUpdate(videoId, accountId, updates, scheduledTime) {
    return await YouTubeScheduledTask.create({
      video_id: videoId,
      account_id: accountId,
      task_type: 'metadata_update',
      scheduled_time: scheduledTime.toISOString(),
      task_data: updates
    });
  }

  /**
   * Schedule a bulk update
   * @param {Array<string>} videoIds - Video IDs
   * @param {number} accountId - Account ID
   * @param {Object} updates - Updates to apply
   * @param {Date} scheduledTime - When to execute
   * @returns {Promise<Object>}
   */
  async scheduleBulkUpdate(videoIds, accountId, updates, scheduledTime) {
    // Use first video ID as reference
    return await YouTubeScheduledTask.create({
      video_id: videoIds[0],
      account_id: accountId,
      task_type: 'bulk_update',
      scheduled_time: scheduledTime.toISOString(),
      task_data: { videoIds, updates }
    });
  }
}

module.exports = new YouTubeTaskScheduler();
