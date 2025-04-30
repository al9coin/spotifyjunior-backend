// index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
app.use(cors());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI; // https://spotifyjunior-backend.onrender.com/callback
const appRedirect = "spotifyjunior://callback"; // URI de ton app mobile

const PORT = process.env.PORT || 3000;

let currentCodeVerifier = null;

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

  currentCodeVerifier = generateRandomString(64);
  const codeChallenge = generateCodeChallenge(currentCodeVerifier);

  const redirectUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge
    });

  res.redirect(redirectUrl.toString());
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.status(400).send('Missing code');
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: currentCodeVerifier
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const accessTokenApi = response.data.access_token;

    // Envoi page de redirection
    res.send(`
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Connexion Spotify réussie</title>
    <style>
      body { font-family: sans-serif; text-align: center; margin-top: 100px; }
      a.button {
        background-color: #1DB954;
        color: white;
        padding: 15px 25px;
        text-decoration: none;
        font-size: 18px;
        border-radius: 5px;
        display: inline-block;
        margin-top: 30px;
      }
    </style>
    <script>
      window.onload = function() {
        window.location.href = "${appRedirect}#access_token_api=${accessTokenApi}";
      };
    </script>
  </head>
  <body>
    <h1>✅ Connexion réussie à Spotify !</h1>
    <p>Si vous n'êtes pas redirigé automatiquement, cliquez :</p>
    <a class="button" href="${appRedirect}#access_token_api=${accessTokenApi}">Retourner dans l'application</a>
  </body>
</html>
    `);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Erreur lors de l\'échange du code');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur Spotify Junior démarré sur port ${PORT}`);
});

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
