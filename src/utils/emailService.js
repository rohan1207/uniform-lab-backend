/**
 * emailService.js
 * Transactional email via Resend SDK.
 * Handles: password reset links + order status notifications.
 *
 * Required env vars:
 *   RESEND_API_KEY   – your Resend API key (re_xxxxxxx)
 *   FRONTEND_URL     – e.g. https://uniformlab.in  (no trailing slash)
 *   FROM_EMAIL       – optional override, default: Uniform Lab <orders@uniformlab.in>
 */

const { Resend } = require('resend');

const FROM_EMAIL = process.env.FROM_EMAIL || 'Uniform Lab <orders@uniformlab.in>';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://uniformlab.in').replace(/\/$/, '');
const OWNER_ORDER_EMAIL = process.env.OWNER_ORDER_EMAIL || 'nivi12@gmail.com';
const ADMIN_BASE_URL =
  (process.env.ADMIN_BASE_URL || 'https://uniformlab-admin.onrender.com').replace(/\/+$/, '') ||
  'https://uniformlab-admin.onrender.com';
const ADMIN_ORDERS_URL = `${ADMIN_BASE_URL}/orders`;

// Lazy-init Resend so missing key only warns at call time, not import time
let _resend = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/* ─────────────────────────────────────────────────────────── */
/* Shared HTML helpers                                          */
/* ─────────────────────────────────────────────────────────── */
function emailWrapper(bodyHtml, previewText = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>The Uniform Lab</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a6bb8 0%,#004C99 60%,#003580 100%);padding:22px 20px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">The Uniform Lab</h1>
              <p style="margin:5px 0 0;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">Premium School Uniforms</p>
            </td>
          </tr>
          <!-- BODY -->
          ${bodyHtml}
          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 20px;text-align:center;">
              <p style="margin:0 0 5px;color:#94a3b8;font-size:11px;">
                © ${new Date().getFullYear()} The Uniform Lab &nbsp;·&nbsp;
                <a href="${FRONTEND_URL}" style="color:#2563eb;text-decoration:none;">uniformlab.in</a>
              </p>
              <p style="margin:0;color:#cbd5e1;font-size:10px;">
                Need help? WhatsApp us at
              <a href="https://wa.me/919028552855" style="color:#2563eb;text-decoration:none;">+91 90285 52855</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────── */
/* 1. PASSWORD RESET EMAIL                                      */
/* ─────────────────────────────────────────────────────────── */

/**
 * Sends a password reset email.
 * @param {string} toEmail
 * @param {string} resetToken  – raw 64-char hex token
 */
async function sendPasswordResetEmail(toEmail, resetToken) {
  const resend = getResend();
  const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

  if (!resend) {
    console.warn('[emailService] RESEND_API_KEY not set – skipping password reset email.');
    console.info('[emailService] Reset link (dev):', resetLink);
    return;
  }

  const bodyHtml = `
  <tr>
    <td style="padding:24px 20px 16px;">
      <h2 style="margin:0 0 10px;color:#1a1a2e;font-size:20px;font-weight:700;">Reset your password</h2>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7;">
        We received a request to reset the password for your Uniform Lab account. Click the button below to set a new password.
        This link is valid for <strong>1 hour</strong>.
      </p>
      <a href="${resetLink}"
         style="display:block;width:100%;text-align:center;padding:14px 20px;background:linear-gradient(180deg,#1a6bb8 0%,#004C99 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:9999px;box-sizing:border-box;letter-spacing:0.02em;box-shadow:0 4px 14px rgba(0,76,153,0.35);">
        Reset Password →
      </a>
      <p style="margin:16px 0 6px;color:#94a3b8;font-size:11px;">Or copy this link into your browser:</p>
      <p style="margin:0;background:#f1f5f9;border-radius:8px;padding:10px 12px;color:#2563eb;font-size:11px;word-break:break-all;">${resetLink}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 24px;">
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:12px 16px;">
        <p style="margin:0;color:#92400e;font-size:12px;line-height:1.6;">
          🔒 <strong>Didn't request this?</strong> Simply ignore this email — your password won't change and this link will expire automatically.
        </p>
      </div>
    </td>
  </tr>`;

  const html = emailWrapper(bodyHtml, 'Reset your Uniform Lab password – link expires in 1 hour');

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: '🔐 Reset your Uniform Lab password',
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/* ─────────────────────────────────────────────────────────── */
/* 2. ORDER STATUS EMAIL                                         */
/* ─────────────────────────────────────────────────────────── */

const STATUS_CONFIG = {
  confirmed: {
    subject: '✅ Order Confirmed – The Uniform Lab',
    emoji: '🎉',
    heading: 'Your order is confirmed!',
    statusLabel: 'Order Confirmed',
    color: '#059669',
    bgColor: '#d1fae5',
    borderColor: '#6ee7b7',
    message: "Great news! We've received your order and it's now being prepared by our team. You'll receive another update when it ships.",
  },
  processing: {
    subject: '⚙️ Your Order is Being Processed – The Uniform Lab',
    emoji: '⚙️',
    heading: "We're processing your order",
    statusLabel: 'Processing',
    color: '#2563eb',
    bgColor: '#dbeafe',
    borderColor: '#93c5fd',
    message: 'Your order is currently being carefully processed and prepared by our team. We\'re working hard to get it ready for dispatch.',
  },
  shipped: {
    subject: '🚚 Your Order Has Shipped – The Uniform Lab',
    emoji: '🚚',
    heading: "Your order is on its way!",
    statusLabel: 'Shipped',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    borderColor: '#c4b5fd',
    message: "Great news! Your order has been dispatched and is on its way to you. Our delivery partner will get it to you soon.",
  },
  delivered: {
    subject: '📦 Order Delivered – The Uniform Lab',
    emoji: '📦',
    heading: 'Your order has been delivered!',
    statusLabel: 'Delivered',
    color: '#065f46',
    bgColor: '#d1fae5',
    borderColor: '#6ee7b7',
    message: "Your order has been delivered. We hope you and your students love the new uniforms! If anything isn't right, please reach out.",
  },
  cancelled: {
    subject: '❌ Order Cancelled – The Uniform Lab',
    emoji: '❌',
    heading: 'Your order has been cancelled',
    statusLabel: 'Cancelled',
    color: '#dc2626',
    bgColor: '#fee2e2',
    borderColor: '#fca5a5',
    message: "Your order has been cancelled. If you didn't request this cancellation or have any questions, please contact us immediately.",
  },
};

/**
 * Sends an order status update email.
 * @param {string} toEmail
 * @param {string} customerName
 * @param {object} order        – Mongoose order document (populated or plain)
 * @param {string} newStatus    – one of: confirmed | processing | shipped | delivered | cancelled
 */
async function sendOrderStatusEmail(toEmail, customerName, order, newStatus) {
  const resend = getResend();
  const cfg = STATUS_CONFIG[newStatus] || STATUS_CONFIG.confirmed;

  if (!resend) {
    console.warn(`[emailService] RESEND_API_KEY not set – skipping order status email (${newStatus}).`);
    return;
  }

  const orderId = order.uniqueOrderId || String(order._id).slice(-8).toUpperCase();
  const orderDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // ── Build items rows (with optional image) ──
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRowsHtml = items.map((item) => {
    const name = item.productName || item.name || 'Item';
    const qty = item.quantity || 1;
    const size = item.size ? `<span style="color:#64748b;"> · ${item.size}</span>` : '';
    const color = item.color ? `<span style="color:#64748b;"> · ${item.color}</span>` : '';
    const price = item.price != null ? `₹${Number(item.price).toLocaleString('en-IN')}` : '';
    const lineTotal = item.price != null ? `₹${(Number(item.price) * qty).toLocaleString('en-IN')}` : '';
    const imgUrl = (item.imageUrl || '').replace(/&/g, '&amp;');
    const imgCell = imgUrl
      ? `<td style="padding:10px 12px 10px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:56px;"><img src="${imgUrl}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" /></td>`
      : `<td style="padding:10px 12px 10px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:56px;"></td>`;
    return `
      <tr>
        ${imgCell}
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#1e293b;font-size:13px;line-height:1.5;">
          <strong>${name}</strong>${size}${color}
          <br /><span style="color:#94a3b8;font-size:11px;">Qty: ${qty}${price ? ` · ${price} each` : ''}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;color:#1e293b;font-size:13px;font-weight:600;">${lineTotal}</td>
      </tr>`;
  }).join('');

  const deliveryChargeNumber =
    typeof order.deliveryCharge === 'number' && !Number.isNaN(order.deliveryCharge)
      ? order.deliveryCharge
      : 125;
  const itemsSubtotalNumber = items.reduce((sum, item) => {
    const qty = Number(item.quantity || 1);
    const unit = Number(item.price || 0);
    return sum + qty * unit;
  }, 0);
  const totalAmountNumber =
    order.totalAmount != null && !Number.isNaN(Number(order.totalAmount))
      ? Number(order.totalAmount)
      : itemsSubtotalNumber + deliveryChargeNumber;
  const itemsSubtotal = `₹${itemsSubtotalNumber.toLocaleString('en-IN')}`;
  const deliveryCharge = `₹${deliveryChargeNumber.toLocaleString('en-IN')}`;
  const totalAmount = `₹${totalAmountNumber.toLocaleString('en-IN')}`;

  const ordersLink = `${FRONTEND_URL}/account?tab=orders`;
  const whatsappLink = 'https://wa.me/919028552855';

  const bodyHtml = `
  <tr>
    <td style="padding:24px 20px 0;">
      <!-- Status badge -->
      <div style="display:inline-block;background:${cfg.bgColor};border:1px solid ${cfg.borderColor};border-radius:9999px;padding:5px 14px;margin-bottom:16px;">
        <span style="color:${cfg.color};font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${cfg.emoji} ${cfg.statusLabel}</span>
      </div>
      <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:20px;font-weight:700;">${cfg.heading}</h2>
      <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Hi <strong>${customerName || 'there'}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.7;">${cfg.message}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 16px;">
      <!-- Order summary card -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#f1f5f9;padding:10px 16px;border-bottom:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#1e293b;font-size:13px;font-weight:700;">Order #${orderId}</td>
              <td style="text-align:right;color:#64748b;font-size:12px;">${orderDate}</td>
            </tr>
          </table>
        </div>
        <div style="padding:4px 16px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${itemRowsHtml || `<tr><td colspan="3" style="padding:16px 0;color:#94a3b8;font-size:13px;">No item details available.</td></tr>`}
          </table>
        </div>
        <div style="border-top:2px solid #e2e8f0;padding:10px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;">Items total</td>
              <td style="text-align:right;color:#1e293b;font-size:13px;font-weight:700;">${itemsSubtotal}</td>
            </tr>
            <tr>
              <td style="color:#64748b;font-size:12px;font-weight:600;padding-top:4px;">Delivery charge</td>
              <td style="text-align:right;color:#1e293b;font-size:13px;font-weight:700;padding-top:4px;">${deliveryCharge}</td>
            </tr>
            <tr>
              <td style="color:#1e293b;font-size:14px;font-weight:700;padding-top:6px;">Total</td>
              <td style="text-align:right;color:#004C99;font-size:16px;font-weight:800;padding-top:6px;">${totalAmount}</td>
            </tr>
          </table>
        </div>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 24px;">
      <!-- Buttons stacked vertically — works on all screen sizes -->
      <a href="${ordersLink}"
         style="display:block;width:100%;text-align:center;padding:13px 20px;background:linear-gradient(180deg,#1a6bb8 0%,#004C99 100%);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:9999px;box-sizing:border-box;box-shadow:0 4px 14px rgba(0,76,153,0.3);">
        View My Orders →
      </a>
      <a href="${whatsappLink}"
         style="display:block;width:100%;text-align:center;padding:12px 20px;margin-top:10px;background:#f0fdf4;border:1.5px solid #86efac;color:#15803d;font-size:14px;font-weight:700;text-decoration:none;border-radius:9999px;box-sizing:border-box;">
        💬 WhatsApp Us
      </a>
    </td>
  </tr>`;

  const html = emailWrapper(bodyHtml, `${cfg.heading} – Order #${orderId}`);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: cfg.subject,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/* ─────────────────────────────────────────────────────────── */
/* 3. OWNER NEW ORDER EMAIL                                      */
/* ─────────────────────────────────────────────────────────── */

/**
 * Sends a minimal, premium-looking summary email to the store owner
 * whenever a new order is placed.
 * Includes: customer, shipping address, items with quantities/rates,
 * delivery charge, and grand total.
 *
 * @param {object} order – Mongoose order document (or plain object)
 */
async function sendOwnerNewOrderEmail(order) {
  const resend = getResend();

  if (!resend) {
    console.warn('[emailService] RESEND_API_KEY not set – skipping owner new-order email.');
    return;
  }

  if (!OWNER_ORDER_EMAIL) {
    console.warn('[emailService] OWNER_ORDER_EMAIL not configured – skipping owner new-order email.');
    return;
  }

  if (!order) {
    return;
  }

  const orderId = order.uniqueOrderId || String(order._id || '').slice(-8).toUpperCase() || 'N/A';
  const orderDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const schoolName =
    (order.school && typeof order.school === 'object' && order.school.name && order.school.name) ||
    order.schoolName ||
    '—';

  const customerName = order.customerName || 'Customer';
  const customerEmail = order.customerEmail || '—';
  const customerPhone = order.customerPhone || '—';

  const addr = order.address || {};
  const addressName = addr.name || customerName;
  const line1 = addr.line1 || '';
  const line2 = addr.line2 || '';
  const city = addr.city || '';
  const state = addr.state || '';
  const pincode = addr.pincode || '';
  const phone = addr.phone || customerPhone || '—';

  const addressLines = [line1, line2, city && `${city}`, state && `${state}`, pincode && `${pincode}`]
    .filter(Boolean)
    .join(', ');

  const paymentMethod = order.paymentMethod || 'Unknown';
  const paymentStatus = order.paymentStatus || 'Pending';
  const gatewayPaymentId = order.gatewayPaymentId || '';
  const gatewayPaymentRequestId = order.gatewayPaymentRequestId || '';

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsRowsHtml = items
    .map((item) => {
      const name = item.productName || item.name || 'Item';
      const size = item.size ? ` · Size ${item.size}` : '';
      const color = item.color ? ` · ${item.color}` : '';
      const qty = Number(item.quantity || 1);
      const price = Number(item.price || 0);
      const lineTotal = price * qty;
      const imgUrl = (item.imageUrl || '').replace(/&/g, '&amp;');
      const imgCell = imgUrl
        ? `<td style="padding:8px 10px 8px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:52px;"><img src="${imgUrl}" alt="" width="52" height="52" style="display:block;width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" /></td>`
        : `<td style="padding:8px 10px 8px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:52px;"></td>`;
      return `
        <tr>
          ${imgCell}
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">
            <strong>${name}</strong>${size}${color}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:center;">
            ${qty}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:right;">
            ₹${price.toLocaleString('en-IN')}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">
            ₹${lineTotal.toLocaleString('en-IN')}
          </td>
        </tr>`;
    })
    .join('');

  const deliveryCharge =
    typeof order.deliveryCharge === 'number' && !Number.isNaN(order.deliveryCharge)
      ? order.deliveryCharge
      : 125;
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
  const totalAmountNumber =
    typeof order.totalAmount === 'number' && !Number.isNaN(order.totalAmount)
      ? order.totalAmount
      : itemsSubtotal + deliveryCharge;

  const subtotalDisplay = `₹${itemsSubtotal.toLocaleString('en-IN')}`;
  const deliveryDisplay = `₹${deliveryCharge.toLocaleString('en-IN')}`;
  const totalDisplay = `₹${totalAmountNumber.toLocaleString('en-IN')}`;

  const bodyHtml = `
  <tr>
    <td style="padding:22px 20px 8px;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;font-weight:600;">
        New Order Placed
      </p>
      <h2 style="margin:0 0 12px;font-size:19px;color:#0f172a;font-weight:750;">
        Order #${orderId}
      </h2>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b;">
        A new order has been placed on The Uniform Lab.
        Open it in the admin panel to review and fulfil.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td colspan="2" style="background:#f8fafc;padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            <strong style="color:#0f172a;">Order meta</strong>
            <span style="float:right;color:#94a3b8;">${orderDate}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-right:1px solid #e2e8f0;vertical-align:top;width:50%;font-size:12px;color:#0f172a;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Customer</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${customerName}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:2px;">${customerEmail}</div>
            <div style="font-size:12px;color:#64748b;">${customerPhone}</div>
          </td>
          <td style="padding:10px 14px;vertical-align:top;width:50%;font-size:12px;color:#0f172a;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Ship to</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${addressName}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:2px;">${addressLines || '—'}</div>
            <div style="font-size:12px;color:#64748b;">${phone}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-top:1px solid #e5e7eb;font-size:12px;color:#0f172a;vertical-align:top;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">School</div>
            <div style="font-size:13px;font-weight:600;">${schoolName}</div>
          </td>
          <td style="padding:10px 14px;border-top:1px solid #e5e7eb;font-size:12px;color:#0f172a;vertical-align:top;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Payment</div>
            <div style="font-size:12px;color:#111827;margin-bottom:2px;">
              <strong>${paymentMethod}</strong>
              <span style="color:#9ca3af;"> · ${paymentStatus}</span>
            </div>
            ${
              gatewayPaymentId
                ? `<div style="font-size:11px;color:#6b7280;">Txn ID: ${gatewayPaymentId}</div>`
                : gatewayPaymentRequestId
                ? `<div style="font-size:11px;color:#6b7280;">Request ID: ${gatewayPaymentRequestId}</div>`
                : ''
            }
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:4px 20px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td colspan="5" style="background:#f8fafc;padding:9px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            <strong style="color:#0f172a;">Items</strong>
          </td>
        </tr>
        <tr>
          <th style="padding:6px 10px 6px 0;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;width:52px;"></th>
          <th align="left" style="padding:6px 14px;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;">Product</th>
          <th align="center" style="padding:6px 0;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;width:12%;">Qty</th>
          <th align="right" style="padding:6px 14px;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;width:20%;">Rate</th>
          <th align="right" style="padding:6px 14px;font-size:11px;color:#9ca3af;font-weight:600;border-bottom:1px solid #e5e7eb;width:22%;">Line total</th>
        </tr>
        ${itemsRowsHtml || `
        <tr>
          <td colspan="5" style="padding:14px 14px 16px;font-size:12px;color:#9ca3af;text-align:center;">
            No item details available.
          </td>
        </tr>`}
        <tr>
          <td colspan="4" style="padding:10px 14px 4px;font-size:12px;color:#64748b;text-align:right;">Items subtotal</td>
          <td style="padding:10px 14px 4px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${subtotalDisplay}</td>
        </tr>
        <tr>
          <td colspan="4" style="padding:4px 14px;font-size:12px;color:#64748b;text-align:right;">Delivery charge</td>
          <td style="padding:4px 14px;font-size:13px;color:#0f172a;font-weight:600;text-align:right;">${deliveryDisplay}</td>
        </tr>
        <tr>
          <td colspan="4" style="padding:8px 14px 10px;font-size:12px;color:#111827;font-weight:700;text-align:right;border-top:1px solid #e5e7eb;">Grand total</td>
          <td style="padding:8px 14px 10px;font-size:15px;color:#004C99;font-weight:800;text-align:right;border-top:1px solid #e5e7eb;">${totalDisplay}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 22px;">
      <a href="${ADMIN_ORDERS_URL}"
         style="display:block;width:100%;text-align:center;padding:13px 18px;background:#0f172a;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:9999px;box-sizing:border-box;">
        Open orders dashboard →
      </a>
    </td>
  </tr>`;

  const html = emailWrapper(bodyHtml, `New order #${orderId} – ${customerName}`);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: OWNER_ORDER_EMAIL,
    subject: `New order #${orderId} – ${schoolName !== '—' ? schoolName : 'The Uniform Lab'}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/* ─────────────────────────────────────────────────────────── */
/* 4. OWNER EXCHANGE REQUEST EMAIL                              */
/* ─────────────────────────────────────────────────────────── */

/**
 * Sends a concise summary email to the owner whenever a customer
 * submits a new exchange request.
 *
 * Mirrors the key data shown in the admin panel:
 * - Order ID + basic order info
 * - Customer + contact
 * - Address
 * - Item being exchanged (size, color, qty)
 * - Reason + current status
 */
async function sendOwnerExchangeRequestEmail(exchangeReq) {
  const resend = getResend();

  if (!resend) {
    console.warn('[emailService] RESEND_API_KEY not set – skipping owner exchange email.');
    return;
  }

  if (!OWNER_ORDER_EMAIL) {
    console.warn('[emailService] OWNER_ORDER_EMAIL not configured – skipping owner exchange email.');
    return;
  }

  if (!exchangeReq) return;

  const orderId = exchangeReq.orderUniqueId || (exchangeReq.order && exchangeReq.order.uniqueOrderId) || 'N/A';
  const createdAt = exchangeReq.createdAt
    ? new Date(exchangeReq.createdAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const customerName = exchangeReq.customerName || 'Customer';
  const customerEmail = exchangeReq.customerEmail || '—';
  const customerPhone = exchangeReq.customerPhone || '—';

  const addr = exchangeReq.customerAddress || {};
  const addressName = addr.name || customerName;
  const line1 = addr.line1 || '';
  const line2 = addr.line2 || '';
  const city = addr.city || '';
  const state = addr.state || '';
  const pincode = addr.pincode || '';
  const phone = addr.phone || customerPhone || '—';

  const addressLines = [line1, line2, city && `${city}`, state && `${state}`, pincode && `${pincode}`]
    .filter(Boolean)
    .join(', ');

  const itemName = exchangeReq.itemName || 'Item';
  const itemSize = exchangeReq.itemSize ? `Size ${exchangeReq.itemSize}` : '';
  const itemColor = exchangeReq.itemColor || '';
  const itemQty = exchangeReq.itemQuantity || 1;
  const reason = exchangeReq.reason || '—';
  const status = exchangeReq.status || 'Pending';
  const itemImageUrl = (exchangeReq.itemImage || '').replace(/&/g, '&amp;');
  const itemImageCell = itemImageUrl
    ? `<td style="padding:10px 14px;vertical-align:middle;width:64px;"><img src="${itemImageUrl}" alt="" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0;" /></td>`
    : '';

  const adminExchangeUrl = `${ADMIN_BASE_URL}/exchanges`;

  const bodyHtml = `
  <tr>
    <td style="padding:22px 20px 10px;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;font-weight:600;">
        New Exchange Request
      </p>
      <h2 style="margin:0 0 10px;font-size:18px;color:#0f172a;font-weight:750;">
        Order #${orderId}
      </h2>
      <p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">
        Received at ${createdAt}
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="padding:10px 14px;border-right:1px solid #e2e8f0;vertical-align:top;width:50%;font-size:12px;color:#0f172a;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Customer</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${customerName}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:2px;">${customerEmail}</div>
            <div style="font-size:12px;color:#64748b;">${customerPhone}</div>
          </td>
          <td style="padding:10px 14px;vertical-align:top;width:50%;font-size:12px;color:#0f172a;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Ship to</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${addressName}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:2px;">${addressLines || '—'}</div>
            <div style="font-size:12px;color:#64748b;">${phone}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:4px 20px 12px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td colspan="${itemImageUrl ? 3 : 2}" style="background:#f8fafc;padding:9px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
            <strong style="color:#0f172a;">Item requested for exchange</strong>
          </td>
        </tr>
        <tr>
          ${itemImageCell}
          <td style="padding:10px 14px;font-size:13px;color:#0f172a;vertical-align:middle;">
            <div style="font-weight:600;margin-bottom:2px;">${itemName}</div>
            <div style="font-size:12px;color:#64748b;">
              ${[itemSize, itemColor].filter(Boolean).join(' · ') || ''}
            </div>
          </td>
          <td style="padding:10px 14px;font-size:12px;color:#64748b;text-align:right;white-space:nowrap;vertical-align:middle;">
            Qty: <strong style="color:#0f172a;">${itemQty}</strong>
          </td>
        </tr>
        <tr>
          <td colspan="${itemImageUrl ? 3 : 2}" style="padding:8px 14px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#111827;">
            <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;">Reason</div>
            <div style="font-size:12px;color:#1f2933;line-height:1.5;white-space:pre-line;">${reason}</div>
          </td>
        </tr>
        <tr>
          <td colspan="${itemImageUrl ? 3 : 2}" style="padding:6px 14px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#111827;">
            <span style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;margin-right:6px;">Status</span>
            <span style="display:inline-block;padding:3px 10px;border-radius:9999px;border:1px solid #e5e7eb;font-size:11px;color:#0f172a;background:#f9fafb;">
              ${status}
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 20px 22px;">
      <a href="${adminExchangeUrl}"
         style="display:block;width:100%;text-align:center;padding:13px 18px;background:#0f172a;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:9999px;box-sizing:border-box;">
        Open exchange dashboard →
      </a>
    </td>
  </tr>`;

  const html = emailWrapper(
    bodyHtml,
    `New exchange request for order #${orderId} – ${customerName}`
  );

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: OWNER_ORDER_EMAIL,
    subject: `New exchange request – Order #${orderId}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

/* ─────────────────────────────────────────────────────────── */
/* 5. STOCK AVAILABLE EMAIL                                   */
/* ─────────────────────────────────────────────────────────── */

/**
 * Sends email to a customer when their requested product/color
 * becomes available again.
 */
async function sendStockAvailableEmail({ toEmail, customerName, schoolName, productName, shopNowUrl }) {
  const resend = getResend();
  if (!resend) {
    console.warn('[emailService] RESEND_API_KEY not set – skipping stock available email.');
    return;
  }

  if (!toEmail) return;

  const safeCustomerName = customerName || 'there';
  const safeSchoolName = schoolName || '';
  const safeProductName = productName || '';
  const safeShopNowUrl = shopNowUrl || FRONTEND_URL;

  const bodyHtml = `
  <tr>
    <td style="padding:26px 20px 8px;">
      <div style="display:inline-block;background:#d1fae5;border:1px solid #6ee7b7;border-radius:9999px;padding:5px 14px;margin-bottom:16px;">
        <span style="color:#065f46;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Available now</span>
      </div>
      <h2 style="margin:0 0 10px;color:#0f172a;font-size:20px;font-weight:800;">
        Your requested item is back in stock
      </h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.7;">
        Hi <strong>${safeCustomerName}</strong>,
        <br />
        <span style="color:#0f172a;font-weight:700;">${safeProductName}</span>
        ${safeSchoolName ? `for ${safeSchoolName}` : ''} is now available again.
      </p>
    </td>
  </tr>

  <tr>
    <td style="padding:0 20px 24px;">
      <a href="${safeShopNowUrl}"
         style="display:block;width:100%;text-align:center;padding:13px 18px;background:#0f172a;color:#ffffff;font-size:13px;font-weight:800;text-decoration:none;border-radius:9999px;box-sizing:border-box;">
        Shop Now →
      </a>
      <p style="margin:12px 0 0;color:#94a3b8;font-size:11px;line-height:1.6;">
        Thanks for your request. We notify customers as soon as availability returns.
      </p>
    </td>
  </tr>`;

  const html = emailWrapper(bodyHtml, `Stock available – ${safeProductName}`);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: `Stock available – ${safeProductName}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendOrderStatusEmail,
  sendOwnerNewOrderEmail,
  sendOwnerExchangeRequestEmail,
  sendStockAvailableEmail,
};

