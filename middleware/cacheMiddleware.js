/**
 * Cache Middleware untuk Optimasi Performa
 * Mengurangi query database dengan caching in-memory
 */

const NodeCache = require('node-cache');

// Cache dengan TTL 5 menit
const pageCache = new NodeCache({ 
  stdTTL: 300, // 5 menit
  checkperiod: 60, // Check expired keys setiap 60 detik
  useClones: false // Lebih cepat, tapi hati-hati dengan mutasi
});

// Cache untuk data user (lebih lama karena jarang berubah)
const userCache = new NodeCache({ 
  stdTTL: 600, // 10 menit
  checkperiod: 120
});

// Cache untuk system stats (lebih pendek karena real-time)
const statsCache = new NodeCache({ 
  stdTTL: 30, // 30 detik
  checkperiod: 10
});

/**
 * Middleware untuk cache halaman
 * @param {number} duration - Durasi cache dalam detik
 */
function cacheMiddleware(duration = 300) {
  return (req, res, next) => {
    // Skip cache untuk POST/PUT/DELETE
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache jika ada query parameter tertentu
    if (req.query.nocache || req.query.refresh) {
      return next();
    }

    // Generate cache key berdasarkan user dan path
    const cacheKey = `page_${req.session.userId}_${req.path}`;
    
    // Cek apakah ada di cache
    const cachedResponse = pageCache.get(cacheKey);
    
    if (cachedResponse) {
      // Kirim dari cache dengan header
      res.set('X-Cache', 'HIT');
      return res.send(cachedResponse);
    }

    // Intercept res.send untuk menyimpan ke cache
    const originalSend = res.send;
    res.send = function(body) {
      // Simpan ke cache hanya jika response sukses
      if (res.statusCode === 200) {
        pageCache.set(cacheKey, body, duration);
      }
      res.set('X-Cache', 'MISS');
      originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Cache untuk data user
 */
function cacheUser(userId, userData) {
  userCache.set(`user_${userId}`, userData);
}

function getCachedUser(userId) {
  return userCache.get(`user_${userId}`);
}

function invalidateUserCache(userId) {
  userCache.del(`user_${userId}`);
  // Juga hapus cache halaman user ini
  const keys = pageCache.keys();
  keys.forEach(key => {
    if (key.includes(`_${userId}_`)) {
      pageCache.del(key);
    }
  });
}

/**
 * Cache untuk system stats
 */
function cacheStats(key, data) {
  statsCache.set(key, data);
}

function getCachedStats(key) {
  return statsCache.get(key);
}

/**
 * Clear semua cache
 */
function clearAllCache() {
  pageCache.flushAll();
  userCache.flushAll();
  statsCache.flushAll();
}

/**
 * Clear cache untuk user tertentu
 */
function clearUserCache(userId) {
  invalidateUserCache(userId);
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    page: pageCache.getStats(),
    user: userCache.getStats(),
    stats: statsCache.getStats()
  };
}

module.exports = {
  cacheMiddleware,
  cacheUser,
  getCachedUser,
  invalidateUserCache,
  cacheStats,
  getCachedStats,
  clearAllCache,
  clearUserCache,
  getCacheStats
};
