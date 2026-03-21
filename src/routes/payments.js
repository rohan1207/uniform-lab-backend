const express = require('express');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const Order = require('../models/Order');
const CheckoutSession = require('../models/CheckoutSession');
const Product = require('../models/Product');
const generateUniqueOrderId = require('../utils/orderId');
const { sendOrderStatusEmail, sendOwnerNewOrderEmail } = require('../utils/emailService');

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

/**
 * GET Instamojo payment-request JSON (for redirect reconciliation).
 */
function instamojoGetPaymentRequest(paymentRequestId) {
  const { apiKey, authToken, baseUrl } = getInstamojoConfig();
  const base = baseUrl.replace(/\/+$/, '');
  const path = `payment-requests/${encodeURIComponent(paymentRequestId)}/`;
  const url = new URL(path, `${base}/`);

  return new Promise((resolve, reject) => {
    const opts = {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        'X-Auth-Token': authToken,
      },
    };

    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          if (!res.statusCode || res.statusCode >= 400 || json.success === false) {
            const msg = json?.message || json?.error || `HTTP ${res.statusCode}`;
            return reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)));
          }
          const pr = json.payment_request || json;
          resolve(pr);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * True if this payment id appears in the payment request with a successful status.
 */
function paymentRequestContainsCompletedPayment(pr, paymentId) {
  if (!pr || !paymentId) return false;
  const payments = Array.isArray(pr.payments) ? pr.payments : [];
  const pid = String(paymentId);
  return payments.some((p) => {
    if (!p || String(p.id) !== pid) return false;
    const st = String(p.status || '').toLowerCase();
    return st === 'credit' || st === 'completed';
  });
}

/**
 * Idempotent: create paid order from a checkout session + Instamojo payment id.
 * Safe to call from webhook and redirect (reconciliation).
 */
async function fulfillInstamojoPaidOrder({
  paymentRequestId,
  paymentId,
  webhookPayload,
  source,
}) {
  if (!paymentRequestId || !paymentId) {
    return { order: null, created: false, reason: 'missing_ids' };
  }

  const pidStr = String(paymentId);

  const existingByPayment = await Order.findOne({ gatewayPaymentId: pidStr });
  if (existingByPayment) {
    const session = await CheckoutSession.findOne({ paymentRequestId });
    if (session && session.status === 'Pending') {
      session.status = 'Completed';
      await session.save();
    }
    return { order: existingByPayment, created: false, duplicate: true };
  }

  const existingForPr = await Order.findOne({ gatewayPaymentRequestId: paymentRequestId });
  if (existingForPr) {
    const session = await CheckoutSession.findOne({ paymentRequestId });
    if (session && session.status === 'Pending') {
      session.status = 'Completed';
      await session.save();
    }
    if (String(existingForPr.gatewayPaymentId || '') !== pidStr) {
      // eslint-disable-next-line no-console
      console.error('[Instamojo] Order exists for payment_request_id but different payment_id', {
        paymentRequestId,
        expected: existingForPr.gatewayPaymentId,
        got: pidStr,
      });
    }
    return { order: existingForPr, created: false, duplicate: true };
  }

  const session = await CheckoutSession.findOne({ paymentRequestId });
  if (!session) {
    // eslint-disable-next-line no-console
    console.error('[Instamojo] fulfill: no CheckoutSession for payment_request_id', paymentRequestId);
    return { order: null, created: false, reason: 'no_session' };
  }

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

  const rawMeta = webhookPayload || { source: source || 'reconciliation', reconciledAt: new Date().toISOString() };

  let order;
  try {
    order = await Order.create({
      uniqueOrderId: generateUniqueOrderId(),
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
      gatewayPaymentId: pidStr,
      gatewayPaymentRequestId: paymentRequestId,
      gatewayRawWebhook: rawMeta,
    });
  } catch (err) {
    // Race: webhook + redirect both created — fetch existing
    if (err && err.code === 11000) {
      const dup = await Order.findOne({ gatewayPaymentId: pidStr });
      if (dup) {
        if (session.status === 'Pending') {
          session.status = 'Completed';
          await session.save();
        }
        return { order: dup, created: false, duplicate: true };
      }
    }
    throw err;
  }

  try {
    await order.populate('school', 'name');
  } catch {
    // non-fatal
  }

  session.status = 'Completed';
  await session.save();

  if (session.customerEmail) {
    const custName = session.customerName || 'Customer';
    sendOrderStatusEmail(session.customerEmail, custName, order, 'confirmed').catch((e) => {
      // eslint-disable-next-line no-console
      console.error(
        `[OrderEmail] Failed confirmation (${source}) for order ${order.uniqueOrderId || order._id}:`,
        e.message,
      );
    });
  }

  sendOwnerNewOrderEmail(order).catch((e) => {
    // eslint-disable-next-line no-console
    console.error(
      `[OwnerOrderEmail] Failed (${source}) for order ${order.uniqueOrderId || order._id}:`,
      e.message,
    );
  });

  return { order, created: true, duplicate: false };
}

