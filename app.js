require('dotenv').config();
require('./services/logger.js');
const express = require('express');
const path = require('path');
const engine = require('ejs-mate');
const os = require('os');
const multer = require('multer');
const fs = require('fs');
const csrf = require('csrf');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('./models/User');
const { db, checkIfUsersExist, waitForDbInit, verifyTables, checkConnectivity, closeDatabase } = require('./db/database');
const systemMonitor = require('./services/systemMonitor');
const { uploadVideo, upload, uploadAudio, uploadBackup } = require('./middleware/uploadMiddleware');
const { ensureDirectories } = require('./utils/storage');
const { getVideoInfo, generateThumbnail } = require('./utils/videoProcessor');
const Video = require('./models/Video');
const Audio = require('./models/Audio');
const Playlist = require('./models/Playlist');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const streamingService = require('./services/streamingService');
const schedulerService = require('./services/schedulerService');
const YouTubeCredentials = require('./models/YouTubeCredentials');
const youtubeService = require('./services/youtubeService');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
// Track if we're shutting down to prevent multiple shutdown attempts
let isShuttingDown = false;
let httpServer = null;
const activeIntervals = [];
const activeTimeouts = [];

// Store interval/timeout references for cleanup
const originalSetInterval = global.setInterval;
const originalSetTimeout = global.setTimeout;
const originalClearInterval = global.clearInterval;
const originalClearTimeout = global.clearTimeout;

global.setInterval = function(...args) {
  const id = originalSetInterval.apply(this, args);
  activeIntervals.push(id);
  return id;
};

global.setTimeout = function(...args) {
  const id = originalSetTimeout.apply(this, args);
  activeTimeouts.push(id);
  return id;
};

global.clearInterval = function(id) {
  const index = activeIntervals.indexOf(id);
  if (index > -1) activeIntervals.splice(index, 1);
  return originalClearInterval.call(this, id);
};

global.clearTimeout = function(id) {
  const index = activeTimeouts.indexOf(id);
  if (index > -1) activeTimeouts.splice(index, 1);
  return originalClearTimeout.call(this, id);
};

/**
 * Perform graceful shutdown of the application
 * @param {string} signal - Signal that triggered shutdown
 * @param {number} exitCode - Exit code to use
 */
async function gracefulShutdown(signal, exitCode = 0) {
  if (isShuttingDown) {
    console.log('[Shutdown] Already shutting down, ignoring signal');
    return;
  }
  
  isShuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, starting graceful shutdown...`);
  
  // Force exit after 30 seconds
  const forceExitTimeout = setTimeout(() => {
    console.error('[Shutdown] Force exit after 30 second timeout');
    process.exit(exitCode || 1);
  }, 30000);
  forceExitTimeout.unref();
  
  try {
    // 1. Stop accepting new connections
    if (httpServer) {
      console.log('[Shutdown] Closing HTTP server...');
      await new Promise((resolve) => {
        httpServer.close(() => {
          console.log('[Shutdown] HTTP server closed');
          resolve();
        });
      });
    }
    
    // 2. Stop all active streams
    try {
      const activeStreams = streamingService.getActiveStreams();
      if (activeStreams.length > 0) {
        console.log(`[Shutdown] Stopping ${activeStreams.length} active streams...`);
        await Promise.all(activeStreams.map(id => 
          streamingService.stopStream(id).catch(err => {
            console.error(`[Shutdown] Error stopping stream ${id}:`, err.message);
          })
        ));
        console.log('[Shutdown] All streams stopped');
      }
    } catch (e) {
      console.error('[Shutdown] Error stopping streams:', e.message);
    }
    
    // 3. Clear all intervals and timeouts
    console.log(`[Shutdown] Clearing ${activeIntervals.length} intervals and ${activeTimeouts.length} timeouts...`);
    activeIntervals.forEach(id => originalClearInterval(id));
    activeTimeouts.forEach(id => originalClearTimeout(id));
    activeIntervals.length = 0;
    activeTimeouts.length = 0;
    
    // 4. Close database connection
    try {
      console.log('[Shutdown] Closing database connection...');
      await closeDatabase();
    } catch (e) {
      console.error('[Shutdown] Error closing database:', e.message);
    }
    
    console.log('[Shutdown] Graceful shutdown complete');
    clearTimeout(forceExitTimeout);
    process.exit(exitCode);
    
  } catch (error) {
    console.error('[Shutdown] Error during graceful shutdown:', error);
    clearTimeout(forceExitTimeout);
    process.exit(exitCode || 1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('-----------------------------------');
  console.error('[ERROR] UNHANDLED REJECTION');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack || 'No stack trace');
  console.error('-----------------------------------');
  // Don't exit - just log and continue
  // This prevents the app from crashing on unhandled promise rejections
});

// SIMPLIFIED: Removed aggressive memory monitoring and self-healing
// These were causing more problems than they solved
// PM2 will handle restarts if needed via max_memory_restart

// Simple memory logging every 30 minutes (just for info, no action)
setInterval(() => {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    console.log(`[Memory] Heap: ${heapUsedMB}MB, RSS: ${rssMB}MB`);
  } catch (e) {
    // Ignore errors
  }
}, 30 * 60 * 1000); // Every 30 minutes

process.on('uncaughtException', (error) => {
  console.error('-----------------------------------');
  console.error('[ERROR] UNCAUGHT EXCEPTION');
  console.error('Error:', error);
  console.error('Stack:', error?.stack || 'No stack trace');
  console.error('-----------------------------------');
  
  // Check if this is a recoverable error
  // EXPANDED: Added more recoverable error codes
  const recoverableErrors = [
    'ECONNRESET',
    'EPIPE',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNABORTED',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOENT',
    'EBUSY',
    'SQLITE_BUSY',
    'SQLITE_LOCKED',
    'ERR_STREAM_DESTROYED',
    'ERR_STREAM_WRITE_AFTER_END',
    'ERR_HTTP_HEADERS_SENT'
  ];
  
  // Also check for common recoverable error messages
  const recoverableMessages = [
    'socket hang up',
    'read ECONNRESET',
    'write EPIPE',
    'connect ETIMEDOUT',
    'getaddrinfo',
    'SQLITE_BUSY',
    'database is locked',
    'Cannot read properties of null',
    'Cannot read properties of undefined'
  ];
  
  const isRecoverable = recoverableErrors.some(code => 
    error.code === code || (error.message && error.message.includes(code))
  ) || recoverableMessages.some(msg => 
    error.message && error.message.includes(msg)
  );
  
  if (isRecoverable) {
    console.error('[ERROR] Recoverable error detected, continuing...');
    return;
  }
  
  // For critical errors, attempt graceful shutdown
  gracefulShutdown('uncaughtException', 1);
});

// Handle SIGTERM and SIGINT for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));
const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 7575;
const tokens = new csrf();
ensureDirectories();
ensureDirectories();
app.locals.helpers = {
  getUsername: function (req) {
    if (req.session && req.session.username) {
      return req.session.username;
    }
    return 'User';
  },
  getRoleBadge: function (req) {
    if (req.session && req.session.user_role) {
      const role = req.session.user_role;
      if (role === 'admin') {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30" title="Administrator - Full system access">
          <i class="ti ti-shield-check text-xs"></i>
          <span>Admin</span>
        </span>`;
      } else {
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30" title="Member - Standard access">
          <i class="ti ti-user text-xs"></i>
          <span>Member</span>
        </span>`;
      }
    }
    return '';
  },
  getAvatar: function (req) {
    if (req.session && req.session.userId) {
      const avatarPath = req.session.avatar_path;
      if (avatarPath) {
        return `<img src="${avatarPath}" alt="${req.session.username || 'User'}'s Profile" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='/images/default-avatar.jpg';">`;
      }
    }
    return '<img src="/images/default-avatar.jpg" alt="Default Profile" class="w-full h-full object-cover">';
  },
  getPlatformIcon: function (platform) {
    switch (platform) {
      case 'YouTube': return 'youtube';
      case 'Facebook': return 'facebook';
      case 'Twitch': return 'twitch';
      case 'TikTok': return 'tiktok';
      case 'Instagram': return 'instagram';
      case 'Shopee Live': return 'shopping-bag';
      case 'Restream.io': return 'live-photo';
      default: return 'broadcast';
    }
  },
  getPlatformColor: function (platform) {
    switch (platform) {
      case 'YouTube': return 'red-500';
      case 'Facebook': return 'blue-500';
      case 'Twitch': return 'purple-500';
      case 'TikTok': return 'gray-100';
      case 'Instagram': return 'pink-500';
      case 'Shopee Live': return 'orange-500';
      case 'Restream.io': return 'teal-500';
      default: return 'gray-400';
    }
  },
  formatDateTime: function (isoString) {
    if (!isoString) return '--';
    
    const utcDate = new Date(isoString);
    
    return utcDate.toLocaleString('en-US', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  },
  formatDuration: function (seconds) {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
  },
  formatTime: function (isoString) {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
};
// Validate SESSION_SECRET exists and generate secure fallback if not
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('[Session] WARNING: SESSION_SECRET is not set in .env file!');
  console.warn('[Session] Generating a temporary secret - DO NOT USE IN PRODUCTION!');
  console.warn('[Session] Generate a permanent secret using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  sessionSecret = require('crypto').randomBytes(32).toString('hex');
}

// Validate secret is not empty or too short
if (!sessionSecret || sessionSecret.length < 16) {
  console.error('[Session] CRITICAL: SESSION_SECRET is too short or invalid!');
  sessionSecret = require('crypto').randomBytes(32).toString('hex');
}

// Create session store with cleanup
const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: './db/',
  table: 'sessions',
  // CRITICAL: Enable session cleanup to prevent database bloat
  cleanupInterval: 900000 // Clean expired sessions every 15 minutes (900000ms)
});

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Session error handling middleware
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('session')) {
    console.error('[Session] Session error:', err.message);
    return res.status(500).render('error', {
      title: 'Session Error',
      message: 'A session error occurred. Please try refreshing the page.',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }
  next(err);
});
app.use(async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId);
      if (user) {
        req.session.username = user.username;
        req.session.avatar_path = user.avatar_path;
        if (user.email) req.session.email = user.email;
        res.locals.user = {
          id: user.id,
          username: user.username,
          avatar_path: user.avatar_path,
          email: user.email
        };
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  }
  res.locals.req = req;
  next();
});
app.use(function (req, res, next) {
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = uuidv4();
  }
  res.locals.csrfToken = tokens.create(req.session.csrfSecret);
  next();
});
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.use('/uploads', function (req, res, next) {
  res.header('Cache-Control', 'no-cache');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});
app.use(express.urlencoded({ extended: true, limit: '10gb' }));
app.use(express.json({ limit: '10gb' }));

// Request timeout middleware - prevent hanging requests
app.use((req, res, next) => {
  // Set timeout for all requests (60 seconds)
  req.setTimeout(60000, () => {
    console.error(`[Timeout] Request timeout: ${req.method} ${req.url}`);
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  
  res.setTimeout(60000, () => {
    console.error(`[Timeout] Response timeout: ${req.method} ${req.url}`);
  });
  
  next();
});

const csrfProtection = function (req, res, next) {
  if ((req.path === '/login' && req.method === 'POST') ||
    (req.path === '/setup-account' && req.method === 'POST')) {
    return next();
  }
  const token = req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  if (!token || !tokens.verify(req.session.csrfSecret, token)) {
    return res.status(403).render('error', {
      title: 'Error',
      error: 'CSRF validation failed. Please try again.'
    });
  }
  next();
};
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

const isAdmin = async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.redirect('/login');
    }
    
    const user = await User.findById(req.session.userId);
    if (!user || user.user_role !== 'admin') {
      return res.redirect('/dashboard');
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.redirect('/dashboard');
  }
};

// Permission middleware for member video access control
const canViewVideos = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/login');
    }
    // Admins always have permission
    if (user.user_role === 'admin') {
      req.user = user;
      return next();
    }
    // Check member permission
    if (user.can_view_videos !== 1) {
      req.viewPermissionDenied = true;
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('View permission middleware error:', error);
    next();
  }
};

