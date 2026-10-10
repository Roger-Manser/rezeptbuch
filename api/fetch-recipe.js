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
    const limitedHtml = html.substring(0, 20000); // Erhöht auf 20000 für bessere Datenextraktion

    // Debug-Logging
    console.log('[RECIPE-FETCH] Original HTML-Größe:', html.length, 'chars');
    console.log('[RECIPE-FETCH] Begrenzt auf:', limitedHtml.length, 'chars');

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
          content: `Du bist ein Rezept-Parsing-Experte. Extrahiere EXAKT aus diesem HTML.

KRITISCHE REGELN - STRIKTE EINHALTUNG:

1. "name": Der Hauptrezepttitel (größter, fettgedruckter Text im Rezept)

2. "portions": IMMER ein Wert! Such nach: "Portionen", "Personen", "Für X", "Servings", "Yield"
   Format: "4 Portionen" oder "4 Stück" oder "1 Rezept"

3. "ingredients": LISTE mit Zutaten
   - WICHTIG: Such nach Listenmarkern oder Zeilennummern vor den Zutaten
   - Format: [{"quantity": "400", "unit": "g", "name": "Fischfilet"}]
   - Gib ALLE Zutaten an - auch wenn keine Mengenangabe, dann quantity: "", unit: ""
   - MINIMUM 1 Zutat - wenn du keine findest, schreib: [{"quantity": "", "unit": "", "name": "Keine Zutaten gefunden"}]

4. "steps": LISTE der Zubereitungsschritte
   - Format: ["Schritt 1", "Schritt 2", "Schritt 3"]
   - Suche nach Nummern (1., 2., 3.) oder Absatztrennungen
   - MINIMUM 1 Schritt - wenn du keine findest, schreib: ["Keine Schritte gefunden"]

5. "time_prep", "time_cook": Zahlen oder 0 wenn nicht gefunden

6. "source": Website-Domain (z.B. "fooby.ch")

BEISPIEL (EXAKT dieses Format):
{
  "name": "Fisch marinieren",
  "portions": "4 Portionen",
  "time_prep": 15,
  "time_cook": 30,
  "ingredients": [
    {"quantity": "400", "unit": "g", "name": "Fischfilet Royal"},
    {"quantity": "4", "unit": "Stück", "name": "Limetten"}
  ],
  "steps": ["Limetten pressen", "Fisch marinieren"],
  "source": "fooby.ch"
}

WICHTIG: Antworte NUR mit JSON - kein Markdown, kein Text davor/danach!

HTML:
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

    // Debug: KI-Antwort loggen
    console.log('[RECIPE-FETCH] KI-Antwort (raw):', content.substring(0, 500));
    console.log('[RECIPE-FETCH] KI-Antwort-Länge:', content.length);

    // 3. Entferne Markdown-Code-Blöcke wenn vorhanden
    let cleanContent = content;
    // Entferne ```json ... ``` oder ``` ... ```
    cleanContent = cleanContent.replace(/^```(?:json)?\s*\n?/, '');
    cleanContent = cleanContent.replace(/\n?```\s*$/, '');
    cleanContent = cleanContent.trim();

    console.log('[RECIPE-FETCH] Nach Markdown-Entfernung:', cleanContent.substring(0, 500));

    // Versuche JSON zu parsen
    let recipe;
    try {
      recipe = JSON.parse(cleanContent);
      console.log('[RECIPE-FETCH] JSON erfolgreich geparst');
    } catch (e) {
      console.error('[RECIPE-FETCH] JSON Parse-Fehler:', e.message);
      console.log('[RECIPE-FETCH] Versuche Regex-Match für {...}...');
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[RECIPE-FETCH] Keine JSON Struktur gefunden');
        return res.status(400).json({ error: 'Could not extract JSON from AI response' });
      }
      try {
        recipe = JSON.parse(jsonMatch[0]);
        console.log('[RECIPE-FETCH] JSON nach Regex erfolgreich geparst');
      } catch (e2) {
        console.error('[RECIPE-FETCH] Regex-JSON Parse-Fehler:', e2.message);
        return res.status(400).json({ error: 'Could not parse JSON: ' + e2.message });
      }
    }

    // Final validation
    console.log('[RECIPE-FETCH] Final recipe object:');
    console.log('  - name:', recipe.name);
    console.log('  - portions:', recipe.portions);
    console.log('  - ingredients:', recipe.ingredients?.length || 0, 'items');
    console.log('  - steps:', recipe.steps?.length || 0, 'items');

    return res.status(200).json({ recipe });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: error.message || 'Request failed'
    });
  }
}
