const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const { cloudinary, isConfigured } = require('../config/cloudinary');
const { isR2Configured, uploadToR2, deleteFromR2 } = require('../config/r2');
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

const useR2 = process.env.USE_R2 === 'true';

function buildR2Key(parts) {
  return parts.filter(Boolean).join('/');
}

// POST /api/admin/upload/school-logo – upload logo to folder schools/{schoolSlug}/logo
router.post('/school-logo', uploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }
  const schoolSlug = await resolveSchoolSlug(req);
  const folder = `schools/${schoolSlug}/logo`;

  if (useR2 && isR2Configured()) {
    try {
      const key = buildR2Key([folder, `${Date.now()}-${req.file.originalname}`]);
      const { url, key: storedKey } = await uploadToR2(key, req.file.buffer, req.file.mimetype);
      return res.status(201).json({ url, publicId: storedKey });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message || 'Failed to upload to Cloudflare' } });
    }
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }

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

// POST /api/admin/upload/school-image – upload school main image to folder schools/{schoolSlug}/image
router.post('/school-image', uploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: { message: 'No file uploaded' } });
  }
  const schoolSlug = await resolveSchoolSlug(req);
  const folder = `schools/${schoolSlug}/image`;

  if (useR2 && isR2Configured()) {
    try {
      const key = buildR2Key([folder, `${Date.now()}-${req.file.originalname}`]);
      const { url, key: storedKey } = await uploadToR2(key, req.file.buffer, req.file.mimetype);
      return res.status(201).json({ url, publicId: storedKey });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message || 'Failed to upload to Cloudflare' } });
    }
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }

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

// POST /api/admin/upload/product-image – upload product main image to folder products/{schoolSlug}/{categorySlug}
router.post('/product-image', uploadMiddleware, async (req, res) => {
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

  if (useR2 && isR2Configured()) {
    try {
      const baseName = publicId || `${productSlug}-${Date.now()}`;
      const key = buildR2Key([folder, `${baseName}${colorSlug ? `-${colorSlug}-${imageIndex}` : ''}`]);
      const { url, key: storedKey } = await uploadToR2(key, req.file.buffer, req.file.mimetype);
      return res.status(201).json({ url, publicId: storedKey });
    } catch (err) {
      return res.status(500).json({ error: { message: err.message || 'Failed to upload to Cloudflare' } });
    }
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: { message: 'Cloudinary is not configured' } });
  }

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

// DELETE /api/admin/upload/asset – delete asset by public_id/key from Cloudinary and/or R2
router.delete('/asset', express.json(), async (req, res) => {
  const { publicId } = req.body || {};
  if (!publicId || typeof publicId !== 'string') {
    return res.status(400).json({ error: { message: 'publicId is required' } });
  }
  let cloudinaryResult = null;

  if (isConfigured()) {
    try {
      cloudinaryResult = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
      // ignore
    }
  }

  if (useR2 && isR2Configured()) {
    await deleteFromR2(publicId);
  }

  res.json({ ok: true, result: cloudinaryResult });
});

module.exports = router;