const canDownloadVideos = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Admins always have permission
    if (user.user_role === 'admin') {
      req.user = user;
      return next();
    }
    // Check member permission
    if (user.can_download_videos !== 1) {
      return res.status(403).json({ success: false, message: "You don't have permission to download videos" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Download permission middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const canDeleteVideos = async (req, res, next) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // Admins always have permission
    if (user.user_role === 'admin') {
      req.user = user;
      return next();
    }
    // Check member permission
    if (user.can_delete_videos !== 1) {
      return res.status(403).json({ success: false, message: "You don't have permission to delete videos" });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Delete permission middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

app.use('/uploads', function (req, res, next) {
  res.header('Cache-Control', 'no-cache');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});
app.use('/uploads/avatars', (req, res, next) => {
  const file = path.join(__dirname, 'public', 'uploads', 'avatars', path.basename(req.path));
  if (fs.existsSync(file)) {
    const ext = path.extname(file).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    res.header('Content-Type', contentType);
    res.header('Cache-Control', 'max-age=60, must-revalidate');
    fs.createReadStream(file).pipe(res);
  } else {
    next();
  }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('login', {
      title: 'Login',
      error: 'Too many login attempts. Please try again in 15 minutes.'
    });
  },
  requestWasSuccessful: (request, response) => {
    return response.statusCode < 400;
  }
});
const loginDelayMiddleware = async (req, res, next) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  next();
};
app.get('/login', async (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  try {
    const usersExist = await checkIfUsersExist();
    if (!usersExist) {
      return res.redirect('/setup-account');
    }
    res.render('login', {
      title: 'Login',
      error: null
    });
  } catch (error) {
    console.error('Error checking for users:', error);
    res.render('login', {
      title: 'Login',
      error: 'System error. Please try again.'
    });
  }
});
app.post('/login', loginDelayMiddleware, loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findByUsername(username);
    if (!user) {
      return res.render('login', {
        title: 'Login',
        error: 'Invalid username or password'
      });
    }
    const passwordMatch = await User.verifyPassword(password, user.password);
    if (!passwordMatch) {
      return res.render('login', {
        title: 'Login',
        error: 'Invalid username or password'
      });
    }
    
    if (user.status !== 'active') {
      return res.render('login', {
        title: 'Login',
        error: 'Your account is not active. Please contact administrator for activation.'
      });
    }
    
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.avatar_path = user.avatar_path;
    req.session.user_role = user.user_role;
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', {
      title: 'Login',
      error: 'An error occurred during login. Please try again.'
    });
  }
});
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/signup', async (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  try {
    const usersExist = await checkIfUsersExist();
    if (!usersExist) {
      return res.redirect('/setup-account');
    }
    res.render('signup', {
      title: 'Sign Up',
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Error loading signup page:', error);
    res.render('signup', {
      title: 'Sign Up',
      error: 'System error. Please try again.',
      success: null
    });
  }
});

app.post('/signup', upload.single('avatar'), async (req, res) => {
  const { username, password, user_role, status } = req.body;
  
  try {
    if (!username || !password) {
      return res.render('signup', {
        title: 'Sign Up',
        error: 'Username and password are required',
        success: null
      });
    }

    if (password.length < 6) {
      return res.render('signup', {
        title: 'Sign Up',
        error: 'Password must be at least 6 characters long',
        success: null
      });
    }

    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.render('signup', {
        title: 'Sign Up',
        error: 'Username already exists',
        success: null
      });
    }

    let avatarPath = null;
    if (req.file) {
      avatarPath = `/uploads/avatars/${req.file.filename}`;
    }

    const newUser = await User.create({
      username,
      password,
      avatar_path: avatarPath,
      user_role: user_role || 'member',
      status: status || 'inactive'
    });

    if (newUser) {
      return res.render('signup', {
        title: 'Sign Up',
        error: null,
        success: 'Account created successfully! Please wait for admin approval to activate your account.'
      });
    } else {
      return res.render('signup', {
        title: 'Sign Up',
        error: 'Failed to create account. Please try again.',
        success: null
      });
    }
  } catch (error) {
    console.error('Signup error:', error);
    return res.render('signup', {
      title: 'Sign Up',
      error: 'An error occurred during registration. Please try again.',
      success: null
    });
  }
});

app.get('/setup-account', async (req, res) => {
  try {
    const usersExist = await checkIfUsersExist();
    if (usersExist && !req.session.userId) {
      return res.redirect('/login');
    }
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user && user.username) {
        return res.redirect('/dashboard');
      }
    }
    res.render('setup-account', {
      title: 'Complete Your Account',
      user: req.session.userId ? await User.findById(req.session.userId) : {},
      error: null
    });
  } catch (error) {
    console.error('Setup account error:', error);
    res.redirect('/login');
  }
});
app.post('/setup-account', upload.single('avatar'), [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.render('setup-account', {
        title: 'Complete Your Account',
        user: { username: req.body.username || '' },
        error: errors.array()[0].msg
      });
    }
    const existingUsername = await User.findByUsername(req.body.username);
    if (existingUsername) {
      return res.render('setup-account', {
        title: 'Complete Your Account',
        user: { email: req.body.email || '' },
        error: 'Username is already taken'
      });
    }
    const avatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    const usersExist = await checkIfUsersExist();
    if (!usersExist) {
      try {
        const user = await User.create({
          username: req.body.username,
          password: req.body.password,
          avatar_path: avatarPath,
          user_role: 'admin',
          status: 'active'
        });
        req.session.userId = user.id;
        req.session.username = req.body.username;
        req.session.user_role = user.user_role;
        if (avatarPath) {
          req.session.avatar_path = avatarPath;
        }
        console.log('Setup account - Using user ID from database:', user.id);
        console.log('Setup account - Session userId set to:', req.session.userId);
        return res.redirect('/dashboard');
      } catch (error) {
        console.error('User creation error:', error);
        return res.render('setup-account', {
          title: 'Complete Your Account',
          user: {},
          error: 'Failed to create user. Please try again.'
        });
      }
    } else {
      await User.update(req.session.userId, {
        username: req.body.username,
        password: req.body.password,
        avatar_path: avatarPath,
      });
      req.session.username = req.body.username;
      if (avatarPath) {
        req.session.avatar_path = avatarPath;
      }
      res.redirect('/dashboard');
    }
  } catch (error) {
    console.error('Account setup error:', error);
    res.render('setup-account', {
      title: 'Complete Your Account',
      user: { email: req.body.email || '' },
      error: 'An error occurred. Please try again.'
    });
  }
});
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Health check endpoint - no authentication required
// Used for monitoring if the application is running
app.get('/health', async (req, res) => {
  try {
    const activeStreams = streamingService.getActiveStreams();
    
    // Check database connectivity
    let dbStatus = { connected: false, latency: 0 };
    try {
      dbStatus = await checkConnectivity();
    } catch (dbErr) {
      dbStatus = { connected: false, latency: 0, error: dbErr.message };
    }
    
    // Determine overall status
    const components = {
      database: dbStatus.connected ? 'healthy' : 'unhealthy',
      streaming: 'healthy',
      scheduler: 'healthy'
    };
    
    const isHealthy = Object.values(components).every(s => s === 'healthy');
    const status = isHealthy ? 'ok' : 'degraded';
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      },
      database: {
        connected: dbStatus.connected,
        latency: dbStatus.latency
      },
      activeStreams: activeStreams.length,
      components
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
      components: {
        database: 'unknown',
        streaming: 'unknown',
        scheduler: 'unknown'
      }
    });
  }
});
app.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    res.render('dashboard', {
      title: 'Dashboard',
      active: 'dashboard',
      user: user
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.redirect('/login');
  }
});
app.get('/gallery', isAuthenticated, canViewVideos, async (req, res) => {
  try {
    const tab = req.query.tab || 'video';
    const user = await User.findById(req.session.userId);
    
    // Check view permission for members
    let videos = [];
    let viewPermissionDenied = false;
    
    if (user.user_role === 'admin' || user.can_view_videos === 1) {
      videos = await Video.findAll(req.session.userId);
    } else {
      viewPermissionDenied = true;
    }
    
    const audios = await Audio.findAll(req.session.userId);
    
    // Get user permissions for UI
    const permissions = {
      can_view_videos: user.user_role === 'admin' || user.can_view_videos === 1,
      can_download_videos: user.user_role === 'admin' || user.can_download_videos === 1,
      can_delete_videos: user.user_role === 'admin' || user.can_delete_videos === 1
    };
    
    res.render('gallery', {
      title: 'Media Gallery',
      active: 'gallery',
      user: user,
      videos: videos,
      audios: audios,
      activeTab: tab,
      permissions: permissions,
      viewPermissionDenied: viewPermissionDenied
    });
  } catch (error) {
    console.error('Gallery error:', error);
    res.redirect('/dashboard');
  }
});
app.get('/settings', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }
    res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: user
    });
  } catch (error) {
    console.error('Settings error:', error);
    res.redirect('/login');
  }
});
// Schedule page - shows all scheduled streams
app.get('/schedule', isAuthenticated, async (req, res) => {
  try {
    const streams = await Stream.findAllScheduled(req.session.userId);
    
    // Compute next run time for recurring streams
    streams.forEach(stream => {
      if (stream.schedule_type === 'daily' || stream.schedule_type === 'weekly') {
        stream.nextRunTime = Stream.getNextScheduledTime(stream);
      }
    });
    
    // Group streams by schedule type
    const grouped = Stream.groupByScheduleType(streams);
    
    // Filter today's schedules
    const todaySchedules = Stream.filterTodaySchedules(streams);
    
    res.render('schedule', {
      active: 'schedule',
      title: 'Schedule',
      streams: streams,
      grouped: grouped,
      todaySchedules: todaySchedules,
      helpers: app.locals.helpers
    });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load schedules',
      error: error
    });
  }
});

app.get('/history', isAuthenticated, async (req, res) => {
  try {
    const db = require('./db/database').db;
    const history = await new Promise((resolve, reject) => {
      db.all(
        `SELECT h.*, v.thumbnail_path 
         FROM stream_history h 
         LEFT JOIN videos v ON h.video_id = v.id 
         WHERE h.user_id = ? 
         ORDER BY h.start_time DESC`,
        [req.session.userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    res.render('history', {
      active: 'history',
      title: 'Stream History',
      history: history,
      helpers: app.locals.helpers
    });
  } catch (error) {
    console.error('Error fetching stream history:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load stream history',
      error: error
    });
  }
});
app.delete('/api/history/:id', isAuthenticated, async (req, res) => {
  try {
    const db = require('./db/database').db;
    const historyId = req.params.id;
    const history = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM stream_history WHERE id = ? AND user_id = ?',
        [historyId, req.session.userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    if (!history) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found or not authorized'
      });
    }
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM stream_history WHERE id = ?',
        [historyId],
        function (err) {
          if (err) reject(err);
          else resolve(this);
        }
      );
    });
    res.json({ success: true, message: 'History entry deleted' });
  } catch (error) {
    console.error('Error deleting history entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete history entry'
    });
  }
});

app.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.findAll();
    const SystemSettingsModel = require('./models/SystemSettings');
    const defaultLiveLimit = await SystemSettingsModel.getDefaultLiveLimit();
    
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const videoStats = await new Promise((resolve, reject) => {
        db.get(
          `SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as totalSize 
           FROM videos WHERE user_id = ?`,
          [user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      const streamStats = await new Promise((resolve, reject) => {
         db.get(
           `SELECT COUNT(*) as count FROM streams WHERE user_id = ?`,
           [user.id],
           (err, row) => {
             if (err) reject(err);
             else resolve(row);
           }
         );
       });
       
       const activeStreamStats = await new Promise((resolve, reject) => {
         db.get(
           `SELECT COUNT(*) as count FROM streams WHERE user_id = ? AND status = 'live'`,
           [user.id],
           (err, row) => {
             if (err) reject(err);
             else resolve(row);
           }
         );
       });
      
      const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };
      
      return {
         ...user,
         videoCount: videoStats.count,
         totalVideoSize: videoStats.totalSize > 0 ? formatFileSize(videoStats.totalSize) : null,
         streamCount: streamStats.count,
         activeStreamCount: activeStreamStats.count,
         defaultLiveLimit: defaultLiveLimit
       };
    }));
    
    res.render('users', {
      title: 'User Management',
      active: 'users',
      users: usersWithStats,
      user: req.user
    });
  } catch (error) {
    console.error('Users page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load users page',
      user: req.user
    });
  }
});

