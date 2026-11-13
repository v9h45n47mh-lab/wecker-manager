# Wecker

![Wecker](custom_components/wecker_manager/brand/icon.png)

Home-Assistant-Integration mit vollständig bearbeitbaren Weckerkarten und gemeinsamen Tagestypen. Version **1.10.1**, unverändertes **HA UI Kit 1.4.1**.

## Funktionen

- Eigene Tagestypen mit Namen, Symbolen, Wochentagen und optional einem Kalender. Im Setup festlegen: freie oder gebuchte Kalendertage; nur ganztägige Termine zählen.
- Einen Tagestyp wie **Schultag** bei Maximilian anlegen und bei Paul aus dem gemeinsamen Katalog verwenden. Namen, Anzeigenamen, Symbole, Wochentage und Kalenderregeln werden gemeinsam gepflegt. Der Name identifiziert den Typ in der Verwaltung, der Anzeigename beschriftet die Karte. Uhrzeiten und Aktivierungen bleiben je Karte getrennt.
- In der Tagestypenverwaltung **Musik** (immer an oder schaltbar) und **Ausschalten des Weckers** (direkt oder nach Bestätigung) vorgeben. Neue Übernahmen verwenden diese Vorgaben. Mit **Musik und Ausschaltverhalten auf bestehende Wecker übernehmen** werden sie ausdrücklich auch auf die aufgeführten Wecker angewendet; individuelle Änderungen je Karte bleiben möglich.
- Zentrale Verwaltung unter **Zahnrad → Tagestypen verwalten**: Mit **Aktualisieren** die aktuellen Dashboardkarten prüfen; gespeicherte Wecker ohne Dashboardkarte werden getrennt angezeigt und können beim Löschen ungenutzter Typen mit aufgeräumt werden. Anlegen, gemeinsame Regeln ändern, verwendende Weckerkarten und Benutzer sehen und unbenutzte Typen löschen. Wiederholtes Übernehmen fügt keinen zweiten Wecker hinzu.
- **Zahnrad → Wecker verwalten:** Ungenutzte Wecker gezielt löschen. Die Übersicht zeigt Benutzer, Weckzeiten, Boxen und die aktuelle Kartenverwendung; gemeinsame Tagestypen bleiben erhalten.
- Im Setup unter **Licht → betreffende Lampe bearbeiten** deren Hue-Szene wählen. Die gespeicherten Szenenwerte werden nur auf diese Lampe angewendet; weitere Lampen der Szene bleiben unberührt.
- Zusätzliche kompakte **Wecker-Status**-Karte: Name, Tagessymbole, An/Aus und die eingestellte Weckzeit. Zum Beispiel Maximilian und Paul nebeneinander: [Anleitung und YAML](docs/STATUSKARTE.md).
- Ein-/Ausschalten mit optionaler Bestätigung, Stunden-/Minutenräder und bis zu drei Schnellzeiten je Typ. Änderungen werden zentral gespeichert.
- **Leicht blauer Hintergrund des gesamten Weckerbereichs:** Der aktivierte Wecker ist innerhalb der nächsten 24 Stunden fällig. Alle Symbole sind blau. Kalenderregeln, Wochentage, erledigte Ausführungen und Zeitumstellungen werden berücksichtigt.
- Unter dem Zahnrad: Weckdauer (feste Minuten oder Titelende), Lautstärke 5–15 %, Schnellzeiten und Sonnenaufgang je Tagestyp. Der schmale Dialog zeigt die Versionsnummer.
- Administratoren können über **Gesamte Karte bearbeiten** oder im Karteneditor Konto, Boxen, Rollläden, Licht und Tagestypen ändern, ohne die Karte neu anzulegen.
- Genau ein persönliches Musikkonto pro Karte und mehrere Sonos-Boxen. Mehrere Rollläden mit Zielposition sowie mehrere Lichter mit Helligkeit/Farbtemperatur/Farbe sind möglich.
- Zentrale Ausführung in Home Assistant auch bei geschlossenem Dashboard. Die gewählte Musik gilt für alle Typen; Weckmusik endet nach der gewählten Dauer mit Titelwiederholung oder einmalig am Titelende.

