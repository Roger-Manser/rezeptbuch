// Einfacher Rezept-Fetch-Proxy für Rezeptbuch PWA
// Deploy auf Vercel: vercel deploy
// Nutze: https://dein-vercel-project.vercel.app/api/fetch-recipe?url=...

export default async function handler(req, res) {
  // CORS-Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    // Validiere URL
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }

    // Fetch die Website
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Fetch failed with status ${response.status}`
      });
    }

    const html = await response.text();

    // Begrenzen auf 50KB um Performance zu wahren
    const limitedHtml = html.substring(0, 50000);

    return res.status(200).json({ html: limitedHtml });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: error.message || 'Fetch failed'
    });
  }
}
