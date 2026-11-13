# Wecker 1.3.0

- Die Einrichtung beginnt mit **Tagestypen**. Bis zu zwölf eigene Typen mit Namen, Symbol und Wochentagen sind möglich; Schultag, Wochenende und Ferien sind vorbelegt.
- Pro Typ: Musik **immer an** oder **schaltbar**, Ausschalten **per Klick** oder **mit Bestätigung**, und optional ein eigener Kalender.
- Die Kalenderbedingung wird direkt in der Weckerkarte gewählt: **Ganztägiger Termin vorhanden** oder **Kein ganztägiger Termin**. Nur echte ganztägige Termine zählen; Termine mit Uhrzeit werden ignoriert. Enddaten ganztägiger Termine sind exklusiv.
- Der Kalender wird zur Weckzeit erneut geprüft. Ist er nicht erreichbar, pausiert der betroffene Typ; andere unabhängige Typen können weiterlaufen.
- Administratoren können die Tagestypen bestehender Karten im Karteneditor bearbeiten. Musikkonto, Lampen, Rollläden und Boxen bleiben dabei fest zugeordnet.
- Ausschaltbestätigung und Musikpflicht werden auch im Backend geprüft. Gemeinsame Änderungen besitzen weiterhin einen Versionsschutz.
- Sonnenaufgang und Schnellzeiten sind pro Tagestyp einstellbar. Die vorhandenen drei Typen, Weckzeiten, Musikauswahl, Lautstärke und Lichtvorlauf werden übernommen.
- HA UI Kit 1.4.1 bleibt unverändert eingebunden.

In HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5).
