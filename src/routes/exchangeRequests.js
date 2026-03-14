const express = require('express');
const ExchangeRequest = require('../models/ExchangeRequest');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const { sendOwnerExchangeRequestEmail } = require('../utils/emailService');

// ─── Customer-facing router (mounted under /api/customer, already auth-guarded) ───
const customerRouter = express.Router();

// POST /api/customer/exchange-requests  — submit a new exchange request
customerRouter.post('/', async (req, res) => {
  const { orderId, itemIndex, reason } = req.body || {};

  if (!orderId || itemIndex == null || !String(reason || '').trim()) {
    return res.status(400).json({
      error: { message: 'orderId, itemIndex and reason are required' },
    });
  }

  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }

  // Accept MongoDB _id (sent from frontend)
  const order = await Order.findById(orderId);
  if (!order) {
    return res.status(404).json({ error: { message: 'Order not found' } });
  }

  // Verify order belongs to this customer
  if (order.customerEmail !== customer.email) {
    return res.status(403).json({ error: { message: 'Order does not belong to this account' } });
  }

  const idx = Number(itemIndex);
  const item = Array.isArray(order.items) ? order.items[idx] : null;
  if (!item) {
    return res.status(400).json({ error: { message: 'Invalid item index' } });
  }

  const exchangeReq = await ExchangeRequest.create({
    order: order._id,
    orderUniqueId: order.uniqueOrderId,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    customerAddress: order.address ? order.address.toObject() : {},
    itemIndex: idx,
    itemName: item.productName,
    itemSize: item.size,
    itemColor: item.color,
    itemQuantity: item.quantity,
    itemImage: item.imageUrl,
    reason: String(reason).trim(),
  });

  // Owner notification email – background only, non-blocking
  sendOwnerExchangeRequestEmail(exchangeReq).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      `[OwnerExchangeEmail] Failed owner notification for exchange request ${exchangeReq._id}:`,
      err.message
    );
  });

  return res.status(201).json(exchangeReq);
});

// GET /api/customer/exchange-requests  — list own exchange requests
customerRouter.get('/', async (req, res) => {
  const customer = await Customer.findById(req.customer.id);
  if (!customer) {
    return res.status(404).json({ error: { message: 'Customer not found' } });
  }

  const requests = await ExchangeRequest.find({ customerEmail: customer.email })
    .sort({ createdAt: -1 });

  return res.json(requests);
});

// ─── Admin router (mounted under /api/admin, already auth-guarded) ───
const adminRouter = express.Router();

// GET /api/admin/exchange-requests  — list all exchange requests
adminRouter.get('/', async (req, res) => {
  const requests = await ExchangeRequest.find()
    .populate('order', 'uniqueOrderId totalAmount deliveryStatus paymentStatus')
    .sort({ createdAt: -1 });
  return res.json(requests);
});

// PUT /api/admin/exchange-requests/:id  — update remark and/or status
adminRouter.put('/:id', async (req, res) => {
  const { adminRemark, status } = req.body || {};
  const update = {};
  if (typeof adminRemark === 'string') update.adminRemark = adminRemark;
  if (status && ['Pending', 'Reviewed', 'Approved', 'Rejected'].includes(status)) {
    update.status = status;
  }

  const updated = await ExchangeRequest.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  }).populate('order', 'uniqueOrderId totalAmount deliveryStatus paymentStatus');

  if (!updated) {
    return res.status(404).json({ error: { message: 'Exchange request not found' } });
  }

  return res.json(updated);
});

module.exports = { customerRouter, adminRouter };