app.post('/api/users/status', isAdmin, async (req, res) => {
  try {
    const { userId, status } = req.body;
    
    if (!userId || !status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or status'
      });
    }

    if (userId == req.session.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own status'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.updateStatus(userId, status);
    
    res.json({
      success: true,
      message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

app.post('/api/users/role', isAdmin, async (req, res) => {
  try {
    const { userId, role } = req.body;
    
    if (!userId || !role || !['admin', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or role'
      });
    }

    if (userId == req.session.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own role'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.updateRole(userId, role);
    
    res.json({
      success: true,
      message: `User role updated to ${role} successfully`
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role'
    });
  }
});

app.post('/api/users/delete', isAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    if (userId == req.session.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.delete(userId);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

app.post('/api/users/update', isAdmin, upload.single('avatar'), async (req, res) => {
  try {
    const { userId, username, role, status, password, live_limit } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let avatarPath = user.avatar_path;
    if (req.file) {
      avatarPath = `/uploads/avatars/${req.file.filename}`;
    }

    const updateData = {
      username: username || user.username,
      user_role: role || user.user_role,
      status: status || user.status,
      avatar_path: avatarPath
    };

    // Handle live_limit - convert to null if empty/0, otherwise parse as integer
    if (live_limit !== undefined) {
      const parsedLimit = parseInt(live_limit, 10);
      updateData.live_limit = (isNaN(parsedLimit) || parsedLimit <= 0) ? null : parsedLimit;
    }

    if (password && password.trim() !== '') {
      const bcrypt = require('bcrypt');
      updateData.password = await bcrypt.hash(password, 10);
    }

    await User.updateProfile(userId, updateData);
    
    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

app.post('/api/users/create', isAdmin, upload.single('avatar'), async (req, res) => {
  try {
    const { username, role, status, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    let avatarPath = null;
    if (req.file) {
      avatarPath = `/uploads/avatars/${req.file.filename}`;
    }

    const userData = {
      username: username,
      password: password,
      user_role: role || 'member',
      status: status || 'active',
      avatar_path: avatarPath
    };

    const result = await User.create(userData);
    
    res.json({
      success: true,
      message: 'User created successfully',
      userId: result.id
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

app.get('/api/users/:id/videos', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const videos = await Video.findAll(userId);
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Get user videos error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user videos' });
  }
});

app.get('/api/users/:id/streams', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const streams = await Stream.findAll(userId);
    res.json({ success: true, streams });
  } catch (error) {
    console.error('Get user streams error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user streams' });
  }
});

// Permission Control API
app.post('/api/users/permission', isAdmin, async (req, res) => {
  try {
    const { userId, permission, value } = req.body;
    
    const validPermissions = ['can_view_videos', 'can_download_videos', 'can_delete_videos'];
    if (!userId || !permission || !validPermissions.includes(permission)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or permission type'
      });
    }

    if (userId === req.session.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify your own permissions'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await User.updatePermission(userId, permission, value);
    
    res.json({
      success: true,
      message: 'Permission updated successfully'
    });
  } catch (error) {
    console.error('Error updating permission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update permission'
    });
  }
});

app.post('/api/users/bulk-permissions', isAdmin, async (req, res) => {
  try {
    const { userIds, permissions } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No users selected'
      });
    }

    // Filter out admin's own ID
    const filteredUserIds = userIds.filter(id => id !== req.session.userId);
    if (filteredUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify your own permissions'
      });
    }

    const validPermissions = ['can_view_videos', 'can_download_videos', 'can_delete_videos'];
    const validatedPermissions = {};
    for (const [key, value] of Object.entries(permissions || {})) {
      if (validPermissions.includes(key)) {
        validatedPermissions[key] = value;
      }
    }

    if (Object.keys(validatedPermissions).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid permissions to update'
      });
    }

    const result = await User.bulkUpdatePermissions(filteredUserIds, validatedPermissions);
    
    res.json({
      success: true,
      message: `Permissions updated for ${result.updatedCount} users`,
      updatedCount: result.updatedCount
    });
  } catch (error) {
    console.error('Error bulk updating permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update permissions'
    });
  }
});

app.get('/api/users/:id/permissions', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const permissions = await User.getPermissions(userId);
    
    if (!permissions) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({ success: true, permissions });
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user permissions' });
  }
});

// Live Limit Settings API
const SystemSettings = require('./models/SystemSettings');
const LiveLimitService = require('./services/liveLimitService');

app.get('/api/settings/live-limit', isAdmin, async (req, res) => {
  try {
    const defaultLimit = await SystemSettings.getDefaultLiveLimit();
    res.json({ success: true, defaultLimit });
  } catch (error) {
    console.error('Get live limit error:', error);
    res.status(500).json({ success: false, message: 'Failed to get live limit' });
  }
});

app.post('/api/settings/live-limit', isAdmin, async (req, res) => {
  try {
    const { limit } = req.body;
    const parsedLimit = parseInt(limit, 10);
    
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Live limit must be at least 1' 
      });
    }
    
    await SystemSettings.setDefaultLiveLimit(parsedLimit);
    res.json({ success: true, message: 'Live limit updated successfully', limit: parsedLimit });
  } catch (error) {
    console.error('Set live limit error:', error);
    res.status(500).json({ success: false, message: 'Failed to update live limit' });
  }
});

app.get('/api/streams/limit-info', isAuthenticated, async (req, res) => {
  try {
    const limitInfo = await LiveLimitService.validateAndGetInfo(req.session.userId);
    res.json({ success: true, ...limitInfo });
  } catch (error) {
    console.error('Get limit info error:', error);
    res.status(500).json({ success: false, message: 'Failed to get limit info' });
  }
});

app.get('/api/system-stats', isAuthenticated, async (req, res) => {
  try {
    const stats = await systemMonitor.getSystemStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  Object.keys(interfaces).forEach((ifname) => {
    interfaces[ifname].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    });
  });
  return addresses.length > 0 ? addresses : ['localhost'];
}
app.post('/settings/profile', isAuthenticated, upload.single('avatar'), [
  body('username')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('settings', {
        title: 'Settings',
        active: 'settings',
        user: await User.findById(req.session.userId),
        error: errors.array()[0].msg,
        activeTab: 'profile'
      });
    }
    const currentUser = await User.findById(req.session.userId);
    if (req.body.username !== currentUser.username) {
      const existingUser = await User.findByUsername(req.body.username);
      if (existingUser) {
        return res.render('settings', {
          title: 'Settings',
          active: 'settings',
          user: currentUser,
          error: 'Username is already taken',
          activeTab: 'profile'
        });
      }
    }
    const updateData = {
      username: req.body.username
    };
    if (req.file) {
      updateData.avatar_path = `/uploads/avatars/${req.file.filename}`;
    }
    await User.update(req.session.userId, updateData);
    req.session.username = updateData.username;
    if (updateData.avatar_path) {
      req.session.avatar_path = updateData.avatar_path;
    }
    return res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: await User.findById(req.session.userId),
      success: 'Profile updated successfully!',
      activeTab: 'profile'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: await User.findById(req.session.userId),
      error: 'An error occurred while updating your profile',
      activeTab: 'profile'
    });
  }
});
app.post('/settings/password', isAuthenticated, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('settings', {
        title: 'Settings',
        active: 'settings',
        user: await User.findById(req.session.userId),
        error: errors.array()[0].msg,
        activeTab: 'security'
      });
    }
    const user = await User.findById(req.session.userId);
    const passwordMatch = await User.verifyPassword(req.body.currentPassword, user.password);
    if (!passwordMatch) {
      return res.render('settings', {
        title: 'Settings',
        active: 'settings',
        user: user,
        error: 'Current password is incorrect',
        activeTab: 'security'
      });
    }
    const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
    await User.update(req.session.userId, { password: hashedPassword });
    return res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: await User.findById(req.session.userId),
      success: 'Password changed successfully',
      activeTab: 'security'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: await User.findById(req.session.userId),
      error: 'An error occurred while changing your password',
      activeTab: 'security'
    });
  }
});
app.get('/settings', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }
    res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: user
    });
  } catch (error) {
    console.error('Settings error:', error);
    res.redirect('/dashboard');
  }
});
app.post('/settings/integrations/gdrive', isAuthenticated, [
  body('apiKey').notEmpty().withMessage('API Key is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('settings', {
        title: 'Settings',
        active: 'settings',
        user: await User.findById(req.session.userId),
        error: errors.array()[0].msg,
        activeTab: 'integrations'
      });
    }
    await User.update(req.session.userId, {
      gdrive_api_key: req.body.apiKey
    });
    return res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: await User.findById(req.session.userId),
      success: 'Google Drive API key saved successfully!',
      activeTab: 'integrations'
    });
  } catch (error) {
    console.error('Error saving Google Drive API key:', error);
    res.render('settings', {
      title: 'Settings',
      active: 'settings',
      user: await User.findById(req.session.userId),
      error: 'An error occurred while saving your Google Drive API key',
      activeTab: 'integrations'
    });
  }
});
app.post('/upload/video', isAuthenticated, uploadVideo.single('video'), async (req, res) => {
  try {
    console.log('Upload request received:', req.file);
    console.log('Session userId for upload:', req.session.userId);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    const { filename, originalname, path: videoPath, mimetype, size } = req.file;
    const thumbnailName = path.basename(filename, path.extname(filename)) + '.jpg';
    const videoInfo = await getVideoInfo(videoPath);
    const thumbnailRelativePath = await generateThumbnail(videoPath, thumbnailName)
      .then(() => `/uploads/thumbnails/${thumbnailName}`)
      .catch(() => null);
    let format = 'unknown';
    if (mimetype === 'video/mp4') format = 'mp4';
    else if (mimetype === 'video/avi') format = 'avi';
    else if (mimetype === 'video/quicktime') format = 'mov';
    const videoData = {
      title: path.basename(originalname, path.extname(originalname)),
      original_filename: originalname,
      filepath: `/uploads/videos/${filename}`,
      thumbnail_path: thumbnailRelativePath,
      file_size: size,
      duration: videoInfo.duration,
      format: format,
      user_id: req.session.userId
    };
    const video = await Video.create(videoData);
    res.json({
      success: true,
      video: {
        id: video.id,
        title: video.title,
        filepath: video.filepath,
        thumbnail_path: video.thumbnail_path,
        duration: video.duration,
        file_size: video.file_size,
        format: video.format
      }
    });
  } catch (error) {
    console.error('Upload error details:', error);
    res.status(500).json({ 
      error: 'Failed to upload video',
      details: error.message 
    });
  }
});
app.post('/api/videos/upload', isAuthenticated, (req, res, next) => {
  uploadVideo.single('video')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          success: false, 
          error: 'File too large. Maximum size is 10GB.' 
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ 
          success: false, 
          error: 'Unexpected file field.' 
        });
      }
      return res.status(400).json({ 
        success: false, 
        error: err.message 
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No video file provided' 
      });
    }
    let title = path.parse(req.file.originalname).name;
    const filePath = `/uploads/videos/${req.file.filename}`;
    const fullFilePath = path.join(__dirname, 'public', filePath);
    const fileSize = req.file.size;
    await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(fullFilePath, (err, metadata) => {
        if (err) {
          console.error('Error extracting metadata:', err);
          return reject(err);
        }
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const duration = metadata.format.duration || 0;
        const format = metadata.format.format_name || '';
        const resolution = videoStream ? `${videoStream.width}x${videoStream.height}` : '';
        const bitrate = metadata.format.bit_rate ?
          Math.round(parseInt(metadata.format.bit_rate) / 1000) :
          null;
        let fps = null;
        if (videoStream && videoStream.avg_frame_rate) {
          const fpsRatio = videoStream.avg_frame_rate.split('/');
          if (fpsRatio.length === 2 && parseInt(fpsRatio[1]) !== 0) {
            fps = Math.round((parseInt(fpsRatio[0]) / parseInt(fpsRatio[1]) * 100)) / 100;
          } else {
            fps = parseInt(fpsRatio[0]) || null;
          }
        }
        const thumbnailFilename = `thumb-${path.parse(req.file.filename).name}.jpg`;
        const thumbnailPath = `/uploads/thumbnails/${thumbnailFilename}`;
        const fullThumbnailPath = path.join(__dirname, 'public', thumbnailPath);
        ffmpeg(fullFilePath)
          .screenshots({
            timestamps: ['10%'],
            filename: thumbnailFilename,
            folder: path.join(__dirname, 'public', 'uploads', 'thumbnails'),
            size: '854x480'
          })
          .on('end', async () => {
            try {
              const videoData = {
                title,
                filepath: filePath,
                thumbnail_path: thumbnailPath,
                file_size: fileSize,
                duration,
                format,
                resolution,
                bitrate,
                fps,
                user_id: req.session.userId
              };
              const video = await Video.create(videoData);
              res.json({
                success: true,
                message: 'Video uploaded successfully',
                video
              });
              resolve();
            } catch (dbError) {
              console.error('Database error:', dbError);
              reject(dbError);
            }
          })
          .on('error', (err) => {
            console.error('Error creating thumbnail:', err);
            reject(err);
          });
      });
    });
  } catch (error) {
    console.error('Upload error details:', error);
    res.status(500).json({ 
      error: 'Failed to upload video',
      details: error.message 
    });
  }
});
app.get('/api/videos', isAuthenticated, async (req, res) => {
  try {
    const videos = await Video.findAll(req.session.userId);
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch videos' });
  }
});
app.delete('/api/videos/:id', isAuthenticated, canDeleteVideos, async (req, res) => {
  try {
    const videoId = req.params.id;
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    if (video.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const videoPath = path.join(__dirname, 'public', video.filepath);
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
    if (video.thumbnail_path) {
      const thumbnailPath = path.join(__dirname, 'public', video.thumbnail_path);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }
    await Video.delete(videoId, req.session.userId);
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ success: false, error: 'Failed to delete video' });
  }
});
// Video download endpoint with permission check
app.get('/api/videos/:id/download', isAuthenticated, canDownloadVideos, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }
    // Admin can download any video, members can only download their own
    if (req.user.user_role !== 'admin' && video.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const videoPath = path.join(__dirname, 'public', video.filepath);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ success: false, error: 'Video file not found' });
    }
    res.download(videoPath, video.title + path.extname(video.filepath));
  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(500).json({ success: false, error: 'Failed to download video' });
  }
});

