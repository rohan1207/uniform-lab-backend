const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const { cloudinary, isConfigured } = require('../config/cloudinary');
const School = require('../models/School');

const router = express.Router();

// In-memory storage so we can pass buffer to Cloudinary (no disk write)
const storage = multer.memoryStorage();
const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'), false);
  },
}).single('file');

function normalizeSegment(value, fallback = '') {
  const str = (value || fallback || '').toString().trim();
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-_]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resolveSchoolSlug(req) {
  const body = req.body || {};
  const schoolId = body.schoolId;
  if (schoolId) {
    try {
      const school = await School.findById(schoolId).select('slug');
      if (school && school.slug) {
        return normalizeSegment(school.slug);
      }
    } catch {
      // ignore and fall back
    }
  }
  return normalizeSegment(body.schoolSlug, 'school');
}

// POST /api/admin/upload/school-logo – upload logo to Cloudinary folder schools/{schoolSlug}/logo
router.post('/school-logo', uploadMiddleware, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }
  const schoolSlug = await resolveSchoolSlug(req);
  const folder = `schools/${schoolSlug}/logo`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        res.status(201).json({ url: result.secure_url, publicId: result.public_id });
        resolve();
      }
    );
    const readStream = Readable.from(req.file.buffer);
    readStream.pipe(uploadStream);
  });
});

// POST /api/admin/upload/school-image – upload school main image to Cloudinary folder schools/{schoolSlug}/image
router.post('/school-image', uploadMiddleware, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }
  const schoolSlug = await resolveSchoolSlug(req);
  const folder = `schools/${schoolSlug}/image`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        res.status(201).json({ url: result.secure_url, publicId: result.public_id });
        resolve();
      }
    );
    const readStream = Readable.from(req.file.buffer);
    readStream.pipe(uploadStream);
  });
});

// POST /api/admin/upload/product-image – upload product main image to Cloudinary folder products/{schoolSlug}/{categorySlug}
router.post('/product-image', uploadMiddleware, async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }

  const schoolSlug = await resolveSchoolSlug(req);
  const categorySlug = normalizeSegment(req.body.categorySlug, 'category');
  const productSlug = normalizeSegment(req.body.productSlug || req.body.productId || req.body.productName, 'product');
  const colorSlug = normalizeSegment(req.body.colorName, '');
  const imageIndex = req.body.imageIndex || '0';

  // Build a unique public_id per product + color + index to prevent overwrites
  let publicId = productSlug || undefined;
  if (publicId && colorSlug) {
    publicId = `${publicId}-${colorSlug}-${imageIndex}`;
  } else if (publicId) {
    // Main image or gallery image — add timestamp to avoid overwriting
    publicId = `${publicId}-${Date.now()}`;
  }

  const folder = `products/${schoolSlug}/${categorySlug}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
      },
      (err, result) => {
        if (err) return reject(err);
        res.status(201).json({ url: result.secure_url, publicId: result.public_id });
        resolve();
      }
    );
    const readStream = Readable.from(req.file.buffer);
    readStream.pipe(uploadStream);
  });
});

// DELETE /api/admin/upload/asset – delete asset from Cloudinary by public_id
router.delete('/asset', express.json(), async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }
  const { publicId } = req.body || {};
  if (!publicId || typeof publicId !== 'string') {
    return res.status(400).json({ error: { message: 'publicId is required' } });
  }
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  res.json({ ok: true, result });
});

module.exports = router;
