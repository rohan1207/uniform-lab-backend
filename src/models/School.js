const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    logoUrl: { type: String },
    logoPublicId: { type: String }, // Cloudinary public_id for deletion
    imageUrl: { type: String },
    imagePublicId: { type: String }, // Cloudinary public_id for school main image
    level: { type: String }, // e.g. CBSE, ICSE
    classes: [{ type: String }], // e.g. ['Nursery','KG','1',...]
    accentColor: { type: String },
    isActive: { type: Boolean, default: true },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('School', schoolSchema);

