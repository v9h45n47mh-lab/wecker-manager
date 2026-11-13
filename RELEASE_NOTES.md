# Wecker 1.1.1

- Korrektur für den visuellen Karteneditor: Die Konfiguration mit vorausgewähltem Musikkonto und leeren Gerätelisten funktioniert auch ohne die entfernte Liste alter Automationen. Fehlende optionale Gerätelisten und leere YAML-Werte werden abgefangen.
- Jeder Release verwendet einen eigenen Pfad für das Kartenmodul. Alte Wecker-Ressourcen werden automatisch aktualisiert und doppelte Einträge bereinigt, damit kein alter Editor aus dem Cache geladen wird.
- Integration, HACS-Eintrag und Dashboardkarte heißen jetzt **Wecker**. Der bisherige Standardtitel wird beim Start angepasst; selbst gewählte Titel bleiben erhalten.
- Wecker-Icon aus dem HA UI Kit für helle und dunkle Darstellung, jeweils mit 256 und 512 Pixeln, direkt im installierten `brand/`-Ordner.
- Die Einrichtung bleibt **Musik → Rollläden → Licht → Schultage → Prüfen**. Die Ablösung alter Wecker ist weiterhin entfernt.
- Bestehende Kartenkennungen, Konten, Gerätezuordnungen, Weckzeiten und Musikauswahl bleiben erhalten. HA UI Kit 1.4.1 bleibt unverändert eingebunden.

In HACS aktualisieren, Home Assistant neu starten und die Seite vollständig neu laden. Vorhandene Karten und Weckzeiten bleiben erhalten.
