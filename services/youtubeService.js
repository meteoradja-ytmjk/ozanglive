const { google } = require('googleapis');

class YouTubeService {
  /**
   * Get access token from refresh token
   * @param {string} clientId - Google Client ID
   * @param {string} clientSecret - Google Client Secret
   * @param {string} refreshToken - Refresh Token
   * @returns {Promise<string>} Access token
   */
  async getAccessToken(clientId, clientSecret, refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token;
  }

  /**
   * Validate credentials by testing API connection
   * @param {string} clientId - Google Client ID
   * @param {string} clientSecret - Google Client Secret
   * @param {string} refreshToken - Refresh Token
   * @returns {Promise<{valid: boolean, channelName?: string, channelId?: string, error?: string}>}
   */
  async validateCredentials(clientId, clientSecret, refreshToken) {
    try {
      const accessToken = await this.getAccessToken(clientId, clientSecret, refreshToken);
      const channelInfo = await this.getChannelInfo(accessToken);
      
      return {
        valid: true,
        channelName: channelInfo.title,
        channelId: channelInfo.id,
        channelThumbnail: channelInfo.thumbnail
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message || 'Invalid credentials'
      };
    }
  }

  /**
   * Get channel info from access token
   * @param {string} accessToken - Access token
   * @returns {Promise<{id: string, title: string, thumbnail: string}>}
   */
  async getChannelInfo(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    const response = await youtube.channels.list({
      part: 'snippet',
      mine: true
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('No channel found for this account');
    }
    
    const channel = response.data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      thumbnail: channel.snippet.thumbnails?.default?.url || ''
    };
  }


  /**
   * Create a scheduled broadcast on YouTube
   * @param {string} accessToken - Access token
   * @param {Object} data - Broadcast data
   * @param {string} [data.streamId] - Optional existing stream ID to bind
   * @param {string[]} [data.tags] - Optional tags for the broadcast
   * @param {string} [data.categoryId] - Optional category ID
   * @param {boolean} [data.monetizationEnabled] - Optional monetization status
   * @param {string} [data.adFrequency] - Optional ad frequency (high/medium/low)
   * @param {boolean} [data.alteredContent] - Optional altered content declaration
   * @returns {Promise<{broadcastId: string, streamKey: string, rtmpUrl: string}>}
   */
  async createBroadcast(accessToken, { title, description, scheduledStartTime, privacyStatus, streamId, tags, categoryId, enableAutoStart, enableAutoStop, monetizationEnabled, adFrequency, alteredContent }) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    console.log('[YouTubeService.createBroadcast] Received streamId:', streamId);
    console.log('[YouTubeService.createBroadcast] Settings: autoStart=%s, autoStop=%s', enableAutoStart, enableAutoStop);
    
    // Build snippet with optional tags and category
    const snippet = {
      title: title,
      description: description || '',
      scheduledStartTime: new Date(scheduledStartTime).toISOString(),
      categoryId: categoryId || '22' // Default to People & Blogs
    };
    
    // Add tags if provided (YouTube API accepts tags in snippet)
    if (tags && Array.isArray(tags) && tags.length > 0) {
      snippet.tags = tags;
    }
    
    // Build contentDetails with auto-start/stop settings
    const contentDetails = {
      enableAutoStart: enableAutoStart === true || enableAutoStart === 'true',
      enableAutoStop: enableAutoStop !== false && enableAutoStop !== 'false', // Default true
      monitorStream: {
        enableMonitorStream: false
      },
      // Record from start - always enabled for replay
      recordFromStart: true
    };
    
    // Build status with privacy settings
    const status = {
      privacyStatus: privacyStatus || 'unlisted',
      selfDeclaredMadeForKids: false
    };
    
    // Create the broadcast
    const broadcastResponse = await youtube.liveBroadcasts.insert({
      part: 'snippet,status,contentDetails',
      requestBody: {
        snippet,
        status,
        contentDetails
      }
    });
    
    const broadcast = broadcastResponse.data;
    
    let stream;
    
    // Use existing stream or create new one
    if (streamId) {
      console.log('[YouTubeService.createBroadcast] Using existing stream:', streamId);
      // Fetch existing stream info
      const streamResponse = await youtube.liveStreams.list({
        part: 'snippet,cdn',
        id: streamId
      });
      
      if (!streamResponse.data.items || streamResponse.data.items.length === 0) {
        console.log('[YouTubeService.createBroadcast] Stream not found, creating new one');
        // Stream not found, create a new one
        const newStreamResponse = await youtube.liveStreams.insert({
          part: 'snippet,cdn',
          requestBody: {
            snippet: {
              title: `Stream for ${title}`
            },
            cdn: {
              frameRate: '30fps',
              ingestionType: 'rtmp',
              resolution: '1080p'
            }
          }
        });
        stream = newStreamResponse.data;
      } else {
        stream = streamResponse.data.items[0];
        console.log('[YouTubeService.createBroadcast] Found existing stream:', stream.snippet.title);
      }
    } else {
      console.log('[YouTubeService.createBroadcast] No streamId provided, creating new stream');
      // Create a new stream
      const streamResponse = await youtube.liveStreams.insert({
        part: 'snippet,cdn',
        requestBody: {
          snippet: {
            title: `Stream for ${title}`
          },
          cdn: {
            frameRate: '30fps',
            ingestionType: 'rtmp',
            resolution: '1080p'
          }
        }
      });
      
      stream = streamResponse.data;
    }
    
