// Rezept-Fetch-Proxy mit AI-Analyse für Rezeptbuch PWA
// Deploy auf Vercel: vercel deploy
// Nutze: POST https://dein-vercel-project.vercel.app/api/fetch-recipe
// Body: { url: "...", apiKey: "..." }

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

  const { url, apiKey } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'API Key required' });
  }

  try {
    // Validiere URL
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }

    // 1. Fetch die Website
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
    const limitedHtml = html.substring(0, 8000); // Limit für AI-Input

    // 2. Sende zu Anthropic API für Rezept-Extraktion
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Extrahiere aus diesem HTML-Content ein Rezept. Analysiere verschiedene Website-Formate (Betty Bossi, Chefkoch, etc.).

Antworte AUSSCHLIESSLICH mit gültigem JSON (kein Markdown, keine Backticks):
{
  "name": "Rezeptname",
  "portions": "Anzahl Portionen/Stücke",
  "time_prep": Minuten als Zahl,
  "time_cook": Minuten als Zahl,
  "ingredients": [
    {"quantity": "Menge", "unit": "Einheit", "name": "Zutatname"}
  ],
  "steps": ["Schritt 1", "Schritt 2"],
  "source": "Website-Name"
}

HTML-Content:
${limitedHtml}`
        }]
      })
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.json();
      return res.status(aiResponse.status).json({
        error: error.error?.message || 'AI API failed'
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.content[0].text;

    // 3. Versuche JSON zu parsen
    let recipe;
    try {
      recipe = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(400).json({ error: 'Could not parse recipe from AI' });
      }
      recipe = JSON.parse(jsonMatch[0]);
    }

    return res.status(200).json({ recipe });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: error.message || 'Request failed'
    });
  }
}
