/**
 * YouTube Status Sync Service
 * 
 * Monitors YouTube broadcast status and syncs with local stream status.
 * When a broadcast ends on YouTube (complete/revoked/deleted), 
 * the local FFmpeg process is stopped automatically.
 * 
 * IMPORTANT: This service now works with RTMPHealthMonitor to handle
 * reconnection scenarios. If YouTube broadcast dies but stream should
 * still be running, RTMPHealthMonitor will attempt to reconnect.
 */

const YouTubeCredentials = require('../models/YouTubeCredentials');
const youtubeService = require('./youtubeService');

// Status display mapping (Indonesian)
const STATUS_DISPLAY = {
  'created': 'Dibuat',
  'ready': 'Siap',
  'testing': 'Menunggu Preview',
  'live': 'Live di YouTube',
  'complete': 'Selesai',
  'revoked': 'Dibatalkan'
};

// Polling interval: 15 minutes (saves CPU and API quota, stream end handled by FFmpeg)
const POLLING_INTERVAL_MS = 15 * 60 * 1000;

// Quota cooldown: 1 hour
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;

// Grace period before stopping stream (allows reconnect attempt)
const GRACE_PERIOD_MS = 60 * 1000; // 1 minute

class YouTubeStatusSync {
  constructor() {
    // Map of streamId -> { intervalId, broadcastId, userId, lastStatus, lastChecked, disconnectedAt }
    this.activeChecks = new Map();
    
    // Timestamp when quota cooldown ends (null = no cooldown)
    this.quotaExceededUntil = null;
    
    // Reference to streamingService (set via setStreamingService)
    this.streamingService = null;
    
    // Reference to rtmpHealthMonitor (set via setRTMPHealthMonitor)
    this.rtmpHealthMonitor = null;
  }

  /**
   * Set reference to streaming service (to avoid circular dependency)
   * @param {Object} streamingService - StreamingService instance
   */
  setStreamingService(streamingService) {
    this.streamingService = streamingService;
  }

  /**
   * Set reference to RTMP health monitor (to avoid circular dependency)
   * @param {Object} rtmpHealthMonitor - RTMPHealthMonitor instance
   */
  setRTMPHealthMonitor(rtmpHealthMonitor) {
    this.rtmpHealthMonitor = rtmpHealthMonitor;
  }

  /**
   * Map YouTube lifecycle status to Indonesian display text
   * @param {string} lifeCycleStatus - YouTube lifecycle status
   * @returns {string} Display text in Indonesian
   */
  static mapStatusToDisplay(lifeCycleStatus) {
    if (!lifeCycleStatus) return 'Status tidak diketahui';
    return STATUS_DISPLAY[lifeCycleStatus] || 'Status tidak diketahui';
  }

  /**
   * Check if quota is in cooldown period
   * @returns {boolean} True if in cooldown
   */
  isQuotaCooldown() {
    if (!this.quotaExceededUntil) return false;
    
    const now = Date.now();
    if (now >= this.quotaExceededUntil) {
      // Cooldown expired, reset
      this.quotaExceededUntil = null;
      console.log('[YouTubeStatusSync] Quota cooldown expired, resuming status checks');
      return false;
    }
    
    return true;
  }

  /**
   * Handle quota exceeded error - set 1 hour cooldown
   */
  handleQuotaExceeded() {
    this.quotaExceededUntil = Date.now() + QUOTA_COOLDOWN_MS;
    const cooldownEndTime = new Date(this.quotaExceededUntil).toISOString();
    console.warn(`[YouTubeStatusSync] YouTube API quota exceeded. Status checking disabled until ${cooldownEndTime}`);
  }