    // Bind the stream to the broadcast
    await youtube.liveBroadcasts.bind({
      part: 'id,contentDetails',
      id: broadcast.id,
      streamId: stream.id
    });
    
    console.log('[YouTubeService.createBroadcast] Bound stream:', stream.id, 'with key:', stream.cdn.ingestionInfo.streamName);
    
    return {
      broadcastId: broadcast.id,
      streamId: stream.id,
      streamKey: stream.cdn.ingestionInfo.streamName,
      rtmpUrl: stream.cdn.ingestionInfo.ingestionAddress,
      title: broadcast.snippet.title,
      description: broadcast.snippet.description,
      scheduledStartTime: broadcast.snippet.scheduledStartTime,
      privacyStatus: broadcast.status.privacyStatus,
      thumbnailUrl: broadcast.snippet.thumbnails?.default?.url || ''
    };
  }

  /**
   * List upcoming broadcasts
   * @param {string} accessToken - Access token
   * @returns {Promise<Array>} List of broadcasts
   */
  async listBroadcasts(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    const response = await youtube.liveBroadcasts.list({
      part: 'snippet,status,contentDetails',
      broadcastStatus: 'upcoming',
      maxResults: 50
    });
    
    const broadcasts = response.data.items || [];
    
    // Get stream info for each broadcast
    const result = await Promise.all(broadcasts.map(async (broadcast) => {
      let streamKey = '';
      let streamId = null;
      let rtmpUrl = 'rtmp://a.rtmp.youtube.com/live2';
      
      if (broadcast.contentDetails?.boundStreamId) {
        streamId = broadcast.contentDetails.boundStreamId;
        try {
          const streamResponse = await youtube.liveStreams.list({
            part: 'cdn',
            id: broadcast.contentDetails.boundStreamId
          });
          
          if (streamResponse.data.items && streamResponse.data.items.length > 0) {
            const stream = streamResponse.data.items[0];
            streamKey = stream.cdn.ingestionInfo.streamName;
            rtmpUrl = stream.cdn.ingestionInfo.ingestionAddress;
          }
        } catch (err) {
          console.error('Error fetching stream info:', err.message);
        }
      }
      
      return {
        id: broadcast.id,
        title: broadcast.snippet.title,
        description: broadcast.snippet.description,
        scheduledStartTime: broadcast.snippet.scheduledStartTime,
        privacyStatus: broadcast.status.privacyStatus,
        lifeCycleStatus: broadcast.status.lifeCycleStatus,
        thumbnailUrl: broadcast.snippet.thumbnails?.medium?.url || broadcast.snippet.thumbnails?.default?.url || '',
        streamId,
        streamKey,
        rtmpUrl
      };
    }));
    
    return result;
  }

  /**
   * List available live streams (stream keys)
   * @param {string} accessToken - Access token
   * @returns {Promise<Array<{id: string, title: string, streamKey: string, rtmpUrl: string, resolution: string, frameRate: string}>>}
   */
  async listStreams(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    console.log('[YouTubeService.listStreams] Fetching streams...');
    
    const response = await youtube.liveStreams.list({
      part: 'snippet,cdn',
      mine: true,
      maxResults: 50
    });
    
    const streams = response.data.items || [];
    console.log('[YouTubeService.listStreams] Raw response items:', streams.length);
    
    const result = streams.map(stream => ({
      id: stream.id,
      title: stream.snippet.title,
      streamKey: stream.cdn?.ingestionInfo?.streamName || '',
      rtmpUrl: stream.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
      resolution: stream.cdn?.resolution || 'variable',
      frameRate: stream.cdn?.frameRate || 'variable'
    }));
    
    console.log('[YouTubeService.listStreams] Mapped streams:', result.map(s => s.title));
    
    return result;
  }

  /**
   * Delete a broadcast
   * @param {string} accessToken - Access token
   * @param {string} broadcastId - Broadcast ID to delete
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteBroadcast(accessToken, broadcastId) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    await youtube.liveBroadcasts.delete({
      id: broadcastId
    });
    
    return true;
  }

  /**
   * Update a broadcast
   * @param {string} accessToken - Access token
   * @param {string} broadcastId - Broadcast ID to update
   * @param {Object} data - Update data
   * @param {string} [data.title] - New title
   * @param {string} [data.description] - New description
   * @param {string} [data.scheduledStartTime] - New scheduled start time
   * @param {string} [data.privacyStatus] - New privacy status
   * @returns {Promise<Object>} Updated broadcast info
   */
  async updateBroadcast(accessToken, broadcastId, { title, description, scheduledStartTime, privacyStatus }) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    // First, get the current broadcast to preserve existing values
    const currentResponse = await youtube.liveBroadcasts.list({
      part: 'snippet,status',
      id: broadcastId
    });
    
    if (!currentResponse.data.items || currentResponse.data.items.length === 0) {
      throw new Error('Broadcast not found');
    }
    
    const current = currentResponse.data.items[0];
    
    // Build update request
    const updateRequest = {
      id: broadcastId,
      snippet: {
        title: title || current.snippet.title,
        description: description !== undefined ? description : current.snippet.description,
        scheduledStartTime: scheduledStartTime ? new Date(scheduledStartTime).toISOString() : current.snippet.scheduledStartTime
      },
      status: {
        privacyStatus: privacyStatus || current.status.privacyStatus,
        selfDeclaredMadeForKids: current.status.selfDeclaredMadeForKids || false
      }
    };
    
    // Update the broadcast
    const response = await youtube.liveBroadcasts.update({
      part: 'snippet,status',
      requestBody: updateRequest
    });
    
    const broadcast = response.data;
    
    return {
      id: broadcast.id,
      title: broadcast.snippet.title,
      description: broadcast.snippet.description,
      scheduledStartTime: broadcast.snippet.scheduledStartTime,
      privacyStatus: broadcast.status.privacyStatus,
      thumbnailUrl: broadcast.snippet.thumbnails?.default?.url || ''
    };
  }

  /**
   * Get channel default settings for broadcasts
   * Fetches from channel branding settings and last broadcast for better defaults
   * @param {string} accessToken - Access token
   * @returns {Promise<{title: string, description: string, tags: string[], monetizationEnabled: boolean, alteredContent: boolean, categoryId: string}>}
   */
  async getChannelDefaults(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    // Fetch channel with brandingSettings and status for monetization info
    const channelResponse = await youtube.channels.list({
      part: 'brandingSettings,status,snippet',
      mine: true
    });
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      throw new Error('No channel found for this account');
    }
    
    const channel = channelResponse.data.items[0];
    const brandingSettings = channel.brandingSettings || {};
    const channelSettings = brandingSettings.channel || {};
    
    // Try to get defaults from the most recent broadcast
    let lastBroadcastDefaults = { title: '', description: '', tags: [] };
    try {
      const broadcastsResponse = await youtube.liveBroadcasts.list({
        part: 'snippet',
        broadcastStatus: 'upcoming',
        maxResults: 1
      });
      
      if (broadcastsResponse.data.items && broadcastsResponse.data.items.length > 0) {
        const lastBroadcast = broadcastsResponse.data.items[0];
        lastBroadcastDefaults = {
          title: lastBroadcast.snippet.title || '',
          description: lastBroadcast.snippet.description || '',
          tags: lastBroadcast.snippet.tags || []
        };
      }
    } catch (err) {
      console.log('[YouTubeService] Could not fetch last broadcast for defaults:', err.message);
    }
    
    // Use channel keywords as fallback for tags
    const channelKeywords = channelSettings.keywords 
      ? channelSettings.keywords.split(/[,\s]+/).map(t => t.trim().replace(/^"|"$/g, '')).filter(t => t)
      : [];
    
    // Return combined defaults - prefer last broadcast values, fallback to channel settings
    return {
      title: lastBroadcastDefaults.title || channelSettings.title || '',
      description: lastBroadcastDefaults.description || channelSettings.description || '',
      tags: lastBroadcastDefaults.tags.length > 0 ? lastBroadcastDefaults.tags : channelKeywords,
      monetizationEnabled: channel.status?.isLinked || false,
      alteredContent: false, // YouTube API doesn't expose this default, user must set
      categoryId: channelSettings.defaultCategory || '22' // Default to People & Blogs category
    };
  }

  /**
   * Upload thumbnail for a broadcast
   * @param {string} accessToken - Access token
   * @param {string} broadcastId - Broadcast ID (video ID)
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Promise<{thumbnailUrl: string}>}
   */
  async uploadThumbnail(accessToken, broadcastId, imageBuffer) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    const response = await youtube.thumbnails.set({
      videoId: broadcastId,
      media: {
        mimeType: 'image/jpeg',
        body: require('stream').Readable.from(imageBuffer)
      }
    });
    
    return {
      thumbnailUrl: response.data.items?.[0]?.default?.url || ''
    };
  }

  /**
   * Get broadcast status by ID
   * Used for status sync to check if broadcast is still active
   * @param {string} accessToken - Access token
   * @param {string} broadcastId - Broadcast ID
   * @returns {Promise<{lifeCycleStatus: string, exists: boolean, error?: string}>}
   */
  async getBroadcastStatus(accessToken, broadcastId) {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      const response = await youtube.liveBroadcasts.list({
        part: 'status',
        id: broadcastId
      });
      
      if (!response.data.items || response.data.items.length === 0) {
        return { exists: false, lifeCycleStatus: null };
      }
      
      const broadcast = response.data.items[0];
      return {
        exists: true,
        lifeCycleStatus: broadcast.status.lifeCycleStatus
      };
    } catch (error) {
      // Check for quota exceeded error
      if (error.code === 403 && error.message?.includes('quota')) {
        return { exists: true, lifeCycleStatus: null, error: 'quota_exceeded' };
      }
      // For other errors, assume broadcast might still exist
      return { exists: true, lifeCycleStatus: null, error: error.message };
    }
  }

  /**
   * Find broadcast by stream key
   * Searches active broadcasts (live, testing, ready) to find one matching the stream key
   * @param {string} accessToken - Access token
   * @param {string} streamKey - Stream key to search for
   * @returns {Promise<{broadcastId: string, lifeCycleStatus: string} | null>}
   */
  async findBroadcastByStreamKey(accessToken, streamKey) {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      // Get all active broadcasts (live, testing, ready, upcoming)
      const statuses = ['active', 'upcoming'];
      let allBroadcasts = [];
      
      for (const status of statuses) {
        try {
          const response = await youtube.liveBroadcasts.list({
            part: 'status,contentDetails',
            broadcastStatus: status,
            maxResults: 50
          });
          
          if (response.data.items) {
            allBroadcasts = allBroadcasts.concat(response.data.items);
          }
        } catch (err) {
          console.log(`[YouTubeService] Error fetching ${status} broadcasts:`, err.message);
        }
      }
      
      // For each broadcast, get the bound stream and check stream key
      for (const broadcast of allBroadcasts) {
        if (!broadcast.contentDetails?.boundStreamId) continue;
        
        try {
          const streamResponse = await youtube.liveStreams.list({
            part: 'cdn',
            id: broadcast.contentDetails.boundStreamId
          });
          
          if (streamResponse.data.items && streamResponse.data.items.length > 0) {
            const stream = streamResponse.data.items[0];
            const broadcastStreamKey = stream.cdn?.ingestionInfo?.streamName;
            
            if (broadcastStreamKey === streamKey) {
              return {
                broadcastId: broadcast.id,
                lifeCycleStatus: broadcast.status.lifeCycleStatus
              };
            }
          }
        } catch (err) {
          console.log(`[YouTubeService] Error fetching stream for broadcast ${broadcast.id}:`, err.message);
        }
      }
      
      return null;
    } catch (error) {
      console.error('[YouTubeService] Error finding broadcast by stream key:', error.message);
      return null;
    }
  }

  /**
   * List active broadcasts (live and testing status)
   * Used for status sync to monitor ongoing broadcasts
   * @param {string} accessToken - Access token
   * @returns {Promise<Array<{id: string, streamKey: string, lifeCycleStatus: string}>>}
   */
  async listActiveBroadcasts(accessToken) {
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      
      // Get active broadcasts (includes live and testing)
      const response = await youtube.liveBroadcasts.list({
        part: 'status,contentDetails',
        broadcastStatus: 'active',
        maxResults: 50
      });
      
      const broadcasts = response.data.items || [];
      const result = [];
      
      // Get stream key for each broadcast
      for (const broadcast of broadcasts) {
        let streamKey = '';
        
        if (broadcast.contentDetails?.boundStreamId) {
          try {
            const streamResponse = await youtube.liveStreams.list({
              part: 'cdn',
              id: broadcast.contentDetails.boundStreamId
            });
            
            if (streamResponse.data.items && streamResponse.data.items.length > 0) {
              streamKey = streamResponse.data.items[0].cdn?.ingestionInfo?.streamName || '';
            }
          } catch (err) {
            console.log(`[YouTubeService] Error fetching stream for broadcast ${broadcast.id}:`, err.message);
          }
        }
        
        result.push({
          id: broadcast.id,
          streamKey,
          lifeCycleStatus: broadcast.status.lifeCycleStatus
        });
      }
      
      return result;
    } catch (error) {
      console.error('[YouTubeService] Error listing active broadcasts:', error.message);
      return [];
    }
  }
}

module.exports = new YouTubeService();
