// index.js
const express = require('express');
const axios   = require('axios');
const qs      = require('querystring');
require('dotenv').config();
const crypto  = require('crypto');

const app = express();
app.use(express.static('public'));

const clientId    = process.env.CLIENT_ID;
const redirectUri = process.env.REDIRECT_URI;      // ex. https://spotifyjunior-backend.onrender.com/callback
const appRedirect = process.env.APP_REDIRECT_URI || "spotifyjunior://callback";
const PORT       = process.env.PORT || 3000;

/** 
 * Génère un code_verifier PKCE aléatoire (c'est aussi notre state). 
 * On n’a plus besoin de stocker quoi que ce soit en mémoire.
 */
function generateCodeVerifier() {
  return crypto.randomBytes(64)
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * À partir du code_verifier, génère le code_challenge (S256 + base64url).
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 1) GET /login
 *    - Génère code_verifier (et state)
 *    - Génère code_challenge
 *    - Redirige vers Spotify avec state=code_verifier
 */
app.get('/login', (req, res) => {
  const scope = [
    'user-read-private','user-read-email',
    'playlist-read-private','user-library-read',
    'user-top-read','user-read-recently-played',
    'app-remote-control','streaming',
    'user-read-playback-state','user-modify-playback-state'
  ].join(' ');

  const codeVerifier  = generateCodeVerifier();            // sera aussi notre state
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = {
    response_type:         'code',
    client_id:             clientId,
    scope,
    redirect_uri:          redirectUri,
    state:                 codeVerifier,                  // state = codeVerifier
    code_challenge_method: 'S256',
    code_challenge:        codeChallenge
  };

  const authorizeUrl = 'https://accounts.spotify.com/authorize?' + qs.stringify(params);
  res.redirect(authorizeUrl);
});

/**
 * 2) GET /callback
 *    - Spotify renvoie ?code=…&state=…
 *    - state = codeVerifier
 *    - On récupère codeVerifier, on échange code => tokens
 *    - 302 redirect vers spotifyjunior://callback?... 
 */
app.get('/callback', async (req, res) => {
  const { code, state: codeVerifier } = req.query;

  if (!code || !codeVerifier) {
    return res.status(400).send('Invalid state or missing code');
  }

  try {
    const tokenResponse = await axios.post(
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

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // On redirige directement l’OS vers l’app mobile
    const redirectToApp = `${appRedirect}`
      + `?access_token=${access_token}`
      + `&refresh_token=${refresh_token}`
      + `&expires_in=${expires_in}`;

    return res.redirect(302, redirectToApp);

  } catch (err) {
    console.error('Error exchanging code for token:', err.response?.data || err.message);
    return res.status(500).send('Erreur lors de l’échange du code');
  }
});

/**
 * 3) GET /me
 *    Proxy vers l’API Spotify /v1/me
 *    Lit le header Authorization envoyé par le client mobile.
 */
app.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const spotifyMe = await axios.get(
      'https://api.spotify.com/v1/me',
      { headers: { Authorization: authHeader } }
    );
    res.json(spotifyMe.data);
  } catch (err) {
    console.error('Error fetching /me:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * 4) (Optionnel) Autres endpoints : top-artists, playlists, recommendations, etc.
 *    Implemente-les en lisant req.headers.authorization exactement de la même façon.
 */

app.listen(PORT, () => {
  console.log(`✅ SpotifyJunior backend up on port ${PORT}`);
});
