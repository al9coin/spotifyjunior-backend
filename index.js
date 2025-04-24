// index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const appRedirect = "spotifyjunior://callback"; // <- Lien personnalisé pour l'app mobile

const PORT = process.env.PORT || 3000;

app.get('/login', (req, res) => {
  const scope = 'user-read-private user-read-email';

  const redirectUrl = 'https://accounts.spotify.com/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
    });

  res.redirect(redirectUrl.toString());
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

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

    // ✅ Rediriger vers ton app avec le token
    res.redirect(`${appRedirect}#access_token=${accessToken}`);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send('Erreur lors de l’échange de code');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
