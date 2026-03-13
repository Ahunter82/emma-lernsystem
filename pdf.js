/* =============================================
   Emma Lernsystem – pdf.js
   Übungsblatt & Klassenarbeit generieren
   (Anthropic API → Print-Window → PDF)
   ============================================= */

'use strict';

const PDF = (() => {

  // ---- Prompts ----

  function buildPrompt(fach, kontext, themen, modus) {
    const fachName  = fach === 'mathe' ? 'Mathematik' : 'Deutsch';
    const modusText = modus === 'klausur'
      ? 'eine Klassenarbeit (Schulaufgabe) im NRW Klasse-4-Format, ca. 45 Minuten, realistischer Schwierigkeitsgrad'
      : 'ein Übungsblatt zum Üben zu Hause, ca. 20–30 Minuten, aufbauend von leicht nach schwer';
    const themenText = themen.length === 1
      ? `Thema: "${themen[0]}"`
      : `Themen (alle abdecken, Aufgaben sinnvoll verteilen):\n${themen.map((t, i) => `${i+1}. "${t}"`).join('\n')}`;

    return `Du erstellst ${modusText} für Emma, Klasse 4 NRW, Fach ${fachName}.

${themenText}

Lernkontext (Emmas Stand, Stärken und Schwächen):
${kontext}

WICHTIG – Niveau Grundschule Klasse 4 NRW (9–10 Jahre):
Erlaubte Themen: schriftliche Addition/Subtraktion, schriftliche Multiplikation/Division, Zahlen bis 1.000.000 lesen/schreiben/runden, einfache Brüche (½, ¼, ¾), Fläche von Rechteck und Quadrat berechnen (Länge × Breite), Umfang, einfache Sachaufgaben, Maßeinheiten umrechnen (cm/m/km, g/kg, ml/l).
VERBOTEN – zu schwer für Klasse 4: Rauminhalt/Volumen (cm³), 3D-Körper-Formeln, algebraische Gleichungen umstellen (z.B. V=l×b×h → l=?), Variablen, negative Zahlen, Koordinatensysteme, Prozentrechnung, Dreisatz.
${fach === 'mathe' ? 'Baue mindestens eine echte Textaufgabe ein (mit einer konkreten Geschichte/Situation und Zahlen), die genaues Lesen erfordert.' : ''}

Erstelle das Arbeitsblatt als JSON mit exakt dieser Struktur (kein Text außerhalb des JSON):

{
  "titel": "...",
  "untertitel": "...",
  "zeitangabe": "${modus === 'klausur' ? '45 Minuten' : 'ca. 25 Minuten'}",
  "aufgaben": [
    {
      "nummer": 1,
      "titel": "...",
      "anweisung": "...",
      "typ": "freitext|luecke|rechnung|zeichnung",
      "unteraufgaben": [
        {
          "bezeichnung": "a)",
          "text": "...",
          "zeilen": 2
        }
      ],
      "punkte": 4
    }
  ],
  "gesamtpunkte": 20,
  "hinweis": "..."
}

Regeln:
- 4–6 Aufgaben mit insgesamt 16–24 Punkten
- "zeilen" gibt an wie viele Schreibzeilen Platz gelassen werden soll (1–6)
- "typ" bestimmt das Lösungsformat: freitext=Zeilen, rechnung=Rechenkasten, zeichnung=Zeichenfeld, luecke=Lückentext
- Aufgaben ohne Unteraufgaben: "unteraufgaben" weglassen, dann "zeilen" direkt in die Aufgabe
- Nur valides JSON, keine Kommentare

KRITISCH – Pflichtregeln für "anweisung":
- "anweisung" MUSS den vollständigen, konkreten Aufgabentext enthalten (Zahlen, Namen, Situation)
- "anweisung" darf NIEMALS nur eine Meta-Anweisung sein wie "Lies die Aufgabe durch" oder "Löse die folgenden Aufgaben" – das ist KEIN Aufgabeninhalt
- Beispiel FALSCH: "anweisung": "Lies die Aufgabe zweimal durch und löse sie dann."
- Beispiel RICHTIG: "anweisung": "Im Supermarkt kostet ein Apfel 0,35 €. Emma kauft 6 Äpfel und bezahlt mit einem 5-Euro-Schein. Wie viel Wechselgeld bekommt sie? Lies die Aufgabe genau – nicht alle Zahlen werden gebraucht."
- Jede Aufgabe braucht echten, lösbaren Inhalt. Leseanweisungen kommen NUR zusätzlich zum Aufgabentext, nie stattdessen.`;
  }

  // ---- API-Aufruf ----

  async function fetchWorksheet(fach, kontext, themen, modus, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role:    'user',
          content: buildPrompt(fach, kontext, themen, modus),
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const raw  = data.content[0].text.trim();

    // JSON aus Antwort extrahieren (falls Modell doch etwas drumherum schreibt)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein gültiges JSON in der Antwort.');
    return JSON.parse(jsonMatch[0]);
  }

  // ---- HTML-Render ----

  function renderHtml(sheet, fach, modus) {
    const fachName = fach === 'mathe' ? 'Mathematik' : 'Deutsch';
    const heute    = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const aufgabenHtml = sheet.aufgaben.map(a => {
      const unterHtml = a.unteraufgaben
        ? a.unteraufgaben.map(u => `
            <div class="unteraufgabe">
              <div class="unter-text"><span class="unter-bez">${u.bezeichnung}</span> ${escHtml(u.text)}</div>
              ${renderLoesungsfeld(a.typ, u.zeilen || 2)}
            </div>`).join('')
        : renderLoesungsfeld(a.typ, a.zeilen || 3);

      return `
        <div class="aufgabe">
          <div class="aufgabe-header">
            <span class="aufgabe-nr">Aufgabe ${a.nummer}</span>
            <span class="aufgabe-titel">${escHtml(a.titel)}</span>
            <span class="aufgabe-punkte">${a.punkte} ${a.punkte === 1 ? 'Punkt' : 'Punkte'}</span>
          </div>
          ${a.anweisung ? `<p class="aufgabe-anweisung">${escHtml(a.anweisung)}</p>` : ''}
          ${unterHtml}
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(sheet.titel)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Arial', sans-serif;
      font-size: 12pt;
      color: #000;
      background: #fff;
      padding: 0;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 18mm 18mm 14mm;
    }

    /* Header */
    .header {
      border-bottom: 2.5px solid #000;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .header-fach {
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #444;
    }

    .header-meta {
      font-size: 9pt;
      color: #444;
      text-align: right;
    }

    .header-titel {
      font-size: 17pt;
      font-weight: bold;
      margin: 4px 0 2px;
    }

    .header-untertitel {
      font-size: 10pt;
      color: #333;
      margin-bottom: 10px;
    }

    .header-felder {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }

    .feld-label {
      font-size: 8pt;
      color: #666;
      margin-bottom: 2px;
    }

    .feld-linie {
      border-bottom: 1px solid #000;
      height: 18px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 9pt;
    }

    .zeit-badge {
      background: #f0f0f0;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 2px 8px;
      font-weight: bold;
    }

    .punkte-gesamt {
      font-weight: bold;
    }

    /* Aufgaben */
    .aufgaben { margin-top: 4px; }

    .aufgabe {
      margin-bottom: 18px;
      break-inside: avoid;
    }

    .aufgabe-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      background: #f5f5f5;
      border-left: 4px solid #333;
      padding: 5px 8px;
      margin-bottom: 8px;
    }

    .aufgabe-nr {
      font-weight: bold;
      font-size: 10pt;
      white-space: nowrap;
    }

    .aufgabe-titel {
      flex: 1;
      font-size: 10pt;
    }

    .aufgabe-punkte {
      font-size: 9pt;
      color: #555;
      white-space: nowrap;
    }

    .aufgabe-anweisung {
      font-size: 10pt;
      margin: 0 0 8px 4px;
      line-height: 1.4;
    }

    /* Unteraufgaben */
    .unteraufgabe {
      margin: 6px 0 6px 4px;
    }

    .unter-text {
      font-size: 10pt;
      line-height: 1.4;
      margin-bottom: 4px;
    }

    .unter-bez {
      font-weight: bold;
      margin-right: 4px;
    }

    /* Lösungsfelder */
    .zeilen-feld { margin: 4px 0 8px; }

    .schreibzeile {
      border-bottom: 1px solid #bbb;
      height: 22px;
      margin-bottom: 4px;
    }

    .rechen-kasten {
      border: 1px solid #999;
      border-radius: 3px;
      margin: 4px 0 8px;
      padding: 6px;
      min-height: 60px;
      background: repeating-linear-gradient(
        transparent, transparent 21px,
        #ddd 21px, #ddd 22px
      );
    }

    .zeichen-feld {
      border: 1px solid #999;
      border-radius: 3px;
      margin: 4px 0 8px;
      height: 80px;
      background: #fafafa;
    }

    .luecke {
      display: inline-block;
      border-bottom: 1px solid #000;
      min-width: 60px;
      margin: 0 4px;
    }

    /* Hinweis */
    .hinweis {
      margin-top: 16px;
      padding: 8px 12px;
      border: 1px dashed #aaa;
      border-radius: 4px;
      font-size: 9pt;
      color: #555;
      break-inside: avoid;
    }

    /* Punkte-Tabelle unten */
    .punkte-tabelle {
      margin-top: 20px;
      border-top: 1.5px solid #000;
      padding-top: 10px;
      break-inside: avoid;
    }

    .punkte-tabelle table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }

    .punkte-tabelle th, .punkte-tabelle td {
      border: 1px solid #999;
      padding: 4px 6px;
      text-align: center;
    }

    .punkte-tabelle th {
      background: #f0f0f0;
      font-weight: bold;
    }

    @media print {
      body { padding: 0; }
      .page { width: 100%; padding: 12mm 14mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Drucken-Button (verschwindet beim Drucken) -->
  <div class="no-print" style="text-align:right;margin-bottom:12px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:bold;">
      🖨 Als PDF drucken / speichern
    </button>
  </div>

  <div class="header">
    <div class="header-top">
      <div>
        <div class="header-fach">${fachName} · Klasse 4 · NRW</div>
        <div class="header-titel">${escHtml(sheet.titel)}</div>
        ${sheet.untertitel ? `<div class="header-untertitel">${escHtml(sheet.untertitel)}</div>` : ''}
      </div>
      <div class="header-meta">
        ${modus === 'klausur' ? '<strong>Klassenarbeit</strong><br>' : 'Übungsblatt<br>'}
        ${heute}
      </div>
    </div>
    <div class="header-felder">
      <div><div class="feld-label">Name:</div><div class="feld-linie"></div></div>
      <div><div class="feld-label">Datum:</div><div class="feld-linie"></div></div>
      <div><div class="feld-label">Erreichte Punkte:</div><div class="feld-linie"></div></div>
    </div>
    <div class="info-row">
      <span class="zeit-badge">⏱ ${escHtml(sheet.zeitangabe)}</span>
      <span class="punkte-gesamt">Gesamt: ${sheet.gesamtpunkte} Punkte</span>
    </div>
  </div>

  <div class="aufgaben">
    ${aufgabenHtml}
  </div>

  ${sheet.hinweis ? `<div class="hinweis">💡 ${escHtml(sheet.hinweis)}</div>` : ''}

  <div class="punkte-tabelle">
    <table>
      <tr>
        <th>Aufgabe</th>
        ${sheet.aufgaben.map(a => `<th>${a.nummer}</th>`).join('')}
        <th>Gesamt</th>
      </tr>
      <tr>
        <td>Max. Punkte</td>
        ${sheet.aufgaben.map(a => `<td>${a.punkte}</td>`).join('')}
        <td><strong>${sheet.gesamtpunkte}</strong></td>
      </tr>
      <tr>
        <td>Erreicht</td>
        ${sheet.aufgaben.map(() => '<td>&nbsp;</td>').join('')}
        <td>&nbsp;</td>
      </tr>
    </table>
  </div>

</div>
</body>
</html>`;
  }

  function renderLoesungsfeld(typ, zeilen) {
    switch (typ) {
      case 'rechnung':
        return `<div class="rechen-kasten" style="min-height:${Math.max(40, zeilen * 22)}px"></div>`;
      case 'zeichnung':
        return `<div class="zeichen-feld" style="height:${Math.max(60, zeilen * 22)}px"></div>`;
      default:
        return `<div class="zeilen-feld">${'<div class="schreibzeile"></div>'.repeat(zeilen || 2)}</div>`;
    }
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ---- Public: Generieren & Öffnen ----

  async function generate(fach, modus, apiKey, themen) {
    if (!themen?.length) throw new Error('Kein Thema ausgewählt.');
    const kontext = document.getElementById('kontext-' + fach)?.value || '';
    const sheet   = await fetchWorksheet(fach, kontext, themen, modus, apiKey);

    const html    = renderHtml(sheet, fach, modus);
    const win     = window.open('', '_blank');
    if (!win) throw new Error('Popup wurde blockiert. Bitte Popups für diese Seite erlauben.');
    win.document.write(html);
    win.document.close();

    // Kleines Delay damit Styles laden, dann automatisch Druckdialog
    setTimeout(() => {
      try { win.focus(); } catch { /* */ }
    }, 500);

    return sheet;
  }

  return { generate };

})();
