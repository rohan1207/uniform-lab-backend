/**
 * sendOrderTestEmail.js
 * Quick script to send a single test "Order Confirmed" email
 * so you can preview the layout in your inbox.
 *
 * Run from Backend folder:
 *   node scripts/sendOrderTestEmail.js
 *
 * Required env:
 *   RESEND_API_KEY   – your Resend API key
 * Optional:
 *   TEST_EMAIL       – override recipient (defaults to rohanambhore7@gmail.com)
 *   FROM_EMAIL, FRONTEND_URL – same as main app (see emailService.js)
 */

// Load .env so RESEND_API_KEY / TEST_EMAIL etc are available
require('dotenv').config();

const { sendOrderStatusEmail } = require('../src/utils/emailService');

const toEmail = process.env.TEST_EMAIL || 'rohanambhore7@gmail.com';

// Minimal mock order object using the same shape as real orders
const mockOrder = {
  uniqueOrderId: 'UL-TEST-1234',
  createdAt: new Date().toISOString(),
  totalAmount: 1999,
  items: [
    {
      productName: 'Sample School Shirt',
      price: 999,
      quantity: 2,
      size: 'M',
      color: 'White / Blue',
    },
  ],
};

async function main() {
  // eslint-disable-next-line no-console
  console.log(`Sending test order email to ${toEmail} ...`);

  try {
    await sendOrderStatusEmail(toEmail, 'Rohan', mockOrder, 'confirmed');
    // eslint-disable-next-line no-console
    console.log('✅ Test email sent. Check your inbox (and spam folder).');
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to send test email:', err);
    process.exit(1);
  }
}

main();

