const express = require('express');
const https = require('https');
const crypto = require('crypto');
const Order = require('../models/Order');
const CheckoutSession = require('../models/CheckoutSession');
const Product = require('../models/Product');

const publicRouter = express.Router();

function getInstamojoConfig() {
  const apiKey = process.env.INSTAMOJO_API_KEY;
  const authToken = process.env.INSTAMOJO_AUTH_TOKEN;
  const baseUrl = process.env.INSTAMOJO_BASE_URL || 'https://test.instamojo.com/api/1.1';
  if (!apiKey || !authToken) {
    throw new Error('INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN must be configured');
  }
  return { apiKey, authToken, baseUrl };
}

function getBackendBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

// Helper: call Instamojo Payment Request API
function createPaymentRequest(req, { amount, buyerName, email, phone, purpose }) {
  const { apiKey, authToken, baseUrl } = getInstamojoConfig();
  const base = baseUrl.replace(/\/+$/, '');
  // IMPORTANT: do NOT start path with '/', otherwise the '/api/1.1' part is dropped.
  // We want: https://www.instamojo.com/api/1.1/payment-requests/
  const url = new URL('payment-requests/', `${base}/`);

  const backendBase = getBackendBaseUrl(req);
  const redirectUrl = `${backendBase}/api/public/payments/instamojo/redirect`;

  const body = new URLSearchParams({
    amount: String(amount),
    purpose: purpose || 'Uniform Lab order',
    buyer_name: buyerName || '',
    email: email || '',
    phone: phone || '',
    redirect_url: redirectUrl,
    send_email: 'False',
    send_sms: 'False',
    allow_repeated_payments: 'False',
  });

  // Webhook cannot be localhost/127.0.0.1 – Instamojo rejects it.
  // Only attach webhook when running on a real public domain.
  if (
    backendBase &&
    !backendBase.includes('localhost') &&
    !backendBase.includes('127.0.0.1')
  ) {
    const webhookUrl = `${backendBase}/api/public/payments/instamojo/webhook`;
    body.append('webhook', webhookUrl);
  }

  const options = {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'X-Auth-Token': authToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (!res.statusCode || res.statusCode >= 400 || json.success === false) {
            let details = json?.message || json?.error || json;
            if (typeof details !== 'string') {
              try {
                details = JSON.stringify(details);
              } catch {
                details = String(details);
              }
            }
            const msg = `Instamojo API error (status ${res.statusCode || 'unknown'}): ${details}`;
            // eslint-disable-next-line no-console
            console.error('Instamojo error response:', msg);
            return reject(new Error(msg));
          }
          if (!json.payment_request || !json.payment_request.id || !json.payment_request.longurl) {
            return reject(new Error('Invalid Instamojo response'));
          }
          resolve({
            id: json.payment_request.id,
            url: json.payment_request.longurl,
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.write(body.toString());
    request.end();
  });
}

// POST /api/public/payments/instamojo/checkout
publicRouter.post('/instamojo/checkout', async (req, res) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    address,
    items,
    totalAmount,      // grand total sent from frontend (items + delivery)
    itemsTotal,       // items-only subtotal (optional, informational)
    deliveryCharge,   // should always be 125
  } = req.body || {};

  if (!customerName || !address || !Array.isArray(items) || !items.length || !totalAmount) {
    return res
      .status(400)
      .json({ error: { message: 'customerName, address, items and totalAmount are required' } });
  }

  if (!Number.isFinite(Number(totalAmount)) || Number(totalAmount) <= 0) {
    return res.status(400).json({ error: { message: 'Invalid total amount' } });
  }

  // Always enforce ₹125 delivery charge server-side — never trust client for this
  const DELIVERY_CHARGE = 125;
  const normItemsTotal = Number.isFinite(Number(itemsTotal)) ? Number(itemsTotal) : Number(totalAmount) - DELIVERY_CHARGE;
  const normAmount = normItemsTotal + DELIVERY_CHARGE;

  const firstItem = items[0] || {};
  const baseName = firstItem.productName || firstItem.name || 'Uniform Lab order';
  let purpose = baseName;
  if (firstItem.size) {
    purpose += ` (Size ${firstItem.size})`;
  }
  purpose = `${purpose} – Uniform Lab (+₹125 delivery)`;
  if (purpose.length > 90) purpose = purpose.slice(0, 90);

  const paymentRequest = await createPaymentRequest(req, {
    amount: normAmount,
    buyerName: customerName,
    email: customerEmail,
    phone: customerPhone,
    purpose,
  });

  await CheckoutSession.create({
    paymentRequestId: paymentRequest.id,
    customerName,
    customerEmail: customerEmail || '',
    customerPhone: customerPhone || '',
    address: {
      name: address.name || customerName,
      line1: address.line1,
      line2: address.line2 || '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      phone: address.phone || customerPhone || '',
    },
    items: items.map((i) => ({
      productId: i.productId || undefined,
      productName: i.productName || i.name,
      price: Number(i.price),
      quantity: Number(i.quantity),
      size: i.size,
      color: i.color,
      imageUrl: i.imageUrl,
    })),
    totalAmount: normAmount,
    status: 'Pending',
  });

  return res.json({ paymentUrl: paymentRequest.url });
});

