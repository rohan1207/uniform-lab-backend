import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Use in-memory storage; files are streamed directly to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dsrlnbc5k',
  api_key: process.env.CLOUDINARY_API_KEY || '226881632578541',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'sygJK8W6204n7kVfORNjri27ruY',
});

function sanitizeSlug(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uploadBufferToCloudinary(buffer, { folder, publicId }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
        use_filename: true,
        unique_filename: true,
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Upload school logo: stored in schools/{schoolSlug}/logo
app.post('/api/upload/school-logo', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const schoolSlugRaw = req.body.schoolSlug || '';
  const schoolSlug = sanitizeSlug(schoolSlugRaw);
  if (!schoolSlug) {
    return res.status(400).json({ error: 'schoolSlug is required' });
  }

  try {
    const folder = `schools/${schoolSlug}/logo`;
    const publicId = 'logo';
    const result = await uploadBufferToCloudinary(req.file.buffer, { folder, publicId });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Upload school image: stored in schools/{schoolSlug}/image
app.post('/api/upload/school-image', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const schoolSlugRaw = req.body.schoolSlug || '';
  const schoolSlug = sanitizeSlug(schoolSlugRaw);
  if (!schoolSlug) {
    return res.status(400).json({ error: 'schoolSlug is required' });
  }

  try {
    const folder = `schools/${schoolSlug}/image`;
    const publicId = 'image';
    const result = await uploadBufferToCloudinary(req.file.buffer, { folder, publicId });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload school image' });
  }
});

// Upload product image: stored in products/{schoolSlug}/{categorySlug}
app.post('/api/upload/product-image', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const schoolSlug = sanitizeSlug(req.body.schoolSlug || '');
  const categorySlug = sanitizeSlug(req.body.categorySlug || '');
  const productId = sanitizeSlug(req.body.productId || '');

  if (!schoolSlug) {
    return res.status(400).json({ error: 'schoolSlug is required' });
  }

  try {
    const folderParts = ['products', schoolSlug];
    if (categorySlug) folderParts.push(categorySlug);
    const folder = folderParts.join('/');
    const publicId = productId || `product-${Date.now()}`;

    const result = await uploadBufferToCloudinary(req.file.buffer, { folder, publicId });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload product image' });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Upload backend listening on http://localhost:${PORT}`);
});

