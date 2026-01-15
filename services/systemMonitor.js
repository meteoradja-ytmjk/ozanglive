const si = require('systeminformation');
const { exec } = require('child_process');

let previousNetworkData = null;
let previousTimestamp = null;

// Cache for system stats to prevent blocking - ULTRA OPTIMIZED
let cachedStats = null;
let lastCacheTime = 0;
const CACHE_TTL = 120000; // ULTRA: Cache for 2 minutes - minimal CPU polling

// Cache for process CPU to avoid frequent process enumeration
let cachedProcessCpu = 0;
let lastProcessCpuTime = 0;
const PROCESS_CPU_CACHE_TTL = 30000; // Cache process CPU for 30 seconds

/**
 * Wrap a promise with timeout to prevent hanging
 */
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

/**
 * Get CPU usage for streaming-related processes only (node + ffmpeg)
 * This gives more accurate CPU usage for the streaming application
 */
async function getStreamingProcessCpu() {
  const now = Date.now();
  
  // Return cached value if fresh
  if (cachedProcessCpu !== null && (now - lastProcessCpuTime) < PROCESS_CPU_CACHE_TTL) {
    return cachedProcessCpu;
  }
  
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Windows: Use WMIC to get CPU for node and ffmpeg processes
      exec('wmic path win32_perfformatteddata_perfproc_process where "name like \'node%\' or name like \'ffmpeg%\'" get PercentProcessorTime 2>nul', 
        { timeout: 3000 }, 
        (error, stdout) => {
          if (error || !stdout) {
            resolve(cachedProcessCpu || 0);
            return;
          }
          
          // Parse CPU percentages and sum them
          const lines = stdout.trim().split('\n').slice(1); // Skip header
          let totalCpu = 0;
          for (const line of lines) {
            const cpu = parseInt(line.trim());
            if (!isNaN(cpu)) {
              totalCpu += cpu;
            }
          }
          
          // Normalize by number of CPU cores
          const cpuCount = require('os').cpus().length;
          const normalizedCpu = Math.round(totalCpu / cpuCount);
          
          cachedProcessCpu = normalizedCpu;
          lastProcessCpuTime = now;
          resolve(normalizedCpu);
        }
      );
    } else {
      // Linux: Use ps to get CPU for node and ffmpeg
      exec("ps -eo pcpu,comm | grep -E 'node|ffmpeg' | awk '{sum += $1} END {print sum}'",
        { timeout: 3000 },
        (error, stdout) => {
          if (error || !stdout) {
            resolve(cachedProcessCpu || 0);
            return;
          }
          
          const cpu = parseFloat(stdout.trim()) || 0;
          cachedProcessCpu = Math.round(cpu);
          lastProcessCpuTime = now;
          resolve(Math.round(cpu));
        }
      );
    }
  });
}

async function getSystemStats() {
  // Return cached stats if fresh
  const now = Date.now();
  if (cachedStats && (now - lastCacheTime) < CACHE_TTL) {
    return { ...cachedStats, timestamp: now };
  }
  
  try {
    // Use timeout to prevent hanging - 10 second max
    const [cpuData, memData, networkData, diskData, streamingCpu] = await Promise.all([
      withTimeout(si.currentLoad(), 3000, { currentLoad: 0, cpus: [] }),
      withTimeout(si.mem(), 3000, { total: 0, active: 0, available: 0 }),
      withTimeout(si.networkStats(), 3000, []),
      withTimeout(getDiskUsage(), 3000, { total: "0 GB", used: "0 GB", free: "0 GB", usagePercent: 0, drive: "N/A" }),
      withTimeout(getStreamingProcessCpu(), 3000, 0)
    ]);
    
    // Use streaming process CPU instead of total system CPU for more accurate display
    // This shows only node + ffmpeg CPU usage, not browser/IDE/other apps
    const cpuUsage = streamingCpu > 0 ? streamingCpu : (cpuData.currentLoad || cpuData.avg || 0);
    
    const networkSpeed = calculateNetworkSpeed(networkData);
    
    const formatMemory = (bytes) => {
      if (bytes >= 1073741824) {
        return (bytes / 1073741824).toFixed(2) + " GB";
      } else {
        return (bytes / 1048576).toFixed(2) + " MB";
      }
    };
    
    const stats = {
      cpu: {
        usage: Math.round(cpuUsage),
        cores: cpuData.cpus ? cpuData.cpus.length : 0
      },
      memory: {
        total: formatMemory(memData.total),
        used: formatMemory(memData.active),
        free: formatMemory(memData.available),
        usagePercent: memData.total > 0 ? Math.round((memData.active / memData.total) * 100) : 0
      },
      network: networkSpeed,
      disk: diskData,
      platform: process.platform,
      timestamp: now
    };
    
    // Update cache
    cachedStats = stats;
    lastCacheTime = now;
    
    return stats;
  } catch (error) {
    console.error('Error getting system stats:', error.message);
    
    // Return cached stats if available, otherwise return defaults
    if (cachedStats) {
      return { ...cachedStats, timestamp: Date.now() };
    }
    
    return {
      cpu: { usage: 0, cores: 0 },
      memory: { total: "0 GB", used: "0 GB", free: "0 GB", usagePercent: 0 },
      network: { download: 0, upload: 0, downloadFormatted: '0 Mbps', uploadFormatted: '0 Mbps' },
      disk: { total: "0 GB", used: "0 GB", free: "0 GB", usagePercent: 0, drive: "N/A" },
      platform: process.platform,
      timestamp: Date.now()
    };
  }
}

