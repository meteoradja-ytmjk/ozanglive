/**
 * CPU Usage Test Script
 * Run this to verify CPU usage is within 2-3% target
 */

const si = require('systeminformation');

async function measureCPU(durationSeconds = 30) {
  console.log(`\n=== CPU Usage Test (${durationSeconds} seconds) ===\n`);
  
  const samples = [];
  const interval = 2000; // Sample every 2 seconds
  const iterations = Math.floor((durationSeconds * 1000) / interval);
  
  for (let i = 0; i < iterations; i++) {
    const cpuData = await si.currentLoad();
    const usage = cpuData.currentLoad;
    samples.push(usage);
    
    process.stdout.write(`\rSample ${i + 1}/${iterations}: ${usage.toFixed(1)}%`);
    
    await new Promise(r => setTimeout(r, interval));
  }
  
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  
  console.log(`\n\n=== Results ===`);
  console.log(`Average CPU: ${avg.toFixed(1)}%`);
  console.log(`Min CPU: ${min.toFixed(1)}%`);
  console.log(`Max CPU: ${max.toFixed(1)}%`);
  console.log(`Samples: ${samples.length}`);
  
  if (avg <= 3) {
    console.log(`\n✅ PASS: Average CPU (${avg.toFixed(1)}%) is within 2-3% target`);
  } else {
    console.log(`\n❌ FAIL: Average CPU (${avg.toFixed(1)}%) exceeds 3% target`);
  }
  
  process.exit(0);
}

// Run for 30 seconds
measureCPU(30);
