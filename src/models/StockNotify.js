const mongoose = require('mongoose');

const stockNotifySchema = new mongoose.Schema(
  {
    // Scope can be:
    // - PRODUCT: triggered from product card when the whole product is out-of-stock
    // - COLOR:   triggered from color swatch when only a color is out-of-stock
    notifyType: {
      type: String,
      enum: ['PRODUCT', 'COLOR'],
      required: true,
    },

    // Product identity
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },

    // School identity
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    schoolName: { type: String, required: true },
    schoolSlug: { type: String, required: true },

    // Only for COLOR notifications. PRODUCT notifications store colorName as null.
    colorName: { type: String, default: null },

    // Customer identity (we store email/name because notify can be triggered before login)
    name: { type: String, required: true },
    email: { type: String, required: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },

    // When the product becomes available again we send the email and delete the entry.
    // This field is only for debugging/visibility.
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

stockNotifySchema.index({ productId: 1, notifyType: 1, colorName: 1, email: 1 });
stockNotifySchema.index({ email: 1, createdAt: -1 });

// Prevent accidental duplicates from the same email for the same request scope.
stockNotifySchema.index(
  { productId: 1, schoolId: 1, notifyType: 1, colorName: 1, email: 1 },
  { unique: true }
);

module.exports = mongoose.model('StockNotify', stockNotifySchema);

