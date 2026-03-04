const mongoose = require('mongoose');

const exchangeRequestSchema = new mongoose.Schema(
  {
    // Hard reference to the order document
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    // Denormalized for fast display without populate
    orderUniqueId: { type: String },

    // Customer info (denormalized from order at submission time)
    customerName: { type: String },
    customerEmail: { type: String },
    customerPhone: { type: String },
    customerAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      phone: String,
    },

    // The specific item being exchanged (denormalized)
    itemIndex: { type: Number },
    itemName: { type: String },
    itemSize: { type: String },
    itemColor: { type: String },
    itemQuantity: { type: Number },
    itemImage: { type: String },

    // Customer's reason
    reason: { type: String, required: true },

    // Status workflow
    status: {
      type: String,
      enum: ['Pending', 'Reviewed', 'Approved', 'Rejected'],
      default: 'Pending',
    },

    // Admin remark (admin can write notes here)
    adminRemark: { type: String, default: '' },
  },
  { timestamps: true }
);

exchangeRequestSchema.index({ customerEmail: 1, createdAt: -1 });
exchangeRequestSchema.index({ order: 1 });

module.exports = mongoose.model('ExchangeRequest', exchangeRequestSchema);
