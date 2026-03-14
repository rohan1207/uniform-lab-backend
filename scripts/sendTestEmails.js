/* sendTestEmails.js
 *
 * Helper script to manually trigger the same email flows
 * as a real new order + exchange request, without going
 * through checkout or payment.
 *
 * Usage (from Backend folder):
 *   node scripts/sendTestEmails.js
 *
 * It will:
 * 1) Send the owner new-order summary email
 * 2) Send the owner exchange-request summary email
 */

require('dotenv').config();

const { sendOwnerNewOrderEmail, sendOwnerExchangeRequestEmail } = require('../src/utils/emailService');

async function main() {
  // ────────────────────────────────────────────────────────────
  // 1. Dummy order object – based on your screenshot
  //    Billed to / Shipped to: Geetu Garg
  //    School: The Kalyani School
  // ────────────────────────────────────────────────────────────

  const dummyOrder = {
    uniqueOrderId: 'UL-20260312-00001',
    school: { name: 'The Kalyani School' },
    customerName: 'Geetu Garg',
    customerEmail: 'geetu.garg@example.com',
    customerPhone: '9975444950',
    address: {
      name: 'Geetu Garg',
      line1: 'CL3/404, Bramha Sun City, Wadgaon Sheri',
      line2: '',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411014',
      phone: '9975444950',
    },
    items: [
      {
        productName: 'Sports T-Shirt',
        color: 'Green',
        size: '34',
        quantity: 2,
        price: 550,
        imageUrl: '',
      },
      {
        productName: 'Sports Track Pant',
        color: 'Green',
        size: '30',
        quantity: 1,
        price: 570,
        imageUrl: '',
      },
      {
        productName: 'Socks',
        color: 'Navy',
        size: '5',
        quantity: 1,
        price: 120,
        imageUrl: '',
      },
      {
        productName:
          'Elastic Full Pant (For Boys: Grade 6th & Above / For Girls: Grade 9th & Above)',
        color: 'Navy',
        size: '38h',
        quantity: 1,
        price: 690,
        imageUrl: '',
      },
    ],
    deliveryCharge: 125,
    totalAmount: 2605, // 550*2 + 570 + 120 + 690 + 125
    paymentMethod: 'Online',
    paymentStatus: 'Paid',
    gatewayPaymentId: 'MOJO5a06000J12345678',
    gatewayPaymentRequestId: '5f8a2b1c3d4e5',
    createdAt: new Date(),
  };

  // ────────────────────────────────────────────────────────────
  // 2. Dummy exchange request – based on your screenshot
  //    Order: UL-20260311-00002, customer: Agasthya Adwani
  // ────────────────────────────────────────────────────────────

  const dummyExchangeRequest = {
    orderUniqueId: 'UL-20260311-00002',
    customerName: 'Agasthya Adwani',
    customerEmail: 'sneha.khanchandani@gmail.com',
    customerPhone: '9822532501',
    customerAddress: {
      name: 'Agasthya Adwani',
      line1: '24k Atria, Tower 1, Flat 102, Pimple nilakh',
      line2: '',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411027',
      phone: '9822532501',
    },
    itemName: 'GREY FULL PANT (HALF ELASTIC WITHOUT PLEAT)',
    itemSize: '28h',
    itemColor: 'Grey',
    itemQuantity: 1,
    reason:
      'Size too small. I had ordered Height 36. He wear 36 size uniform shirt and T-shirt.',
    status: 'Pending',
    createdAt: new Date(),
  };

  try {
    console.log('Sending owner new-order summary email...');
    await sendOwnerNewOrderEmail(dummyOrder);
    console.log('✓ Owner new-order email sent.');
  } catch (err) {
    console.error('✗ Failed to send owner new-order email:', err.message);
  }

  try {
    console.log('Sending owner exchange-request summary email...');
    await sendOwnerExchangeRequestEmail(dummyExchangeRequest);
    console.log('✓ Owner exchange-request email sent.');
  } catch (err) {
    console.error('✗ Failed to send owner exchange-request email:', err.message);
  }

  console.log('Done. Check your inbox for the two owner test emails.');
}

main().catch((err) => {
  console.error('Unexpected error in sendTestEmails script:', err);
  process.exit(1);
});

