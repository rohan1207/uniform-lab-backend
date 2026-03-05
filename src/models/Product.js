const mongoose = require('mongoose');

const colorSchema = new mongoose.Schema(
  {
    name: String,
    hex: String,
  },
  { _id: false }
);

// Variant-level data: one row per size/code, shared product image
const variantSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, // unique code / SKU per variant (e.g. mproductid)
    sizeLabel: { type: String, required: true }, // e.g. "18", "32*42", "CUSTOM"
    gender: {
      type: String,
      enum: ['BOYS', 'GIRLS', 'UNISEX', ''],
      default: 'UNISEX',
    },
    colorName: { type: String }, // "NAVY", "RED" etc
    saleRate: { type: Number, required: true }, // selling price
    mrp: { type: Number }, // printed MRP
    purchaseRate: { type: Number }, // cost price (optional)
    stockQty: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    // Multi-category support: all selected categories (first one mirrors `category` for compat)
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    grade: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
    // String-based grade/class label sourced directly from school.classes (e.g. "Class 5", "KG")
    gradeLabel: { type: String },
    name: { type: String, required: true },
    slug: { type: String },
    description: { type: String },
    features: [{ type: String }],

    gender: {
      type: String,
      enum: ['BOYS', 'GIRLS', 'UNISEX', ''],
      default: 'UNISEX',
    },

    // Top-level price kept for compatibility; derived from variants.min(saleRate) when variants exist
    price: { type: Number, required: true },
    compareAtPrice: { type: Number },

    sizeType: {
      type: String,
      enum: ['numeric', 'alpha', 'shoe', 'one_size', 'none'],
      default: 'numeric',
    },
    // Derived list of unique size labels from variants for filters/legacy UI
    sizes: [{ type: String }],

    colors: [colorSchema],

    // Single shared image (and optional gallery) for all variants
    mainImageUrl: { type: String },
    mainImagePublicId: { type: String },
    galleryImageUrls: [{ type: String }],
    galleryImagePublicIds: [{ type: String }],

    imagesByColor: {
      type: Map,
      of: [String], // colorName -> [urls]
    },
    imagesByColorPublicIds: {
      type: Map,
      of: [String], // colorName -> [publicIds]
    },

    variants: [variantSchema],

    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ school: 1, category: 1, name: 1 });
productSchema.index({ 'variants.code': 1 });

module.exports = mongoose.model('Product', productSchema);

