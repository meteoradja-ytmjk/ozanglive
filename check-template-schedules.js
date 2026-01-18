/**
 * Script to check template recurring schedules
 * Run with: node check-template-schedules.js
 */

const { db, waitForDbInit } = require('./db/database');

/**
 * Get current time in Asia/Jakarta timezone (WIB)
 */
function getWIBTime(date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    let hours = 0, minutes = 0, seconds = 0, dayName = '', year = 0, month = 0, dayOfMonth = 0;
    
    for (const part of parts) {
      if (part.type === 'hour') hours = parseInt(part.value, 10);
      if (part.type === 'minute') minutes = parseInt(part.value, 10);
      if (part.type === 'second') seconds = parseInt(part.value, 10);
      if (part.type === 'weekday') dayName = part.value;
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'day') dayOfMonth = parseInt(part.value, 10);
    }
    
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const day = dayMap[dayName] ?? date.getDay();
    
    return { hours, minutes, seconds, day, dayName, year, month, dayOfMonth };
  } catch (e) {
    console.error('Error getting WIB time:', e.message);
    return null;
  }
}

async function checkTemplateSchedules() {
  await waitForDbInit();
  
  console.log('\n=== CHECKING TEMPLATE RECURRING SCHEDULES ===\n');
  
  const now = new Date();
  const wibTime = getWIBTime(now);
  
  console.log('=== CURRENT TIME ===');
  console.log(`UTC:     ${now.toISOString()}`);
  console.log(`WIB:     ${wibTime.hours}:${String(wibTime.minutes).padStart(2,'0')}:${String(wibTime.seconds).padStart(2,'0')} (${wibTime.dayName}, ${wibTime.dayOfMonth}/${wibTime.month}/${wibTime.year})`);
  console.log(`Day:     ${wibTime.dayName} (index: ${wibTime.day})`);
  console.log('');
  
  // First check ALL templates
  const allQuery = `
    SELECT bt.id, bt.name, bt.recurring_enabled, bt.recurring_pattern, 
           bt.recurring_time, bt.recurring_days, bt.next_run_at, bt.last_run_at,
           yc.channel_name
    FROM broadcast_templates bt
    LEFT JOIN youtube_credentials yc ON bt.account_id = yc.id
    ORDER BY bt.name ASC
  `;
  
  db.all(allQuery, [], (err, allRows) => {
    if (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
    
    console.log(`=== ALL TEMPLATES (${allRows ? allRows.length : 0}) ===\n`);
    
    if (!allRows || allRows.length === 0) {
      console.log('No templates found in database.');
    } else {
      allRows.forEach((t, i) => {
        console.log(`${i + 1}. ${t.name}`);
        console.log(`   recurring_enabled: ${t.recurring_enabled}`);
        console.log(`   recurring_pattern: ${t.recurring_pattern}`);
        console.log(`   recurring_time: ${t.recurring_time}`);
        console.log(`   recurring_days: ${t.recurring_days}`);
        console.log(`   next_run_at: ${t.next_run_at}`);
        console.log('');
      });
    }
    
    // Now check only enabled templates
    const enabledRows = (allRows || []).filter(r => r.recurring_enabled === 1);
    
    if (enabledRows.length === 0) {
      console.log('No templates with recurring enabled found.');
      process.exit(0);
    }
    
    console.log(`=== TEMPLATES WITH RECURRING ENABLED (${enabledRows.length}) ===\n`);
    
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = dayNames[wibTime.day];
    
    enabledRows.forEach((template, index) => {
      console.log(`--- Template ${index + 1}: ${template.name} ---`);
      console.log(`  ID: ${template.id}`);
      console.log(`  Channel: ${template.channel_name || 'N/A'}`);
      console.log(`  Pattern: ${template.recurring_pattern}`);
      console.log(`  Time: ${template.recurring_time} WIB`);
      
      // Parse recurring_days
      let recurringDays = [];
      try {
        recurringDays = JSON.parse(template.recurring_days || '[]');
      } catch (e) {}
      
      if (template.recurring_pattern === 'weekly') {
        console.log(`  Days: ${recurringDays.join(', ') || 'None'}`);
        const isTodayScheduled = recurringDays.map(d => d.toLowerCase()).includes(todayName);
        console.log(`  Today (${todayName}): ${isTodayScheduled ? 'YES - SCHEDULED' : 'NO'}`);
      }
      
      console.log(`  Next Run: ${template.next_run_at || 'Not set'}`);
      console.log(`  Last Run: ${template.last_run_at || 'Never'}`);
      
      // Check trigger conditions
      if (template.recurring_time) {
        const [schedHour, schedMin] = template.recurring_time.split(':').map(Number);
        const scheduleMinutes = schedHour * 60 + schedMin;
        const currentMinutes = wibTime.hours * 60 + wibTime.minutes;
        const timeDiff = currentMinutes - scheduleMinutes;
        
        console.log(`  Schedule: ${schedHour}:${String(schedMin).padStart(2,'0')} WIB`);
        console.log(`  Current:  ${wibTime.hours}:${String(wibTime.minutes).padStart(2,'0')} WIB`);
        console.log(`  Diff:     ${timeDiff} minutes`);
        
        // Check shouldExecute (0-1 min window)
        let shouldExecute = false;
        if (timeDiff >= 0 && timeDiff <= 1) {
          if (template.recurring_pattern === 'daily') {
            shouldExecute = true;
          } else if (template.recurring_pattern === 'weekly') {
            const isTodayScheduled = recurringDays.map(d => d.toLowerCase()).includes(todayName);
            shouldExecute = isTodayScheduled;
          }
        }
        
        // Check shouldExecuteMissed (1-30 min window)
        let shouldExecuteMissed = false;
        if (timeDiff > 1 && timeDiff <= 30) {
          if (template.recurring_pattern === 'daily') {
            shouldExecuteMissed = true;
          } else if (template.recurring_pattern === 'weekly') {
            const isTodayScheduled = recurringDays.map(d => d.toLowerCase()).includes(todayName);
            shouldExecuteMissed = isTodayScheduled;
          }
        }
        
        console.log(`  Should Execute Now: ${shouldExecute ? 'YES!' : 'NO'}`);
        console.log(`  Should Execute Missed: ${shouldExecuteMissed ? 'YES!' : 'NO'}`);
      }
      
      console.log('');
    });
    
    console.log('=== END ===');
    process.exit(0);
  });
}

checkTemplateSchedules().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
