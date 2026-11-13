# Wecker 1.4.0

- Weckerkarten lassen sich vollständig bearbeiten: Name, Musikkonto, Sonos-Boxen, Rollläden, Licht und Tagestypen. Der Einstieg steht im Karteneditor und für Administratoren unter dem Zahnrad. Die Karten-/Weckerkennung sowie bestehende Zeiten bleiben erhalten.
- Gemeinsame Tagestypen können auf mehreren Karten verwendet werden. Ein bei Maximilian angelegter Schultag lässt sich bei Paul übernehmen. Namen, Symbole, Wochentage und Kalenderregeln werden geteilt; Weckzeit, Aktivierung, Musik und Ausschaltbestätigung bleiben pro Karte getrennt.
- Bereits vorhandene Tage werden in den gemeinsamen Katalog übernommen. Identische Regeln werden zusammengeführt. Änderungen gemeinsamer Regeln aktualisieren verknüpfte Karten mit Versionsschutz und Kalender-Berechtigungsprüfung für alle betroffenen Benutzer.
- Ausschließlich zwei Farben für die Tagessymbole: **Blau** bei einer geplanten Ausführung innerhalb der nächsten 24 Stunden, andernfalls **Grau**. Aktivierung, Wochentage, ganztägige Kalendertermine und bereits ausgeführte Wecker werden berücksichtigt. Die 24 Stunden werden auch bei Zeitumstellungen als tatsächlich verstrichene Stunden gerechnet.
- Die bisherige Tagesüberschrift und ihre Konfiguration entfallen vollständig. Die Weckmusikauswahl und das Zahnrad bleiben auf der Karte.
- Die Wecker-Einstellungen sind maximal 480 Pixel breit und zeigen die Wecker-/Integrationsversion sowie die UI-Kit-Version.
- Das HA UI Kit 1.4.1 bleibt unverändert eingebunden. Desktop-/Mobilansichten, helle/dunkle Themes, Farbanzeige und vollständige Bearbeitung werden vor dem Release im Browser geprüft.

In HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5). Alte YAML-Wecker-Automationen bei der Umstellung selbst deaktivieren.
