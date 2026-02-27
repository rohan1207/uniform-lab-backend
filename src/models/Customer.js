const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    label: { type: String },
    name: { type: String },
    phone: { type: String },
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    passwordHash: { type: String, required: true },
    addresses: [addressSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);

