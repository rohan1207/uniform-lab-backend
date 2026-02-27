const express = require('express');
const DeliveryPartner = require('../models/DeliveryPartner');

const adminRouter = express.Router();

// GET /api/admin/delivery-partners
adminRouter.get('/', async (req, res) => {
  const partners = await DeliveryPartner.find().sort({ createdAt: 1 });
  res.json(partners);
});

// POST /api/admin/delivery-partners
adminRouter.post('/', async (req, res) => {
  const { name, phone, isDefault, notes } = req.body;
  if (!name) {
    return res.status(400).json({ error: { message: 'name is required' } });
  }
  if (isDefault) {
    // ensure only one default
    await DeliveryPartner.updateMany({ isDefault: true }, { isDefault: false });
  }
  const partner = await DeliveryPartner.create({ name, phone, isDefault, notes });
  res.status(201).json(partner);
});

// PATCH /api/admin/delivery-partners/:id
adminRouter.patch('/:id', async (req, res) => {
  const update = { ...req.body };
  if (update.isDefault) {
    await DeliveryPartner.updateMany({ isDefault: true }, { isDefault: false });
  }
  const partner = await DeliveryPartner.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!partner) {
    return res.status(404).json({ error: { message: 'Delivery partner not found' } });
  }
  res.json(partner);
});

// DELETE /api/admin/delivery-partners/:id
adminRouter.delete('/:id', async (req, res) => {
  await DeliveryPartner.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

module.exports = { admin: adminRouter };