app.post('/api/videos/:id/rename', isAuthenticated, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    if (video.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You don\'t have permission to rename this video' });
    }
    await Video.update(req.params.id, { title: req.body.title });
    res.json({ success: true, message: 'Video renamed successfully' });
  } catch (error) {
    console.error('Error renaming video:', error);
    res.status(500).json({ error: 'Failed to rename video' });
  }
});
app.get('/stream/:videoId', isAuthenticated, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).send('Video not found');
    }
    if (video.user_id !== req.session.userId) {
      return res.status(403).send('You do not have permission to access this video');
    }
    const videoPath = path.join(__dirname, 'public', video.filepath);
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).send('Error streaming video');
  }
});
app.get('/api/settings/gdrive-status', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    res.json({
      hasApiKey: !!user.gdrive_api_key,
      message: user.gdrive_api_key ? 'Google Drive API key is configured' : 'No Google Drive API key found'
    });
  } catch (error) {
    console.error('Error checking Google Drive API status:', error);
    res.status(500).json({ error: 'Failed to check API key status' });
  }
});
app.post('/api/settings/gdrive-api-key', isAuthenticated, [
  body('apiKey').notEmpty().withMessage('API Key is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }
    await User.update(req.session.userId, {
      gdrive_api_key: req.body.apiKey
    });
    return res.json({
      success: true,
      message: 'Google Drive API key saved successfully!'
    });
  } catch (error) {
    console.error('Error saving Google Drive API key:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while saving your Google Drive API key'
    });
  }
});
app.post('/api/videos/import-drive', isAuthenticated, [
  body('driveUrl').notEmpty().withMessage('Google Drive URL is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const { driveUrl } = req.body;
    const { extractFileId, downloadFile } = require('./utils/googleDriveService');
    try {
      const fileId = extractFileId(driveUrl);
      const jobId = uuidv4();
      processGoogleDriveImport(jobId, fileId, req.session.userId)
        .catch(err => console.error('Drive import failed:', err));
      return res.json({
        success: true,
        message: 'Video import started',
        jobId: jobId
      });
    } catch (error) {
      console.error('Google Drive URL parsing error:', error);
      return res.status(400).json({
        success: false,
        error: 'Invalid Google Drive URL format'
      });
    }
  } catch (error) {
    console.error('Error importing from Google Drive:', error);
    res.status(500).json({ success: false, error: 'Failed to import video' });
  }
});
app.get('/api/videos/import-status/:jobId', isAuthenticated, async (req, res) => {
  const jobId = req.params.jobId;
  if (!importJobs[jobId]) {
    return res.status(404).json({ success: false, error: 'Import job not found' });
  }
  return res.json({
    success: true,
    status: importJobs[jobId]
  });
});
const importJobs = {};
async function processGoogleDriveImport(jobId, fileId, userId) {
  const { downloadFile } = require('./utils/googleDriveService');
  const { getVideoInfo, generateThumbnail } = require('./utils/videoProcessor');
  const ffmpeg = require('fluent-ffmpeg');
  
  importJobs[jobId] = {
    status: 'downloading',
    progress: 0,
    message: 'Starting download...'
  };
  
  try {
    const result = await downloadFile(fileId, (progress) => {
      importJobs[jobId] = {
        status: 'downloading',
        progress: progress.progress,
        message: `Downloading ${progress.filename}: ${progress.progress}%`
      };
    });
    
    importJobs[jobId] = {
      status: 'processing',
      progress: 100,
      message: 'Processing video...'
    };
    
    const videoInfo = await getVideoInfo(result.localFilePath);
    
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(result.localFilePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata);
      });
    });
    
    let resolution = '';
    let bitrate = null;
    
    const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
    if (videoStream) {
      resolution = `${videoStream.width}x${videoStream.height}`;
    }
    
    if (metadata.format && metadata.format.bit_rate) {
      bitrate = Math.round(parseInt(metadata.format.bit_rate) / 1000);
    }
    
    const thumbnailName = path.basename(result.filename, path.extname(result.filename)) + '.jpg';
    const thumbnailRelativePath = await generateThumbnail(result.localFilePath, thumbnailName)
      .then(() => `/uploads/thumbnails/${thumbnailName}`)
      .catch(() => null);
    
    let format = path.extname(result.filename).toLowerCase().replace('.', '');
    if (!format) format = 'mp4';
    
    const videoData = {
      title: path.basename(result.originalFilename, path.extname(result.originalFilename)),
      filepath: `/uploads/videos/${result.filename}`,
      thumbnail_path: thumbnailRelativePath,
      file_size: result.fileSize,
      duration: videoInfo.duration,
      format: format,
      resolution: resolution,
      bitrate: bitrate,
      user_id: userId
    };
    
    const video = await Video.create(videoData);
    
    importJobs[jobId] = {
      status: 'complete',
      progress: 100,
      message: 'Video imported successfully',
      videoId: video.id
    };
    setTimeout(() => {
      delete importJobs[jobId];
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error('Error processing Google Drive import:', error);
    importJobs[jobId] = {
      status: 'failed',
      progress: 0,
      message: error.message || 'Failed to import video'
    };
    setTimeout(() => {
      delete importJobs[jobId];
    }, 5 * 60 * 1000);
  }
}
app.get('/api/stream/videos', isAuthenticated, async (req, res) => {
  try {
    const videos = await Video.findAll(req.session.userId);
    const formattedVideos = videos.map(video => {
      const duration = video.duration ? Math.floor(video.duration) : 0;
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      return {
        id: video.id,
        name: video.title,
        thumbnail: video.thumbnail_path,
        resolution: video.resolution || '1280x720',
        duration: formattedDuration,
        url: `/stream/${video.id}`,
        type: 'video'
      };
    });
    res.json(formattedVideos);
  } catch (error) {
    console.error('Error fetching videos for stream:', error);
    res.status(500).json({ error: 'Failed to load videos' });
  }
});

app.get('/api/stream/content', isAuthenticated, async (req, res) => {
  try {
    const videos = await Video.findAll(req.session.userId);
    const formattedVideos = videos.map(video => {
      const duration = video.duration ? Math.floor(video.duration) : 0;
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      return {
        id: video.id,
        name: video.title,
        thumbnail: video.thumbnail_path,
        resolution: video.resolution || '1280x720',
        duration: formattedDuration,
        url: `/stream/${video.id}`,
        type: 'video'
      };
    });

    const playlists = await Playlist.findAll(req.session.userId);
    const formattedPlaylists = playlists.map(playlist => {
      return {
        id: playlist.id,
        name: playlist.name,
        thumbnail: '/images/playlist-thumbnail.svg',
        resolution: 'Playlist',
        duration: `${playlist.video_count || 0} videos`,
        url: `/playlist/${playlist.id}`,
        type: 'playlist',
        description: playlist.description,
        is_shuffle: playlist.is_shuffle
      };
    });

    const allContent = [...formattedPlaylists, ...formattedVideos];
    
    res.json(allContent);
  } catch (error) {
    console.error('Error fetching content for stream:', error);
    res.status(500).json({ error: 'Failed to load content' });
  }
});

// API endpoint for fetching audio list for stream modal
app.get('/api/stream/audios', isAuthenticated, async (req, res) => {
  try {
    const audios = await Audio.findAll(req.session.userId);
    const formattedAudios = audios.map(audio => {
      let formattedDuration = 'Unknown';
      if (audio.duration) {
        const duration = Math.floor(audio.duration);
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      return {
        id: audio.id,
        title: audio.title,
        name: audio.title,
        duration: formattedDuration,
        format: audio.format || 'audio',
        filepath: audio.filepath
      };
    });
    res.json(formattedAudios);
  } catch (error) {
    console.error('Error fetching audios for stream:', error);
    res.status(500).json({ error: 'Failed to load audios' });
  }
});

const Stream = require('./models/Stream');
const { title } = require('process');

// API endpoint for schedules (used by dashboard modal)
app.get('/api/schedules', isAuthenticated, async (req, res) => {
  try {
    const type = req.query.type || 'once';
    const allSchedules = await Stream.findAllScheduled(req.session.userId);
    
    // Filter by type
    const schedules = allSchedules.filter(s => s.schedule_type === type);
    
    // Add nextRunTime for recurring schedules
    schedules.forEach(stream => {
      if (stream.schedule_type === 'daily' || stream.schedule_type === 'weekly') {
        stream.nextRunTime = Stream.getNextScheduledTime(stream);
      }
    });
    
    res.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch schedules' });
  }
});

app.get('/api/streams', isAuthenticated, async (req, res) => {
  try {
    const filter = req.query.filter;
    const streams = await Stream.findAll(req.session.userId, filter);
    res.json({ success: true, streams });
  } catch (error) {
    console.error('Error fetching streams:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch streams' });
  }
});
app.post('/api/streams', isAuthenticated, [
  body('streamTitle').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('rtmpUrl').trim().isLength({ min: 1 }).withMessage('RTMP URL is required'),
  body('streamKey').trim().isLength({ min: 1 }).withMessage('Stream key is required')
], async (req, res) => {
  try {
    console.log('Session userId for stream creation:', req.session.userId);
    console.log('[API] Received stream data:', JSON.stringify({
      scheduleType: req.body.scheduleType,
      recurringTime: req.body.recurringTime,
      recurringEnabled: req.body.recurringEnabled,
      scheduleDays: req.body.scheduleDays
    }));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    let platform = 'Custom';
    let platform_icon = 'ti-broadcast';
    if (req.body.rtmpUrl.includes('youtube.com')) {
      platform = 'YouTube';
      platform_icon = 'ti-brand-youtube';
    } else if (req.body.rtmpUrl.includes('facebook.com')) {
      platform = 'Facebook';
      platform_icon = 'ti-brand-facebook';
    } else if (req.body.rtmpUrl.includes('twitch.tv')) {
      platform = 'Twitch';
      platform_icon = 'ti-brand-twitch';
    } else if (req.body.rtmpUrl.includes('tiktok.com')) {
      platform = 'TikTok';
      platform_icon = 'ti-brand-tiktok';
    } else if (req.body.rtmpUrl.includes('instagram.com')) {
      platform = 'Instagram';
      platform_icon = 'ti-brand-instagram';
    } else if (req.body.rtmpUrl.includes('shopee.io')) {
      platform = 'Shopee Live';
      platform_icon = 'ti-brand-shopee';
    } else if (req.body.rtmpUrl.includes('restream.io')) {
      platform = 'Restream.io';
      platform_icon = 'ti-live-photo';
    }
    // Parse schedule days if provided
    let scheduleDays = null;
    if (req.body.scheduleDays) {
      try {
        scheduleDays = typeof req.body.scheduleDays === 'string' 
          ? JSON.parse(req.body.scheduleDays) 
          : req.body.scheduleDays;
      } catch (e) {
        scheduleDays = null;
      }
    }
    
    const streamData = {
      title: req.body.streamTitle,
      video_id: req.body.videoId || null,
      audio_id: req.body.audioId || null,
      rtmp_url: req.body.rtmpUrl,
      stream_key: req.body.streamKey,
      platform,
      platform_icon,
      bitrate: parseInt(req.body.bitrate) || 2500,
      resolution: req.body.resolution || '1280x720',
      fps: parseInt(req.body.fps) || 30,
      orientation: req.body.orientation || 'horizontal',
      loop_video: req.body.loopVideo === 'true' || req.body.loopVideo === true,
      // Duration in minutes (stored as stream_duration_minutes in DB)
      stream_duration_minutes: (() => {
        const hours = parseInt(req.body.streamDurationHours) || 0;
        const minutes = parseInt(req.body.streamDurationMinutes) || 0;
        const totalMinutes = (hours * 60) + minutes;
        console.log(`[API] Duration calculation: ${hours}h + ${minutes}m = ${totalMinutes} total minutes`);
        return totalMinutes > 0 ? totalMinutes : null;
      })(),
      // Recurring schedule fields
      schedule_type: req.body.scheduleType || 'once',
      schedule_days: scheduleDays,
      recurring_time: req.body.recurringTime || null,
      recurring_enabled: req.body.recurringEnabled === 'true' || req.body.recurringEnabled === true,
      user_id: req.session.userId
    };
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    function parseLocalDateTime(dateTimeString) {
      const [datePart, timePart] = dateTimeString.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      return new Date(year, month - 1, day, hours, minutes);
    }
    
    if (req.body.scheduleStartTime) {
      const scheduleStartDate = parseLocalDateTime(req.body.scheduleStartTime);
      streamData.schedule_time = scheduleStartDate.toISOString();
      streamData.status = 'scheduled';
      
      if (req.body.scheduleEndTime) {
        const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);
        
        if (scheduleEndDate <= scheduleStartDate) {
          return res.status(400).json({ 
            success: false, 
            error: 'End time must be after start time' 
          });
        }
        
        streamData.end_time = scheduleEndDate.toISOString();
        const durationMs = scheduleEndDate - scheduleStartDate;
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        streamData.duration = durationMinutes > 0 ? durationMinutes : null;
      }
    } else if (req.body.scheduleEndTime) {
      const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);
      streamData.end_time = scheduleEndDate.toISOString();
    }
    
    // Set status based on schedule type
    if (!streamData.status) {
      if (streamData.schedule_type === 'daily' || streamData.schedule_type === 'weekly') {
        // Recurring schedules should be 'scheduled' status
        streamData.status = 'scheduled';
      } else {
        streamData.status = 'offline';
      }
    }
    
    console.log(`[API] Creating stream with schedule_type=${streamData.schedule_type}, recurring_time=${streamData.recurring_time}, recurring_enabled=${streamData.recurring_enabled}, status=${streamData.status}`);
    
    const stream = await Stream.create(streamData);
    res.json({ success: true, stream });
  } catch (error) {
    console.error('Error creating stream:', error);
    res.status(500).json({ success: false, error: 'Failed to create stream' });
  }
});

