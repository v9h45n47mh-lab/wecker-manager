# Wecker 1.2.0

- Layout nach der bisherigen Weckerkarte: eigene Anzeige **Morgen ist …**, Weckmusik oben, Symbole vor Weckertyp/Uhrzeit/Musik, dezente Trennlinien und kompakte graue Schnellzeiten nebeneinander.
- Die zusätzliche Überschrift mit der Boxenanzahl entfällt. Das Zahnrad steht neben der Morgen-Anzeige bereit. Zeiten bleiben antippbar und öffnen die Stunden-/Minutenräder.
- **Sonnenaufgang am Schultag** liegt jetzt in den normalen Weckereinstellungen: Aus oder 5–30 Minuten Vorlauf. Er verwendet unverändert die beim Anlegen festgelegten Lampen und Zielhelligkeiten.
- Bereits gespeicherte Sonnenaufgangszeiten werden übernommen. Ändern, Speichern und Abbrechen funktionieren ohne Neuanlage der Karte; auch ältere Clients behalten die gespeicherte Vorlaufzeit bei.
- Morgen-Anzeige mit Home-Assistant-Zeitzone und tatsächlichen Schulfrei-Kalendereinträgen für den Folgetag. Fehler der Kalenderabfrage werden als Hinweis angezeigt.
- HA UI Kit 1.4.1 und die Verbindung zum separat installierten Music Manager bleiben erhalten.

In HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5). Vorhandene Karten, Geräte, Musik und Weckzeiten bleiben erhalten.
