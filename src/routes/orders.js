const express = require('express');
const Order = require('../models/Order');
const DeliveryPartner = require('../models/DeliveryPartner');
const Product = require('../models/Product');
const generateUniqueOrderId = require('../utils/orderId');
const { sendOrderStatusEmail } = require('../utils/emailService');
const { emitUnfulfilledCount } = require('../socket');

const publicRouter = express.Router();
const adminRouter = express.Router();

// PUBLIC
// POST /api/public/orders  – create order from storefront checkout
publicRouter.post('/', async (req, res) => {
  const {
    schoolId,
    customerName,
    customerEmail,
    customerPhone,
    address,
    items,
    totalAmount,
    paymentMethod,
  } = req.body;

  if (!customerName || !address || !Array.isArray(items) || !items.length) {
    return res
      .status(400)
      .json({ error: { message: 'customerName, address and at least one item are required' } });
  }

  const uniqueOrderId = generateUniqueOrderId();

  let defaultPartner = await DeliveryPartner.findOne({ isDefault: true });
  if (!defaultPartner) {
    defaultPartner = await DeliveryPartner.findOne();
  }

  const order = await Order.create({
    uniqueOrderId,
    school: schoolId || undefined,
    customerName,
    customerEmail,
    customerPhone,
    address,
    items: items.map((i) => ({
      product: i.productId,
      productName: i.productName,
      price: i.price,
      quantity: i.quantity,
      size: i.size,
      color: i.color,
      imageUrl: i.imageUrl,
    })),
    totalAmount,
    paymentMethod: paymentMethod || 'COD',
    paymentStatus: paymentMethod === 'Online' ? 'Paid' : 'Pending',
    assignedDeliveryPartner: defaultPartner ? defaultPartner._id : undefined,
  });

  emitUnfulfilledCount().catch(() => {});
  res.status(201).json(order);
});

// ADMIN
// GET /api/admin/orders?schoolId=
adminRouter.get('/', async (req, res) => {
  const { schoolId } = req.query;
  const query = {};
  if (schoolId) query.school = schoolId;

  let orders = await Order.find(query)
    .populate('assignedDeliveryPartner', 'name phone')
    .populate('school', 'name')
    .sort({ createdAt: -1 });

  // Backfill missing school for older orders using first line item's product
  const needsBackfill = orders.filter(
    (o) => !o.school && Array.isArray(o.items) && o.items[0] && o.items[0].product
  );

  for (const order of needsBackfill) {
    try {
      const first = order.items[0];
      const product = await Product.findById(first.product).select('school');
      if (product && product.school) {
        order.school = product.school;
        await order.save();
        await order.populate('school', 'name');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to backfill order.school', order._id.toString(), err);
    }
  }

  res.json(orders);
});

// GET /api/admin/orders/:id
adminRouter.get('/:id', async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('assignedDeliveryPartner', 'name phone')
    .populate('school', 'name');
  if (!order) {
    return res.status(404).json({ error: { message: 'Order not found' } });
  }
  res.json(order);
});

// Maps Order.deliveryStatus enum values → emailService STATUS_CONFIG keys
const DELIVERY_EMAIL_MAP = {
  'Order confirmed': 'confirmed',
  'Packed':          'processing',
  'Shipped':         'shipped',
  'Delivered':       'delivered',
  'Undelivered':     'cancelled',
};

// PATCH /api/admin/orders/:id  – update fulfillment/delivery/assigned partner/notes
adminRouter.patch('/:id', async (req, res) => {
  const {
    fulfillmentStatus,
    deliveryStatus,
    deliveryReason,
    assignedDeliveryPartnerId,
    notes,
    paymentStatus,
    trackingNumber,
  } = req.body;

  const update = {};
  if (fulfillmentStatus) update.fulfillmentStatus = fulfillmentStatus;
  if (deliveryStatus) update.deliveryStatus = deliveryStatus;
  if (typeof deliveryReason === 'string') update.deliveryReason = deliveryReason;
  if (typeof notes === 'string') update.notes = notes;
  if (paymentStatus) update.paymentStatus = paymentStatus;
  if (assignedDeliveryPartnerId) update.assignedDeliveryPartner = assignedDeliveryPartnerId;
  if (typeof trackingNumber === 'string') update.trackingNumber = trackingNumber;

  // Snapshot previous deliveryStatus BEFORE the update (only when deliveryStatus is changing)
  const previousOrder = deliveryStatus
    ? await Order.findById(req.params.id).select('deliveryStatus customerEmail customerName').lean()
    : null;

  const order = await Order.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  }).populate('assignedDeliveryPartner', 'name phone');

  if (!order) {
    return res.status(404).json({ error: { message: 'Order not found' } });
  }

  // ── Non-blocking order status email ──────────────────────────────────────────
  // Fires when deliveryStatus actually changes AND customer has an email.
  // Errors are caught and logged — they NEVER affect the HTTP response.
  if (
    previousOrder &&
    deliveryStatus &&
    deliveryStatus !== previousOrder.deliveryStatus
  ) {
    const emailKey = DELIVERY_EMAIL_MAP[deliveryStatus];
    const emailAddr = order.customerEmail || previousOrder.customerEmail;
    const custName  = order.customerName  || previousOrder.customerName || 'Customer';

    if (emailKey && emailAddr) {
      sendOrderStatusEmail(emailAddr, custName, order, emailKey).catch((err) => {
        console.error(
          `[OrderEmail] Failed for order ${order.uniqueOrderId || order._id} → ${deliveryStatus}:`,
          err.message
        );
      });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  if (fulfillmentStatus === 'Fulfilled') {
    emitUnfulfilledCount().catch(() => {});
  }
  res.json(order);
});

module.exports = { public: publicRouter, admin: adminRouter };