// Stream Settings Backup - Export endpoint (MUST be before :id routes)
const backupService = require('./services/backupService');

app.get('/api/streams/export', isAuthenticated, async (req, res) => {
  try {
    const backupData = await backupService.exportStreams(req.session.userId);
    const filename = `streamflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    console.error('Error exporting streams:', error);
    res.status(500).json({ success: false, error: 'Failed to export stream settings' });
  }
});

// Stream Settings Backup - Import endpoint
app.post('/api/streams/import', isAuthenticated, uploadBackup.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Read and parse the uploaded file
    const fileContent = req.file.buffer.toString('utf8');
    let backupData;
    
    try {
      backupData = JSON.parse(fileContent);
    } catch (parseError) {
      return res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }

    // Import streams
    const result = await backupService.importStreams(backupData, req.session.userId);
    
    res.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      message: `Successfully imported ${result.imported} stream(s). ${result.skipped} skipped.`
    });
  } catch (error) {
    console.error('Error importing streams:', error);
    res.status(500).json({ success: false, error: 'Failed to import stream settings' });
  }
});

// Stream Settings - Reset all streams to original imported settings
app.post('/api/streams/reset-all', isAuthenticated, async (req, res) => {
  try {
    const result = await Stream.resetAllToOriginal(req.session.userId);
    
    res.json({
      success: true,
      resetCount: result.resetCount,
      skippedCount: result.skippedCount,
      message: `Reset ${result.resetCount} stream(s) to original settings. ${result.skippedCount} skipped.`
    });
  } catch (error) {
    console.error('Error resetting streams:', error);
    res.status(500).json({ success: false, error: 'Failed to reset stream settings' });
  }
});

app.get('/api/streams/:id', isAuthenticated, async (req, res) => {
  try {
    const stream = await Stream.getStreamWithVideo(req.params.id);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to access this stream' });
    }
    res.json({ success: true, stream });
  } catch (error) {
    console.error('Error fetching stream:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stream' });
  }
});
app.put('/api/streams/:id', isAuthenticated, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this stream' });
    }
    const updateData = {};
    if (req.body.streamTitle) updateData.title = req.body.streamTitle;
    if (req.body.videoId) updateData.video_id = req.body.videoId;
    
    if (req.body.rtmpUrl) {
      updateData.rtmp_url = req.body.rtmpUrl;
      
      let platform = 'Custom';
      let platform_icon = 'ti-broadcast';
      if (req.body.rtmpUrl.includes('youtube.com')) {
        platform = 'YouTube';
        platform_icon = 'ti-brand-youtube';
      } else if (req.body.rtmpUrl.includes('facebook.com')) {
        platform = 'Facebook';
        platform_icon = 'ti-brand-facebook';
      } else if (req.body.rtmpUrl.includes('twitch.tv')) {
        platform = 'Twitch';
        platform_icon = 'ti-brand-twitch';
      } else if (req.body.rtmpUrl.includes('tiktok.com')) {
        platform = 'TikTok';
        platform_icon = 'ti-brand-tiktok';
      } else if (req.body.rtmpUrl.includes('instagram.com')) {
        platform = 'Instagram';
        platform_icon = 'ti-brand-instagram';
      } else if (req.body.rtmpUrl.includes('shopee.io')) {
        platform = 'Shopee Live';
        platform_icon = 'ti-brand-shopee';
      } else if (req.body.rtmpUrl.includes('restream.io')) {
        platform = 'Restream.io';
        platform_icon = 'ti-live-photo';
      }
      updateData.platform = platform;
      updateData.platform_icon = platform_icon;
    }
    
    if (req.body.streamKey) updateData.stream_key = req.body.streamKey;
    if (req.body.bitrate) updateData.bitrate = parseInt(req.body.bitrate);
    if (req.body.resolution) updateData.resolution = req.body.resolution;
    if (req.body.fps) updateData.fps = parseInt(req.body.fps);
    if (req.body.orientation) updateData.orientation = req.body.orientation;
    if (req.body.loopVideo !== undefined) {
      updateData.loop_video = req.body.loopVideo === 'true' || req.body.loopVideo === true;
    }
    if (req.body.useAdvancedSettings !== undefined) {
      updateData.use_advanced_settings = req.body.useAdvancedSettings === 'true' || req.body.useAdvancedSettings === true;
    }
    
    // Handle stream duration (in minutes - new format: hours + minutes)
    if (req.body.streamDurationHours !== undefined || req.body.streamDurationMinutes !== undefined) {
      const hours = parseInt(req.body.streamDurationHours) || 0;
      const minutes = parseInt(req.body.streamDurationMinutes) || 0;
      const totalMinutes = (hours * 60) + minutes;
      updateData.stream_duration_minutes = totalMinutes > 0 ? totalMinutes : null;
    }
    
    // Handle audio selection
    if (req.body.audioId !== undefined) {
      updateData.audio_id = req.body.audioId || null;
    }
    
    // Handle recurring schedule fields
    if (req.body.scheduleType !== undefined) {
      updateData.schedule_type = req.body.scheduleType || 'once';
    }
    if (req.body.recurringTime !== undefined) {
      updateData.recurring_time = req.body.recurringTime || null;
    }
    if (req.body.scheduleDays !== undefined) {
      try {
        const days = typeof req.body.scheduleDays === 'string' 
          ? JSON.parse(req.body.scheduleDays) 
          : req.body.scheduleDays;
        updateData.schedule_days = days ? JSON.stringify(days) : null;
      } catch (e) {
        updateData.schedule_days = null;
      }
    }
    if (req.body.recurringEnabled !== undefined) {
      updateData.recurring_enabled = req.body.recurringEnabled === 'true' || req.body.recurringEnabled === true ? 1 : 0;
    }
    
    // Set status to scheduled for recurring schedules
    if (updateData.schedule_type && (updateData.schedule_type === 'daily' || updateData.schedule_type === 'weekly')) {
      updateData.status = 'scheduled';
    }
    
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    function parseLocalDateTime(dateTimeString) {
      const [datePart, timePart] = dateTimeString.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      return new Date(year, month - 1, day, hours, minutes);
    }
    
    if (req.body.scheduleStartTime) {
      const scheduleStartDate = parseLocalDateTime(req.body.scheduleStartTime);
      updateData.schedule_time = scheduleStartDate.toISOString();
      updateData.status = 'scheduled';
      
      if (req.body.scheduleEndTime) {
        const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);
        
        if (scheduleEndDate <= scheduleStartDate) {
          return res.status(400).json({ 
            success: false, 
            error: 'End time must be after start time' 
          });
        }
        
        updateData.end_time = scheduleEndDate.toISOString();
        const durationMs = scheduleEndDate - scheduleStartDate;
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        updateData.duration = durationMinutes > 0 ? durationMinutes : null;
      } else if ('scheduleEndTime' in req.body && req.body.scheduleEndTime === '') {
        updateData.end_time = null;
        updateData.duration = null;
      }
    } else if ('scheduleStartTime' in req.body && !req.body.scheduleStartTime) {
      updateData.schedule_time = null;
      // FIXED: Only set to offline if not a recurring schedule
      // For recurring schedules (daily/weekly), keep status as 'scheduled'
      const scheduleType = updateData.schedule_type || stream.schedule_type;
      if (scheduleType === 'daily' || scheduleType === 'weekly') {
        updateData.status = 'scheduled';
      } else {
        updateData.status = 'offline';
      }
      
      if (req.body.scheduleEndTime) {
        const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);
        updateData.end_time = scheduleEndDate.toISOString();
      } else if ('scheduleEndTime' in req.body && req.body.scheduleEndTime === '') {
        updateData.end_time = null;
        updateData.duration = null;
      }
    } else if (req.body.scheduleEndTime) {
      const scheduleEndDate = parseLocalDateTime(req.body.scheduleEndTime);
      updateData.end_time = scheduleEndDate.toISOString();
    } else if ('scheduleEndTime' in req.body && req.body.scheduleEndTime === '') {
      updateData.end_time = null;
      updateData.duration = null;
    }
    
    const updatedStream = await Stream.update(req.params.id, updateData);
    res.json({ success: true, stream: updatedStream });
  } catch (error) {
    console.error('Error updating stream:', error);
    res.status(500).json({ success: false, error: 'Failed to update stream' });
  }
});
// Delete all streams for current user
app.delete('/api/streams/all', isAuthenticated, async (req, res) => {
  try {
    const streams = await Stream.findByUserId(req.session.userId);
    let deletedCount = 0;
    
    for (const stream of streams) {
      // Stop stream if live
      if (stream.status === 'live') {
        try {
          await streamingService.stopStream(stream.id);
        } catch (e) {
          console.error('Error stopping stream during delete all:', e);
        }
      }
      await Stream.delete(stream.id, req.session.userId);
      deletedCount++;
    }
    
    res.json({ success: true, deleted: deletedCount, message: `Deleted ${deletedCount} stream(s)` });
  } catch (error) {
    console.error('Error deleting all streams:', error);
    res.status(500).json({ success: false, error: 'Failed to delete all streams' });
  }
});

app.delete('/api/streams/:id', isAuthenticated, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this stream' });
    }
    await Stream.delete(req.params.id, req.session.userId);
    res.json({ success: true, message: 'Stream deleted successfully' });
  } catch (error) {
    console.error('Error deleting stream:', error);
    res.status(500).json({ success: false, error: 'Failed to delete stream' });
  }
});
app.post('/api/streams/:id/status', isAuthenticated, [
  body('status').isIn(['live', 'offline', 'scheduled']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const streamId = req.params.id;
    const stream = await Stream.findById(streamId);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const newStatus = req.body.status;
    if (newStatus === 'live') {
      if (stream.status === 'live') {
        return res.json({
          success: false,
          error: 'Stream is already live',
          stream
        });
      }
      if (!stream.video_id) {
        return res.json({
          success: false,
          error: 'No video attached to this stream',
          stream
        });
      }
      const result = await streamingService.startStream(streamId);
      if (result.success) {
        const updatedStream = await Stream.getStreamWithVideo(streamId);
        return res.json({
          success: true,
          stream: updatedStream,
          isAdvancedMode: result.isAdvancedMode
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error || 'Failed to start stream'
        });
      }
    } else if (newStatus === 'offline') {
      if (stream.status === 'live') {
        const result = await streamingService.stopStream(streamId);
        if (!result.success) {
          console.warn('Failed to stop FFmpeg process:', result.error);
        }
        await Stream.update(streamId, {
          schedule_time: null
        });
        console.log(`Reset schedule_time for stopped stream ${streamId}`);
      } else if (stream.status === 'scheduled') {
        await Stream.update(streamId, {
          schedule_time: null,
          status: 'offline'
        });
        console.log(`Scheduled stream ${streamId} was cancelled`);
      }
      const result = await Stream.updateStatus(streamId, 'offline', req.session.userId);
      if (!result.updated) {
        return res.status(404).json({
          success: false,
          error: 'Stream not found or not updated'
        });
      }
      return res.json({ success: true, stream: result });
    } else {
      const result = await Stream.updateStatus(streamId, newStatus, req.session.userId);
      if (!result.updated) {
        return res.status(404).json({
          success: false,
          error: 'Stream not found or not updated'
        });
      }
      return res.json({ success: true, stream: result });
    }
  } catch (error) {
    console.error('Error updating stream status:', error);
    res.status(500).json({ success: false, error: 'Failed to update stream status' });
  }
});
// Start stream endpoint
app.post('/api/streams/:id/start', isAuthenticated, async (req, res) => {
  try {
    const streamId = req.params.id;
    const stream = await Stream.findById(streamId);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if (stream.status === 'live') {
      return res.json({ success: false, error: 'Stream is already live' });
    }
    if (!stream.video_id) {
      return res.json({ success: false, error: 'No video attached to this stream' });
    }
    const result = await streamingService.startStream(streamId);
    if (result.success) {
      const updatedStream = await Stream.getStreamWithVideo(streamId);
      return res.json({ success: true, stream: updatedStream });
    } else {
      // Check if limit reached
      if (result.limitReached) {
        return res.status(403).json({ 
          success: false, 
          error: result.error || 'Hubungi Admin Untuk Menambah Limit',
          limitReached: true,
          activeStreams: result.activeStreams,
          effectiveLimit: result.effectiveLimit
        });
      }
      return res.status(500).json({ success: false, error: result.error || 'Failed to start stream' });
    }
  } catch (error) {
    console.error('Error starting stream:', error);
    res.status(500).json({ success: false, error: 'Failed to start stream' });
  }
});

// Stop stream endpoint
app.post('/api/streams/:id/stop', isAuthenticated, async (req, res) => {
  try {
    const streamId = req.params.id;
    const stream = await Stream.findById(streamId);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if (stream.status === 'live') {
      const result = await streamingService.stopStream(streamId);
      if (!result.success) {
        console.warn('Failed to stop FFmpeg process:', result.error);
      }
    }
    await Stream.updateStatus(streamId, 'offline', req.session.userId);
    const updatedStream = await Stream.getStreamWithVideo(streamId);
    return res.json({ success: true, stream: updatedStream });
  } catch (error) {
    console.error('Error stopping stream:', error);
    res.status(500).json({ success: false, error: 'Failed to stop stream' });
  }
});

app.get('/api/streams/check-key', isAuthenticated, async (req, res) => {
  try {
    const streamKey = req.query.key;
    const excludeId = req.query.excludeId || null;
    if (!streamKey) {
      return res.status(400).json({
        success: false,
        error: 'Stream key is required'
      });
    }
    const isInUse = await Stream.isStreamKeyInUse(streamKey, req.session.userId, excludeId);
    res.json({
      success: true,
      isInUse: isInUse,
      message: isInUse ? 'Stream key is already in use' : 'Stream key is available'
    });
  } catch (error) {
    console.error('Error checking stream key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check stream key'
    });
  }
});
app.get('/api/streams/:id/logs', isAuthenticated, async (req, res) => {
  try {
    const streamId = req.params.id;
    const stream = await Stream.findById(streamId);
    if (!stream) {
      return res.status(404).json({ success: false, error: 'Stream not found' });
    }
    if (stream.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const logs = streamingService.getStreamLogs(streamId);
    const isActive = streamingService.isStreamActive(streamId);
    res.json({
      success: true,
      logs,
      isActive,
      stream
    });
  } catch (error) {
    console.error('Error fetching stream logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stream logs' });
  }
});

app.get('/playlist', isAuthenticated, async (req, res) => {
  try {
    const playlists = await Playlist.findAll(req.session.userId);
    const videos = await Video.findAll(req.session.userId);
    res.render('playlist', {
      title: 'Playlist',
      active: 'playlist',
      user: await User.findById(req.session.userId),
      playlists: playlists,
      videos: videos
    });
  } catch (error) {
    console.error('Playlist error:', error);
    res.redirect('/dashboard');
  }
});

app.get('/api/playlists', isAuthenticated, async (req, res) => {
  try {
    const playlists = await Playlist.findAll(req.session.userId);
    
    playlists.forEach(playlist => {
      playlist.shuffle = playlist.is_shuffle;
    });
    
    res.json({ success: true, playlists });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch playlists' });
  }
});

app.post('/api/playlists', isAuthenticated, [
  body('name').trim().isLength({ min: 1 }).withMessage('Playlist name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const playlistData = {
      name: req.body.name,
      description: req.body.description || null,
      is_shuffle: req.body.shuffle === 'true' || req.body.shuffle === true,
      user_id: req.session.userId
    };

    const playlist = await Playlist.create(playlistData);
    
    if (req.body.videos && Array.isArray(req.body.videos) && req.body.videos.length > 0) {
      for (let i = 0; i < req.body.videos.length; i++) {
        await Playlist.addVideo(playlist.id, req.body.videos[i], i + 1);
      }
    }
    
    res.json({ success: true, playlist });
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to create playlist' });
  }
});

app.get('/api/playlists/:id', isAuthenticated, async (req, res) => {
  try {
    const playlist = await Playlist.findByIdWithVideos(req.params.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    if (playlist.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    playlist.shuffle = playlist.is_shuffle;
    
    res.json({ success: true, playlist });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch playlist' });
  }
});

app.put('/api/playlists/:id', isAuthenticated, [
  body('name').trim().isLength({ min: 1 }).withMessage('Playlist name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    if (playlist.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const updateData = {
      name: req.body.name,
      description: req.body.description || null,
      is_shuffle: req.body.shuffle === 'true' || req.body.shuffle === true
    };

    const updatedPlaylist = await Playlist.update(req.params.id, updateData);
    
    if (req.body.videos && Array.isArray(req.body.videos)) {
      const existingVideos = await Playlist.findByIdWithVideos(req.params.id);
      if (existingVideos && existingVideos.videos) {
        for (const video of existingVideos.videos) {
          await Playlist.removeVideo(req.params.id, video.id);
        }
      }
      
      for (let i = 0; i < req.body.videos.length; i++) {
        await Playlist.addVideo(req.params.id, req.body.videos[i], i + 1);
      }
    }
    
    res.json({ success: true, playlist: updatedPlaylist });
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to update playlist' });
  }
});

app.delete('/api/playlists/:id', isAuthenticated, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    if (playlist.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await Playlist.delete(req.params.id);
    res.json({ success: true, message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to delete playlist' });
  }
});

app.post('/api/playlists/:id/videos', isAuthenticated, [
  body('videoId').notEmpty().withMessage('Video ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    if (playlist.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const video = await Video.findById(req.body.videoId);
    if (!video || video.user_id !== req.session.userId) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    const position = await Playlist.getNextPosition(req.params.id);
    await Playlist.addVideo(req.params.id, req.body.videoId, position);
    
    res.json({ success: true, message: 'Video added to playlist' });
  } catch (error) {
    console.error('Error adding video to playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to add video to playlist' });
  }
});

app.delete('/api/playlists/:id/videos/:videoId', isAuthenticated, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    if (playlist.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await Playlist.removeVideo(req.params.id, req.params.videoId);
    res.json({ success: true, message: 'Video removed from playlist' });
  } catch (error) {
    console.error('Error removing video from playlist:', error);
    res.status(500).json({ success: false, error: 'Failed to remove video from playlist' });
  }
});

app.put('/api/playlists/:id/videos/reorder', isAuthenticated, [
  body('videoPositions').isArray().withMessage('Video positions must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) {
      return res.status(404).json({ success: false, error: 'Playlist not found' });
    }
    if (playlist.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await Playlist.updateVideoPositions(req.params.id, req.body.videoPositions);
    res.json({ success: true, message: 'Video order updated' });
  } catch (error) {
    console.error('Error reordering videos:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder videos' });
  }
});

app.get('/api/server-time', (req, res) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const formattedTime = `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
  res.json({
    serverTime: now.toISOString(),
    formattedTime: formattedTime
  });
});

// Audio API Routes
app.post('/api/audios/upload', isAuthenticated, (req, res, next) => {
  uploadAudio.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          success: false, 
          error: 'File too large. Maximum size is 500MB.' 
        });
      }
      return res.status(400).json({ 
        success: false, 
        error: err.message 
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }
    let title = path.parse(req.file.originalname).name;
    const filePath = `/uploads/audios/${req.file.filename}`;
    const fullFilePath = path.join(__dirname, 'public', filePath);
    const fileSize = req.file.size;
    
    // Extract audio metadata using ffprobe
    ffmpeg.ffprobe(fullFilePath, async (err, metadata) => {
      if (err) {
        console.error('Error extracting audio metadata:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to process audio file' 
        });
      }
      
      const duration = metadata.format.duration || 0;
      const format = path.extname(req.file.originalname).replace('.', '').toUpperCase();
      
      try {
        const audioData = {
          title,
          filepath: filePath,
          file_size: fileSize,
          duration,
          format,
          user_id: req.session.userId
        };
        const audio = await Audio.create(audioData);
        res.json({
          success: true,
          message: 'Audio uploaded successfully',
          audio
        });
      } catch (dbError) {
        console.error('Database error:', dbError);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to save audio record' 
        });
      }
    });
  } catch (error) {
    console.error('Audio upload error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to upload audio' 
    });
  }
});

