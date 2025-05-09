// index.js
const express = require('express');
const axios = require('axios');
const qs = require('querystring');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
app.use(express.static('public'));

const clientId    = process.env.CLIENT_ID;
const redirectUri = process.env.REDIRECT_URI;      // ex. https://spotifyjunior-backend.onrender.com/callback
const appRedirect = process.env.APP_REDIRECT_URI;   // ex. spotifyjunior://callback

const PORT = process.env.PORT || 3000;

// Stockage temporaire des codeVerifiers, indexés par state
const verifierStore = new Map();

function generateRandomString(length) {
  return crypto.randomBytes(length)
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 1) /login → on génère :
 *    • code_verifier (secret PKCE)
 *    • code_challenge
 *    • state (pour sécuriser l’échange)
 *  On stocke verifierStore[state] = code_verifier,
 *  puis on redirige vers Spotify.
 */
app.get('/login', (req, res) => {
  const scope = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'user-library-read',
    'user-top-read',
    'user-read-recently-played',
    'app-remote-control',
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  const codeVerifier  = generateRandomString(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = generateRandomString(16);

  verifierStore.set(state, codeVerifier);

  const params = {
    response_type:      'code',
    client_id:          clientId,
    scope,
    redirect_uri:       redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge
  };

  const authUrl = 'https://accounts.spotify.com/authorize?' + qs.stringify(params);
  res.redirect(authUrl);
});

/**
 * 2) /callback → Spotify nous renvoie ?code=…&state=…
 *    On vérifie le state, on récupère le code_verifier,
 *    on échange le code contre un token, puis on redirige
 *    vers l’app mobile via le schéma custom.
 */
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || !verifierStore.has(state)) {
    return res.status(400).send('Invalid state or missing code');
  }

  const codeVerifier = verifierStore.get(state);
  // On peut maintenant supprimer l’entrée pour éviter la réutilisation
  verifierStore.delete(state);

  try {
    // Échange code → tokens
    const tokenResp = await axios.post(
      'https://accounts.spotify.com/api/token',
      qs.stringify({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     clientId,
        code_verifier: codeVerifier
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = tokenResp.data;

    // On redirige immédiatement vers l'app mobile
    const redirectToApp = `${appRedirect}`
      + `?access_token=${access_token}`
      + `&refresh_token=${refresh_token}`
      + `&expires_in=${expires_in}`;

    // Page web de secours + redirection automatique
    res.send(`
      <html><head><meta charset="UTF-8"><title>Redirection...</title></head>
      <body style="font-family:sans-serif; text-align:center; margin-top:100px">
        <h1>Connexion réussie ✅</h1>
        <p>Si vous n'êtes pas redirigé automatiquement, cliquez :</p>
        <a href="${redirectToApp}">Retourner dans l'application</a>
        <script>window.location.href = "${redirectToApp}";</script>
      </body></html>
    `);

  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.status(500).send('Erreur lors de l’échange du code');
  }
});

/**
 * 3) Ici tu ajoutes tes autres endpoints (/me, /top-artists, etc.)
 *    en t’assurant de passer le header "Authorization: Bearer <access_token>"
 *    que ton appli mobile t’enverra à chaque requête.
 */

app.listen(PORT, () => {
  console.log(`✅ Spotify Junior backend démarré sur le port ${PORT}`);
});
