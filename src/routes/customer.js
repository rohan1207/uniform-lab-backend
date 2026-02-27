const express = require('express');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

const router = express.Router();

// Helper to strip sensitive fields
function serializeCustomer(customer) {
  if (!customer) return null;
  return {
    id: customer._id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
  };
}

// GET /api/customer/me
router.get('/me', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }
  return res.json(serializeCustomer(customer));
});

// PUT /api/customer/me
router.put('/me', async (req, res) => {
  const { name, phone } = req.body || {};
  const update = {};
  if (typeof name === 'string' && name.trim()) update.name = name.trim();
  if (typeof phone === 'string') update.phone = phone.trim();

  const customer = await Customer.findByIdAndUpdate(req.customer.id, update, {
    new: true,
    runValidators: true,
  });
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }
  return res.json(serializeCustomer(customer));
});

// Addresses helpers
function normalizeAddressInput(body) {
  const {
    label,
    name,
    phone,
    line1,
    line2,
    city,
    state,
    pincode,
    isDefault,
  } = body || {};

  return {
    label: label ? String(label).trim() : '',
    name: name ? String(name).trim() : '',
    phone: phone ? String(phone).trim() : '',
    line1: line1 ? String(line1).trim() : '',
    line2: line2 ? String(line2).trim() : '',
    city: city ? String(city).trim() : '',
    state: state ? String(state).trim() : '',
    pincode: pincode ? String(pincode).trim() : '',
    isDefault: Boolean(isDefault),
  };
}

// GET /api/customer/addresses
router.get('/addresses', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }
  return res.json(Array.isArray(customer.addresses) ? customer.addresses : []);
});

// POST /api/customer/addresses
router.post('/addresses', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }

  const addr = normalizeAddressInput(req.body);
  if (!addr.name || !addr.phone || !addr.line1 || !addr.city || !addr.state || !addr.pincode) {
    return res.status(400).json({ error: { message: 'Incomplete address' } });
  }

  if (!customer.addresses) customer.addresses = [];

  const willBeDefault = addr.isDefault || customer.addresses.length === 0;
  if (willBeDefault) {
    customer.addresses = customer.addresses.map((a) => ({ ...a.toObject(), isDefault: false }));
    addr.isDefault = true;
  }

  customer.addresses.push(addr);
  await customer.save();

  return res.status(201).json(customer.addresses);
});

// PUT /api/customer/addresses/:id
router.put('/addresses/:id', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }

  const addrId = req.params.id;
  if (!customer.addresses || !customer.addresses.id(addrId)) {
    return res.status(404).json({ error: { message: 'Address not found' } });
  }

  const updates = normalizeAddressInput(req.body);
  const address = customer.addresses.id(addrId);
  Object.assign(address, updates);

  if (updates.isDefault) {
    customer.addresses.forEach((a) => {
      a.isDefault = a._id.toString() === addrId;
    });
  }

  await customer.save();
  return res.json(customer.addresses);
});

// DELETE /api/customer/addresses/:id
router.delete('/addresses/:id', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }

  const addrId = req.params.id;
  if (!customer.addresses || !customer.addresses.id(addrId)) {
    return res.status(404).json({ error: { message: 'Address not found' } });
  }

  customer.addresses.id(addrId).deleteOne();

  // Ensure there is always at most one default
  if (customer.addresses.length > 0 && !customer.addresses.some((a) => a.isDefault)) {
    customer.addresses[0].isDefault = true;
  }

  await customer.save();
  return res.json(customer.addresses);
});

// GET /api/customer/orders – orders for logged-in customer (by email)
router.get('/orders', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }

  const email = customer.email;
  const orders = await Order.find({ customerEmail: email }).sort({ createdAt: -1 });
  return res.json(orders);
});

module.exports = router;

