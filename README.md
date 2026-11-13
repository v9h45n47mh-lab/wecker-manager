# Wecker Manager

Eigenständige Home-Assistant-Integration mit Dashboardkarte für **Schultag, Wochenende und Ferien/schulfrei**. Version **1.1.0**, gemeinsames **HA UI Kit 1.4.1**.

## Funktionen

- Uhrzeit antippen und mit getrennten Stunden-/Minuten-Drehrädern ändern. Touch, Maus und Tastatur; Übernehmen/Abbrechen.
- Pro Weckertyp null bis drei Schnellzeiten in den Einstellungen.
- Gemeinsame Musiklautstärke von **5 bis 15 %** für alle gewählten Boxen.
- Beim Anlegen genau **ein Musikkonto** und **mehrere Sonos-Boxen** festlegen.
- **Mehrere Rollläden**, jeweils mit eigener Zielposition, und **mehrere Lichter** mit eigener Helligkeit, Farbtemperatur oder Farbe.
- Konto und Geräte bleiben danach fest zugeordnet. Änderungen erfordern eine neu angelegte Karte mit neuer Kartenkennung.
- Ausführung zentral in Home Assistant, auch bei geschlossenem Dashboard. Musik endet nach fünf Minuten.
- Gemeinsame Musikauswahl für alle drei Wecker; Musikschalter für Wochenende/Ferien und Bestätigung beim Ausschalten des Schultagsweckers.

## Installation

1. [Music Manager](https://github.com/v9h45n47mh-lab/music-manager) ab **2.1.0** mit Music Assistant und persönlicher Apple-Music-Zuordnung einrichten. Alle gewünschten Boxen für dieses eine Konto freigeben.
2. In HACS unter **Benutzerdefinierte Repositories** `https://github.com/v9h45n47mh-lab/wecker-manager` als **Integration** hinzufügen und **Wecker Manager** installieren.
3. Home Assistant neu starten. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** **Wecker Manager** einrichten.
4. Die Dashboardkarte **Wecker Manager** hinzufügen und den fünf Schritten folgen: **Musik → Rollläden → Licht → Schultage → Prüfen**.
5. In der Übersicht **Wecker anlegen** drücken und das Dashboard speichern. Bestehende alte Wecker bei Bedarf selbst ausschalten.

Der Music Manager wird als vorhandene Integration verwendet. Dieses Repository installiert ausschließlich `custom_components/wecker_manager`; es enthält und ersetzt keine Music-Manager-Installation. Die Dashboard-Ressource wird automatisch registriert.

## Maximilian und Paul umstellen

| Kind | Weckerkennung | Sanftes Licht |
| --- | --- | --- |
| Maximilian | `m_wecker_schultag` | 5 Minuten |
| Paul | `p_wecker_schultag` | Aus |

Bereits vorhandene Karten behalten ihre Weckerkennung und alle Einstellungen. Bei manueller YAML-Konfiguration mit diesen Kennungen werden vorhandene Helferzeiten, Aktivierungen, Musikschalter und gespeicherte Wecklieder übernommen. Der Assistent verwaltet die Kennungen neuer Karten automatisch. Als Kalender **Schulfreie Tage** wählen. Alte Wecker-Automationen werden nicht verändert. Deaktiviere den bisherigen Wecker bei einer Umstellung selbst. Zusätzliche unabhängige Lichtsignale bleiben bestehen.

Neue unabhängige Wecker benötigen keine YAML-Helfer oder YAML-Automationen und beginnen ausgeschaltet.

[Bedienung, feste Gerätezuordnung und Betrieb](docs/WECKERKARTE.md).

## Entwicklung und Prüfung

`npm ci`, `npm run build`, `npm run check`, `npm test`, `npm run test:browser`. Die Browserprüfung verwendet `CHROMIUM_PATH`, falls gesetzt. Backendtests prüfen die Schnittstelle gegen den separat ausgecheckten Music Manager am Commit `5b312361676197bf1178ce76b63ab46ac76d3975`; Quellpfad über `MUSIC_MANAGER_SOURCE` oder `.test-deps/music-manager` angeben. Der Release-Workflow richtet diese Testabhängigkeit ein.

`python3 scripts/package.py` erzeugt das installierbare ZIP und eine selbständige Beispieldaten-Vorschau. Das UI Kit wird lokal mit festen Prüfsummen gebündelt; zur Laufzeit gibt es keinen CDN- oder GitHub-Abruf.
