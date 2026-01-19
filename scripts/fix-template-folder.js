/**
 * Script untuk meng-update thumbnail_folder di template
 * 
 * Jalankan di VPS:
 * node scripts/fix-template-folder.js
 * 
 * Atau dengan parameter untuk set folder:
 * node scripts/fix-template-folder.js "TEMPLATE_NAME" "FOLDER_NAME"
 */

const { db } = require('../db/database');

async function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('=== Fix Template Thumbnail Folder ===\n');
  
  try {
    // Show all templates
    const templates = await getAll(`
      SELECT id, name, account_id, thumbnail_folder, recurring_enabled
      FROM broadcast_templates
    `);
    
    console.log('Templates saat ini:');
    console.log('-'.repeat(60));
    
    if (templates.length === 0) {
      console.log('Tidak ada template!');
      process.exit(0);
    }
    
    templates.forEach((t, i) => {
      const folder = t.thumbnail_folder === null ? 'NULL (tidak di-set)' : 
                     t.thumbnail_folder === '' ? '""(root)' : 
                     `"${t.thumbnail_folder}"`;
      console.log(`${i + 1}. ${t.name}`);
      console.log(`   ID: ${t.id}`);
      console.log(`   thumbnail_folder: ${folder}`);
      console.log(`   recurring: ${t.recurring_enabled ? 'YES' : 'NO'}`);
      console.log('');
    });
    
    // If arguments provided, update template
    if (args.length >= 2) {
      const templateName = args[0];
      const folderName = args[1];
      
      console.log('-'.repeat(60));
      console.log(`Updating template "${templateName}" dengan folder "${folderName}"...`);
      
      const result = await runQuery(
        'UPDATE broadcast_templates SET thumbnail_folder = ? WHERE name = ?',
        [folderName, templateName]
      );
      
      if (result.changes > 0) {
        console.log(`✓ Berhasil update ${result.changes} template`);
      } else {
        console.log(`✗ Template "${templateName}" tidak ditemukan`);
      }
    } else {
      console.log('-'.repeat(60));
      console.log('Untuk update folder, jalankan:');
      console.log('node scripts/fix-template-folder.js "NAMA_TEMPLATE" "NAMA_FOLDER"');
      console.log('');
      console.log('Contoh:');
      console.log('node scripts/fix-template-folder.js "La Davina Melodia" "DAVINA"');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

setTimeout(main, 1000);
