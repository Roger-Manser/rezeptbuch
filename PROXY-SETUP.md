# Rezeptbuch URL-Import Proxy Setup

## Das Problem
Öffentliche CORS-Proxies funktionieren nicht zuverlässig mit GitHub Pages. Die Lösung: ein eigener kleiner Backend-Service.

## Setup (2-3 Minuten)

### 1. Vercel Account erstellen (kostenlos)
- Gehe zu https://vercel.com
- Melde dich mit GitHub an (du hast ja schon einen GitHub Account!)

### 2. Projekt forken oder erstellen
```bash
# Option A: Neues Vercel Projekt
mkdir rezeptbuch-proxy
cd rezeptbuch-proxy
git init

# Option B: Zu deinem bestehenden rezeptbuch-Repo hinzufügen
cd roger-manser.github.io
mkdir -p api
```

### 3. Dateien kopieren
Kopiere diese Datei in dein Projekt:
- `proxy-backend.js` → `api/fetch-recipe.js` (umbenennen!)
- `vercel.json` → `vercel.json` (ins Root-Verzeichnis)

Die Struktur sollte so aussehen:
```
rezeptbuch-proxy/
├── api/
│   └── fetch-recipe.js
└── vercel.json
```

### 4. Auf Vercel deployen
```bash
npm install -g vercel
vercel deploy
```

Vercel wird dich fragen, ob das ein neues Projekt ist. Antworte mit "y" (yes).

Nach dem Deploy bekommst du eine URL wie:
```
https://rezeptbuch-proxy.vercel.app/api/fetch-recipe
```

### 5. URL in Rezeptbuch eintragen
Öffne die `index.html` und suche nach `BACKEND_PROXY_URL`:
```javascript
const BACKEND_PROXY_URL = 'https://rezeptbuch-proxy.vercel.app/api/fetch-recipe';
```

Passe die URL an dein Vercel-Projekt an.

### 6. Fertig!
Der URL-Import sollte jetzt funktionieren. Der Proxy:
- Fetcht die Website von deinem Vercel Backend
- Gibt das HTML als JSON zurück
- Keine CORS-Probleme mehr!

## Kosten
- **Kostenlos** – Vercel gibt dir 1 Million Anfragen pro Monat umsonst
- Für einen kleinen Rezeptbuch-Service ist das mehr als genug

## Sicherheit
- Der Proxy validiert die URL (nur HTTP/HTTPS)
- Begrenzt die HTML-Größe auf 50KB (verhindert Abuse)
- Timeout nach 10 Sekunden (verhindert Hängen)

## Support
Falls etwas nicht funktioniert:
- Öffne die Browser-Console und prüfe den Status
- Vercel zeigt die Logs an: `vercel logs rezeptbuch-proxy`
