/**
 * TEST SCRIPT: Duration Accuracy Fix Verification
 * 
 * Script ini untuk test apakah perbaikan duration settings sudah bekerja dengan baik
 * 
 * Usage:
 *   node test-duration-accuracy.js
 */

const { db } = require('./db/database');

/**
 * Get all live streams with their timing details
 */
async function getLiveStreamsWithTiming() {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        id,
        title,
        stream_duration_minutes,
        start_time,
        status,
        user_id,
        schedule_type
      FROM streams 
      WHERE status = 'live'
      ORDER BY start_time DESC
    `;
    
    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Calculate timing details for a stream
 */
function calculateTimingDetails(stream) {
  if (!stream.start_time || !stream.stream_duration_minutes) {
    return null;
  }
  
  const now = new Date();
  const startTime = new Date(stream.start_time);
  
  // Validate start_time
  if (isNaN(startTime.getTime())) {
    return {
      error: 'Invalid start_time',
      startTime: stream.start_time
    };
  }
  
  const durationMs = stream.stream_duration_minutes * 60 * 1000;
  const expectedEndTime = new Date(startTime.getTime() + durationMs);
  
  const elapsed = now.getTime() - startTime.getTime();
  const elapsedMinutes = elapsed / 60000;
  
  const remaining = expectedEndTime.getTime() - now.getTime();
  const remainingMinutes = remaining / 60000;
  
  const overdueMinutes = -remainingMinutes;
  const isOverdue = remaining < 0;
  
  return {
    startTime: startTime.toISOString(),
    expectedEndTime: expectedEndTime.toISOString(),
    currentTime: now.toISOString(),
    configuredDuration: stream.stream_duration_minutes,
    elapsedMinutes: elapsedMinutes.toFixed(2),
    remainingMinutes: remainingMinutes.toFixed(2),
    isOverdue,
    overdueMinutes: isOverdue ? overdueMinutes.toFixed(2) : 0
  };
}

/**
 * Main test function
 */
async function testDurationAccuracy() {
  console.log('========================================');
  console.log('  DURATION ACCURACY TEST');
  console.log('========================================');
  console.log('');
  
  try {
    const liveStreams = await getLiveStreamsWithTiming();
    
    if (liveStreams.length === 0) {
      console.log('ℹ️  No live streams found.');
      console.log('');
      console.log('To test:');
      console.log('1. Start one or more streams from dashboard');
      console.log('2. Run this script again');
      console.log('');
      return;
    }
    
    console.log(`Found ${liveStreams.length} live stream(s)\n`);
    
    let allAccurate = true;
    let overdueStreams = [];
    
    liveStreams.forEach((stream, index) => {
      console.log(`Stream ${index + 1}:`);
      console.log(`  ID: ${stream.id}`);
      console.log(`  Title: "${stream.title}"`);
      console.log(`  Schedule Type: ${stream.schedule_type}`);
      console.log(`  Configured Duration: ${stream.stream_duration_minutes} minutes`);
      console.log('');
      
      const timing = calculateTimingDetails(stream);
      
      if (!timing) {
        console.log('  ⚠️  Cannot calculate timing (missing start_time or duration)');
        console.log('');
        return;
      }
      
      if (timing.error) {
        console.log(`  ❌ ERROR: ${timing.error}`);
        console.log(`     start_time in DB: ${timing.startTime}`);
        console.log('');
        allAccurate = false;
        return;
      }
      
      console.log('  Timing Details:');
      console.log(`    Started:       ${timing.startTime}`);
      console.log(`    Expected End:  ${timing.expectedEndTime}`);
      console.log(`    Current Time:  ${timing.currentTime}`);
      console.log('');
      console.log(`    Elapsed:   ${timing.elapsedMinutes} minutes`);
      console.log(`    Remaining: ${timing.remainingMinutes} minutes`);
      console.log('');
      
      if (timing.isOverdue) {
        console.log(`  ⚠️  OVERDUE by ${timing.overdueMinutes} minutes!`);
        console.log(`     This stream should have been stopped automatically.`);
        console.log('');
        allAccurate = false;
        overdueStreams.push({
          id: stream.id,
          title: stream.title,
          overdueMinutes: timing.overdueMinutes
        });
      } else {
        const remainingNum = parseFloat(timing.remainingMinutes);
        if (remainingNum < 1) {
          console.log(`  ⏰ Ending soon (< 1 minute remaining)`);
        } else if (remainingNum < 5) {
          console.log(`  ⏱️  Ending in ${timing.remainingMinutes} minutes`);
        } else {
          console.log(`  ✅ Running normally (${timing.remainingMinutes} min remaining)`);
        }
        console.log('');
      }
      
      console.log('---');
      console.log('');
    });
    
    // Summary
    console.log('========================================');
    console.log('  SUMMARY');
    console.log('========================================');
    console.log('');
    
    if (overdueStreams.length > 0) {
      console.log(`❌ ISSUES FOUND: ${overdueStreams.length} stream(s) are overdue\n`);
      overdueStreams.forEach(s => {
        console.log(`   - Stream ${s.id} "${s.title}": overdue by ${s.overdueMinutes} min`);
      });
      console.log('');
      console.log('These streams should have been stopped by schedulerService.');
      console.log('Check logs/app.log for [Scheduler] messages.');
      console.log('');
      console.log('Possible causes:');
      console.log('  1. Scheduler not running (check app.js)');
      console.log('  2. StreamingService not initialized in scheduler');
      console.log('  3. Duration check interval too slow');
      console.log('');
    } else {
      console.log(`✅ ALL STREAMS TIMING ACCURATE\n`);
      console.log(`   ${liveStreams.length} stream(s) running normally`);
      console.log('   No overdue streams detected');
      console.log('');
    }
    
    console.log('========================================');
    console.log('');
    
    // Recommendations
    console.log('📋 MONITORING TIPS:');
    console.log('');
    console.log('1. Check scheduler logs:');
    console.log('   tail -f logs/app.log | grep "\\[Scheduler\\]"');
    console.log('');
    console.log('2. Run this test script periodically:');
    console.log('   node test-duration-accuracy.js');
    console.log('');
    console.log('3. Expected scheduler behavior:');
    console.log('   - Checks every 10 seconds');
    console.log('   - Logs "Checking durations for X live stream(s)"');
    console.log('   - Shows timing details for each stream');
    console.log('   - Stops streams within ±10 seconds of configured duration');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error running test:', error.message);
    console.error(error);
  }
}

// Run test
testDurationAccuracy().then(() => {
  console.log('Test completed.');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
