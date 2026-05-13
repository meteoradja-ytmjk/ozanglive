#!/usr/bin/env node

/**
 * Fix Branding Table - Recreate with MonsterLive defaults
 * 
 * This script will:
 * 1. Drop existing branding_settings table
 * 2. Recreate with MonsterLive defaults
 * 3. Insert default MonsterLive branding
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'streamflow.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Fixing branding_settings table...\n');

db.serialize(() => {
  // Step 1: Drop existing table
  console.log('1️⃣ Dropping old branding_settings table...');
  db.run(`DROP TABLE IF EXISTS branding_settings`, (err) => {
    if (err) {
      console.error('❌ Error dropping table:', err);
      process.exit(1);
    }
    console.log('✅ Old table dropped\n');

    // Step 2: Create new table with MonsterLive defaults
    console.log('2️⃣ Creating new branding_settings table with MonsterLive defaults...');
    db.run(`CREATE TABLE branding_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
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
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('❌ Error creating table:', err);
        process.exit(1);
      }
      console.log('✅ New table created\n');

      // Step 3: Insert default values
      console.log('3️⃣ Inserting MonsterLive default values...');
      db.run(`INSERT INTO branding_settings (
        id, app_name, company_name, logo_path, favicon_path,
        primary_color, secondary_color, accent_color,
        footer_text, support_email, show_powered_by
      ) VALUES (
        1, 'MonsterLive', 'MonsterLive Team', 
        '/images/logo-default.png', '/images/favicon-default.png',
        '#8B5CF6', '#7C3AED', '#6D28D9',
        '© 2024 MonsterLive. All rights reserved.',
        'support@monsterlive.com', 1
      )`, (err) => {
        if (err) {
          console.error('❌ Error inserting defaults:', err);
          process.exit(1);
        }
        console.log('✅ Default values inserted\n');

        // Step 4: Verify
        console.log('4️⃣ Verifying...');
        db.get(`SELECT * FROM branding_settings WHERE id = 1`, (err, row) => {
          if (err) {
            console.error('❌ Error verifying:', err);
            process.exit(1);
          }

          console.log('✅ Verification successful!\n');
          console.log('📊 Current Branding Settings:');
          console.log(`   App Name: ${row.app_name}`);
          console.log(`   Company: ${row.company_name}`);
          console.log(`   Logo: ${row.logo_path}`);
          console.log(`   Favicon: ${row.favicon_path}`);
          console.log(`   Primary Color: ${row.primary_color}`);
          console.log(`   Support Email: ${row.support_email}\n`);

          console.log('🎉 Done! Branding table fixed successfully!\n');
          console.log('📝 Next steps:');
          console.log('   1. Make sure logo files exist:');
          console.log('      - public/images/logo-default.png (Monster Live logo)');
          console.log('      - public/images/favicon-default.png (Monster Live favicon)');
          console.log('   2. Restart the application');
          console.log('   3. Clear browser cache (Ctrl+F5)');
          console.log('   4. Check if MonsterLive logo appears\n');

          db.close();
          process.exit(0);
        });
      });
    });
  });
});
