// src/utils/jwt.js
const { SignJWT, jwtVerify } = require('jose');

const secretKey = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_dev_secret_key_change_in_prod_32chars'
);

async function signToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);
}

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch (err) {
    return null;
  }
}

module.exports = { signToken, verifyToken };