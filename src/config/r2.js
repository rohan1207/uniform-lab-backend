const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2Bucket = process.env.R2_BUCKET;
const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

function isR2Configured() {
  return !!(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2PublicBaseUrl);
}

let r2Client = null;

function getR2Client() {
  if (!isR2Configured()) return null;
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });
  }
  return r2Client;
}

async function uploadToR2(key, buffer, contentType) {
  const client = getR2Client();
  if (!client) {
    throw new Error('Cloudflare R2 is not configured');
  }
  await client.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  const url = `${r2PublicBaseUrl.replace(/\/+$/, '')}/${key}`;
  return { url, key };
}

async function deleteFromR2(key) {
  const client = getR2Client();
  if (!client) return;
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: r2Bucket,
        Key: key,
      })
    );
  } catch {
    // ignore delete errors
  }
}

module.exports = {
  isR2Configured,
  uploadToR2,
  deleteFromR2,
};

