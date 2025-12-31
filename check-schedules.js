const { db } = require('./db/database');

db.all('SELECT id, title, schedule_type, recurring_time, recurring_enabled, schedule_days, status, schedule_time FROM streams WHERE status = "scheduled"', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Scheduled streams:');
    rows.forEach(row => {
      console.log(`- ID: ${row.id}`);
      console.log(`  Title: ${row.title}`);
      console.log(`  Type: ${row.schedule_type}`);
      console.log(`  Time: ${row.recurring_time}`);
      console.log(`  Enabled: ${row.recurring_enabled}`);
      console.log(`  Days: ${row.schedule_days}`);
      console.log(`  Schedule Time: ${row.schedule_time}`);
      console.log(`  Status: ${row.status}`);
      console.log('');
    });
  }
  process.exit();
});
