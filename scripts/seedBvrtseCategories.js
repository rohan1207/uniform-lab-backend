/**
 * Seed default global categories (same list for all schools).
 * Run: npm run seed:categories  (from Backend folder)
 */
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Category = require('../src/models/Category');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniformlab';

const DEFAULT_CATEGORIES = [
  'Shirts & Tops',
  'Pants & Trousers',
  'Pre-Primary',
  'Skirts',
  'Sports',
  'Accessories',
  'Shoes',
];

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function run() {
  try {
    await connectDB(MONGODB_URI);

    // eslint-disable-next-line no-console
    console.log('Seeding global categories…');

    for (let i = 0; i < DEFAULT_CATEGORIES.length; i += 1) {
      const name = DEFAULT_CATEGORIES[i];
      const slug = slugify(name);
      const existing = await Category.findOne({ slug });
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`- ${name} (slug: ${slug}) already exists, skipping`);
        // eslint-disable-next-line no-continue
        continue;
      }
      const category = await Category.create({
        name,
        slug,
        sortOrder: i,
      });
      // eslint-disable-next-line no-console
      console.log(`+ Created category ${category.name} (slug: ${category.slug})`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to seed categories', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
