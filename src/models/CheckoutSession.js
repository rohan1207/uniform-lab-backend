const mongoose = require('mongoose');

const checkoutItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    size: { type: String },
    color: { type: String },
    imageUrl: { type: String },
  },
  { _id: false }
);

const checkoutAddressSchema = new mongoose.Schema(
  {
    name: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
    phone: String,
  },
  { _id: false }
);

const checkoutSessionSchema = new mongoose.Schema(
  {
    paymentRequestId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String },
    customerPhone: { type: String },
    address: checkoutAddressSchema,
    items: [checkoutItemSchema],
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CheckoutSession', checkoutSessionSchema);

