// index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const { generateCodeVerifier, generateCodeChallenge } = require('./pkce'); // <-- ajout
require('dotenv').config();

const app = express();
app.use(cors());
app.use(cookieParser()); // <-- ajout

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI; // https://spotifyjunior-backend.onrender.com/callback
const appRedirect = "spotifyjunior://callback";

const PORT = process.env.PORT || 3000;

// 👉 Route pour démarrer le login Spotify avec PKCE
app.get('/login', (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // On stocke temporairement le codeVerifier en cookie sécurisé
  res.cookie('spotify_code_verifier', codeVerifier, { maxAge: 300000, httpOnly: true, secure: true });

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

  const redirectUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });

  res.redirect(redirectUrl.toString());
});

// 👉 Route de callback après login Spotify avec PKCE
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const codeVerifier = req.cookies.spotify_code_verifier || null;

  if (!code || !codeVerifier) {
    return res.status(400).send('Missing code or code_verifier.');
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = response.data.access_token;

    // ✅ Redirige proprement vers l'app mobile
    res.redirect(`${appRedirect}#access_token=${accessToken}`);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Erreur lors de l\'échange de code.');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur Spotify Junior démarré sur port ${PORT}`);
});
