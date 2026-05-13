const { db } = require('../db/database');

class BrandingSettings {
  /**
   * Get all branding settings
   */
  static async get() {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM branding_settings WHERE id = 1`,
        (err, row) => {
          if (err) {
            console.error('[BrandingSettings] Error getting settings:', err);
            reject(err);
          } else {
            // Return default values if no settings exist
            if (!row) {
              resolve({
                id: 1,
                app_name: 'MonsterLive',
                company_name: 'MonsterLive Team',
                logo_path: '/images/logo-default.png',
                favicon_path: '/images/favicon-default.png',
                primary_color: '#8B5CF6',
                secondary_color: '#7C3AED',
                accent_color: '#6D28D9',
                login_background: null,
                custom_css: null,
                footer_text: '© 2024 MonsterLive. All rights reserved.',
                support_email: 'support@monsterlive.com',
                support_url: null,
                show_powered_by: 1,
                updated_at: new Date().toISOString()
              });
            } else {
              resolve(row);
            }
          }
        }
      );
    });
  }

  /**
   * Update branding settings
   */
  static async update(settings) {
    return new Promise((resolve, reject) => {
      const {
        app_name,
        company_name,
        logo_path,
        favicon_path,
        primary_color,
        secondary_color,
        accent_color,
        login_background,
        custom_css,
        footer_text,
        support_email,
        support_url,
        show_powered_by
      } = settings;

      db.run(
        `INSERT OR REPLACE INTO branding_settings (
          id, app_name, company_name, logo_path, favicon_path,
          primary_color, secondary_color, accent_color,
          login_background, custom_css, footer_text,
          support_email, support_url, show_powered_by, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          app_name,
          company_name,
          logo_path,
          favicon_path,
          primary_color,
          secondary_color,
          accent_color,
          login_background,
          custom_css,
          footer_text,
          support_email,
          support_url,
          show_powered_by ? 1 : 0
        ],
        function (err) {
          if (err) {
            console.error('[BrandingSettings] Error updating settings:', err);
            reject(err);
          } else {
            console.log('[BrandingSettings] Settings updated successfully');
            resolve({ success: true, changes: this.changes });
          }
        }
      );
    });
  }

  /**
   * Reset to default branding
   */
  static async reset() {
    return new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM branding_settings WHERE id = 1`,
        function (err) {
          if (err) {
            console.error('[BrandingSettings] Error resetting settings:', err);
            reject(err);
          } else {
            console.log('[BrandingSettings] Settings reset to default');
            resolve({ success: true });
          }
        }
      );
    });
  }

  /**
   * Initialize branding_settings table
   */
  static async initTable() {
    return new Promise((resolve, reject) => {
      db.run(
        `CREATE TABLE IF NOT EXISTS branding_settings (
          id INTEGER PRIMARY KEY DEFAULT 1,
          app_name TEXT DEFAULT 'MonsterLive',
          company_name TEXT DEFAULT 'MonsterLive Team',
          logo_path TEXT DEFAULT '/images/logo-default.png',
          favicon_path TEXT DEFAULT '/images/favicon-default.png',
          primary_color TEXT DEFAULT '#8B5CF6',
          secondary_color TEXT DEFAULT '#7C3AED',
          accent_color TEXT DEFAULT '#6D28D9',
          login_background TEXT,
          custom_css TEXT,
          footer_text TEXT DEFAULT '© 2024 MonsterLive. All rights reserved.',
          support_email TEXT DEFAULT 'support@monsterlive.com',
          support_url TEXT,
          show_powered_by INTEGER DEFAULT 1,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          CHECK (id = 1)
        )`,
        (err) => {
          if (err) {
            console.error('[BrandingSettings] Error creating table:', err);
            reject(err);
          } else {
            console.log('[BrandingSettings] Table initialized');
            resolve();
          }
        }
      );
    });
  }
}

module.exports = BrandingSettings;
