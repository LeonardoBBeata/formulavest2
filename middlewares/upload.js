const fs = require('fs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const uploadDir = path.join('public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname || '');
    const ext = path.extname(safeName).toLowerCase() || '.png';
    const name = `${req.user.id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  const safeName = path.basename(file.originalname || '');
  const ext = path.extname(safeName).toLowerCase();
  const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

  if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) {
    return cb(new Error('Apenas imagens são permitidas'), false);
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});
