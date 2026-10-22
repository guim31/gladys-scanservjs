# scanservjs

[scanservjs](https://github.com/sbs20/scanservjs) ist eine Weboberfläche, die
mit SANE von jedem Gerät deines Netzwerks aus scannt. Mit dieser Integration
startet Gladys einen Scan, per Knopf im Dashboard oder aus einer Szene, und
meldet, wenn eine Datei fertig ist: aus Gladys oder aus der Weboberfläche von
scanservjs. Wohin die Datei danach geht (ein freigegebener Ordner,
Paperless-ngx…), ist Sache von scanservjs und seinen Pipelines.

Getestet mit einem echten scanservjs 3.3 (Docker-Image `sbs20/scanservjs`), der
den virtuellen Scanner von SANE steuert (sein Backend `test`): Scans vom
Flachbett und vom Dokumenteneinzug (10 Seiten), als PDF, JPEG und PNG,
abgelehnte Einstellungen, eine gelöschte Datei, mit und ohne Anmeldung. Ohne
die Hardware entwickelt (kein echter Scanner) und noch nicht mit einem echten
Gladys getestet: Rückmeldungen sind willkommen in
[den Issues](https://github.com/guim31/gladys-scanservjs/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- scanservjs 3.x (getestet mit 3.3.0), seine Weboberfläche vom Gladys-Rechner
  aus erreichbar (standardmäßig Port 8080), und ein Scanner, den es sieht.
- Wenn du in seiner `config.local.js` Benutzer angelegt hast: einen davon und
  sein Passwort.

Die Integration liest die Dateiliste von scanservjs standardmäßig jede Minute
und seine Scanner einmal pro Stunde. Nichts verlässt dein Netzwerk.

## Einrichtung

### 1. Die Adresse von scanservjs prüfen

Öffne scanservjs im Browser und notiere seine Adresse, zum Beispiel
`http://192.168.1.2:8080`. Mach einen ersten Scan aus seiner Weboberfläche:
Wenn er dort klappt, klappt er auch aus Gladys.

### 2. Die Integration konfigurieren

Unter **Integrationen → scanservjs → Konfiguration**:

- **scanservjs-Adresse**: die Adresse von oben. Eine reine IP-Adresse nutzt
  Port 8080.
- **Benutzername** und **Passwort**: nur, wenn scanservjs danach fragt.
- **Voreinstellung 1, 2 und 3**: was ein Knopfdruck macht. Jede Voreinstellung
  hat einen **Namen** (der Text ihres Knopfs; leer ist die Voreinstellung aus),
  eine **Auflösung**, einen **Modus** (Farbe, Graustufen, Schwarzweiß), ein
  **Format** (PDF, durchsuchbares PDF per OCR, JPEG, PNG) und eine **Quelle**:
  den Standard des Scanners, das Flachbett oder den Dokumenteneinzug, der alle
  eingelegten Blätter scannt (eine Datei). Standard: _Document_ (300 dpi,
  Graustufen, PDF) und _Photo_ (300 dpi, Farbe, JPEG). Die Integration findet
  die Wörter deines Scanners (ein Modus „Color“ kann „24bit Color“ heißen);
  ein fehlendes Schwarzweiß wird zu Graustufen.
- **scanservjs-Pipeline (optional)**: der genaue Name einer Pipeline von
  scanservjs, zum Beispiel einer eigenen (siehe _Paperless und freigegebene
  Ordner_). Leer nimmt die Integration die des Formats.
- **Aktualisierungsintervall**: wie schnell ein Scan aus der Weboberfläche
  von scanservjs erkannt wird (30 Sekunden, 1 oder 5 Minuten). Ein Scan aus
  Gladys wird sofort erkannt.
- **Löschen von Dateien erlauben**: standardmäßig aus; siehe die Aktion
  unten.
- **Sprache der Namen**: die Sprache der Funktionsnamen (beim Anlegen eines
  Geräts festgelegt) und der Zustände.

**Verbindung testen** liest scanservjs und nennt seine Version, seine Scanner
und seine Dateien.

### 3. Die Geräte anlegen

Lege im Tab **Entdecken** die Scanner und das Gerät **scanservjs** an. Nichts
wird ohne dich angelegt. Das Widget und die Szenen funktionieren auch ohne
sie, aber eine Szene kann nur einen angelegten Scanner wählen.

## Die Geräte

Ein Gerät pro Scanner von scanservjs:

| Funktion   | Wert                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Zustand    | Bereit, Scannt, Letzter Scan fehlgeschlagen (bis zum nächsten erfolgreichen), Nicht gefunden (scanservjs listet ihn nicht mehr) |
| Scan läuft | 1, solange ein aus Gladys gestarteter Scan läuft                                                                                |

Ein Gerät **scanservjs** für die Dateien seines Ausgabeordners:

| Funktion                 | Wert                                                       |
| ------------------------ | ---------------------------------------------------------- |
| Letzter Scan             | Tag und Uhrzeit der neuesten Datei                         |
| Letzte Datei             | Dateiname                                                  |
| Seiten des letzten Scans | Im PDF (oder im ZIP der Bilder) gezählt; 0, wenn unbekannt |
| Scans heute              | Seit Mitternacht erstellte Dateien                         |
| Dateien                  | Dateien im Ordner                                          |

Die Dateien hängen nicht an den Scannern: scanservjs merkt sich nicht, welcher
Scanner eine Datei erstellt hat.

## Dashboard

Das Widget **Scanner** zeigt die Scans des Tages, die Seiten des letzten
Scans, den Zustand des Scanners, die letzten fünf Dateien und einen Knopf pro
Voreinstellung (_Document_, _Photo_…). Ein Druck scannt: Dateiname und Seiten
erscheinen innerhalb von 20 Sekunden, oder das Widget meldet, dass der Scan
weiterläuft, und aktualisiert sich an seinem Ende. Wähle in seinen
Einstellungen den Scanner (leer: der erste).

## Szenen

### Auslöser

- **Ein Scan ist fertig**: eine neue Datei in scanservjs, aus Gladys oder aus
  seiner Weboberfläche. Filter: gestartet aus (Gladys, Weboberfläche) und
  Dateityp. Variablen: die Datei, ihre Seiten, ihr Typ, ihre Größe und bei
  einem Scan aus Gladys seine Voreinstellung, seine Pipeline und sein Scanner.
- **Ein Scan schlägt fehl**: ein aus Gladys gestarteter Scan schlägt fehl
  (Papierstau, leerer Einzug, Scanner aus, abgelehnte Einstellung). Filter:
  die Scanner. Variablen: der Scanner, die Voreinstellung und der Fehler von
  scanservjs.

### Aktionen

- **Scannen**: scannt mit einer Voreinstellung (und einem Scanner; leer: der
  erste) und wartet höchstens 100 Sekunden auf die Datei. Ergebnisse: ob die
  Datei fertig ist, ihr Name und ihre Seiten. Ein längerer Scan läuft weiter,
  und **Ein Scan ist fertig** löst an seinem Ende aus.
- **Letzte Datei löschen**: löscht die neueste Datei von scanservjs, zum
  Beispiel einen misslungenen Scan. Aus, außer **Löschen von Dateien
  erlauben** ist an. Ergebnis: der Name der gelöschten Datei.

### Szenen-Ideen

- Ein Knopf im Flur (Zigbee-Schalter) → **Scannen** mit der Voreinstellung
  _Document_: Brief aufs Glas, Druck, und er ist in Paperless.
- **Ein Scan ist fertig** → eine Nachricht „Gescannt: Datei (Seiten)“ mit den
  Variablen des Auslösers senden.
- **Ein Scan schlägt fehl** → mit dem Fehler benachrichtigen: Der Einzug war
  leer.

## Paperless und freigegebene Ordner

Die Integration startet die Scans; scanservjs erstellt und verschickt die
Dateien. Damit sie in Paperless-ngx landen, lass den Ausgabeordner von
scanservjs (`/var/lib/scanservjs/output` in seinem Container) auf den
Consume-Ordner von Paperless zeigen, oder lege in seiner `config.local.js` eine
Pipeline an, deren `afterAction` die Datei dorthin verschiebt (siehe die
Dokumentation von scanservjs, „config.local.js“), und trage ihren Namen unter
**scanservjs-Pipeline** einer Voreinstellung ein.

## Fehlerbehebung

- **„scanservjs antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner
  aus.
- **„Benutzername oder Passwort fehlt oder von scanservjs abgelehnt“**:
  scanservjs hat Benutzer in seiner `config.local.js`: Gib einen davon und
  sein Passwort ein.
- **„kein scanservjs unter dieser Adresse“**: Die Adresse zeigt auf etwas
  anderes.
- **„scanservjs sieht keinen Scanner“**: Prüfe den Scanner in seiner
  Weboberfläche, dann **Suchen** im Tab Entdecken (die Scanner werden neu
  gelesen).
- **„dieser Scanner hat keinen Dokumenteneinzug“**: Die Voreinstellung
  verlangt den Einzug; wähle das Flachbett oder den Standard des Scanners.
- **Ein Scan schlägt mit dem Fehler von `scanimage` fehl**: Derselbe Scan
  schlägt wohl auch aus der Weboberfläche von scanservjs fehl; seine
  Protokolle sagen mehr.
- Für mehr Details setze die Variable `LOG_LEVEL` der Integration auf `debug`.

## Grenzen

- Eine scanservjs-Instanz pro Integration, ein Scan aus Gladys zur selben
  Zeit. scanservjs selbst verhindert nicht, dass ein Scan aus seiner
  Weboberfläche gleichzeitig mit einem aus Gladys läuft: Vermeide das.
- Ein Scan aus der Weboberfläche wird erkannt, wenn seine Datei erscheint,
  beim nächsten Lesen: sein Fehlschlag, seine Voreinstellung und sein Scanner
  sind nicht bekannt.
- Die Seiten werden in PDF-Dateien und ZIP-Archiven gezählt; eine Textdatei
  der OCR zählt als eine Seite.
- Ohne die Hardware entwickelt: Rückmeldungen willkommen (nur ein virtueller
  Scanner von SANE). Nicht mit scanservjs oder SANE verbunden. Melde ein
  Problem oder eine Idee in
  [den Issues](https://github.com/guim31/gladys-scanservjs/issues).
