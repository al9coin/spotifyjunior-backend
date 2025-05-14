const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI  = process.env.REDIRECT_URI;
const MONGO_URI     = process.env.MONGO_URI;

// --- Connexion à MongoDB ---
let db;
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db('spotifyjunior');
    console.log('✅ Connexion MongoDB réussie');
  })
  .catch(err => console.error('❌ Erreur MongoDB:', err));

// --- Callback Spotify après autorisation ---
app.get('/callback', async (req, res) => {
  console.log("➡️ Requête reçue sur /callback");
  console.log("🔎 Query params :", req.query);

  const code = req.query.code;
  if (!code) {
    console.error("❌ Code manquant !");
    return res.status(400).send("Code manquant");
  }

  try {
    // Échange du code contre un access_token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('❌ Erreur token:', tokenData.error_description);
      return res.status(400).json(tokenData);
    }

    const accessToken  = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Récupération du user_id
    const profileResp = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profileData = await profileResp.json();
    const userId = profileData.id;

    if (!userId) {
      return res.status(400).json({ error: 'Impossible de récupérer le user_id Spotify' });
    }

    // Sauvegarde du refresh_token en base
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

  } catch (error) {
    console.error('❌ Exception dans /callback :', error.message);
    return res.status(500).send("Erreur serveur");
  }
});

// --- Refresh token ---
app.get('/refresh_token', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id requis' });

  const user = await db.collection('tokens').findOne({ user_id: userId });
  if (!user || !user.refresh_token) {
    return res.status(404).json({ error: 'Refresh token introuvable pour ce user_id' });
  }

  try {
    const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.refresh_token,
      }),
    });

    const refreshData = await refreshResponse.json();

    if (refreshData.error) {
      console.error('❌ Erreur refresh:', refreshData.error_description);
      return res.status(400).json(refreshData);
    }

    return res.json({ access_token: refreshData.access_token });

  } catch (error) {
    console.error('❌ Exception dans /refresh_token :', error.message);
    return res.status(500).send("Erreur serveur");
  }
});

// --- Lancement du serveur ---
app.listen(PORT, () => {
  console.log(`🚀 Serveur backend SpotifyJunior en ligne sur http://localhost:${PORT}`);
});
