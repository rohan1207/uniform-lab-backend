const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    size: { type: String },
    color: { type: String },
    imageUrl: { type: String },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
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

const orderSchema = new mongoose.Schema(
  {
    uniqueOrderId: { type: String, required: true, unique: true },
    // optional link to school (for filtering orders by school)
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    customerName: { type: String, required: true },
    customerEmail: { type: String },
    customerPhone: { type: String },
    address: addressSchema,
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['COD', 'Online', 'Unknown'], default: 'COD' },
    paymentStatus: { type: String, enum: ['Paid', 'Pending'], default: 'Pending' },
    // Instamojo / payment gateway metadata
    gatewayPaymentId: { type: String },
    gatewayPaymentRequestId: { type: String },
    gatewayRawWebhook: { type: mongoose.Schema.Types.Mixed },
    fulfillmentStatus: {
      type: String,
      enum: ['Unfulfilled', 'Fulfilled'],
      default: 'Unfulfilled',
    },
    deliveryStatus: {
      type: String,
      enum: ['Order confirmed', 'Packed', 'Shipped', 'Delivered', 'Undelivered'],
      default: 'Order confirmed',
    },
    deliveryReason: { type: String },
    deliveryMethod: { type: String, default: 'Free delivery' },
    assignedDeliveryPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryPartner',
    },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);

