#!/usr/bin/env node

/**
 * Update Default Branding to MonsterLive
 * 
 * This script updates the database to use MonsterLive as the default branding
 * instead of OzangLive. Run this after saving the Monster Live logo files.
 */

const { db } = require('./db/database');
const BrandingSettings = require('./models/BrandingSettings');

const NEW_DEFAULTS = {
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
  show_powered_by: 1
};

async function updateDefaultBranding() {
  console.log('🔄 Updating default branding to MonsterLive...\n');

  try {
    // Check if branding settings exist
    const current = await BrandingSettings.get();
    
    console.log('📊 Current Settings:');
    console.log(`   App Name: ${current.app_name}`);
    console.log(`   Company: ${current.company_name}`);
    console.log(`   Logo: ${current.logo_path}`);
    console.log(`   Favicon: ${current.favicon_path}\n`);

    // Ask for confirmation
    console.log('⚠️  This will update the default branding to MonsterLive.');
    console.log('   Current custom settings will be preserved unless you reset.\n');

    // Update to new defaults
    await BrandingSettings.update(NEW_DEFAULTS);

    console.log('✅ Default branding updated successfully!\n');
    console.log('📊 New Default Settings:');
    console.log(`   App Name: ${NEW_DEFAULTS.app_name}`);
    console.log(`   Company: ${NEW_DEFAULTS.company_name}`);
    console.log(`   Logo: ${NEW_DEFAULTS.logo_path}`);
    console.log(`   Favicon: ${NEW_DEFAULTS.favicon_path}\n`);

    console.log('🎉 Done! Please restart the application.\n');
    console.log('📝 Next steps:');
    console.log('   1. Make sure logo files exist:');
    console.log('      - public/images/logo-default.png');
    console.log('      - public/images/favicon-default.png');
    console.log('   2. Restart the application');
    console.log('   3. Test the reset function in Settings → Branding\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating default branding:', error);
    process.exit(1);
  }
}

// Run the update
updateDefaultBranding();
