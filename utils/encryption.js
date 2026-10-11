/**
 * Encryption Utility for Sensitive Data
 * 
 * Uses AES-256-GCM for secure encryption of sensitive data like API keys and secrets
 * Implements proper key derivation, random IVs, and authentication tags
 */

const crypto = require('crypto');

// Algorithm and constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // 512 bits for PBKDF2
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Get encryption key from environment or generate one
 * @returns {Buffer} Encryption key
 */
function getEncryptionKey() {
  // Check if ENCRYPTION_KEY is set in environment
  let keyHex = process.env.ENCRYPTION_KEY;
  
  if (!keyHex) {
    console.warn('[Encryption] WARNING: ENCRYPTION_KEY not set in .env file!');
    console.warn('[Encryption] Using fallback key - DO NOT USE IN PRODUCTION!');
    console.warn('[Encryption] Generate a key using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    
    // Generate a temporary key based on session secret as fallback
    const sessionSecret = process.env.SESSION_SECRET || 'default-insecure-secret';
    keyHex = crypto.createHash('sha256').update(sessionSecret).digest('hex');
  }
  
  // Validate key length
  if (keyHex.length !== KEY_LENGTH * 2) {
    console.error('[Encryption] CRITICAL: ENCRYPTION_KEY must be 64 hex characters (32 bytes)!');
    // Pad or hash to correct length
    keyHex = crypto.createHash('sha256').update(keyHex).digest('hex');
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt plaintext string
 * 
 * @param {string} plaintext - Text to encrypt
 * @returns {string} Encrypted text in format: iv:authTag:ciphertext (all hex-encoded)
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }
  
  try {
    const key = getEncryptionKey();
    
    // Generate random IV (never reuse!)
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    // Return as hex-encoded string: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error) {
    console.error('[Encryption] Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt encrypted string
 * 
 * @param {string} encryptedData - Encrypted text in format: iv:authTag:ciphertext
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedData) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }
  
  try {
    const key = getEncryptionKey();
    
    // Parse encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    
    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid auth tag length');
    }
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[Encryption] Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Check if a string is encrypted (has the correct format)
 * 
 * @param {string} data - Data to check
 * @returns {boolean} True if data appears to be encrypted
 */
function isEncrypted(data) {
  if (!data || typeof data !== 'string') {
    return false;
  }
  
  // Check format: iv:authTag:ciphertext (3 hex parts separated by colons)
  const parts = data.split(':');
  if (parts.length !== 3) {
    return false;
  }
  
  // Check if all parts are valid hex
  const hexRegex = /^[0-9a-fA-F]+$/;
  return parts.every(part => hexRegex.test(part));
}

/**
 * Generate a secure encryption key
 * This should be called once and the result stored in .env as ENCRYPTION_KEY
 * 
 * @returns {string} Random 256-bit key as hex string
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Hash a password using PBKDF2
 * 
 * @param {string} password - Password to hash
 * @param {string} [salt] - Optional salt (will be generated if not provided)
 * @returns {string} Salt and hash in format: salt:hash
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  }
  
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  ).toString('hex');
  
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 * 
 * @param {string} password - Password to verify
 * @param {string} hashedPassword - Hashed password in format: salt:hash
 * @returns {boolean} True if password matches
 */
function verifyPassword(password, hashedPassword) {
  const [salt, hash] = hashedPassword.split(':');
  const newHash = crypto.pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha512'
  ).toString('hex');
  
  return hash === newHash;
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  generateKey,
  hashPassword,
  verifyPassword,
  // Export constants for testing
  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH
};