// Middleware only for webhook: urlencoded parser
publicRouter.use(
  '/instamojo/webhook',
  express.urlencoded({ extended: false })
);

// POST /api/public/payments/instamojo/webhook
publicRouter.post('/instamojo/webhook', async (req, res) => {
  const secret = process.env.INSTAMOJO_WEBHOOK_SECRET;
  if (!secret) {
    // If not configured, do not accept webhooks
    return res.status(500).send('Webhook not configured');
  }

  const payload = { ...req.body };
  const mac = payload.mac;
  delete payload.mac;

  const sortedKeys = Object.keys(payload).sort();
  const message = sortedKeys.map((k) => String(payload[k])).join('|');
  const expectedMac = crypto.createHmac('sha1', secret).update(message).digest('hex');

  if (mac !== expectedMac) {
    // eslint-disable-next-line no-console
    console.error('Instamojo webhook MAC mismatch');
    return res.status(400).send('Invalid MAC');
  }

  const status = payload.status;
  const paymentRequestId = payload.payment_request_id;
  const paymentId = payload.payment_id;

  const session = await CheckoutSession.findOne({ paymentRequestId });
  if (!session) {
    // Unknown session; acknowledge so Instamojo stops retrying
    return res.status(200).send('OK');
  }

  if (status === 'Credit' && session.status === 'Pending') {
    // Resolve school from first product (all items are from same school)
    let schoolId;
    try {
      const firstItem = (session.items || [])[0];
      if (firstItem && firstItem.productId) {
        const product = await Product.findById(firstItem.productId).select('school');
        if (product && product.school) {
          schoolId = product.school;
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to resolve school for order', err);
    }

    // Create paid order
    await Order.create({
      uniqueOrderId: require('../utils/orderId')(),
      school: schoolId,
      customerName: session.customerName,
      customerEmail: session.customerEmail,
      customerPhone: session.customerPhone,
      address: session.address,
      items: session.items.map((i) => ({
        product: i.productId,
        productName: i.productName,
        price: i.price,
        quantity: i.quantity,
        size: i.size,
        color: i.color,
        imageUrl: i.imageUrl,
      })),
      totalAmount: session.totalAmount,
      deliveryCharge: 125,
      deliveryMethod: '₹125 delivery',
      paymentMethod: 'Online',
      paymentStatus: 'Paid',
      gatewayPaymentId: paymentId,
      gatewayPaymentRequestId: paymentRequestId,
      gatewayRawWebhook: payload,
    });

    session.status = 'Completed';
    await session.save();
  } else if (status !== 'Credit' && session.status === 'Pending') {
    session.status = 'Failed';
    await session.save();
  }

  return res.status(200).send('OK');
});

// GET /api/public/payments/instamojo/redirect
publicRouter.get('/instamojo/redirect', (req, res) => {
  const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/+$/, '') || 'http://localhost:5173';
  const { payment_status: paymentStatus } = req.query;

  if (String(paymentStatus).toLowerCase() === 'credit') {
    return res.redirect(`${frontendBase}/account?tab=orders&status=success`);
  }
  // Pass reason so frontend can show a specific failure message
  const reason = String(paymentStatus || '').toLowerCase() === 'failed' ? 'failed' : 'cancelled';
  return res.redirect(`${frontendBase}/checkout?status=payment_failed&reason=${reason}`);
});

module.exports = { public: publicRouter };

