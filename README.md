# Wecker

![Wecker](custom_components/wecker_manager/brand/icon.png)

Eigenständige Home-Assistant-Integration mit Dashboardkarte mit **eigenen Tagestypen**, zum Beispiel Schultag, Wochenende und Ferien. Version **1.3.0**, gemeinsames **HA UI Kit 1.4.1**.

## Funktionen

- Uhrzeit antippen und mit getrennten Stunden-/Minuten-Drehrädern ändern. Touch, Maus und Tastatur; Übernehmen/Abbrechen.
- Bis zu zwölf Tagestypen mit eigenem Namen, Symbol und Wochentagen. Die bekannten drei Typen sind als Vorlage vorhanden.
- Je Typ: Musik immer an oder schaltbar, Ausschalten per Klick oder nur mit Bestätigung und optional ein eigener Kalender.
- In der Karte wählen: bei einem ganztägigen Termin oder bei freiem Kalender. Termine mit Uhrzeit werden ignoriert.
- Pro Tagestyp null bis drei Schnellzeiten in den Einstellungen.
- Gemeinsame Musiklautstärke von **5 bis 15 %** für alle gewählten Boxen.
- Sonnenaufgang pro Tagestyp in den Weckereinstellungen ein-/ausschalten und die Vorlaufzeit wählen. Er verwendet die fest zugeordneten dimmbaren Lampen und deren Zielhelligkeit.
- Kompakte Ansicht mit Symbolen, grauen Schnellzeiten nebeneinander und getrennter Anzeige **Morgen ist …**.
- Beim Anlegen genau **ein Musikkonto** und **mehrere Sonos-Boxen** festlegen.
- **Mehrere Rollläden**, jeweils mit eigener Zielposition, und **mehrere Lichter** mit eigener Helligkeit, Farbtemperatur oder Farbe.
- Konto und Geräte bleiben danach fest zugeordnet. Änderungen erfordern eine neu angelegte Karte mit neuer Kartenkennung.
- Ausführung zentral in Home Assistant, auch bei geschlossenem Dashboard. Musik endet nach fünf Minuten.
- Eine gemeinsame Musikauswahl für alle Tagestypen. Musikschalter und Ausschaltbestätigung folgen der Konfiguration des jeweiligen Typs.

## Installation

1. [Music Manager](https://github.com/v9h45n47mh-lab/music-manager) ab **2.1.0** mit Music Assistant und persönlicher Apple-Music-Zuordnung einrichten. Alle gewünschten Boxen für dieses eine Konto freigeben.
2. In HACS unter **Benutzerdefinierte Repositories** `https://github.com/v9h45n47mh-lab/wecker-manager` als **Integration** hinzufügen und **Wecker** installieren.
3. Home Assistant neu starten. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** **Wecker** einrichten.
4. Die Dashboardkarte **Wecker** hinzufügen und den fünf Schritten folgen: **Tagestypen → Musik → Rollläden → Licht → Prüfen**.
5. In der Übersicht **Wecker anlegen** drücken und das Dashboard speichern. Bestehende alte Wecker bei Bedarf selbst ausschalten.

Der Music Manager wird als vorhandene Integration verwendet. Dieses Repository installiert ausschließlich `custom_components/wecker_manager`; es enthält und ersetzt keine Music-Manager-Installation. Die Dashboard-Ressource wird automatisch registriert.

## Update auf 1.3.0

In HACS aktualisieren, Home Assistant neu starten und im Browser vollständig neu laden (**Strg+F5**). Vorhandene Karten, Geräte, Weckzeiten und Sonnenaufgangszeiten bleiben erhalten; der technische Kartentyp `custom:wecker-manager-card` bleibt gleich. Sonnenaufgang und Schnellzeiten werden pro Typ über das Zahnrad geändert. Als Administrator kannst du im Karteneditor **Tagestypen bearbeiten** wählen; die Gerätezuordnung bleibt dabei fest.

Zeigt der Karteneditor noch „Karte anlegen“ in der Vorschau oder den Hinweis zur automatischen Ablösung alter Wecker, ist noch ein altes Kartenmodul aktiv. Die aktuelle Version registriert einen eigenen Ressourcenpfad und führt durch die fünf Einrichtungsschritte. Nach dem vollständigen Neuladen den visuellen Editor erneut öffnen.

Die Integration liefert lokale Marketplace-Icons für Hell/Dunkel in 256 und 512 Pixeln mit. Sie verwenden das Weckersymbol des gemeinsamen UI Kits. Alte HACS-Versionen können Icons eigener Repositories erst nach Aktualisierung beziehungsweise Aktualisierung ihrer Metadaten anzeigen. Das Repository wird durch dieses Release nicht automatisch in den öffentlichen Marketplace-Katalog aufgenommen.

## Maximilian und Paul umstellen

| Kind | Weckerkennung | Sanftes Licht |
| --- | --- | --- |
| Maximilian | `m_wecker_schultag` | 5 Minuten |
| Paul | `p_wecker_schultag` | Aus |

Bereits vorhandene Karten behalten ihre Weckerkennung und alle Einstellungen. Bei manueller YAML-Konfiguration mit diesen Kennungen werden vorhandene Helferzeiten, Aktivierungen, Musikschalter und gespeicherte Wecklieder übernommen. Der Assistent verwaltet die Kennungen neuer Karten automatisch. Bei Schultag und Ferien jeweils **Schulfreie Tage** als Kalender wählen. In der Karte für Schultag **Kein ganztägiger Termin** und für Ferien **Ganztägiger Termin vorhanden** einstellen. Alte Wecker-Automationen werden nicht verändert. Deaktiviere den bisherigen Wecker bei einer Umstellung selbst. Zusätzliche unabhängige Lichtsignale bleiben bestehen.

Neue unabhängige Wecker benötigen keine YAML-Helfer oder YAML-Automationen und beginnen ausgeschaltet.

[Bedienung, feste Gerätezuordnung und Betrieb](docs/WECKERKARTE.md).

## Entwicklung und Prüfung

`npm ci`, `npm run build`, `npm run check`, `npm test`, `npm run test:browser`. Die Browserprüfung verwendet `CHROMIUM_PATH`, falls gesetzt. Backendtests prüfen die Schnittstelle gegen den separat ausgecheckten Music Manager am Commit `5b312361676197bf1178ce76b63ab46ac76d3975`; Quellpfad über `MUSIC_MANAGER_SOURCE` oder `.test-deps/music-manager` angeben. Der Release-Workflow richtet diese Testabhängigkeit ein.

`python3 scripts/package.py` erzeugt das installierbare ZIP und eine selbständige Beispieldaten-Vorschau. Das UI Kit wird lokal mit festen Prüfsummen gebündelt; zur Laufzeit gibt es keinen CDN- oder GitHub-Abruf.

`node scripts/brand.mjs` erzeugt die mitgelieferten Icons aus dem UI Kit erneut.