app.get('/api/audios', isAuthenticated, async (req, res) => {
  try {
    const audios = await Audio.findAll(req.session.userId);
    res.json({ success: true, audios });
  } catch (error) {
    console.error('Error fetching audios:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch audios' });
  }
});

app.post('/api/audios/:id/rename', isAuthenticated, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({ success: false, error: 'Audio not found' });
    }
    if (audio.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await Audio.update(req.params.id, { title: req.body.title });
    res.json({ success: true, message: 'Audio renamed successfully' });
  } catch (error) {
    console.error('Error renaming audio:', error);
    res.status(500).json({ success: false, error: 'Failed to rename audio' });
  }
});

app.delete('/api/audios/:id', isAuthenticated, async (req, res) => {
  try {
    const audioId = req.params.id;
    const audio = await Audio.findById(audioId);
    if (!audio) {
      return res.status(404).json({ success: false, error: 'Audio not found' });
    }
    if (audio.user_id !== req.session.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await Audio.delete(audioId);
    res.json({ success: true, message: 'Audio deleted successfully' });
  } catch (error) {
    console.error('Error deleting audio:', error);
    res.status(500).json({ success: false, error: 'Failed to delete audio' });
  }
});

app.get('/stream/audio/:audioId', isAuthenticated, async (req, res) => {
  try {
    const audioId = req.params.audioId;
    const audio = await Audio.findById(audioId);
    if (!audio) {
      return res.status(404).send('Audio not found');
    }
    if (audio.user_id !== req.session.userId) {
      return res.status(403).send('Not authorized');
    }
    const audioPath = path.join(__dirname, 'public', audio.filepath);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).send('Audio file not found');
    }
    const stat = fs.statSync(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    const ext = path.extname(audio.filepath).toLowerCase();
    let contentType = 'audio/mpeg';
    if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.aac' || ext === '.m4a') contentType = 'audio/aac';
    
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(audioPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(audioPath).pipe(res);
    }
  } catch (error) {
    console.error('Audio streaming error:', error);
    res.status(500).send('Error streaming audio');
  }
});

// Audio Google Drive Import
app.post('/api/audios/import-drive', isAuthenticated, [
  body('driveUrl').notEmpty().withMessage('Google Drive URL is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const { driveUrl } = req.body;
    const { extractFileId } = require('./utils/googleDriveService');
    try {
      const fileId = extractFileId(driveUrl);
      const jobId = uuidv4();
      processGoogleDriveAudioImport(jobId, fileId, req.session.userId)
        .catch(err => console.error('Audio Drive import failed:', err));
      return res.json({
        success: true,
        message: 'Audio import started',
        jobId: jobId
      });
    } catch (error) {
      console.error('Google Drive URL parsing error:', error);
      return res.status(400).json({
        success: false,
        error: 'Invalid Google Drive URL format'
      });
    }
  } catch (error) {
    console.error('Error importing audio from Google Drive:', error);
    res.status(500).json({ success: false, error: 'Failed to import audio' });
  }
});

const audioImportJobs = {};
async function processGoogleDriveAudioImport(jobId, fileId, userId) {
  const { downloadFile } = require('./utils/googleDriveService');
  
  audioImportJobs[jobId] = {
    status: 'downloading',
    progress: 0,
    message: 'Starting download...'
  };
  
  try {
    const result = await downloadFile(fileId, (progress) => {
      audioImportJobs[jobId] = {
        status: 'downloading',
        progress: progress.progress,
        message: `Downloading ${progress.filename}: ${progress.progress}%`
      };
    }, 'audios');
    
    audioImportJobs[jobId] = {
      status: 'processing',
      progress: 100,
      message: 'Processing audio...'
    };
    
    // Get audio duration using ffprobe
    const audioFilePath = result.localFilePath;
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata);
      });
    });
    
    const duration = metadata.format.duration || 0;
    let format = path.extname(result.filename).toLowerCase().replace('.', '').toUpperCase();
    if (!format) format = 'MP3';
    
    const audioData = {
      title: path.basename(result.originalFilename, path.extname(result.originalFilename)),
      filepath: `/uploads/audios/${result.filename}`,
      file_size: result.fileSize,
      duration: duration,
      format: format,
      user_id: userId
    };
    
    await Audio.create(audioData);
    
    audioImportJobs[jobId] = {
      status: 'completed',
      progress: 100,
      message: 'Audio imported successfully'
    };
    
  } catch (error) {
    console.error('Audio import error:', error);
    audioImportJobs[jobId] = {
      status: 'failed',
      progress: 0,
      message: error.message || 'Import failed'
    };
  }
}

