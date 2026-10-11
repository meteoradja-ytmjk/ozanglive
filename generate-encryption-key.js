#!/usr/bin/env node

/**
 * Generate Encryption Key for OzangLive
 * 
 * This script generates a secure 256-bit encryption key for encrypting
 * sensitive data like YouTube API credentials.
 * 
 * Usage:
 *   node generate-encryption-key.js
 * 
 * The generated key should be added to your .env file as:
 *   ENCRYPTION_KEY=<generated_key>
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║   🔐 OZANGLIVE ENCRYPTION KEY GENERATOR               ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');

// Generate a 256-bit (32-byte) encryption key
const encryptionKey = crypto.randomBytes(32).toString('hex');

console.log('✅ Generated 256-bit encryption key:');
console.log('');
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log('');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);

if (envExists) {
  // Read existing .env
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Check if ENCRYPTION_KEY already exists
  if (envContent.includes('ENCRYPTION_KEY=')) {
    console.log('⚠️  WARNING: ENCRYPTION_KEY already exists in .env file!');
    console.log('');
    console.log('To update the key:');
    console.log('1. Backup your existing data');
    console.log('2. Decrypt all existing encrypted data with old key');
    console.log('3. Replace ENCRYPTION_KEY in .env with the new key above');
    console.log('4. Re-encrypt all data with new key');
    console.log('');
    console.log('⚠️  DO NOT replace the key without migrating encrypted data!');
  } else {
    console.log('📝 To use this key, add the following line to your .env file:');
    console.log('');
    console.log(`ENCRYPTION_KEY=${encryptionKey}`);
    console.log('');
    
    // Offer to append to .env
    console.log('💡 Tip: You can manually add this to your .env file');
  }
} else {
  console.log('📝 Create a .env file and add the following line:');
  console.log('');
  console.log(`ENCRYPTION_KEY=${encryptionKey}`);
  console.log('');
  
  // Offer to create .env from example
  const envExamplePath = path.join(__dirname, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    console.log('💡 Tip: You can copy .env.example to .env and add the key above');
  }
}

console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');
console.log('🔒 IMPORTANT SECURITY NOTES:');
console.log('');
console.log('1. Keep this key SECRET - never commit it to git');
console.log('2. Backup this key securely');
console.log('3. Add .env to .gitignore');
console.log('4. Each installation should have a unique key');
console.log('5. Changing the key requires re-encrypting all data');
console.log('');
console.log('════════════════════════════════════════════════════════');
console.log('');

// Generate another key as session secret if needed
const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('💡 BONUS: Also generate a SESSION_SECRET:');
console.log('');
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log('');
console.log('Add this to .env if SESSION_SECRET is not set');
console.log('');

process.exit(0);
