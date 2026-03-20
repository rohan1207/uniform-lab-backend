const express = require('express');
const Product = require('../models/Product');
const { cloudinary, isConfigured } = require('../config/cloudinary');
const StockNotify = require('../models/StockNotify');
const { sendStockAvailableEmail } = require('../utils/emailService');

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

function deriveIsColorOOS(product, colorName) {
  if (!colorName) return product?.manualOutOfStock === true;
  if (product?.manualOutOfStock === true) return true;
  const map = product?.outOfStockByColor || {};
  const v = map instanceof Map ? map.get(colorName) : map[colorName];
  return v === true;
}

function deriveIsProductOOS(product) {
  if (product?.manualOutOfStock === true) return true;
  const colors = Array.isArray(product?.colors)
    ? product.colors.map((c) => c?.name).filter(Boolean)
    : [];
  if (!colors.length) return false;
  return colors.every((cn) => deriveIsColorOOS(product, cn));
}

async function processStockNotifyTransitions({ productId, oldProduct, newProduct }) {
  const oldProductOOS = deriveIsProductOOS(oldProduct);
  const newProductOOS = deriveIsProductOOS(newProduct);
  const pending = await StockNotify.find({ productId: productId });
  if (!pending.length) return;

  const frontendBase = (process.env.FRONTEND_URL || 'https://uniformlab.in').replace(/\/+$/, '');
  const sentIds = [];

  for (const entry of pending) {
    try {
      if (entry.notifyType === 'PRODUCT') {
        const shouldSend = oldProductOOS === true && newProductOOS === false;
        if (!shouldSend) continue;
      } else if (entry.notifyType === 'COLOR') {
        const oldColorOOS = deriveIsColorOOS(oldProduct, entry.colorName);
        const newColorOOS = deriveIsColorOOS(newProduct, entry.colorName);
        if (!(oldColorOOS === true && newColorOOS === false)) continue;
      } else {
        continue;
      }

      const shopUrlBase = `${frontendBase}/product/${entry.productId}`;
      const qs = new URLSearchParams();
      if (entry.schoolSlug) qs.set('school', entry.schoolSlug);
      if (entry.notifyType === 'COLOR' && entry.colorName) qs.set('color', entry.colorName);
      if (entry.notifyType === 'PRODUCT') {
        const allColors = Array.isArray(newProduct.colors)
          ? newProduct.colors.map((c) => c?.name).filter(Boolean)
          : [];
        const firstAvailable = allColors.find((cn) => !deriveIsColorOOS(newProduct, cn));
        if (firstAvailable) qs.set('color', firstAvailable);
      }
      const shopNowUrl = `${shopUrlBase}?${qs.toString()}`;

      await sendStockAvailableEmail({
        toEmail: entry.email,
        customerName: entry.name,
        schoolName: entry.schoolName,
        productName: entry.productName,
        shopNowUrl,
      });

      sentIds.push(entry._id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[stockNotify] failed send:', err?.message || err);
    }
  }

  if (sentIds.length) {
    await StockNotify.deleteMany({ _id: { $in: sentIds } });
  }
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
    categoryId,    // legacy single-category field (still accepted)
    categoryIds,   // new: array of category ObjectIds
    gradeId,
    gradeLabel,    // new: string class name from school.classes
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
    manualOutOfStock,
    outOfStockByColor,
  } = body;

  // Resolve categories: prefer categoryIds array, fall back to single categoryId
  const resolvedCategoryIds = Array.isArray(categoryIds) && categoryIds.length
    ? categoryIds
    : (categoryId ? [categoryId] : []);

  const base = {
    school: schoolId,
    category: resolvedCategoryIds[0] || categoryId, // primary category (backward compat)
    categories: resolvedCategoryIds,                // all selected categories
    grade: gradeId || undefined,
    gradeLabel: gradeLabel || undefined,            // string class label from school.classes
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
    manualOutOfStock,
    outOfStockByColor,
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
  const { schoolId, categoryId, categoryIds, name } = req.body || {};
  const hasCat = (Array.isArray(categoryIds) && categoryIds.length) || categoryId;

  if (!schoolId || !hasCat || !name) {
    return res.status(400).json({ error: { message: 'schoolId, categoryId (or categoryIds), name are required' } });
  }

  const doc = buildProductFromBody(req.body);

  if (typeof doc.price !== 'number' || !Number.isFinite(doc.price) || doc.price <= 0) {
    return res.status(400).json({ error: { message: 'At least one valid variant with price is required' } });
  }

  const product = await Product.create(doc);

  res.status(201).json(product);
});

