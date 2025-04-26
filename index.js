// index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();  

const app = express();
app.use(cors());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI; // https://spotifyjunior-backend.onrender.com/callback
const appRedirect = "spotifyjunior://callback"; // URI personnalisée pour l'app mobile

const PORT = process.env.PORT || 3000;

// 👉 Route pour démarrer le login Spotify
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
    });

  res.redirect(redirectUrl.toString());
});

// 👉 Route de callback après login Spotify
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
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
      }
    );

    const accessToken = response.data.access_token;

    // ✅ Redirige avec une page HTML + JavaScript pour WebView
    res.send(`
      <html>
        <head>
          <title>Connexion réussie</title>
          <meta charset="UTF-8" />
        </head>
        <body>
          <script>
            window.location.href = "${appRedirect}#access_token=${accessToken}";
          </script>
          <p>Connexion réussie ! Vous pouvez fermer cette page.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Erreur lors de l\'échange de code');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur Spotify Junior démarré sur port ${PORT}`);
});
