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
    const limitedHtml = html.substring(0, 50000); // Erhöht auf 50000 - manche Seiten haben Zutaten erst weiter unten!

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

SUCHSTRATEGIE (REIHENFOLGE WICHTIG):
1. Strukturierte Daten: Suche nach JSON-LD (<script type="application/ld+json">) - RecipeSchema
2. HTML-Attribute: data-*, aria-label, title mit Zutat/Schritt-Infos
3. Normales HTML: Listen, divs mit Klasse "ingredient", "step", etc.

KRITISCHE REGELN:

1. "name": Der Hauptrezepttitel (größter, fettgedruckter Text)

2. "portions": IMMER ein Wert! Such nach: "Portionen", "Personen", "Für", "Servings", "Yield"
   Format: "4 Portionen" oder "4 Stück" oder "1 Rezept"

3. "ingredients": LISTE mit Zutaten
   - Suche ÜBERALL: Listen, Tabellen, JSON-LD, Attribute
   - Format: [{"quantity": "400", "unit": "g", "name": "Fischfilet, gehackt"}]
   - WICHTIG: Kommentare/Anmerkungen IMMER im name-Feld mit dabei!
     * "Limetten, gehackt" – NICHT nur "Limetten"
     * "Fisch, frisch" – NICHT nur "Fisch"
     * Alle Anmerkungen: gehackt, frisch, optional, nach Geschmack, etc.
   - JEDE Zutat einzeln - auch ohne Mengenangabe (quantity: "", unit: "")
   - WENN MEHRERE GEFUNDEN: Alle auflisten!
   - MINIMUM: 3+ Zutaten für normales Rezept
   - Nur "Keine Zutaten gefunden" wenn wirklich KEINE da sind

4. "steps": LISTE der Zubereitungsschritte
   - Format: ["Schritt 1", "Schritt 2", "Schritt 3"]
   - Suche: Nummern (1., 2., 3.), Absätze, divs mit "step"
   - MINIMUM: 2+ Schritte für normales Rezept
   - Nur "Keine Schritte gefunden" wenn wirklich KEINE da sind

5. "time_prep", "time_cook": Zahlen oder 0

6. "source": Website-Domain (z.B. "fooby.ch")

BEISPIEL:
{
  "name": "Fisch marinieren",
  "portions": "4 Portionen",
  "time_prep": 15,
  "time_cook": 30,
  "ingredients": [
    {"quantity": "400", "unit": "g", "name": "Fischfilet Royal"},
    {"quantity": "4", "unit": "Stück", "name": "Limetten"},
    {"quantity": "2", "unit": "EL", "name": "Öl"}
  ],
  "steps": ["Limetten pressen", "Fisch marinieren", "20 Min ziehen lassen"],
  "source": "fooby.ch"
}

WICHTIG: NUR JSON - kein Markdown, kein Text davor/danach!

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
