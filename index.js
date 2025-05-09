// index.js
const express = require('express');
const axios   = require('axios');
const qs      = require('querystring');
require('dotenv').config();
const crypto  = require('crypto');

const app = express();
app.use(express.static('public'));

const clientId      = process.env.CLIENT_ID;
const redirectUri   = process.env.REDIRECT_URI;        // ex. https://spotifyjunior-backend.onrender.com/callback
const appRedirect   = process.env.APP_REDIRECT_URI || "spotifyjunior://callback";
const PORT          = process.env.PORT || 3000;

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
 * 1) GET /login
 *    Génère code_verifier, code_challenge et state,
 *    stocke le verifier, puis redirige vers Spotify.
 */
app.get('/login', (req, res) => {
  const scope = [
    'user-read-private', 'user-read-email',
    'playlist-read-private','user-library-read',
    'user-top-read','user-read-recently-played',
    'app-remote-control','streaming',
    'user-read-playback-state','user-modify-playback-state'
  ].join(' ');

  const codeVerifier  = generateRandomString(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = generateRandomString(16);

  verifierStore.set(state, codeVerifier);

  const params = {
    response_type:         'code',
    client_id:             clientId,
    scope,
    redirect_uri:          redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge:        codeChallenge
  };

  const authUrl = 'https://accounts.spotify.com/authorize?' + qs.stringify(params);
  res.redirect(authUrl);
});

/**
 * 2) GET /callback
 *    Spotify renvoie ?code=…&state=…
 *    On échange le code contre les tokens, puis on force un 302 vers l’app mobile.
 */
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || !verifierStore.has(state)) {
    return res.status(400).send('Invalid state or missing code');
  }

  const codeVerifier = verifierStore.get(state);
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

    // URI de redirection vers l'app mobile
    const redirectToApp = `${appRedirect}`
      + `?access_token=${access_token}`
      + `&refresh_token=${refresh_token}`
      + `&expires_in=${expires_in}`;

    // **302 Redirect** vers le schéma custom
    return res.redirect(302, redirectToApp);

  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    return res.status(500).send('Erreur lors de l’échange du code');
  }
});

/**
 * 3) GET /me
 *    Proxy vers Spotify API /v1/me en utilisant le header Authorization fourni
 *    par l’app mobile dans chaque requête Retrofit.
 */
app.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const spotifyRes = await axios.get(
      'https://api.spotify.com/v1/me',
      { headers: { Authorization: authHeader } }
    );
    res.json(spotifyRes.data);
  } catch (err) {
    console.error('Error /me:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Failed to fetch profile from Spotify' });
  }
});

/**
 * 4) Autres endpoints (top-artists, playlists, recommendations…)
 *    Implémente-les de façon similaire, en lisant req.headers.authorization.
 */

app.listen(PORT, () => {
  console.log(`✅ Backend Spotify Junior démarré sur le port ${PORT}`);
});
