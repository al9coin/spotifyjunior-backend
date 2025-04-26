// index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI; // ex: https://spotifyjunior-backend.onrender.com/callback
const appRedirect = "spotifyjunior://callback"; // URI personnalisée pour l'app mobile

const PORT = process.env.PORT || 3000;

// 👉 Route pour démarrer l'auth
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

  const redirectUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: 'Zq00E4Ad-0xQqjsU2aN8nkJJLUEqGcGN9jqHVoD7m10' // (valeur générée fixe ici pour test, mieux dynamique plus tard)
    });

  res.redirect(redirectUrl.toString());
});

// 👉 Route de callback après l'auth
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
        // Pas besoin d'envoyer code_verifier ici car simplifié pour test
        client_secret: clientSecret
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
      }
    );

    const accessToken = response.data.access_token;

    // 👉 Redirige avec une page HTML + JavaScript puissante
    res.send(`
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Redirection vers l'application...</title>
          <style>
            body { font-family: sans-serif; text-align: center; margin-top: 50px; }
          </style>
        </head>
        <body>
          <h2>Connexion réussie 🎶</h2>
          <p>Redirection en cours...</p>
          <script>
            // Redirige immédiatement vers l'app mobile
            window.location.replace("${appRedirect}#access_token=${accessToken}");
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Erreur lors de l\'échange du code avec Spotify');
  }
});

// ✅ Serveur démarré
app.listen(PORT, () => {
  console.log(`✅ Serveur Spotify Junior démarré sur port ${PORT}`);
});
