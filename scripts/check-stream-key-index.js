/**
 * Script untuk melihat dan mengatur thumbnail_index per stream key
 * 
 * Cara pakai:
 * 1. Lihat semua mapping: node scripts/check-stream-key-index.js
 * 2. Set index untuk stream key: node scripts/check-stream-key-index.js "STREAM_KEY_ID" INDEX
 * 
 * Contoh:
 * node scripts/check-stream-key-index.js "xpaf-egck-zbh0-dm8p" 5
 */

const { db } = require('../db/database');

async function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         STREAM KEY THUMBNAIL INDEX                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    // Show all stream key mappings
    const mappings = await getAll(`
      SELECT user_id, stream_key_id, folder_name, thumbnail_index, updated_at
      FROM stream_key_folder_mapping
      ORDER BY updated_at DESC
    `);
    
    console.log('STREAM KEY THUMBNAIL INDEX:');
    console.log('─'.repeat(80));
    
    if (mappings.length === 0) {
      console.log('  (tidak ada data)');
    } else {
      mappings.forEach((m, i) => {
        const folder = m.folder_name === '' ? 'root' : m.folder_name;
        console.log(`  ${i + 1}. Stream Key: ${m.stream_key_id}`);
        console.log(`     Folder: ${folder}`);
        console.log(`     Thumbnail Index: ${m.thumbnail_index || 0}`);
        console.log(`     Updated: ${m.updated_at}`);
        console.log('');
      });
    }
    
    // If arguments provided, update index
    if (args.length >= 2) {
      const streamKeyId = args[0];
      const newIndex = parseInt(args[1]);
      
      if (isNaN(newIndex)) {
        console.log('❌ ERROR: Index harus berupa angka');
        process.exit(1);
      }
      
      console.log('─'.repeat(80));
      console.log(`UPDATING: "${streamKeyId}" → index ${newIndex}`);
      
      // Check if exists
      const existing = await getAll(
        'SELECT * FROM stream_key_folder_mapping WHERE stream_key_id = ?',
        [streamKeyId]
      );
      
      if (existing.length > 0) {
        const result = await runQuery(
          'UPDATE stream_key_folder_mapping SET thumbnail_index = ?, updated_at = CURRENT_TIMESTAMP WHERE stream_key_id = ?',
          [newIndex, streamKeyId]
        );
        
        if (result.changes > 0) {
          console.log(`✅ BERHASIL! Stream key "${streamKeyId}" sekarang index ${newIndex}`);
        } else {
          console.log(`❌ GAGAL! Tidak ada perubahan`);
        }
      } else {
        console.log(`❌ Stream key "${streamKeyId}" tidak ditemukan`);
        console.log('   Gunakan aplikasi untuk membuat mapping terlebih dahulu');
      }
    } else if (args.length === 1) {
      console.log('❌ ERROR: Butuh 2 parameter');
      console.log('   Contoh: node scripts/check-stream-key-index.js "xpaf-egck-zbh0-dm8p" 5');
    } else {
      console.log('─'.repeat(80));
      console.log('CARA UPDATE INDEX:');
      console.log('  node scripts/check-stream-key-index.js "STREAM_KEY_ID" INDEX');
      console.log('');
      console.log('CONTOH:');
      if (mappings.length > 0) {
        console.log(`  node scripts/check-stream-key-index.js "${mappings[0].stream_key_id}" 5`);
      } else {
        console.log('  node scripts/check-stream-key-index.js "xpaf-egck-zbh0-dm8p" 5');
      }
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
  
  process.exit(0);
}

setTimeout(main, 1000);
