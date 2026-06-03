/**
 * Test Script for Quick Reconnect Feature
 * 
 * This script simulates expired tokens and tests the Quick Reconnect flow
 * 
 * Usage:
 * node test-quick-reconnect.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'streamflow.db');
const db = new sqlite3.Database(dbPath);

console.log('='.repeat(70));
console.log('🧪 Quick Reconnect Feature - Test Script');
console.log('='.repeat(70));
console.log('');

/**
 * Get all YouTube accounts
 */
function getAllAccounts() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, channel_name, token_status, last_refreshed_at 
       FROM youtube_credentials`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * Set account as expired (for testing)
 */
function setAccountExpired(accountId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE youtube_credentials 
       SET token_status = 'expired',
           last_refresh_error = 'Token expired (simulated for testing)'
       WHERE id = ?`,
      [accountId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Reset account to active (restore after test)
 */
function setAccountActive(accountId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE youtube_credentials 
       SET token_status = 'active',
           last_refresh_error = NULL
       WHERE id = ?`,
      [accountId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Main test flow
 */
async function runTests() {
  try {
    // 1. Get all accounts
    console.log('📊 Step 1: Getting all YouTube accounts...');
    const accounts = await getAllAccounts();
    
    if (accounts.length === 0) {
      console.log('⚠️  No YouTube accounts found in database');
      console.log('   Please connect at least one YouTube account first');
      db.close();
      return;
    }
    
    console.log(`✓ Found ${accounts.length} account(s):`);
    accounts.forEach(acc => {
      console.log(`  - ID: ${acc.id}, Channel: ${acc.channel_name || 'N/A'}, Status: ${acc.token_status || 'unknown'}`);
    });
    console.log('');
    
    // 2. Choose action
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('Choose action:\n  [1] Simulate expired token\n  [2] Reset to active\n  [3] Show status only\n\nYour choice (1/2/3): ', async (answer) => {
      console.log('');
      
      if (answer === '1') {
        // Simulate expired
        console.log('🔧 Simulating expired token...');
        
        rl.question(`Enter account ID to expire (${accounts.map(a => a.id).join(', ')}): `, async (accountId) => {
          const id = parseInt(accountId);
          
          if (!accounts.find(a => a.id === id)) {
            console.log('❌ Invalid account ID');
            rl.close();
            db.close();
            return;
          }
          
          await setAccountExpired(id);
          console.log(`✓ Account ${id} set to EXPIRED`);
          console.log('');
          console.log('📱 Next steps:');
          console.log('   1. Open browser: http://localhost:7575/youtube');
          console.log('   2. You should see red alert banner');
          console.log('   3. Click "Reconnect Semua" button');
          console.log('   4. OAuth flow will start');
          console.log('');
          
          rl.close();
          db.close();
        });
        
      } else if (answer === '2') {
        // Reset to active
        console.log('🔧 Resetting to active...');
        
        rl.question(`Enter account ID to reset (${accounts.map(a => a.id).join(', ')}): `, async (accountId) => {
          const id = parseInt(accountId);
          
          if (!accounts.find(a => a.id === id)) {
            console.log('❌ Invalid account ID');
            rl.close();
            db.close();
            return;
          }
          
          await setAccountActive(id);
          console.log(`✓ Account ${id} set to ACTIVE`);
          console.log('');
          console.log('📱 Next steps:');
          console.log('   1. Reload /youtube page');
          console.log('   2. Alert banner should disappear');
          console.log('');
          
          rl.close();
          db.close();
        });
        
      } else if (answer === '3') {
        // Show status only
        console.log('📊 Current Status:');
        console.log('');
        
        const expiredCount = accounts.filter(a => a.token_status === 'expired' || a.token_status === 'error').length;
        const activeCount = accounts.filter(a => a.token_status === 'active').length;
        const unknownCount = accounts.filter(a => !a.token_status || a.token_status === 'unknown').length;
        
        console.log(`  ✅ Active: ${activeCount}`);
        console.log(`  ⚠️  Expired: ${expiredCount}`);
        console.log(`  ❓ Unknown: ${unknownCount}`);
        console.log('');
        
        if (expiredCount > 0) {
          console.log('💡 Quick Reconnect feature will show alert for expired accounts');
        } else {
          console.log('💡 All accounts are active - no alert will show');
        }
        console.log('');
        
        rl.close();
        db.close();
      } else {
        console.log('❌ Invalid choice');
        rl.close();
        db.close();
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    db.close();
  }
}

// Run tests
runTests();
