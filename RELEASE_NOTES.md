# Wecker 1.10.0

- Unter **Zahnrad → Tagestypen verwalten → Stift** sind jetzt auch **Musik** (immer an oder in der Karte schaltbar) und **Ausschalten des Weckers** (mit einem Klick oder erst nach Bestätigung) einstellbar. Beide Werte sind auch beim Anlegen eines gemeinsamen Tagestyps verfügbar.
- Neue Übernahmen des Typs verwenden diese Vorgaben. Vorhandene Wecker behalten beim Update und beim Speichern allein der Vorgaben ihre individuellen Einstellungen.
- Der zusätzliche Schalter **Musik und Ausschaltverhalten auf bestehende Wecker übernehmen** wendet beide Vorgaben ausdrücklich auch auf die aufgeführten Wecker an. Bei „Immer an“ wird deren Musik eingeschaltet. Zeiten, Aktivierungen, Schnellzeiten, Weckdauer und Gerätebindungen bleiben erhalten.
- Individuelle Anpassungen je Weckerkarte bleiben möglich. Die gemeinsamen Felder, Schalter und Dialoge aus HA UI Kit 1.4.1 werden unverändert verwendet; Berechtigungen und die serverseitige Ausschaltbestätigung bleiben erhalten.

**Update:** Wecker in HACS aktualisieren, Home Assistant neu starten und den Browser mit Strg+F5 neu laden. Ein Music-Manager-Update ist dafür nicht erforderlich.

# Wecker 1.9.0

- Neue eigenständige **Weckerverwaltung unter Zahnrad → Wecker verwalten**. Standardmäßig werden ungenutzte Wecker angezeigt; **Alle** zeigt auch die verwendeten. Name, Benutzer, Tagestypen mit Zeiten, Boxen und aktuelle Kartenverwendung erleichtern die Auswahl.
- Ungenutzte Wecker lassen sich einzeln über den Papierkorb und **Wecker löschen** entfernen. Gemeinsame Tagestypen bleiben erhalten. Die passende Musikzuordnung und offene Entwürfe dieses Weckers werden mit bereinigt.
- **Aktualisieren** liest die aktuelle Dashboardverwendung. Dashboard- und Statuskarten sowie laufende Weckvorgänge oder Musikstopps schützen vor dem Löschen. Vor der Löschung werden Verwendung und Revision serverseitig erneut geprüft.
- Die Verwaltung ist nur für Administratoren sichtbar. Auch ohne bereits eingerichtete Weckerkarte ist sie über den Kartenplatzhalter erreichbar.
- Bestehende Wecker, Gerätebindungen, Berechtigungen und HA UI Kit 1.4.1 bleiben erhalten.

**Update:** In HACS Wecker aktualisieren, Home Assistant neu starten und den Browser mit Strg+F5 neu laden. Danach **Zahnrad → Wecker verwalten → Ungenutzte → Papierkorb** verwenden. Ein Music-Manager-Update ist dafür nicht erforderlich.

# Wecker 1.8.0

- **Ungenutzte Tagestypen wieder löschbar:** Nach **Aktualisieren** zählen aktuelle Dashboard- und Statuskarten. Alte Weckereinträge ohne Karte blockieren das Löschen nicht mehr. Die Löschbestätigung zeigt genau die Wecker, die zusammen mit dem ungenutzten Typ entfernt werden. Auch ihre passenden Music-Manager-Weckerzuordnungen werden bereinigt; andere Tagestypen bleiben erhalten.
- **Speicherablauf korrigiert:** Der Home-Assistant-Karteneditor prüft die Einrichtung als Entwurf. Ein ausführbarer Wecker und seine Musikzuordnung werden erst nach **Speichern** der Dashboardkarte angelegt. Abbrechen legt keinen Wecker an und verändert keinen bestehenden Wecker. Die Übernahme funktioniert ohne geöffneten Browser und über einen Home-Assistant-Neustart hinweg.
- **Name des Weckers** steht am Anfang der Einrichtung statt unter Musik. Die abschließende Aktion heißt **Einrichtung übernehmen** und verweist auf das Speichern der Dashboardkarte. Die vollständige Bearbeitung innerhalb einer bestehenden Karte speichert wie bisher direkt.
- Vor dem Bereinigen werden Kartenverwendung und bestätigte Wecker erneut geprüft. Statuskarten, neue Referenzen, nicht lesbare Dashboards und laufende Musikstopps bleiben geschützt. Veraltete oder nachträglich veränderte Entwürfe überschreiben keine aktuellen Wecker.
- Persönliche Zeiten, Aktivierungen, Weckdauer, Gerätebindungen, Berechtigungen und Hue-Einstellungen bleiben bei bestehenden Karten erhalten. HA UI Kit 1.4.1 bleibt unverändert.

**Update:** Wecker in HACS aktualisieren, Home Assistant neu starten und den Browser mit Strg+F5 neu laden. Danach unter **Zahnrad → Tagestypen verwalten → Aktualisieren** den ungenutzten Typ löschen und die angezeigte Bereinigung bestätigen. Music Manager 2.2.1 bleibt verwendbar.

# Wecker 1.7.1

- **Weckdauer in den Wecker-Einstellungen:** Unter Zahnrad → Weckmusik feste Minuten oder **Wenn Titel endet** wählen. Die Dauer steht nicht mehr in der Musikauswahl. Dauer, Lautstärke und weitere Einstellungen werden zusammen gespeichert; Abbrechen und fehlgeschlagene Speichervorgänge erhalten den bisherigen Stand. Bereits eingestellte Dauern bleiben erhalten.
- **Aktualisieren in der Tagestypenverwaltung:** Prüft die aktuell gespeicherten Dashboardkarten einschließlich verschachtelter Karten und Statuskarten. Frühere Kartenkennungen werden nicht als aktuelle Verwendung gezählt. Gespeicherte Wecker ohne Dashboardkarte stehen getrennt in der Liste, da sie weiterhin schalten können. Die Prüfung löscht und deaktiviert keine Wecker. Nicht lesbare Dashboards erzeugen einen sichtbaren Fehler statt eines falschen Leerstands.
- Unter allen Tagestypen steht **Blau hinterlegt: aktiv in den nächsten 24 Stunden.** Alle Symbole bleiben blau.
- HA UI Kit 1.4.1, Gerätebindungen, Berechtigungen, Hue-Einstellungen und persönliche Weckzeiten bleiben erhalten.

**Update:** Wecker aktualisieren, Home Assistant neu starten und den Browser mit Strg+F5 vollständig neu laden. Music Manager 2.2.1 bleibt unverändert verwendbar und benötigt für diese Korrektur kein weiteres Update.

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
