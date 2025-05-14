const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // e.g. https://spotifyjunior-backend.onrender.com/callback
const MONGO_URI = process.env.MONGO_URI; // MongoDB Atlas URI

// Connexion MongoDB
let db;
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db('spotifyjunior');
    console.log('✅ Connexion MongoDB réussie');
  })
  .catch(err => console.error('❌ Erreur MongoDB:', err));

// --- Callback Spotify ---
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const codeVerifier = req.query.code_verifier;

  if (!code || !codeVerifier) {
    return res.status(400).send('Code ou code_verifier manquant');
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error('Erreur token:', tokenData.error_description);
    return res.status(400).json(tokenData);
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;

  // Obtenir user_id
  const profileResp = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profileData = await profileResp.json();
  const userId = profileData.id;

  if (!userId) {
    return res.status(400).json({ error: 'Impossible de récupérer le user_id Spotify' });
  }

  // Stocker en base
  await db.collection('tokens').updateOne(
    { user_id: userId },
    {
      $set: {
        refresh_token: refreshToken,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return res.json({ access_token: accessToken, user_id: userId });
});

// --- Refresh token ---
app.get('/refresh_token', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id requis' });

  const user = await db.collection('tokens').findOne({ user_id: userId });
  if (!user || !user.refresh_token) {
    return res.status(404).json({ error: 'Refresh token introuvable pour ce user_id' });
  }

  const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: user.refresh_token,
    }),
  });

  const refreshData = await refreshResponse.json();
  if (refreshData.error) {
    console.error('Erreur refresh:', refreshData.error_description);
    return res.status(400).json(refreshData);
  }

  return res.json({ access_token: refreshData.access_token });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