## Installation und Update

1. [Music Manager](https://github.com/v9h45n47mh-lab/music-manager) ab **2.2.1** mit Music Assistant und persönlicher Apple-Music-Zuordnung einrichten. Gewünschte Boxen für das jeweilige Konto freigeben.
2. In HACS `https://github.com/v9h45n47mh-lab/wecker-manager` als benutzerdefiniertes Repository vom Typ **Integration** hinzufügen und **Wecker** installieren.
3. Home Assistant neu starten und **Wecker** unter Geräte & Dienste hinzufügen.
4. Eine Dashboardkarte **Wecker** hinzufügen. **Tagestypen → Musik → Rollläden → Licht → Prüfen** durchlaufen, **Einrichtung übernehmen** wählen und anschließend die Dashboardkarte mit **Speichern** sichern. Erst die gespeicherte Karte legt den ausführbaren Wecker an.

Beim Update in HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (**Strg+F5**). Vorhandene Karten, Musikauswahl, Zeiten und Sonnenaufgangseinstellungen bleiben erhalten. Gemeinsame Tagestypen werden aus den vorhandenen Definitionen übernommen. Alte Kalenderregeln bleiben bestehen.

Die Dashboard-Ressource wird automatisch registriert. Dieses Paket installiert ausschließlich `custom_components/wecker_manager`; die separat installierte Music-Manager-Integration wird nicht ersetzt.

Entwürfe aus dem Karteneditor legen keine Weckerprogramme oder Musikzuordnungen an und blockieren keine Tagestypen. Beim Abbrechen bleibt der bisherige Wecker erhalten. Bereits vorhandene Einträge ohne Dashboardkarte lassen sich unter **Zahnrad → Wecker verwalten → Ungenutzte** einzeln löschen, ohne gemeinsame Tagestypen zu entfernen.

## Umstellung alter YAML-Wecker

Die neue Integration benötigt keine YAML-Weckerhelfer. Bereits angelegte Karten verwenden ihre gespeicherten Werte. Die alten Automationen **M – Wecker** und **P – Wecker** müssen bei einer Umstellung selbst deaktiviert werden; das Entfernen einer alten Dashboardkarte beendet keine Automation. Geräte, Kalender und weiterhin verwendete Music-Manager-Zuordnungen bleiben erhalten. [Aufräumen alter Wecker](docs/ALTE_WECKER.md).

[Einrichtung und Bedienung](docs/WECKERKARTE.md) · [UI-Kit-Prüfung](docs/UI_KIT_PRUEFUNG.md)

## Entwicklung und Prüfung

`npm ci`, `npm run build`, `npm run check`, `npm test`, `npm run test:browser`. `CHROMIUM_PATH` kann den Browser vorgeben. Die Backendtests verwenden den separat ausgecheckten Music Manager am Commit `d98339f219fb4097ada33756bde37b35ca904a82` über `MUSIC_MANAGER_SOURCE` oder `.test-deps/music-manager`.

`python3 scripts/package.py` erzeugt das Installationspaket und eine eigenständige Vorschau mit Beispieldaten. Das UI Kit wird lokal mit festen Prüfsummen gebündelt; es gibt keinen Laufzeitabruf von GitHub oder einem CDN.

## Radiosender als Weckmusik

Mit Music Manager ab **2.2.0** lassen sich Radiosender zum Wecken markieren und auf der Weckerkarte auswählen. Die Auswahl gilt wie die Apple-Music-Auswahl für alle Tagestypen; Musikschalter, Lautstärke und die gewählte feste Dauer gelten auch für Radio. Live-Radio hat kein Titelende. Der Radiosender startet nativ auf allen zugeordneten Sonos-Boxen, auch wenn Music Assistant beim Wecken nicht verbunden ist. Benutzer- und Gerätebindungen werden weiterhin geprüft. Bestehende Apple-Music-Auswahlen und alle Tagestyp- und Hue-Szenen-Einstellungen bleiben erhalten.
