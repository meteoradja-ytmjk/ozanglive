const BrandingSettings = require('../models/BrandingSettings');

// Cache branding settings to avoid database queries on every request
let brandingCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60000; // 1 minute cache

/**
 * Middleware to load branding settings and make them available to all views
 */
async function loadBrandingSettings(req, res, next) {
  try {
    const now = Date.now();
    
    // Use cache if available and not expired
    if (brandingCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
      res.locals.branding = brandingCache;
      return next();
    }

    // Load fresh branding settings
    const branding = await BrandingSettings.get();
    
    // Update cache
    brandingCache = branding;
    cacheTimestamp = now;
    
    // Make available to all views
    res.locals.branding = branding;
    
    next();
  } catch (error) {
    console.error('[BrandingMiddleware] Error loading branding settings:', error);
    
    // Fallback to default branding on error
    res.locals.branding = {
      app_name: 'MonsterLive',
      company_name: 'MonsterLive Team',
      logo_path: '/images/logo-default.png',
      favicon_path: '/images/logo-default.png',
      primary_color: '#8B5CF6',
      secondary_color: '#7C3AED',
      accent_color: '#6D28D9',
      footer_text: '© 2024 MonsterLive. All rights reserved.',
      support_email: 'support@monsterlive.com',
      show_powered_by: 1
    };
    
    next();
  }
}

/**
 * Clear branding cache (call this after updating branding settings)
 */
function clearBrandingCache() {
  brandingCache = null;
  cacheTimestamp = null;
  console.log('[BrandingMiddleware] Cache cleared');
}

module.exports = {
  loadBrandingSettings,
  clearBrandingCache
};
