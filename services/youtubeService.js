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
   * @param {boolean} [data.monetizationEnabled] - Optional monetization status
   * @param {boolean} [data.alteredContent] - Optional altered content declaration
   * @returns {Promise<{broadcastId: string, streamKey: string, rtmpUrl: string}>}
   */
  async createBroadcast(accessToken, { title, description, scheduledStartTime, privacyStatus, streamId, tags, monetizationEnabled, alteredContent }) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    // Build snippet with optional tags
    const snippet = {
      title: title,
      description: description || '',
      scheduledStartTime: new Date(scheduledStartTime).toISOString()
    };
    
    // Add tags if provided (YouTube API accepts tags in snippet)
    if (tags && Array.isArray(tags) && tags.length > 0) {
      snippet.tags = tags;
    }
    
    // Create the broadcast
    const broadcastResponse = await youtube.liveBroadcasts.insert({
      part: 'snippet,status,contentDetails',
      requestBody: {
        snippet,
        status: {
          privacyStatus: privacyStatus || 'unlisted',
          selfDeclaredMadeForKids: false,
          // Note: monetization and altered content are typically set via video update after creation
          // as liveBroadcasts.insert doesn't directly support these fields
        },
        contentDetails: {
          enableAutoStart: false,
          enableAutoStop: true,
          monitorStream: {
            enableMonitorStream: false
          }
        }
      }
    });
    
    const broadcast = broadcastResponse.data;
    
    let stream;
    
    // Use existing stream or create new one
    if (streamId) {
      // Fetch existing stream info
      const streamResponse = await youtube.liveStreams.list({
        part: 'snippet,cdn',
        id: streamId
      });
      
      if (!streamResponse.data.items || streamResponse.data.items.length === 0) {
        throw new Error('Stream not found');
      }
      
      stream = streamResponse.data.items[0];
    } else {
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
      let rtmpUrl = 'rtmp://a.rtmp.youtube.com/live2';
      
      if (broadcast.contentDetails?.boundStreamId) {
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
    
    const response = await youtube.liveStreams.list({
      part: 'snippet,cdn',
      mine: true,
      maxResults: 50
    });
    
    const streams = response.data.items || [];
    
    return streams.map(stream => ({
      id: stream.id,
      title: stream.snippet.title,
      streamKey: stream.cdn?.ingestionInfo?.streamName || '',
      rtmpUrl: stream.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
      resolution: stream.cdn?.resolution || 'variable',
      frameRate: stream.cdn?.frameRate || 'variable'
    }));
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
   * Get channel default settings for broadcasts
   * @param {string} accessToken - Access token
   * @returns {Promise<{title: string, description: string, tags: string[], monetizationEnabled: boolean, alteredContent: boolean, categoryId: string}>}
   */
  async getChannelDefaults(accessToken) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    // Fetch channel with brandingSettings and status for monetization info
    const response = await youtube.channels.list({
      part: 'brandingSettings,status,snippet',
      mine: true
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('No channel found for this account');
    }
    
    const channel = response.data.items[0];
    const brandingSettings = channel.brandingSettings || {};
    const channelSettings = brandingSettings.channel || {};
    
    // Extract default values from branding settings
    // Note: YouTube API doesn't expose all live dashboard defaults directly
    // We use what's available from brandingSettings
    return {
      title: channelSettings.defaultTab || '',
      description: channelSettings.description || '',
      tags: channelSettings.keywords ? channelSettings.keywords.split(',').map(t => t.trim()).filter(t => t) : [],
      monetizationEnabled: channel.status?.isLinked || false,
      alteredContent: false, // YouTube API doesn't expose this default, user must set
      categoryId: channelSettings.defaultCategory || '20' // Default to Gaming category
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
}

module.exports = new YouTubeService();
