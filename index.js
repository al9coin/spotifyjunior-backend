app.get('/callback', async (req, res) => {
  console.log("➡️ Requête reçue sur /callback");
  console.log("🔎 Query params reçus :", req.query);

  const code = req.query.code;
  const codeVerifier = req.query.code_verifier;

  if (!code || !codeVerifier) {
    console.error("❌ code ou code_verifier manquant !");
    return res.status(400).send("Code ou code_verifier manquant");
  }

  // ... suite inchangée :
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

  const profileResp = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profileData = await profileResp.json();
  const userId = profileData.id;

  if (!userId) {
    return res.status(400).json({ error: 'Impossible de récupérer le user_id Spotify' });
  }

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