// ============================================
// STREAM TEMPLATES API
// ============================================
const StreamTemplate = require('./models/StreamTemplate');

// GET all templates for current user
app.get('/api/templates', isAuthenticated, async (req, res) => {
  try {
    const templates = await StreamTemplate.findByUserId(req.session.userId);
    res.json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

// GET single template by ID
app.get('/api/templates/:id', isAuthenticated, async (req, res) => {
  try {
    const template = await StreamTemplate.findById(req.params.id);
    if (!template || template.user_id !== req.session.userId) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch template' });
  }
});

// POST create new template
app.post('/api/templates', isAuthenticated, async (req, res) => {
  try {
    const { name, video_id, audio_id, duration_hours, duration_minutes, loop_video, schedule_type, recurring_time, schedule_days, overwrite } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Template name is required' });
    }
    
    // Check if name already exists
    const existing = await StreamTemplate.findByName(req.session.userId, name.trim());
    if (existing && !overwrite) {
      return res.status(409).json({ 
        success: false, 
        error: 'Template name already exists',
        existingId: existing.id
      });
    }
    
    // If overwrite, delete existing first
    if (existing && overwrite) {
      await StreamTemplate.delete(existing.id, req.session.userId);
    }
    
    const template = await StreamTemplate.create({
      user_id: req.session.userId,
      name: name.trim(),
      video_id: video_id || null,
      audio_id: audio_id || null,
      duration_hours: parseInt(duration_hours, 10) || 0,
      duration_minutes: parseInt(duration_minutes, 10) || 0,
      loop_video: loop_video !== false,
      schedule_type: schedule_type || 'once',
      recurring_time: recurring_time || null,
      schedule_days: schedule_days || null
    });
    
    res.json({ success: true, template });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

// PUT update template
app.put('/api/templates/:id', isAuthenticated, async (req, res) => {
  try {
    const template = await StreamTemplate.findById(req.params.id);
    if (!template || template.user_id !== req.session.userId) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    const { name, video_id, audio_id, duration_hours, duration_minutes, loop_video, schedule_type, recurring_time, schedule_days } = req.body;
    
    // Check if new name conflicts with existing template
    if (name && name.trim() !== template.name) {
      const nameExists = await StreamTemplate.nameExists(req.session.userId, name.trim(), req.params.id);
      if (nameExists) {
        return res.status(409).json({ success: false, error: 'Template name already exists' });
      }
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (video_id !== undefined) updateData.video_id = video_id;
    if (audio_id !== undefined) updateData.audio_id = audio_id;
    if (duration_hours !== undefined) updateData.duration_hours = parseInt(duration_hours, 10) || 0;
    if (duration_minutes !== undefined) updateData.duration_minutes = parseInt(duration_minutes, 10) || 0;
    if (loop_video !== undefined) updateData.loop_video = loop_video;
    if (schedule_type !== undefined) updateData.schedule_type = schedule_type;
    if (recurring_time !== undefined) updateData.recurring_time = recurring_time;
    if (schedule_days !== undefined) updateData.schedule_days = schedule_days;
    
    const updated = await StreamTemplate.update(req.params.id, updateData);
    res.json({ success: true, template: updated });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

// DELETE template
app.delete('/api/templates/:id', isAuthenticated, async (req, res) => {
  try {
    const template = await StreamTemplate.findById(req.params.id);
    if (!template || template.user_id !== req.session.userId) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    
    await StreamTemplate.delete(req.params.id, req.session.userId);
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

// ============================================
// YouTube Sync Routes (Multiple Accounts Support)
// ============================================

// YouTube Sync Page - displays all connected accounts and their broadcasts
app.get('/youtube', isAuthenticated, async (req, res) => {
  try {
    // Get all connected YouTube accounts for this user
    const accounts = await YouTubeCredentials.findAllByUserId(req.session.userId);
    let allBroadcasts = [];
    
    // Fetch broadcasts from all connected accounts
    for (const account of accounts) {
      try {
        const accessToken = await youtubeService.getAccessToken(
          account.clientId,
          account.clientSecret,
          account.refreshToken
        );
        const broadcasts = await youtubeService.listBroadcasts(accessToken);
        // Add account info to each broadcast
        allBroadcasts = allBroadcasts.concat(broadcasts.map(b => ({
          ...b,
          accountId: account.id,
          channelName: account.channelName
        })));
      } catch (err) {
        console.error(`Error fetching broadcasts for account ${account.channelName}:`, err.message);
      }
    }
    
    // Sort broadcasts by scheduled time
    allBroadcasts.sort((a, b) => new Date(a.scheduledStartTime) - new Date(b.scheduledStartTime));
    
    res.render('youtube', {
      title: 'YouTube Sync',
      active: 'youtube',
      accounts,
      credentials: accounts.length > 0 ? accounts[0] : null, // For backward compatibility
      broadcasts: allBroadcasts
    });
  } catch (error) {
    console.error('YouTube page error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load YouTube Sync page'
    });
  }
});

// Add new YouTube account (supports multiple accounts)
app.post('/api/youtube/credentials', isAuthenticated, async (req, res) => {
  try {
    const { clientId, clientSecret, refreshToken } = req.body;
    
    if (!clientId || !clientSecret || !refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Client ID, Client Secret, and Refresh Token are required'
      });
    }
    
    // Validate credentials
    const validation = await youtubeService.validateCredentials(clientId, clientSecret, refreshToken);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || 'Invalid credentials'
      });
    }
    
    // Check if this channel is already connected
    const existingChannel = await YouTubeCredentials.existsByChannel(req.session.userId, validation.channelId);
    if (existingChannel) {
      return res.status(400).json({
        success: false,
        error: 'This YouTube channel is already connected'
      });
    }
    
    // Create new credentials (supports multiple accounts)
    const created = await YouTubeCredentials.create(req.session.userId, {
      clientId,
      clientSecret,
      refreshToken,
      channelName: validation.channelName,
      channelId: validation.channelId
    });
    
    res.json({
      success: true,
      id: created.id,
      channelName: validation.channelName,
      channelId: validation.channelId,
      isPrimary: created.isPrimary
    });
  } catch (error) {
    console.error('Error saving YouTube credentials:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save credentials'
    });
  }
});

// Get all connected YouTube accounts
app.get('/api/youtube/accounts', isAuthenticated, async (req, res) => {
  try {
    const accounts = await YouTubeCredentials.findAllByUserId(req.session.userId);
    res.json({
      success: true,
      accounts: accounts.map(a => ({
        id: a.id,
        channelName: a.channelName,
        channelId: a.channelId,
        isPrimary: a.isPrimary,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching YouTube accounts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch accounts' });
  }
});

// Check if credentials exist (backward compatibility)
app.get('/api/youtube/credentials', isAuthenticated, async (req, res) => {
  try {
    const accounts = await YouTubeCredentials.findAllByUserId(req.session.userId);
    const primary = accounts.find(a => a.isPrimary) || accounts[0];
    res.json({
      success: true,
      hasCredentials: accounts.length > 0,
      accountCount: accounts.length,
      channelName: primary?.channelName || null,
      channelId: primary?.channelId || null
    });
  } catch (error) {
    console.error('Error checking YouTube credentials:', error);
    res.status(500).json({ success: false, error: 'Failed to check credentials' });
  }
});

// Remove specific YouTube account by ID
app.delete('/api/youtube/credentials/:id', isAuthenticated, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    
    // Verify the credential belongs to this user
    const credential = await YouTubeCredentials.findById(credentialId);
    if (!credential || credential.userId !== req.session.userId) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    await YouTubeCredentials.deleteById(credentialId);
    
    // If deleted account was primary, set another as primary
    const remaining = await YouTubeCredentials.findAllByUserId(req.session.userId);
    if (remaining.length > 0 && !remaining.some(a => a.isPrimary)) {
      await YouTubeCredentials.setPrimary(req.session.userId, remaining[0].id);
    }
    
    res.json({ success: true, message: 'Account disconnected' });
  } catch (error) {
    console.error('Error removing YouTube credentials:', error);
    res.status(500).json({ success: false, error: 'Failed to remove credentials' });
  }
});

// Remove all YouTube credentials (backward compatibility)
app.delete('/api/youtube/credentials', isAuthenticated, async (req, res) => {
  try {
    await YouTubeCredentials.delete(req.session.userId);
    res.json({ success: true, message: 'All credentials removed' });
  } catch (error) {
    console.error('Error removing YouTube credentials:', error);
    res.status(500).json({ success: false, error: 'Failed to remove credentials' });
  }
});

// Set primary YouTube account
app.put('/api/youtube/credentials/:id/primary', isAuthenticated, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    
    // Verify the credential belongs to this user
    const credential = await YouTubeCredentials.findById(credentialId);
    if (!credential || credential.userId !== req.session.userId) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    await YouTubeCredentials.setPrimary(req.session.userId, credentialId);
    res.json({ success: true, message: 'Primary account updated' });
  } catch (error) {
    console.error('Error setting primary account:', error);
    res.status(500).json({ success: false, error: 'Failed to set primary account' });
  }
});

// List uploaded thumbnails (per user, max 20)
app.get('/api/thumbnails', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const thumbnailsDir = path.join(__dirname, 'public', 'uploads', 'thumbnails', String(userId));
    
    // Check if directory exists
    if (!fs.existsSync(thumbnailsDir)) {
      return res.json({ success: true, thumbnails: [], count: 0, maxAllowed: 20 });
    }
    
    const files = fs.readdirSync(thumbnailsDir);
    const thumbnails = files
      .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
      .map(file => ({
        filename: file,
        path: `/uploads/thumbnails/${userId}/${file}`,
        url: `/uploads/thumbnails/${userId}/${file}`
      }))
      .sort((a, b) => {
        // Sort by modification time (newest first)
        const statA = fs.statSync(path.join(thumbnailsDir, a.filename));
        const statB = fs.statSync(path.join(thumbnailsDir, b.filename));
        return statB.mtime - statA.mtime;
      });
    
    res.json({ success: true, thumbnails, count: thumbnails.length, maxAllowed: 20 });
  } catch (error) {
    console.error('Error listing thumbnails:', error);
    res.status(500).json({ success: false, error: 'Failed to list thumbnails' });
  }
});

// Thumbnail upload middleware (memory storage)
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedFormats.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG files are allowed'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB max
  }
});

// Upload thumbnail to user's gallery (max 20)
app.post('/api/thumbnails', isAuthenticated, thumbnailUpload.single('thumbnail'), async (req, res) => {
  try {
    const userId = req.session.userId;
    const thumbnailsDir = path.join(__dirname, 'public', 'uploads', 'thumbnails', String(userId));
    
    // Create user's thumbnail directory if not exists
    if (!fs.existsSync(thumbnailsDir)) {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    }
    
    // Check current count
    const existingFiles = fs.readdirSync(thumbnailsDir).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    if (existingFiles.length >= 20) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximum 20 thumbnails allowed. Please delete some before uploading new ones.' 
      });
    }
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    // Save file to user's thumbnail directory
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const newFilename = `thumb_${Date.now()}${ext}`;
    const newPath = path.join(thumbnailsDir, newFilename);
    
    // Write buffer to file
    fs.writeFileSync(newPath, req.file.buffer);
    
    res.json({ 
      success: true, 
      thumbnail: {
        filename: newFilename,
        path: `/uploads/thumbnails/${userId}/${newFilename}`,
        url: `/uploads/thumbnails/${userId}/${newFilename}`
      },
      count: existingFiles.length + 1,
      maxAllowed: 20
    });
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    res.status(500).json({ success: false, error: 'Failed to upload thumbnail' });
  }
});

// Delete thumbnail from user's gallery
app.delete('/api/thumbnails/:filename', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const filename = req.params.filename;
    
    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    const thumbnailPath = path.join(__dirname, 'public', 'uploads', 'thumbnails', String(userId), filename);
    
    // Check if file exists and belongs to user
    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ success: false, error: 'Thumbnail not found' });
    }
    
    // Delete the file
    fs.unlinkSync(thumbnailPath);
    
    res.json({ success: true, message: 'Thumbnail deleted successfully' });
  } catch (error) {
    console.error('Error deleting thumbnail:', error);
    res.status(500).json({ success: false, error: 'Failed to delete thumbnail' });
  }
});

