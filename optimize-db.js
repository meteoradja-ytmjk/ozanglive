const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database paths
const dbPaths = [
    path.join(__dirname, 'db', 'streamflow.db'),
    path.join(__dirname, 'db', 'sessions.db')
];

// Optimize a single database
const optimizeDatabase = (dbPath) => {
    return new Promise((resolve, reject) => {
        // Check if database exists
        if (!fs.existsSync(dbPath)) {
            console.log(`⚠️  Database not found: ${dbPath}`);
            return resolve();
        }

        console.log(`\n🔧 Optimizing: ${path.basename(dbPath)}`);

        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(`❌ Error opening database: ${err.message}`);
                return reject(err);
            }
        });

        // Run optimization commands
        db.serialize(() => {
            // Set journal mode to WAL for better performance
            db.run('PRAGMA journal_mode=WAL;', (err) => {
                if (err) {
                    console.error(`  ❌ Error setting journal_mode: ${err.message}`);
                } else {
                    console.log('  ✓ journal_mode set to WAL');
                }
            });

            // Set synchronous to NORMAL for better performance
            db.run('PRAGMA synchronous=NORMAL;', (err) => {
                if (err) {
                    console.error(`  ❌ Error setting synchronous: ${err.message}`);
                } else {
                    console.log('  ✓ synchronous set to NORMAL');
                }
            });

            // Run VACUUM to reclaim space and optimize
            db.run('VACUUM;', (err) => {
                if (err) {
                    console.error(`  ❌ Error running VACUUM: ${err.message}`);
                } else {
                    console.log('  ✓ VACUUM completed');
                }
            });

            // Run ANALYZE to update query optimizer statistics
            db.run('ANALYZE;', (err) => {
                if (err) {
                    console.error(`  ❌ Error running ANALYZE: ${err.message}`);
                } else {
                    console.log('  ✓ ANALYZE completed');
                }

                // Close database
                db.close((err) => {
                    if (err) {
                        console.error(`  ❌ Error closing database: ${err.message}`);
                        return reject(err);
                    }
                    console.log(`  ✅ Optimization complete for ${path.basename(dbPath)}`);
                    resolve();
                });
            });
        });
    });
};

// Main function
const main = async () => {
    console.log('🚀 Starting database optimization...\n');
    console.log('📊 This will optimize the following databases:');
    dbPaths.forEach(dbPath => {
        if (fs.existsSync(dbPath)) {
            console.log(`  - ${path.basename(dbPath)}`);
        }
    });
    console.log('');

    try {
        // Optimize each database sequentially
        for (const dbPath of dbPaths) {
            await optimizeDatabase(dbPath);
        }

        console.log('\n✅ All databases optimized successfully!');
        console.log('\n💡 Benefits:');
        console.log('  - Reduced database file size');
        console.log('  - Improved query performance');
        console.log('  - Better write performance with WAL mode');
        console.log('  - Updated query optimizer statistics');

    } catch (error) {
        console.error('\n❌ Optimization failed:', error.message);
        process.exit(1);
    }
};

// Run
main();