// PATCH /api/admin/products/:id/order – lightweight: only updates displayOrder
adminRouter.patch('/:id/order', async (req, res) => {
  try {
    const raw = req.body.displayOrder;
    const displayOrder = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (displayOrder !== null && (!Number.isFinite(displayOrder) || displayOrder < 1)) {
      return res.status(400).json({ error: { message: 'displayOrder must be a positive integer or null' } });
    }
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { displayOrder } },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: { message: 'Product not found' } });
    res.json({ _id: product._id, displayOrder: product.displayOrder });
  } catch (err) {
    console.error('PATCH /products/:id/order error:', err);
    res.status(500).json({ error: { message: err.message || 'Failed to update order' } });
  }
});

// PATCH /api/admin/products/:id/availability
// Manual stock controls for UI + notify-me emails:
// - manualOutOfStock: marks the whole product as out-of-stock
// - outOfStockByColor: object map { [colorName]: true/false }
adminRouter.patch('/:id/availability', async (req, res) => {
  const update = req.body || {};
  const { manualOutOfStock, outOfStockByColor } = update;

  // Only allow these fields through this endpoint
  const setDoc = {};
  if (manualOutOfStock !== undefined) setDoc.manualOutOfStock = !!manualOutOfStock;
  if (outOfStockByColor !== undefined) setDoc.outOfStockByColor = outOfStockByColor || {};

  try {
    const productId = req.params.id;

    const oldProduct = await Product.findById(productId).lean();
    if (!oldProduct) return res.status(404).json({ error: { message: 'Product not found' } });

    const newProduct = await Product.findByIdAndUpdate(
      productId,
      { $set: setDoc },
      { new: true, runValidators: true }
    ).lean();

    if (!newProduct) return res.status(404).json({ error: { message: 'Product not found' } });

    // Process notify requests in background; HTTP response returns immediately.
    (async () => {
      await processStockNotifyTransitions({ productId, oldProduct, newProduct });
    })();

    res.json({
      ok: true,
      manualOutOfStock: newProduct.manualOutOfStock,
      outOfStockByColor: newProduct.outOfStockByColor,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('PATCH /products/:id/availability error:', err);
    return res.status(500).json({ error: { message: err.message || 'Failed to update availability' } });
  }
});

// PATCH /api/admin/products/:id
adminRouter.patch('/:id', async (req, res) => {
  try {
    const oldProduct = await Product.findById(req.params.id).lean();
    if (!oldProduct) {
      return res.status(404).json({ error: { message: 'Product not found' } });
    }

    const update = { ...buildProductFromBody(req.body) };
    delete update._id;

    // Always resolve categories from the request body explicitly
    const incomingCatIds = Array.isArray(req.body.categoryIds) && req.body.categoryIds.length
      ? req.body.categoryIds
      : (req.body.categoryId ? [req.body.categoryId] : null);

    if (incomingCatIds && incomingCatIds.length) {
      update.category = incomingCatIds[0];     // primary category (backward compat)
      update.categories = incomingCatIds;      // full multi-category array
    }

    // gradeLabel from body (string class label); clear gradeId legacy field if not provided
    if (req.body.gradeLabel !== undefined) {
      update.gradeLabel = req.body.gradeLabel || null;
    }
    if (req.body.gradeId !== undefined) {
      update.grade = req.body.gradeId || null;
    } else {
      // don't accidentally null the existing grade ObjectId ref when not provided
      delete update.grade;
    }

    if (update.name && !update.slug) {
      update.slug = update.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    }

    // Use explicit $set with undefined values stripped — avoids Mongoose version-dependent
    // auto-wrapping behavior and ensures `categories` array is always persisted
    const setDoc = {};
    Object.keys(update).forEach((k) => {
      if (update[k] !== undefined) setDoc[k] = update[k];
    });

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: setDoc },
      { new: true, runValidators: true }
    ).lean();

    // Also process stock notifications from full edit-save (color toggles are here).
    (async () => {
      await processStockNotifyTransitions({
        productId: req.params.id,
        oldProduct,
        newProduct: product,
      });
    })();

    res.json(product);
  } catch (err) {
    console.error('PATCH /products/:id error:', err);
    return res.status(500).json({ error: { message: err.message || 'Failed to update product' } });
  }
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

