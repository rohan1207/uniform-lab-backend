const mongoose = require('mongoose');

const deliveryPartnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String },
    isDefault: { type: Boolean, default: false },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeliveryPartner', deliveryPartnerSchema);

