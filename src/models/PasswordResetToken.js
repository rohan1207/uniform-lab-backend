/**
 * PasswordResetToken.js
 *
 * Stores single-use, time-limited password reset tokens.
 *
 * Security properties:
 *  - Token is a 64-char hex string (32 random bytes) — cryptographically secure
 *  - expiresAt TTL index: MongoDB auto-deletes expired documents
 *  - used flag: invalidated immediately on first use (even before TTL fires)
 *  - Old tokens for a user are purged before issuing a new one
 */

const mongoose = require('mongoose');

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: false }
);

// MongoDB TTL index — auto-deletes documents after expiresAt has passed
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
