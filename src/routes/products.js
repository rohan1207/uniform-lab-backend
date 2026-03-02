const express = require('express');
const Product = require('../models/Product');
const { cloudinary, isConfigured } = require('../config/cloudinary');

const publicRouter = express.Router();
const adminRouter = express.Router();

function collectProductPublicIds(product) {
  const ids = [];
  if (product.mainImagePublicId) ids.push(product.mainImagePublicId);
  if (Array.isArray(product.galleryImagePublicIds)) ids.push(...product.galleryImagePublicIds);
  if (product.imagesByColorPublicIds && product.imagesByColorPublicIds instanceof Map) {
    product.imagesByColorPublicIds.forEach((arr) => { if (Array.isArray(arr)) ids.push(...arr); });
  } else if (product.imagesByColorPublicIds && typeof product.imagesByColorPublicIds === 'object') {
    Object.values(product.imagesByColorPublicIds).forEach((arr) => { if (Array.isArray(arr)) ids.push(...arr); });
  }
  return ids;
}

async function destroyCloudinaryIds(publicIds) {
  if (!isConfigured() || !publicIds.length) return;
  await Promise.all(
    publicIds.map((id) => cloudinary.uploader.destroy(id, { resource_type: 'image' }).catch(() => {}))
  );
}

// PUBLIC
// GET /api/public/products/:id
publicRouter.get('/:id', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  const product = await Product.findById(req.params.id).populate('school', 'name slug').lean();
  if (!product || !product.isActive) {
    return res.status(404).json({ error: { message: 'Product not found' } });
  }
  res.json(product);
});

// ADMIN
// GET /api/admin/products?schoolId=&categoryId=
adminRouter.get('/', async (req, res) => {
  const { schoolId, categoryId } = req.query;
  const query = {};
  if (schoolId) query.school = schoolId;
  if (categoryId) query.category = categoryId;
  const products = await Product.find(query).sort({ createdAt: -1 });
  res.json(products);
});

// GET /api/admin/products/:id – single product for edit form
adminRouter.get('/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: { message: 'Product not found' } });
  }
  res.json(product);
});

// Helper: derive sizes + sizeType + top-level price from variants
function buildProductFromBody(body) {
  const {
    schoolId,
    categoryId,
    gradeId,
    name,
    slug,
    description,
    features,
    gender,
    price,
    compareAtPrice,
    sizeType,
    sizes,
    colors,
    mainImageUrl,
    galleryImageUrls,
    imagesByColor,
    tags,
    isActive,
    variants,
  } = body;

  const base = {
    school: schoolId,
    category: categoryId,
    grade: gradeId || undefined,
    name,
    description,
    gender,
    compareAtPrice,
    colors,
    mainImageUrl,
    galleryImageUrls,
    imagesByColor,
    tags,
    isActive,
  };

  let finalVariants = Array.isArray(variants) ? variants.filter((v) => v && v.code && v.sizeLabel && typeof v.saleRate === 'number') : [];

  if (!finalVariants.length && Array.isArray(sizes) && typeof price === 'number') {
    // Legacy path: no explicit variants; create one per size using the single price
    finalVariants = sizes.map((sizeLabel, idx) => ({
      code: `${slug || name}-${idx + 1}`,
      sizeLabel,
      gender: 'UNISEX',
      saleRate: price,
    }));
  }

  // Derive sizes + price + sizeType when we have variants
  if (finalVariants.length) {
    base.variants = finalVariants;
    base.sizes = [...new Set(finalVariants.map((v) => v.sizeLabel))];

    const minPrice = Math.min(...finalVariants.map((v) => v.saleRate));
    base.price = Number.isFinite(minPrice) ? minPrice : price;

    let inferredSizeType = sizeType || 'none';
    if (!sizeType || sizeType === 'none') {
      const labels = base.sizes;
      if (labels.every((s) => /^[0-9]+$/.test(String(s)))) inferredSizeType = 'numeric';
      else if (labels.every((s) => /^[A-Za-z]+$/.test(String(s)))) inferredSizeType = 'alpha';
      else inferredSizeType = 'none';
    }
    base.sizeType = inferredSizeType;
  } else {
    // Hard fallback: keep legacy behaviour
    base.price = price;
    base.sizeType = sizeType || 'none';
    base.sizes = sizes || [];
  }

  const finalSlug =
    slug ||
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-');

  base.slug = finalSlug;

  if (Array.isArray(features)) {
    base.features = features.filter((f) => f != null && String(f).trim());
  }

  return base;
}

// POST /api/admin/products
adminRouter.post('/', async (req, res) => {
  const { schoolId, categoryId, name } = req.body || {};

  if (!schoolId || !categoryId || !name) {
    return res.status(400).json({ error: { message: 'schoolId, categoryId, name are required' } });
  }

  const doc = buildProductFromBody(req.body);

  if (typeof doc.price !== 'number' || !Number.isFinite(doc.price) || doc.price <= 0) {
    return res.status(400).json({ error: { message: 'At least one valid variant with price is required' } });
  }

  const product = await Product.create(doc);

  res.status(201).json(product);
});

// PATCH /api/admin/products/:id
adminRouter.patch('/:id', async (req, res) => {
  const update = { ...buildProductFromBody(req.body) };
  delete update._id;
  if (update.schoolId) {
    update.school = update.schoolId;
    delete update.schoolId;
  }
  if (update.categoryId) {
    update.category = update.categoryId;
    delete update.categoryId;
  }
  if (update.gradeId !== undefined) {
    update.grade = update.gradeId || null;
    delete update.gradeId;
  }
  if (update.name && !update.slug) {
    update.slug = update.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
  const product = await Product.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!product) {
    return res.status(404).json({ error: { message: 'Product not found' } });
  }
  res.json(product);
});

// DELETE /api/admin/products/:id – remove from Mongo and delete images from Cloudinary
adminRouter.delete('/:id', async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: { message: 'Product not found' } });
  }
  const publicIds = collectProductPublicIds(product);
  await destroyCloudinaryIds(publicIds);
  await Product.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

module.exports = { public: publicRouter, admin: adminRouter };

