# Wecker 1.3.1

- Neue Einrichtungen beginnen mit einer leeren Tagestypenliste. Namen, Symbole und Wochentage werden ausdrücklich selbst gewählt.
- **Freie oder gebuchte Kalendertage** werden je Tagestyp im Setup festgelegt. Die Auswahl verschwindet aus der laufenden Karte. Nur ganztägige Termine zählen. Bisherige Kalenderregeln werden übernommen.
- Ein-/Ausschalten speichert gezielt nur den gewählten Typ; andere, gleichzeitig geänderte Einstellungen bleiben erhalten. Bestätigungen werden weiter serverseitig geprüft.
- Kopfleiste im Setup und Karteneditor: **heute**, **morgen**, **eigener Text** oder **ausgeblendet**. Das Zahnrad bleibt erreichbar.
- Lokale Überschreibungen für Zeilenhöhen, Schriften, Buttonfarben, Buttonabstände und Schnellzeiten entfernt. Gemeinsame Komponenten stammen aus dem unveränderten HA UI Kit 1.4.1; kompaktere Gruppenabstände verwenden dessen Tokens.
- Die Karte zeigt die gültigen Wochentage je Typ. Geräte, Musikauswahl, Weckzeiten und Sonnenaufgang bleiben erhalten.
- Geprüft werden persistiertes Ausschalten mit und ohne Bestätigung, freie/gebuchte Kalenderregeln, Kopfleisten, unveränderte UI-Kit-Stile und Desktop-/Mobilansichten in hellen/dunklen Themes.

In HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5).
