# CLAUDE.md – Emma Lernsystem

## Projektübersicht

Wir bauen eine Web-App für Alex und seine Frau, die als KI-gestütztes Lernsystem für ihre Tochter Emma (Klasse 4, Grundschule NRW) dient.

Emma selbst nutzt die App nicht – nur die Eltern. Sie laden Fotos von Hausaufgaben und Arbeitsblättern hoch, die App analysiert diese, baut daraus einen wachsenden Lernkontext auf und generiert daraus Übungsblätter und Klassenarbeits-Simulationen.

---

## Technischer Stack

| Komponente | Technologie |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript (single page) |
| Hosting | GitHub Pages |
| KI | Anthropic API (claude-sonnet-4-20250514) |
| Speicher / Sync | Google Drive API (OAuth 2.0) |
| PDF-Generierung | Client-seitig (jsPDF o.ä.) |

**Wichtig:** Kein Backend-Server. Alles läuft im Browser. Google Drive dient als persistenter, gemeinsam genutzter Speicher für beide Elternteile.

---

## Google Drive Struktur

```
📁 Emma-Lernsystem/          ← Root-Ordner, geteilt zwischen beiden Eltern
  📄 kontext-mathe.md        ← Wachsender Lernkontext Mathematik
  📄 kontext-deutsch.md      ← Wachsender Lernkontext Deutsch
  📄 lernstrategie.md        ← Langzeit-Lernstrategie (wird automatisch aktualisiert)
  📁 arbeitsblätter/
     🖼️ YYYY-MM-DD-fach.jpg  ← Hochgeladene Fotos
  📁 uebungen/
     📄 YYYY-MM-DD-uebung.json ← Generierte Übungen + Ergebnisse
```

---

## App-Funktionen

### 1. Fach-Kontext verwalten
- Zwei Fächer: **Mathematik** und **Deutsch** (erweiterbar)
- Jedes Fach hat eine eigene Kontext-Datei in Google Drive
- Kontext kann manuell bearbeitet werden (Textfeld in der App)
- Kontext wird automatisch erweitert wenn ein Foto analysiert wird

### 2. Foto hochladen & analysieren
- Elternteil lädt Foto eines Arbeitsblatts / einer Buchseite hoch
- App schickt Foto an Anthropic API mit Anweisung:
  - Erkenne das Thema
  - Erkenne den Schwierigkeitsgrad
  - Extrahiere relevante Informationen für den Lernkontext
- Ergebnis wird automatisch an die Kontext-Datei des jeweiligen Fachs in Drive angehängt
- Foto wird ebenfalls in Drive gespeichert

### 3. Übungsblätter generieren
- Elternteil wählt Fach und klickt "Übungsblatt generieren"
- App liest aktuellen Kontext aus Drive
- Anthropic API generiert passendes Übungsblatt (Niveau Klasse 4 NRW)
- Übungsblatt wird als **PDF** ausgegeben (druckfertig)
- Berücksichtigt Emmas bekannte Schwächen (Sachaufgaben, zu schnelles Lesen, Zeitdruck)

### 4. Klassenarbeit simulieren
- Ähnlich wie Übungsblatt, aber:
  - Zeitvorgabe wie bei echter Klassenarbeit
  - Format und Schwierigkeit orientiert sich an echten NRW Klasse 4 Arbeiten
  - Basiert auf gesammeltem Kontext der letzten Wochen
- Ausgabe als PDF

### 5. Ergebnisse zurückgeben & auswerten
- Nach einer Übung / Klassenarbeit-Simulation: Foto der ausgefüllten Seite hochladen
- App analysiert Ergebnis, identifiziert Fehler und Muster
- Erkenntnisse fließen in den Kontext und die Lernstrategie ein

### 6. Langzeit-Lernstrategie
- Separate Datei `lernstrategie.md` in Drive
- Wird nach jeder Analyse automatisch vom Modell aktualisiert
- Enthält: aktuelle Schwächen, Fortschritte, Empfehlungen für nächste Schritte
- In der App sichtbar als "Status-Dashboard"

---

## Emma's Lernprofil (initialer Kontext)