  /**
   * Start monitoring a YouTube stream
   * @param {string} streamId - Local stream ID
   * @param {string} userId - User ID
   * @param {string} streamKey - YouTube stream key
   * @param {number|string} [accountId] - Optional YouTube account ID
   * @param {string} [broadcastId] - Optional known YouTube broadcast ID
   * @returns {Promise<boolean>} True if monitoring started successfully
   */
  async startMonitoring(streamId, userId, streamKey, accountId = null, broadcastId = null) {
    try {
      // Check if already monitoring
      if (this.activeChecks.has(streamId)) {
        console.log(`[YouTubeStatusSync] Already monitoring stream ${streamId}`);
        return true;
      }

      // Check quota cooldown
      if (this.isQuotaCooldown()) {
        console.log(`[YouTubeStatusSync] Quota cooldown active, skipping monitoring for stream ${streamId}`);
        return false;
      }

      // Get user's YouTube credentials (prefer specific accountId if provided)
      let credentials = null;
      if (accountId) {
        credentials = await YouTubeCredentials.findById(accountId);
      }
      if (!credentials && userId) {
        credentials = await YouTubeCredentials.findByUserId(userId);
      }
      if (!credentials) {
        console.log(`[YouTubeStatusSync] No YouTube credentials for user ${userId}, skipping monitoring`);
        return false;
      }

      // Get access token
      let accessToken;
      try {
        const cId = credentials.clientId || credentials.client_id;
        const cSec = credentials.clientSecret || credentials.client_secret;
        const rTok = credentials.refreshToken || credentials.refresh_token;
        accessToken = await youtubeService.getAccessToken(cId, cSec, rTok, 0, credentials.id);
      } catch (err) {
        console.error(`[YouTubeStatusSync] Failed to get access token for user ${userId}:`, err.message);
        return false;
      }

      // Resolve broadcast
      let resolvedBroadcastId = broadcastId;
      let initialStatus = 'live';

      if (!resolvedBroadcastId && streamKey) {
        const broadcast = await youtubeService.findBroadcastByStreamKey(accessToken, streamKey);
        if (broadcast) {
          resolvedBroadcastId = broadcast.broadcastId;
          initialStatus = broadcast.lifeCycleStatus || 'live';
        }
      }

      if (!resolvedBroadcastId) {
        console.log(`[YouTubeStatusSync] No matching broadcast found for stream ${streamId}, continuing without sync`);
        return false;
      }

      console.log(`[YouTubeStatusSync] Found broadcast ${resolvedBroadcastId} for stream ${streamId}, status: ${initialStatus}`);

      // Start polling interval
      const intervalId = setInterval(async () => {
        await this.checkBroadcastStatus(streamId);
      }, POLLING_INTERVAL_MS);

      // Store monitoring state
      this.activeChecks.set(streamId, {
        intervalId,
        broadcastId: resolvedBroadcastId,
        userId,
        credentials,
        lastStatus: initialStatus,
        lastChecked: new Date(),
        disconnectedAt: null
      });

      console.log(`[YouTubeStatusSync] Started monitoring stream ${streamId} (broadcast: ${resolvedBroadcastId})`);
      return true;
    } catch (error) {
      console.error(`[YouTubeStatusSync] Error starting monitoring for stream ${streamId}:`, error.message);
      return false;
    }
  }

  /**
   * Stop monitoring a stream
   * @param {string} streamId - Local stream ID
   */
  stopMonitoring(streamId) {
    const check = this.activeChecks.get(streamId);
    if (!check) return;

    // Clear interval
    if (check.intervalId) {
      clearInterval(check.intervalId);
    }

    // Remove from map
    this.activeChecks.delete(streamId);
    console.log(`[YouTubeStatusSync] Stopped monitoring stream ${streamId}`);
  }

  /**
   * Check broadcast status and take action if needed
   * @param {string} streamId - Local stream ID
   */
  async checkBroadcastStatus(streamId) {
    const check = this.activeChecks.get(streamId);
    if (!check) return;

    // Check quota cooldown
    if (this.isQuotaCooldown()) {
      console.log(`[YouTubeStatusSync] Quota cooldown active, skipping check for stream ${streamId}`);
      return;
    }

    try {
      // Get access token
      let accessToken;
      try {
        accessToken = await youtubeService.getAccessToken(check.credentials.client_id, check.credentials.client_secret, check.credentials.refresh_token, 0, check.credentials.id
        );
      } catch (err) {
        console.error(`[YouTubeStatusSync] Failed to refresh access token:`, err.message);
        return; // Retry next interval
      }

      // Get broadcast status
      const result = await youtubeService.getBroadcastStatus(accessToken, check.broadcastId);
      check.lastChecked = new Date();

      // Handle quota exceeded
      if (result.error === 'quota_exceeded') {
        this.handleQuotaExceeded();
        return;
      }

      // Handle other errors - just log and retry next interval
      if (result.error) {
        console.error(`[YouTubeStatusSync] Error checking broadcast ${check.broadcastId}:`, result.error);
        return;
      }

      // Broadcast deleted - give grace period for reconnect
      if (!result.exists) {
        if (!check.disconnectedAt) {
          check.disconnectedAt = Date.now();
          console.log(`[YouTubeStatusSync] Broadcast ${check.broadcastId} not found, starting grace period for stream ${streamId}`);
          return;
        }
        
        // Check if grace period has passed
        const disconnectedDuration = Date.now() - check.disconnectedAt;
        if (disconnectedDuration < GRACE_PERIOD_MS) {
          console.log(`[YouTubeStatusSync] Stream ${streamId} in grace period (${Math.round(disconnectedDuration / 1000)}s / ${GRACE_PERIOD_MS / 1000}s)`);
          return;
        }
        
        console.log(`[YouTubeStatusSync] Broadcast ${check.broadcastId} deleted, grace period expired, stopping stream ${streamId}`);
        await this.stopStreamAndCleanup(streamId, 'broadcast_deleted');
        return;
      }

      // Broadcast exists - reset disconnected state
      if (check.disconnectedAt) {
        console.log(`[YouTubeStatusSync] Stream ${streamId} reconnected to YouTube`);
        check.disconnectedAt = null;
      }

      // Update last status
      const previousStatus = check.lastStatus;
      check.lastStatus = result.lifeCycleStatus;

      // Log status change
      if (previousStatus !== result.lifeCycleStatus) {
        console.log(`[YouTubeStatusSync] Stream ${streamId} broadcast status changed: ${previousStatus} -> ${result.lifeCycleStatus}`);
      }

      // Check if broadcast ended - but only stop if it's a definitive end
      // 'complete' means the broadcast was properly ended
      // 'revoked' means it was cancelled
      if (result.lifeCycleStatus === 'complete' || result.lifeCycleStatus === 'revoked') {
        // Check if RTMP health monitor thinks stream should still be running
        if (this.rtmpHealthMonitor) {
          const timeStatus = typeof this.rtmpHealthMonitor.getStreamTimeStatus === 'function'
            ? this.rtmpHealthMonitor.getStreamTimeStatus(streamId)
            : null;
          const monitor = this.rtmpHealthMonitor.monitoredStreams?.get(streamId);
          const isUnlimited = monitor?.isUnlimited || (timeStatus && timeStatus.remainingMs === null && timeStatus.shouldBeRunning);

          if (isUnlimited || (timeStatus && timeStatus.shouldBeRunning && (timeStatus.remainingMs === null || timeStatus.remainingMs > 15000))) {
            const remText = isUnlimited ? 'unlimited mode' : `${Math.round((timeStatus.remainingMs || 0) / 1000)}s remaining`;
            console.log(`[YouTubeStatusSync] Broadcast ended (${result.lifeCycleStatus}) but stream should still be running (${remText}) - allowing reconnect`);
            return;
          }
        }
        
        console.log(`[YouTubeStatusSync] Broadcast ${check.broadcastId} ended (${result.lifeCycleStatus}), stopping stream ${streamId}`);
        await this.stopStreamAndCleanup(streamId, result.lifeCycleStatus);
        return;
      }

    } catch (error) {
      console.error(`[YouTubeStatusSync] Error checking status for stream ${streamId}:`, error.message);
      // Don't crash, retry next interval
    }
  }