// List YouTube streams (stream keys) - supports accountId parameter
app.get('/api/youtube/streams', isAuthenticated, async (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
    let credentials;
    
    if (accountId) {
      // Get specific account
      credentials = await YouTubeCredentials.findById(accountId);
      if (!credentials || credentials.userId !== req.session.userId) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
    } else {
      // Get primary/first account
      credentials = await YouTubeCredentials.findByUserId(req.session.userId);
    }
    
    if (!credentials) {
      return res.status(400).json({
        success: false,
        error: 'YouTube account not connected'
      });
    }
    
    const accessToken = await youtubeService.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      credentials.refreshToken
    );
    
    const streams = await youtubeService.listStreams(accessToken);
    res.json({ success: true, streams, accountId: credentials.id });
  } catch (error) {
    console.error('Error listing streams:', error);
    res.status(500).json({ success: false, error: 'Failed to list stream keys' });
  }
});

// Get YouTube channel defaults for auto-fill - supports accountId parameter
app.get('/api/youtube/channel-defaults', isAuthenticated, async (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
    let credentials;
    
    if (accountId) {
      credentials = await YouTubeCredentials.findById(accountId);
      if (!credentials || credentials.userId !== req.session.userId) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
    } else {
      credentials = await YouTubeCredentials.findByUserId(req.session.userId);
    }
    
    if (!credentials) {
      return res.status(400).json({
        success: false,
        error: 'YouTube account not connected'
      });
    }
    
    const accessToken = await youtubeService.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      credentials.refreshToken
    );
    
    const defaults = await youtubeService.getChannelDefaults(accessToken);
    res.json({ success: true, defaults, accountId: credentials.id });
  } catch (error) {
    console.error('Error fetching channel defaults:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch channel defaults' });
  }
});

// List YouTube broadcasts - supports accountId parameter
app.get('/api/youtube/broadcasts', isAuthenticated, async (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
    
    if (accountId) {
      // Get broadcasts for specific account
      const credentials = await YouTubeCredentials.findById(accountId);
      if (!credentials || credentials.userId !== req.session.userId) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
      
      const accessToken = await youtubeService.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.refreshToken
      );
      
      const broadcasts = await youtubeService.listBroadcasts(accessToken);
      res.json({ 
        success: true, 
        broadcasts: broadcasts.map(b => ({ ...b, accountId: credentials.id, channelName: credentials.channelName }))
      });
    } else {
      // Get broadcasts from all accounts
      const accounts = await YouTubeCredentials.findAllByUserId(req.session.userId);
      
      if (accounts.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'YouTube account not connected'
        });
      }
      
      let allBroadcasts = [];
      for (const account of accounts) {
        try {
          const accessToken = await youtubeService.getAccessToken(
            account.clientId,
            account.clientSecret,
            account.refreshToken
          );
          const broadcasts = await youtubeService.listBroadcasts(accessToken);
          allBroadcasts = allBroadcasts.concat(broadcasts.map(b => ({
            ...b,
            accountId: account.id,
            channelName: account.channelName
          })));
        } catch (err) {
          console.error(`Error fetching broadcasts for ${account.channelName}:`, err.message);
        }
      }
      
      res.json({ success: true, broadcasts: allBroadcasts });
    }
  } catch (error) {
    console.error('Error listing broadcasts:', error);
    res.status(500).json({ success: false, error: 'Failed to list broadcasts' });
  }
});

// Create YouTube broadcast - supports accountId parameter
app.post('/api/youtube/broadcasts', isAuthenticated, upload.single('thumbnail'), async (req, res) => {
  try {
    const accountId = req.body.accountId ? parseInt(req.body.accountId) : null;
    let credentials;
    
    if (accountId) {
      credentials = await YouTubeCredentials.findById(accountId);
      if (!credentials || credentials.userId !== req.session.userId) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
    } else {
      credentials = await YouTubeCredentials.findByUserId(req.session.userId);
    }
    
    if (!credentials) {
      return res.status(400).json({
        success: false,
        error: 'YouTube account not connected'
      });
    }
    
    const { title, description, scheduledStartTime, privacyStatus, streamId, tags, categoryId, monetizationEnabled, adFrequency, alteredContent } = req.body;
    
    if (!title || !scheduledStartTime) {
      return res.status(400).json({
        success: false,
        error: 'Title and scheduled start time are required'
      });
    }
    
    // Validate scheduled time (at least 10 minutes in future)
    const scheduledDate = new Date(scheduledStartTime);
    const minTime = new Date(Date.now() + 10 * 60 * 1000);
    
    if (scheduledDate < minTime) {
      return res.status(400).json({
        success: false,
        error: 'Scheduled start time must be at least 10 minutes in the future'
      });
    }
    
    // Parse tags if provided as JSON string
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = [];
      }
    }
    
    const accessToken = await youtubeService.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      credentials.refreshToken
    );
    
    const broadcast = await youtubeService.createBroadcast(accessToken, {
      title,
      description: description || '',
      scheduledStartTime,
      privacyStatus: privacyStatus || 'unlisted',
      streamId: streamId || null,
      tags: parsedTags,
      categoryId: categoryId || '20',
      monetizationEnabled: monetizationEnabled === 'true' || monetizationEnabled === true,
      adFrequency: adFrequency || 'medium',
      alteredContent: alteredContent === 'true' || alteredContent === true
    });
    
    // Upload thumbnail if provided (either file upload or gallery selection)
    const thumbnailPath = req.body.thumbnailPath;
    
    if (req.file) {
      // Handle file upload
      try {
        const thumbnailResult = await youtubeService.uploadThumbnail(
          accessToken,
          broadcast.broadcastId,
          req.file.buffer
        );
        broadcast.thumbnailUrl = thumbnailResult.thumbnailUrl;
      } catch (thumbErr) {
        console.error('Error uploading thumbnail:', thumbErr.message);
      }
    } else if (thumbnailPath) {
      // Handle gallery selection
      try {
        const fullPath = path.join(__dirname, 'public', thumbnailPath);
        if (fs.existsSync(fullPath)) {
          const imageBuffer = fs.readFileSync(fullPath);
          const thumbnailResult = await youtubeService.uploadThumbnail(
            accessToken,
            broadcast.broadcastId,
            imageBuffer
          );
          broadcast.thumbnailUrl = thumbnailResult.thumbnailUrl;
        }
      } catch (thumbErr) {
        console.error('Error uploading gallery thumbnail:', thumbErr.message);
      }
    }
    
    res.json({ success: true, broadcast });
  } catch (error) {
    console.error('Error creating broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create broadcast'
    });
  }
});

// Delete YouTube broadcast - supports accountId parameter
app.delete('/api/youtube/broadcasts/:id', isAuthenticated, async (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : null;
    let credentials;
    
    if (accountId) {
      credentials = await YouTubeCredentials.findById(accountId);
      if (!credentials || credentials.userId !== req.session.userId) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
    } else {
      // Try to find the account that owns this broadcast by checking all accounts
      const accounts = await YouTubeCredentials.findAllByUserId(req.session.userId);
      for (const account of accounts) {
        try {
          const accessToken = await youtubeService.getAccessToken(
            account.clientId,
            account.clientSecret,
            account.refreshToken
          );
          await youtubeService.deleteBroadcast(accessToken, req.params.id);
          return res.json({ success: true, message: 'Broadcast deleted' });
        } catch (err) {
          // Continue to next account if this one doesn't own the broadcast
          continue;
        }
      }
      return res.status(404).json({ success: false, error: 'Broadcast not found' });
    }
    
    const accessToken = await youtubeService.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      credentials.refreshToken
    );
    
    await youtubeService.deleteBroadcast(accessToken, req.params.id);
    res.json({ success: true, message: 'Broadcast deleted' });
  } catch (error) {
    console.error('Error deleting broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete broadcast'
    });
  }
});

// Upload/change thumbnail for broadcast - supports accountId parameter
app.post('/api/youtube/broadcasts/:id/thumbnail', isAuthenticated, upload.single('thumbnail'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No thumbnail file provided'
      });
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type. Only JPG and PNG are allowed'
      });
    }
    
    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 2MB'
      });
    }
    
    const accountId = req.body.accountId ? parseInt(req.body.accountId) : null;
    let credentials;
    
    if (accountId) {
      credentials = await YouTubeCredentials.findById(accountId);
      if (!credentials || credentials.userId !== req.session.userId) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
    } else {
      credentials = await YouTubeCredentials.findByUserId(req.session.userId);
    }
    
    if (!credentials) {
      return res.status(400).json({
        success: false,
        error: 'YouTube account not connected'
      });
    }
    
    const accessToken = await youtubeService.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      credentials.refreshToken
    );
    
    const result = await youtubeService.uploadThumbnail(
      accessToken,
      req.params.id,
      req.file.buffer
    );
    
    res.json({ success: true, thumbnailUrl: result.thumbnailUrl });
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload thumbnail'
    });
  }
});

// Global error handler - catches any unhandled errors in routes
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err);
  console.error('Stack:', err.stack);
  
  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';
  
  // Check if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Handle different error types
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', {
      title: 'Error',
      message: 'Session expired. Please refresh and try again.',
      error: isDev ? err : {}
    });
  }
  
  // Default error response
  res.status(err.status || 500);
  
  // Check if request expects JSON
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({
      success: false,
      error: isDev ? err.message : 'An unexpected error occurred'
    });
  }
  
  // Render error page
  res.render('error', {
    title: 'Error',
    message: isDev ? err.message : 'An unexpected error occurred',
    error: isDev ? err : {}
  });
});

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404);
  
  // Check if request expects JSON
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({
      success: false,
      error: 'Not found'
    });
  }
  
  res.render('error', {
    title: '404 Not Found',
    message: 'The page you are looking for does not exist.',
    error: {}
  });
});

// REMOVED: Watchdog interval - was adding unnecessary overhead
// The app should run without constant monitoring

// Start server after database is ready
async function startServer() {
  // Wait for database to be fully initialized
  try {
    console.log('[Startup] Waiting for database initialization...');
    await waitForDbInit();
    
    // Verify all tables exist
    const verification = await verifyTables();
    if (!verification.success) {
      console.warn(`[Startup] Warning: Missing tables: ${verification.missingTables.join(', ')}`);
    }
    
    console.log('[Startup] Database ready, starting server...');
  } catch (dbError) {
    console.error('[Startup] Database initialization error:', dbError.message);
    console.error('[Startup] Attempting to continue - tables might already exist');
  }
  
  httpServer = app.listen(port, '0.0.0.0', async () => {
    const ipAddresses = getLocalIpAddresses();
    console.log(`StreamFlow running at:`);
    if (ipAddresses && ipAddresses.length > 0) {
      ipAddresses.forEach(ip => {
        console.log(`  http://${ip}:${port}`);
      });
    } else {
      console.log(`  http://localhost:${port}`);
    }
    
    // FIXED: Don't reset live streams on startup - let syncStreamStatuses handle it
    // The old code was resetting ALL live streams to offline, even if FFmpeg was still running
    // This caused status mismatch when the app restarted but streams were still active
    try {
      const liveStreams = await Stream.findAll(null, 'live');
      if (liveStreams && liveStreams.length > 0) {
        console.log(`[Startup] Found ${liveStreams.length} streams marked as 'live' in database`);
        console.log('[Startup] Status will be verified by syncStreamStatuses after scheduler init');
        // Don't reset here - syncStreamStatuses will check if FFmpeg is actually running
      }
    } catch (error) {
      console.error('[Startup] Error checking live streams:', error.message);
    }
    
    // Initialize scheduler
    try {
      schedulerService.init(streamingService);
    } catch (error) {
      console.error('Error initializing scheduler:', error.message);
      // Don't crash - scheduler can be retried
    }
    
    // REMOVED: Don't sync stream statuses on startup
    // This was causing live streams to be incorrectly marked as offline
    // The periodic sync (every 15 min) will handle cleanup later
    // Status changes should only happen when:
    // 1. User manually starts/stops a stream
    // 2. FFmpeg process exits (handled by exit event)
    // 3. Duration is reached (handled by scheduler)
    console.log('[Startup] Skipping initial sync - status will be managed by events');
    
    console.log('StreamFlow startup complete');
    
    // Signal to PM2 that app is ready
    if (process.send) {
      process.send('ready');
      console.log('[Startup] Sent ready signal to PM2');
    }
  });
  
  // Handle server errors
  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[Startup] Port ${port} is already in use. Please close the other application or use a different port.`);
    } else {
      console.error('[Startup] Server error:', error);
    }
  });

  // OPTIMIZED: Reduced timeouts to prevent resource exhaustion
  httpServer.timeout = 5 * 60 * 1000; // 5 minutes (was 30)
  httpServer.keepAliveTimeout = 2 * 60 * 1000; // 2 minutes (was 30)
  httpServer.headersTimeout = 65 * 1000; // 65 seconds (must be > keepAliveTimeout)
  
  // Limit max connections to prevent resource exhaustion on 1GB VPS
  httpServer.maxConnections = 100;
}

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