Dieser Kontext soll beim ersten Start automatisch in die Drive-Dateien geschrieben werden:

### Mathematik – initialer Kontext
```
# Mathematik Kontext – Emma, Klasse 4 NRW

## Aktuelle Themen
- Geometrie: Flächen von Quadrat, Rechteck und Dreieck
- Kreis: Radius, Durchmesser
- Als nächstes: Schriftliche Multiplikation, Schriftliche Division

## Typische Aufgabenarten
- Rechenaufgaben
- Geometrieaufgaben
- Sachaufgaben / Textaufgaben

## Bekannte Schwächen
- Textaufgaben werden falsch interpretiert
- Aufgaben werden zu schnell beantwortet ohne vollständiges Lesen
- Zeitmanagement bei Klassenarbeiten

## Stärken
- Grundrechnen funktioniert
- Aktive Mitarbeit im Unterricht

## Letzte Noten
- Klassenarbeiten: 12 Punkte, 14 Punkte, 5 Punkte
- Zeugnisnote: 4
```

### Deutsch – initialer Kontext
```
# Deutsch Kontext – Emma, Klasse 4 NRW

## Bekannte Informationen
- Lesen funktioniert grundsätzlich gut
- Aktuelle Themen werden durch Analyse der Hausaufgaben ermittelt

## Bekannte Schwächen
- Noch zu ermitteln

## Stärken
- Lesen
```

---

## UI-Struktur (Screens)

```
┌─────────────────────────────────┐
│  Emma Lernsystem                │
│  [Mathe] [Deutsch]  ← Tab-Nav  │
├─────────────────────────────────┤
│  📊 Lernstrategie (Kurzansicht) │
├─────────────────────────────────┤
│  📸 Foto hochladen              │
│  [Datei wählen] [Analysieren]   │
├─────────────────────────────────┤
│  📝 Kontext (editierbar)        │
│  [Textfeld]         [Speichern] │
├─────────────────────────────────┤
│  [Übungsblatt PDF]              │
│  [Klassenarbeit simulieren PDF] │
└─────────────────────────────────┘
```

---

## Google Drive OAuth Setup

Alex hat bereits Erfahrung mit Google OAuth (Hauspost Scanner Projekt, GitHub: Ahunter82/Hauspost-scanner).

- Google Cloud Console: neues Projekt anlegen oder vorhandenes nutzen
- APIs aktivieren: Google Drive API
- OAuth 2.0 Client ID für Web-Anwendung
- Authorized redirect URIs: GitHub Pages URL eintragen
- Scopes: `https://www.googleapis.com/auth/drive.file`

---

## Anthropic API

- Modell: `claude-sonnet-4-20250514`
- API Key wird beim ersten App-Start einmalig eingegeben und im `localStorage` gespeichert
- Alle Anfragen laufen direkt vom Browser zur API (kein Proxy nötig, da kein öffentliches Repo)

---

## Sicherheit

- GitHub Repo: **privat**
- API Keys werden nur in `localStorage` gespeichert, nie im Code
- Google Drive Ordner: nur zwischen den beiden Eltern geteilt

---

## Reihenfolge beim Bauen

1. **Grundstruktur** – HTML/CSS, Tab-Navigation, responsiv (Mobile-first, da Foto-Upload oft vom Handy)
2. **Google Drive OAuth** – Login-Flow, Ordner anlegen, Dateien lesen/schreiben
3. **Foto-Upload & Analyse** – Bild an Anthropic API, Kontext updaten
4. **Kontext-Editor** – Anzeigen und manuell bearbeiten
5. **Übungsblatt-Generierung** – API-Aufruf, PDF-Ausgabe
6. **Klassenarbeit-Simulation** – ähnlich Übungsblatt, anderer Prompt
7. **Lernstrategie-Dashboard** – automatisch generiert und angezeigt
8. **Ergebnis-Analyse** – Foto der ausgefüllten Übung zurück analysieren

---

## Startbefehl für Claude Code

Wenn du das hier liest: Lies diese Datei vollständig, dann starte mit Schritt 1 (Grundstruktur). Frag bei Unklarheiten nach, bevor du loslegst.
