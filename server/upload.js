const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const audioDir = path.join(uploadsDir, 'audio');
const coversDir = path.join(uploadsDir, 'covers');

[uploadsDir, audioDir, coversDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === 'audio') cb(null, audioDir);
    else if (file.fieldname === 'cover') cb(null, coversDir);
    else cb(new Error('Unknown field'));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || (file.fieldname === 'audio' ? '.mp3' : '.jpg');
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, safe);
  },
});

function fileFilter(req, file, cb) {
  if (file.fieldname === 'audio') {
    const ok = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.originalname);
    return ok ? cb(null, true) : cb(new Error('Только аудио: mp3, wav, ogg, m4a'));
  }
  if (file.fieldname === 'cover') {
    const ok = /\.(jpg|jpeg|png|webp|gif)$/i.test(file.originalname);
    return ok ? cb(null, true) : cb(new Error('Только изображения'));
  }
  cb(new Error('Unknown field'));
}

const uploadTrack = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

module.exports = { uploadTrack, uploadsDir };