function calculateNetworkSpeed(networkData) {
  const currentTimestamp = Date.now();
  
  if (!previousNetworkData || !previousTimestamp) {
    previousNetworkData = networkData;
    previousTimestamp = currentTimestamp;
    return {
      download: 0,
      upload: 0,
      downloadFormatted: '0 Mbps',
      uploadFormatted: '0 Mbps'
    };
  }
  
  const timeDiff = (currentTimestamp - previousTimestamp) / 1000;
  
  const currentTotal = networkData
    .filter(iface => !iface.iface.includes('lo') && !iface.iface.includes('Loopback'))
    .reduce((acc, iface) => ({
      rx_bytes: acc.rx_bytes + (iface.rx_bytes || 0),
      tx_bytes: acc.tx_bytes + (iface.tx_bytes || 0)
    }), { rx_bytes: 0, tx_bytes: 0 });
  
  const previousTotal = previousNetworkData
    .filter(iface => !iface.iface.includes('lo') && !iface.iface.includes('Loopback'))
    .reduce((acc, iface) => ({
      rx_bytes: acc.rx_bytes + (iface.rx_bytes || 0),
      tx_bytes: acc.tx_bytes + (iface.tx_bytes || 0)
    }), { rx_bytes: 0, tx_bytes: 0 });
  
  const downloadBps = Math.max(0, (currentTotal.rx_bytes - previousTotal.rx_bytes) / timeDiff);
  const uploadBps = Math.max(0, (currentTotal.tx_bytes - previousTotal.tx_bytes) / timeDiff);
  
  const downloadMbps = (downloadBps * 8) / (1024 * 1024);
  const uploadMbps = (uploadBps * 8) / (1024 * 1024);
  
  previousNetworkData = networkData;
  previousTimestamp = currentTimestamp;
  
  return {
    download: downloadMbps,
    upload: uploadMbps,
    downloadFormatted: formatSpeed(downloadMbps),
    uploadFormatted: formatSpeed(uploadMbps)
  };
}

function formatSpeed(speedMbps) {
  if (speedMbps >= 1000) {
    return (speedMbps / 1000).toFixed(2) + ' Gbps';
  } else if (speedMbps >= 1) {
    return speedMbps.toFixed(2) + ' Mbps';
  } else {
    return (speedMbps * 1000).toFixed(0) + ' Kbps';
  }
}

async function getDiskUsage() {
  try {
    const fsSize = await si.fsSize();
    const platform = process.platform;
    
    let targetDisk;
    
    if (platform === 'win32') {
      const currentDrive = process.cwd().charAt(0).toUpperCase();
      targetDisk = fsSize.find(disk => disk.mount.charAt(0).toUpperCase() === currentDrive);
      
      if (!targetDisk) {
        targetDisk = fsSize.find(disk => disk.mount.charAt(0).toUpperCase() === 'C');
      }
    } else {
      targetDisk = fsSize.find(disk => disk.mount === '/');
    }
    
    if (!targetDisk) {
      targetDisk = fsSize[0];
    }
    
    if (!targetDisk) {
      return {
        total: "0 GB",
        used: "0 GB", 
        free: "0 GB",
        usagePercent: 0,
        drive: "N/A"
      };
    }
    
    const formatDisk = (bytes) => {
      if (bytes >= 1099511627776) {
        return (bytes / 1099511627776).toFixed(2) + " TB";
      } else if (bytes >= 1073741824) {
        return (bytes / 1073741824).toFixed(2) + " GB";
      } else {
        return (bytes / 1048576).toFixed(2) + " MB";
      }
    };
    
    const usagePercent = targetDisk.size > 0 ? 
      Math.round(((targetDisk.size - targetDisk.available) / targetDisk.size) * 100) : 0;
    
    return {
      total: formatDisk(targetDisk.size),
      used: formatDisk(targetDisk.size - targetDisk.available),
      free: formatDisk(targetDisk.available),
      usagePercent: usagePercent,
      drive: targetDisk.mount || targetDisk.fs || "Unknown"
    };
  } catch (error) {
    console.error('Error getting disk usage:', error);
    return {
      total: "0 GB",
      used: "0 GB",
      free: "0 GB", 
      usagePercent: 0,
      drive: "N/A"
    };
  }
}

module.exports = { getSystemStats };