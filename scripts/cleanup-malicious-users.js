/**
 * Script to identify and remove malicious users from the database
 * 
 * This script finds users with suspicious usernames that contain
 * SQL injection or XSS patterns and removes them from the system.
 * 
 * Usage: node scripts/cleanup-malicious-users.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '..', 'db', 'streamflow.db');

// Valid username pattern - only letters, numbers, and underscores
const VALID_USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Open database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database');
});

async function findMaliciousUsers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, username, user_role, status, created_at FROM users', [], (err, rows) => {
      if (err) {
        return reject(err);
      }
      
      const maliciousUsers = rows.filter(user => {
        // Check if username contains invalid characters
        return !VALID_USERNAME_REGEX.test(user.username);
      });
      
      resolve(maliciousUsers);
    });
  });
}

async function deleteUser(userId) {
  return new Promise((resolve, reject) => {
    // First delete related videos
    db.run('DELETE FROM videos WHERE user_id = ?', [userId], function(err) {
      if (err) {
        console.error(`Error deleting videos for user ${userId}:`, err.message);
      }
      
      // Then delete related streams
      db.run('DELETE FROM streams WHERE user_id = ?', [userId], function(err) {
        if (err) {
          console.error(`Error deleting streams for user ${userId}:`, err.message);
        }
        
        // Finally delete the user
        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
          if (err) {
            return reject(err);
          }
          resolve(this.changes);
        });
      });
    });
  });
}

async function main() {
  console.log('\n=== Malicious User Cleanup Script ===\n');
  
  try {
    // Find malicious users
    const maliciousUsers = await findMaliciousUsers();
    
    if (maliciousUsers.length === 0) {
      console.log('✓ No malicious users found. Database is clean.');
      return;
    }
    
    console.log(`Found ${maliciousUsers.length} user(s) with suspicious usernames:\n`);
    
    maliciousUsers.forEach((user, index) => {
      console.log(`${index + 1}. Username: "${user.username}"`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.user_role}`);
      console.log(`   Status: ${user.status}`);
      console.log(`   Created: ${user.created_at}`);
      console.log('');
    });
    
    // Check for --dry-run flag
    if (process.argv.includes('--dry-run')) {
      console.log('Dry run mode - no users will be deleted.');
      return;
    }
    
    // Delete malicious users
    console.log('Deleting malicious users...\n');
    
    for (const user of maliciousUsers) {
      try {
        await deleteUser(user.id);
        console.log(`✓ Deleted user: "${user.username}" (ID: ${user.id})`);
      } catch (err) {
        console.error(`✗ Failed to delete user "${user.username}":`, err.message);
      }
    }
    
    console.log('\n=== Cleanup Complete ===');
    
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  } finally {
    db.close((err) => {
      if (err) {
        // Ignore close errors
      }
      process.exit(0);
    });
  }
}

main();
