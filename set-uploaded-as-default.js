#!/usr/bin/env node

/**
 * Set Uploaded Logo as Default
 * 
 * This script will:
 * 1. Find the most recent uploaded logo in public/uploads/branding/
 * 2. Copy it to public/images/logo-default.png
 * 3. Update database to use it as default
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const brandingDir = path.join(__dirname, 'public', 'uploads', 'branding');
const targetLogoPath = path.join(__dirname, 'public', 'images', 'logo-default.png');
const targetFaviconPath = path.join(__dirname, 'public', 'images', 'favicon-default.png');
const dbPath = path.join(__dirname, 'db', 'streamflow.db');

console.log('🔍 Looking for uploaded branding files...\n');

// Get all files in branding directory
let files = [];
try {
  files = fs.readdirSync(brandingDir)
    .filter(f => f !== '.gitkeep' && !f.startsWith('.'))
    .map(f => ({
      name: f,
      path: path.join(brandingDir, f),
      time: fs.statSync(path.join(brandingDir, f)).mtime
    }))
    .sort((a, b) => b.time - a.time); // Sort by newest first
} catch (err) {
  console.error('❌ Error reading branding directory:', err.message);
  process.exit(1);
}

if (files.length === 0) {
  console.log('⚠️  No uploaded files found in public/uploads/branding/\n');
  console.log('📝 Please:');
  console.log('   1. Login as admin');
  console.log('   2. Go to Settings → Branding');
  console.log('   3. Upload Monster Live logo');
  console.log('   4. Run this script again\n');
  process.exit(0);
}

console.log(`✅ Found ${files.length} uploaded file(s):\n`);
files.forEach((f, i) => {
  console.log(`   ${i + 1}. ${f.name} (${f.time.toLocaleString()})`);
});

// Use the most recent file
const latestFile = files[0];
console.log(`\n📌 Using: ${latestFile.name}\n`);

// Copy to default locations
try {
  console.log('📋 Copying to default locations...');
  fs.copyFileSync(latestFile.path, targetLogoPath);
  console.log(`   ✅ Copied to: logo-default.png`);
  
  fs.copyFileSync(latestFile.path, targetFaviconPath);
  console.log(`   ✅ Copied to: favicon-default.png`);
} catch (err) {
  console.error('❌ Error copying files:', err.message);
  process.exit(1);
}

// Update database
console.log('\n💾 Updating database...');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`UPDATE branding_settings 
    SET logo_path = '/images/logo-default.png',
        favicon_path = '/images/favicon-default.png',
        app_name = 'MonsterLive',
        company_name = 'MonsterLive Team',
        support_email = 'support@monsterlive.com',
        footer_text = '© 2024 MonsterLive. All rights reserved.',
        updated_at = datetime('now')
    WHERE id = 1`, (err) => {
    if (err) {
      console.error('❌ Error updating database:', err.message);
      db.close();
      process.exit(1);
    }

    console.log('   ✅ Database updated\n');

    // Verify
    db.get(`SELECT * FROM branding_settings WHERE id = 1`, (err, row) => {
      if (err) {
        console.error('❌ Error verifying:', err.message);
        db.close();
        process.exit(1);
      }

      console.log('✅ Verification successful!\n');
      console.log('📊 Current Settings:');
      console.log(`   App Name: ${row.app_name}`);
      console.log(`   Company: ${row.company_name}`);
      console.log(`   Logo: ${row.logo_path}`);
      console.log(`   Favicon: ${row.favicon_path}\n`);

      console.log('🎉 Done! MonsterLive logo is now the default!\n');
      console.log('📝 Next steps:');
      console.log('   1. Restart the application');
      console.log('   2. Clear browser cache (Ctrl+F5)');
      console.log('   3. Logo should now show MonsterLive');
      console.log('   4. Test Reset button - should restore MonsterLive logo\n');

      db.close();
      process.exit(0);
    });
  });
});
