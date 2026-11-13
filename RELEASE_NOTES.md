# Wecker 1.7.0

- Direkt in der Weckmusikauswahl sind feste Minuten oder **Wenn Titel endet** wählbar. Bei fester Dauer wird der gewählte Titel auf allen zugeordneten Boxen bis zum Ablauf wiederholt. **Dauer übernehmen** ändert die Dauer auch ohne neue Titelwahl. Bestehende Wecker starten weiterhin mit fünf Minuten.
- Die Abschaltzeit wird dauerhaft gespeichert und über einen eigenen Timer geplant. Nach einem Neustart wird sie wiederhergestellt; fehlgeschlagene Stopps bleiben für einen erneuten Versuch gespeichert. Beim Titelende spielt die einzelne Music-Assistant-Queue mit ausgeschalteter Wiederholung vollständig aus. Live-Radio benötigt eine feste Dauer.
- Tagestypen besitzen einen eindeutigen **Namen** für Verwaltung und Auswahl sowie einen **Anzeigenamen** auf der Weckerkarte. Beim Update bleiben vorhandene Beschriftungen und persönliche Zeiten erhalten. Mehrdeutige bisherige Verwaltungsnamen erhalten einen Zusatz.
- Der Verwendungsnachweis nennt die Weckerkarten und Benutzer, die einen Tagestyp verwenden. Er steht in der Verwaltung und beim Bearbeiten eines gemeinsamen Typs.
- Hue-Szenen werden **je Lampe im Lampendialog** gewählt. Nur deren gespeicherte Lichtwerte werden auf diese Lampe beziehungsweise die ausgewählte Lichtgruppe angewendet. Weitere Lampen derselben Hue-Szene werden nicht mitgeschaltet. Auch Sonnenaufgang und vorhandene gemeinsame Hue-Szenen bleiben unterstützt.
- Eine Ausführung innerhalb der nächsten 24 Stunden wird durch einen sehr leicht blauen Hintergrund des gesamten Weckerbereichs markiert. Alle Symbole bleiben blau. Die Versionsanzeige bleibt unten in den Einstellungen.

**Update:** Music Manager auf **2.2.1** und Wecker auf **1.7.0** aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5). Die YAML bestehender Statuskarten bleibt verwendbar.

# Wecker 1.6.1

- Die kompakte Statuskarte zeigt je Tagestyp zusätzlich die aktuell eingestellte Weckzeit im Format HH:MM. Die Zeit bleibt auch bei ausgeschaltetem Wecker sichtbar und aktualisiert sich zusammen mit dem Status automatisch.
- Die Versionsanzeige steht in den Wecker-Einstellungen unten, nach den Einstellungen und Verwaltungsaktionen.
- Die Übersicht bleibt auf schmalen Displays mit zwei Karten nebeneinander nutzbar. Schrift und Statusfarben verwenden weiterhin das unveränderte HA UI Kit 1.4.1.

In HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5). Die YAML vorhandener Statuskarten muss nicht geändert werden.

# Wecker 1.6.0

- Markierte Radiosender aus Music Manager 2.2.0 sind als persönliche Weckmusik auf allen zugeordneten Sonos-Boxen verwendbar.
- Lautstärke, Musikschalter je Tagestyp und das Ende nach fünf Minuten gelten auch für Radio.
- Native Radio-Wiedergabe ohne aktive Apple-Music-Verbindung beim Wecken; persönliche Benutzer- und Geräteberechtigungen bleiben erhalten.
- Die Hue-Szenen, Tagestypenverwaltung und übrigen Neuerungen aus 1.5.0 bleiben erhalten.
- Für die Senderauswahl Music Manager ebenfalls auf 2.2.0 aktualisieren. Bestehende Karten bleiben verwendbar.

# Wecker 1.5.0

- Unter **Zahnrad → Tagestypen verwalten** können Administratoren gemeinsame Tagestypen anlegen, bearbeiten und unbenutzte Typen löschen. Die Liste zeigt, auf wie vielen Karten ein Typ verwendet wird. Gemeinsame Regeln ändern sich auf allen verknüpften Karten; persönliche Weckzeiten, Aktivierungen und Musik bleiben erhalten.
- **Doppelte Einträge beim Übernehmen korrigiert:** Ein schon vorhandener Tagestyp wird anhand seiner gemeinsamen Kennung, Regeln oder seines Namens wiederverwendet. Seine lokale Kennung und Einstellungen bleiben erhalten. Identische Einträge im gemeinsamen Katalog werden zusammengeführt, auch nach einer Umbenennung. Vorhandene einzelne Weckzeiten werden nicht gelöscht.
- Im Einrichtungsschritt **Licht** stehen passende **Hue-Szenen** zur Auswahl. Grundlage ist die tatsächliche Lampenzuordnung der Hue-Integration. Szenen mit zusätzlichen, nicht ausgewählten Lampen werden ausgeblendet. Die Szene setzt Helligkeit und Farben ihrer Lampen; weitere ausgewählte Lichter behalten ihre individuellen Einstellungen.
- Hue-Szenen werden auch beim Sonnenaufgang verwendet. Zuordnung und Berechtigungen werden vor der Ausführung erneut geprüft. Änderungen an einer Szene dürfen keine zusätzlichen Lampen einschalten.
- Neue zusätzliche **Wecker-Status**-Karte für eine kompakte Übersicht wie bisher: Überschrift und je Typ Symbol, Statuspunkt und An/Aus. Sie nutzt die neuen zentralen Daten, aktualisiert sich live und benötigt keine alten Helfer. [Anleitung mit YAML](docs/STATUSKARTE.md).
- Das HA UI Kit 1.4.1 bleibt unverändert. Browserprüfungen decken Desktop, Mobilgeräte sowie helle und dunkle Themes ab. Die schmalen Einstellungen mit Versionsanzeige und die zwei Symbolfarben bleiben erhalten.

In HACS aktualisieren, Home Assistant neu starten und den Browser vollständig neu laden (Strg+F5). Anschließend die Hue-Szene unter **Zahnrad → Gesamte Karte bearbeiten → Licht** wählen und speichern.
