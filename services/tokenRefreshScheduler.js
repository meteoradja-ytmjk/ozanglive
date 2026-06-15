/**
 * YouTube Token Auto-Refresh Scheduler
 * 
 * Masalah: Google OAuth refresh token untuk app "Testing" expired setelah 7 hari.
 * Solusi: Scheduler yang secara proaktif me-refresh token setiap 5 hari,
 *         sehingga token selalu fresh dan tidak pernah expired.
 * 
 * Cara kerja:
 * 1. Setiap interval (default 12 jam), cek semua akun YouTube
 * 2. Jika token sudah mendekati expired (> 5 hari sejak last refresh), lakukan refresh
 * 3. Simpan access_token baru + timestamp di database
 * 4. Jika refresh gagal (token revoked), tandai akun sebagai "needs_reconnect"
 * 
 * PENTING: Ini bekerja TANPA domain karena:
 * - Refresh token tidak memerlukan redirect URI
 * - Hanya butuh client_id + client_secret + refresh_token
 * - Proses berjalan di background server
 */

const { google } = require('googleapis');
const { db } = require('../db/database');

class TokenRefreshScheduler {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    // Check every 12 hours (2x per day is more than enough)
    // Token only needs refresh every 5 days, so checking 2x/day gives plenty of margin
    this.checkInterval = 12 * 60 * 60 * 1000; // 12 hours in ms
    // Refresh if token is older than 5 days (safe margin before 7-day expiry)
    this.refreshThresholdDays = 5;
    // Track refresh results for UI display
    this.lastRunResults = null;
    this.lastRunTime = null;
  }

  /**
   * Start the auto-refresh scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[TokenRefreshScheduler] Already running');
      return;
    }

    console.log('[TokenRefreshScheduler] Starting auto-refresh scheduler');
    console.log(`[TokenRefreshScheduler] Check interval: every ${this.checkInterval / (60 * 60 * 1000)} hours`);
    console.log(`[TokenRefreshScheduler] Refresh threshold: ${this.refreshThresholdDays} days`);

    this.isRunning = true;

    // Delay initial run by 30 seconds to not slow down server startup
    setTimeout(() => {
      this.refreshAllTokens().catch(err => {
        console.error('[TokenRefreshScheduler] Initial refresh error:', err.message);
      });
    }, 30 * 1000);

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.refreshAllTokens().catch(err => {
        console.error('[TokenRefreshScheduler] Scheduled refresh error:', err.message);
      });
    }, this.checkInterval);

    return this.intervalId;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[TokenRefreshScheduler] Stopped');
  }

  /**
   * Refresh tokens for all YouTube accounts
   */
  async refreshAllTokens() {
    console.log('[TokenRefreshScheduler] Starting token refresh check...');
    this.lastRunTime = new Date();

    const results = {
      total: 0,
      refreshed: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    try {
      // Get all YouTube credentials from database
      const accounts = await this.getAllAccounts();
      results.total = accounts.length;

      if (accounts.length === 0) {
        console.log('[TokenRefreshScheduler] No YouTube accounts found');
        this.lastRunResults = results;
        return results;
      }

      console.log(`[TokenRefreshScheduler] Found ${accounts.length} account(s) to check`);

      for (const account of accounts) {
        try {
          const needsRefresh = this.shouldRefresh(account);

          if (!needsRefresh) {
            console.log(`[TokenRefreshScheduler] Account ${account.id} (${account.channel_name || 'unknown'}) - token still fresh, skipping`);
            results.skipped++;
            continue;
          }

          console.log(`[TokenRefreshScheduler] Refreshing token for account ${account.id} (${account.channel_name || 'unknown'})...`);

          // Attempt to refresh the token
          const refreshResult = await this.refreshToken(account);

          if (refreshResult.success) {
            // Update database with new token info
            await this.updateTokenInfo(account.id, {
              accessToken: refreshResult.accessToken,
              tokenExpiresAt: refreshResult.expiresAt,
              lastRefreshedAt: new Date().toISOString(),
              tokenStatus: 'active'
            });

            console.log(`[TokenRefreshScheduler] ✓ Account ${account.id} (${account.channel_name}) refreshed successfully`);
            results.refreshed++;
          } else {
            // Token refresh failed - mark as needs reconnect
            await this.updateTokenInfo(account.id, {
              tokenStatus: 'expired',
              lastRefreshError: refreshResult.error
            });

            console.error(`[TokenRefreshScheduler] ✗ Account ${account.id} (${account.channel_name}) FAILED: ${refreshResult.error}`);
            results.failed++;
            results.errors.push({
              accountId: account.id,
              channelName: account.channel_name,
              error: refreshResult.error
            });
          }
        } catch (err) {
          console.error(`[TokenRefreshScheduler] Error processing account ${account.id}:`, err.message);
          results.failed++;
          results.errors.push({
            accountId: account.id,
            channelName: account.channel_name,
            error: err.message
          });
        }
      }

      console.log(`[TokenRefreshScheduler] Completed: ${results.refreshed} refreshed, ${results.skipped} skipped, ${results.failed} failed`);
    } catch (err) {
      console.error('[TokenRefreshScheduler] Fatal error:', err.message);
      results.errors.push({ error: err.message });
    }

    this.lastRunResults = results;
    return results;
  }

  /**
   * Check if an account's token needs refreshing
   */
  shouldRefresh(account) {
    // If no last_refreshed_at, always refresh
    if (!account.last_refreshed_at) {
      return true;
    }

    // If token status is expired/error, try to refresh
    if (account.token_status === 'expired' || account.token_status === 'error') {
      return true;
    }

    // Check if last refresh was more than threshold days ago
    const lastRefresh = new Date(account.last_refreshed_at);
    const now = new Date();
    const daysSinceRefresh = (now - lastRefresh) / (1000 * 60 * 60 * 24);

    return daysSinceRefresh >= this.refreshThresholdDays;
  }

  /**
   * Attempt to refresh a token using Google OAuth2
   */
  async refreshToken(account) {
    try {
      if (!account.client_id || !account.client_secret || !account.refresh_token) {
        return {
          success: false,
          error: 'Missing credentials (client_id, client_secret, or refresh_token)'
        };
      }

      const oauth2Client = new google.auth.OAuth2(
        account.client_id,
        account.client_secret
      );

      oauth2Client.setCredentials({
        refresh_token: account.refresh_token
      });

      // This is the key call - refreshes the access token using the refresh token
      // This does NOT require a redirect URI or domain
      const { credentials } = await oauth2Client.refreshAccessToken();

      if (!credentials || !credentials.access_token) {
        return {
          success: false,
          error: 'No access token received from Google'
        };
      }

      // If Google returns a new refresh_token (rare but possible), update it
      if (credentials.refresh_token && credentials.refresh_token !== account.refresh_token) {
        await this.updateRefreshToken(account.id, credentials.refresh_token);
        console.log(`[TokenRefreshScheduler] New refresh_token received for account ${account.id}`);
      }

      return {
        success: true,
        accessToken: credentials.access_token,
        expiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString() // Default 1 hour
      };
    } catch (error) {
      const msg = error.message || 'Unknown error';

      // Specific error handling
      if (msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
        return {
          success: false,
          error: 'TOKEN_REVOKED: Refresh token has been revoked or expired. User must reconnect.'
        };
      }

      if (msg.includes('invalid_client')) {
        return {
          success: false,
          error: 'INVALID_CLIENT: Client credentials are invalid.'
        };
      }

      return {
        success: false,
        error: msg
      };
    }
  }

  /**
   * Get all YouTube accounts from database
   */
  getAllAccounts() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, user_id, client_id, client_secret, refresh_token, 
                channel_name, channel_id, is_primary, 
                access_token, token_expires_at, last_refreshed_at, token_status, last_refresh_error
         FROM youtube_credentials`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  /**
   * Update token info in database
   */
  updateTokenInfo(accountId, { accessToken, tokenExpiresAt, lastRefreshedAt, tokenStatus, lastRefreshError }) {
    return new Promise((resolve, reject) => {
      const updates = [];
      const values = [];

      if (accessToken !== undefined) {
        updates.push('access_token = ?');
        values.push(accessToken);
      }
      if (tokenExpiresAt !== undefined) {
        updates.push('token_expires_at = ?');
        values.push(tokenExpiresAt);
      }
      if (lastRefreshedAt !== undefined) {
        updates.push('last_refreshed_at = ?');
        values.push(lastRefreshedAt);
      }
      if (tokenStatus !== undefined) {
        updates.push('token_status = ?');
        values.push(tokenStatus);
      }
      if (lastRefreshError !== undefined) {
        updates.push('last_refresh_error = ?');
        values.push(lastRefreshError);
      }

      if (updates.length === 0) {
        resolve();
        return;
      }

      values.push(accountId);

      db.run(
        `UPDATE youtube_credentials SET ${updates.join(', ')} WHERE id = ?`,
        values,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Update refresh token if Google provides a new one
   */
  updateRefreshToken(accountId, newRefreshToken) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE youtube_credentials SET refresh_token = ? WHERE id = ?',
        [newRefreshToken, accountId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get status of all accounts (for API/UI)
   */
  async getStatus() {
    const accounts = await this.getAllAccounts();

    return {
      schedulerRunning: this.isRunning,
      checkIntervalHours: this.checkInterval / (60 * 60 * 1000),
      refreshThresholdDays: this.refreshThresholdDays,
      lastRunTime: this.lastRunTime,
      lastRunResults: this.lastRunResults,
      accounts: accounts.map(a => ({
        id: a.id,
        channelName: a.channel_name,
        channelId: a.channel_id,
        tokenStatus: a.token_status || 'unknown',
        lastRefreshedAt: a.last_refreshed_at,
        tokenExpiresAt: a.token_expires_at,
        lastRefreshError: a.last_refresh_error,
        needsRefresh: this.shouldRefresh(a)
      }))
    };
  }

  /**
   * Force refresh a specific account (manual trigger from UI)
   */
  async forceRefreshAccount(accountId) {
    const accounts = await this.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);

    if (!account) {
      throw new Error('Account not found');
    }

    const result = await this.refreshToken(account);

    if (result.success) {
      await this.updateTokenInfo(account.id, {
        accessToken: result.accessToken,
        tokenExpiresAt: result.expiresAt,
        lastRefreshedAt: new Date().toISOString(),
        tokenStatus: 'active',
        lastRefreshError: null
      });
    } else {
      await this.updateTokenInfo(account.id, {
        tokenStatus: 'expired',
        lastRefreshError: result.error
      });
    }

    return {
      accountId: account.id,
      channelName: account.channel_name,
      ...result
    };
  }

  /**
   * Get a cached access token for an account (avoids unnecessary API calls)
   * Returns cached token if still valid, otherwise refreshes
   */
  async getCachedAccessToken(accountId) {
    const accounts = await this.getAllAccounts();
    const account = accounts.find(a => a.id === accountId);

    if (!account) {
      throw new Error('Account not found');
    }

    // Check if we have a cached token that's still valid
    if (account.access_token && account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at);
      const now = new Date();
      // Token is valid if it expires more than 5 minutes from now
      if (expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
        return account.access_token;
      }
    }

    // Token expired or not cached, refresh it
    const result = await this.refreshToken(account);

    if (result.success) {
      await this.updateTokenInfo(account.id, {
        accessToken: result.accessToken,
        tokenExpiresAt: result.expiresAt,
        lastRefreshedAt: new Date().toISOString(),
        tokenStatus: 'active',
        lastRefreshError: null
      });
      return result.accessToken;
    }

    throw new Error(result.error || 'Failed to refresh token');
  }
}

// Singleton instance
const tokenRefreshScheduler = new TokenRefreshScheduler();

module.exports = tokenRefreshScheduler;
