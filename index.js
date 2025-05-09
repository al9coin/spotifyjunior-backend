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
const appRedirect = process.env.APP_REDIRECT_URI;   // ex. spotifyjunior://callback
const PORT        = process.env.PORT || 3000;

// Store PKCE verifiers by state
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
 * 1) /login : génère verifier, challenge & state, stocke verifier, redirige vers Spotify
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

  // Stocke le verifier pour ce state
  verifierStore.set(state, codeVerifier);

  // Construis la query Spotify avec les bons noms de paramètres
  const params = {
    response_type:        'code',
    client_id:            clientId,
    scope,
    redirect_uri:         redirectUri,
    state,
    code_challenge_method:'S256',
    code_challenge:       codeChallenge  // <— utilise bien codeChallenge ici
  };

  const authUrl = 'https://accounts.spotify.com/authorize?' + qs.stringify(params);
  res.redirect(authUrl);
});

/**
 * 2) /callback : récupère code & state, valide state, échange code contre tokens,
 *    puis redirige vers l'app mobile via le schéma custom.
 */
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || !verifierStore.has(state)) {
    return res.status(400).send('Invalid state or missing code');
  }

  const codeVerifier = verifierStore.get(state);
  verifierStore.delete(state); // plus besoin après usage

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

    // URL de redirection vers l'app mobile
    const redirectToApp = `${appRedirect}`
      + `?access_token=${access_token}`
      + `&refresh_token=${refresh_token}`
      + `&expires_in=${expires_in}`;

    // Page web + redirection automatique
    res.send(`
      <html>
        <head><meta charset="UTF-8"><title>Connexion réussie</title></head>
        <body style="font-family:sans-serif; text-align:center; margin-top:100px">
          <h1>✅ Connexion Spotify réussie</h1>
          <p>Si vous n’êtes pas redirigé automatiquement, cliquez :</p>
          <a href="${redirectToApp}">Retourner dans l’application</a>
          <script>window.location.href = "${redirectToApp}";</script>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    res.status(500).send('Erreur lors de l’échange du code');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend Spotify Junior démarré sur le port ${PORT}`);
});
