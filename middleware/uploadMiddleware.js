const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getUniqueFilename, paths } = require('../utils/storage');
const StorageService = require('../services/storageService');

const parsedBufferSizeMb = parseInt(process.env.UPLOAD_BUFFER_SIZE_MB || '32', 10);
const UPLOAD_BUFFER_SIZE = Number.isFinite(parsedBufferSizeMb) && parsedBufferSizeMb > 0
  ? parsedBufferSizeMb * 1024 * 1024
  : 32 * 1024 * 1024; // 32MB buffer for faster disk writes
const parsedInflightLimit = parseInt(process.env.UPLOAD_INFLIGHT_LIMIT || '0', 10);
const MAX_INFLIGHT_UPLOADS = Number.isFinite(parsedInflightLimit) && parsedInflightLimit > 0
  ? parsedInflightLimit
  : null;
// Optimized stream options for faster uploads
const STREAM_OPTIONS = {
  highWaterMark: UPLOAD_BUFFER_SIZE,
  flags: 'w',
  autoClose: true,
  emitClose: true
};

/**
 * Create optimized write stream for faster file uploads
 */
const createOptimizedWriteStream = (filepath) => {
  return fs.createWriteStream(filepath, STREAM_OPTIONS);
};

const optimizeIncomingStream = (stream) => {
  if (stream?.readableHighWaterMark && stream.readableHighWaterMark >= UPLOAD_BUFFER_SIZE) {
    return;
  }
  if (stream?._readableState && stream._readableState.highWaterMark) {
    stream._readableState.highWaterMark = UPLOAD_BUFFER_SIZE;
  }
};

/**
 * Middleware to check storage limit before upload
 * Must be used BEFORE multer middleware
 */
const checkStorageLimit = async (req, res, next) => {
  try {
    const userId = req.session?.userId;
    
    if (!userId) {
      // Skip storage check, let isAuthenticated handle auth
      return next();
    }

    // Get content-length header for file size estimation
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (!contentLength || isNaN(contentLength)) {
      // If no content-length, allow the upload and check after
      return next();
    }

    // Quick check - get limit first (cached)
    const limit = await StorageService.getUserStorageLimit(userId);
    
    // If no limit set, allow upload immediately
    if (!limit || limit === 0) {
      return next();
    }

    // Only calculate usage if there's a limit
    const result = await StorageService.canUpload(userId, contentLength);
    
    if (!result.allowed) {
      return res.status(413).json({
        error: 'Storage limit exceeded',
        message: `Storage limit exceeded. Current usage: ${StorageService.formatBytes(result.currentUsage)}, Limit: ${StorageService.formatBytes(result.limit)}`,
        currentUsage: result.currentUsage,
        limit: result.limit,
        remaining: result.remaining
      });
    }

    next();
  } catch (error) {
    console.error('Error checking storage limit:', error);
    // On error, allow upload to proceed (fail open)
    next();
  }
};

const createOptimizedStorage = (destinationPath) => ({
  _handleFile: (req, file, cb) => {
    if (MAX_INFLIGHT_UPLOADS && req.app.locals.activeUploadCount >= MAX_INFLIGHT_UPLOADS) {
      return cb(new Error('Server is busy. Please retry upload in a moment.'));
    }

    req.app.locals.activeUploadCount += 1;

    const filename = getUniqueFilename(file.originalname);
    const finalPath = path.join(destinationPath, filename);
    const outStream = createOptimizedWriteStream(finalPath);
    let handled = false;

    optimizeIncomingStream(file.stream);

    const done = (err, info) => {
      if (handled) return;
      handled = true;
      req.app.locals.activeUploadCount = Math.max(0, req.app.locals.activeUploadCount - 1);
      cb(err, info);
    };

    file.stream.on('error', (err) => done(err));
    outStream.on('error', (err) => done(err));
    outStream.on('finish', () => {
      done(null, {
        destination: destinationPath,
        filename,
        path: finalPath,
        size: outStream.bytesWritten
      });
    });

    file.stream.pipe(outStream);
  },
  _removeFile: (req, file, cb) => {
    if (file.path) {
      fs.unlink(file.path, cb);
    } else {
      cb(null);
    }
  }
});

const videoStorage = createOptimizedStorage(paths.videos);

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, paths.avatars);
  },
  filename: (req, file, cb) => {
    const uniqueFilename = getUniqueFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

const videoFilter = (req, file, cb) => {
  const allowedFormats = ['video/mp4', 'video/avi', 'video/quicktime'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.mp4', '.avi', '.mov'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .mp4, .avi, and .mov formats are allowed'), false);
  }
};

const imageFilter = (req, file, cb) => {
  const allowedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .jpg, .jpeg, .png, and .gif formats are allowed'), false);
  }
};

const audioStorage = createOptimizedStorage(paths.audios);

const audioFilter = (req, file, cb) => {
  const allowedFormats = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a', 'audio/mp4'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.mp3', '.wav', '.aac', '.m4a'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .mp3, .wav, and .aac formats are allowed'), false);
  }
};

const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFilter
});

const upload = multer({
  storage: avatarStorage,
  fileFilter: imageFilter
});

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter
});

// JSON backup file filter
const jsonFilter = (req, file, cb) => {
  const allowedFormats = ['application/json'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.json'];
  if (allowedFormats.includes(file.mimetype) || allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only .json files are allowed'), false);
  }
};

// Memory storage for backup files (no need to save to disk)
const uploadBackup = multer({
  storage: multer.memoryStorage(),
  fileFilter: jsonFilter
});

module.exports = {
  uploadVideo,
  upload,
  uploadAudio,
  uploadBackup,
  checkStorageLimit
};