  /**
   * Stop stream and cleanup monitoring
   * @param {string} streamId - Local stream ID
   * @param {string} reason - Reason for stopping
   */
  async stopStreamAndCleanup(streamId, reason) {
    // CRITICAL FIX: Get the check info BEFORE stopMonitoring deletes it from activeChecks!
    const check = this.activeChecks.get(streamId);

    // Stop monitoring
    this.stopMonitoring(streamId);
    
    // Handle unlist replay on end if configured
    // Use the unlistReplayService which handles delayed retry logic
    if (check && check.broadcastId) {
      try {
        const YouTubeBroadcastSettings = require('../models/YouTubeBroadcastSettings');
        const settings = await YouTubeBroadcastSettings.findByBroadcastId(check.broadcastId);
        
        // Only schedule unlist if user enabled it
        if (settings && settings.unlistReplayOnEnd) {
          console.log(`[YouTubeStatusSync] Scheduling unlist for broadcast ${check.broadcastId} (reason: ${reason})`);
          
          const unlistReplayService = require('./unlistReplayService');
          unlistReplayService.scheduleUnlist(check.broadcastId, check.userId);
        } else {
          console.log(`[YouTubeStatusSync] Unlist replay not enabled for broadcast ${check.broadcastId}`);
        }
      } catch (err) {
        console.error(`[YouTubeStatusSync] Error scheduling unlist replay:`, err.message);
      }
    }

    // Stop the stream via streaming service
    if (this.streamingService) {
      try {
        console.log(`[YouTubeStatusSync] Stopping stream ${streamId} due to: ${reason}`);
        await this.streamingService.stopStream(streamId);
      } catch (err) {
        console.error(`[YouTubeStatusSync] Error stopping stream ${streamId}:`, err.message);
      }
    }
  }

  /**
   * Get current YouTube status for a stream
   * @param {string} streamId - Local stream ID
   * @returns {{lifeCycleStatus: string, displayStatus: string, lastChecked: Date} | null}
   */
  getYouTubeStatus(streamId) {
    const check = this.activeChecks.get(streamId);
    if (!check) return null;

    return {
      lifeCycleStatus: check.lastStatus,
      displayStatus: YouTubeStatusSync.mapStatusToDisplay(check.lastStatus),
      lastChecked: check.lastChecked,
      broadcastId: check.broadcastId
    };
  }

  /**
   * Check if a stream is being monitored
   * @param {string} streamId - Local stream ID
   * @returns {boolean}
   */
  isMonitoring(streamId) {
    return this.activeChecks.has(streamId);
  }

  /**
   * Get broadcast ID for a monitored stream
   * @param {string} streamId - Local stream ID
   * @returns {string|null}
   */
  getBroadcastId(streamId) {
    const check = this.activeChecks.get(streamId);
    return check ? check.broadcastId : null;
  }

  /**
   * Get all monitored streams
   * @returns {string[]} Array of stream IDs
   */
  getMonitoredStreams() {
    return Array.from(this.activeChecks.keys());
  }

  /**
   * Cleanup all monitoring (for shutdown)
   */
  cleanup() {
    for (const [streamId, check] of this.activeChecks) {
      if (check.intervalId) {
        clearInterval(check.intervalId);
      }
    }
    this.activeChecks.clear();
    console.log('[YouTubeStatusSync] Cleaned up all monitoring');
  }
}

// Export singleton instance
module.exports = new YouTubeStatusSync();
