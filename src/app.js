require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Routers
const schoolRouter = require('./routes/schools');
const productRouter = require('./routes/products');
const categoryRouter = require('./routes/categories');
const orderRouter = require('./routes/orders');
const deliveryPartnerRouter = require('./routes/deliveryPartners');
const seoRouter = require('./routes/seo');
const recommendationRouter = require('./routes/recommendations');
const adminAuthRouter = require('./routes/adminAuth');
const adminAuth = require('./middleware/adminAuth');
const uploadRouter = require('./routes/upload');
const customerAuthRouter = require('./routes/customerAuth');
const customerRouter = require('./routes/customer');
const customerAuth = require('./middleware/customerAuth');
const paymentRouter = require('./routes/payments');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: '*', // adjust when you wire to specific domains
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Uniform Lab backend is running' });
});

// Public APIs for storefront
app.use('/api/public/schools', schoolRouter.public);
app.use('/api/public/products', productRouter.public);
app.use('/api/public/orders', orderRouter.public);
app.use('/api/public/recommendations', recommendationRouter);
app.use('/api/public/auth', customerAuthRouter);
app.use('/api/public/payments', paymentRouter.public);

// Customer APIs (require customer auth)
app.use('/api/customer', customerAuth, customerRouter);

// Admin APIs (protect with auth later; upload kept open for now so CMS UI can call it directly)
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/upload', uploadRouter);
app.use('/api/admin/schools', adminAuth, schoolRouter.admin);
app.use('/api/admin/categories', adminAuth, categoryRouter.admin);
app.use('/api/admin/products', adminAuth, productRouter.admin);
app.use('/api/admin/orders', adminAuth, orderRouter.admin);
app.use('/api/admin/delivery-partners', adminAuth, deliveryPartnerRouter.admin);
app.use('/api/admin/seo', adminAuth, seoRouter.admin);

// Basic error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Server error',
    },
  });
});

module.exports = app;