// Helper: call Instamojo Payment Request API
function createPaymentRequest(req, { amount, buyerName, email, phone, purpose }) {
  const { apiKey, authToken, baseUrl } = getInstamojoConfig();
  const base = baseUrl.replace(/\/+$/, '');
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
    totalAmount,
    itemsTotal,
    deliveryCharge,
  } = req.body || {};

  if (!customerName || !address || !Array.isArray(items) || !items.length || !totalAmount) {
    return res
      .status(400)
      .json({ error: { message: 'customerName, address, items and totalAmount are required' } });
  }

  if (!Number.isFinite(Number(totalAmount)) || Number(totalAmount) <= 0) {
    return res.status(400).json({ error: { message: 'Invalid total amount' } });
  }

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
  express.urlencoded({ extended: false }),
);

// POST /api/public/payments/instamojo/webhook
publicRouter.post('/instamojo/webhook', async (req, res) => {
  const secret = process.env.INSTAMOJO_WEBHOOK_SECRET;
  if (!secret) {
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
    return res.status(200).send('OK');
  }

  if (status === 'Credit' && session.status === 'Pending') {
    // Do not swallow errors — return 500 so Instamojo retries if DB/email path fails.
    await fulfillInstamojoPaidOrder({
      paymentRequestId,
      paymentId,
      webhookPayload: payload,
      source: 'webhook',
    });
  } else if (status !== 'Credit' && session.status === 'Pending') {
    session.status = 'Failed';
    await session.save();
  }

  return res.status(200).send('OK');
});

// GET /api/public/payments/instamojo/redirect
// Reconciliation: if webhook was missed (sleep, timeout, MAC), user still returns here with
// payment_id + payment_request_id — verify with Instamojo API and create order idempotently.
publicRouter.get('/instamojo/redirect', async (req, res) => {
  const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/+$/, '') || 'http://localhost:5173';

  const q = req.query || {};
  const paymentStatus = String(q.payment_status || '').toLowerCase();
  let paymentRequestId = q.payment_request_id || q.paymentRequestId;
  let paymentId = q.payment_id || q.paymentId;

  const isCredit =
    paymentStatus === 'credit' ||
    paymentStatus === 'success' ||
    paymentStatus === 'completed';

  if (isCredit && paymentRequestId && !paymentId) {
    try {
      const pr = await instamojoGetPaymentRequest(paymentRequestId);
      const payments = Array.isArray(pr.payments) ? pr.payments : [];
      const last = payments.filter((p) => p && p.id).pop();
      if (last && last.id) paymentId = last.id;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Instamojo] redirect: could not fetch payment request', e?.message || e);
    }
  }

  if (isCredit && paymentRequestId && paymentId) {
    try {
      const pr = await instamojoGetPaymentRequest(paymentRequestId);
      const ok = paymentRequestContainsCompletedPayment(pr, paymentId);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn('[Instamojo] redirect: API list inconclusive; still reconciling (trust redirect)', {
          paymentRequestId,
          paymentId,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Instamojo] redirect: verify API failed; still reconciling', e?.message || e);
    }

    try {
      const result = await fulfillInstamojoPaidOrder({
        paymentRequestId,
        paymentId,
        webhookPayload: { source: 'redirect_reconciliation', query: { ...q } },
        source: 'redirect',
      });
      if (result.created) {
        // eslint-disable-next-line no-console
        console.log('[Instamojo] redirect: order created via reconciliation', result.order?.uniqueOrderId);
      } else if (result.duplicate) {
        // eslint-disable-next-line no-console
        console.log('[Instamojo] redirect: order already existed (idempotent)');
      } else if (result.reason === 'no_session') {
        // eslint-disable-next-line no-console
        console.warn('[Instamojo] redirect: no session — cannot create order');
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Instamojo] redirect: fulfill failed', err?.message || err);
    }
  }

  if (isCredit) {
    return res.redirect(`${frontendBase}/account?tab=orders&status=success`);
  }

  const reason = String(paymentStatus || '').toLowerCase() === 'failed' ? 'failed' : 'cancelled';
  return res.redirect(`${frontendBase}/checkout?status=payment_failed&reason=${reason}`);
});

module.exports = { public: publicRouter };
