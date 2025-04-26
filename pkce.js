// pkce.js
const crypto = require('crypto');

// Génère un code_verifier aléatoire
function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(64));
}

// Génère un code_challenge (SHA256 du code_verifier)
function generateCodeChallenge(codeVerifier) {
  return base64URLEncode(crypto.createHash('sha256').update(codeVerifier).digest());
}

// Convertit en base64 URL safe
function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

module.exports = { generateCodeVerifier, generateCodeChallenge };
