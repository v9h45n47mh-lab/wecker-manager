# Weckerkarte 1.0.0

Die Karte bündelt Schultag, Wochenende und Ferien/schulfrei. Home Assistant führt die Wecker aus; ein geöffnetes Dashboard oder Handy wird nicht benötigt. Die Karte wird mit der eigenständigen Integration Wecker Manager installiert und erscheint als **Wecker Manager** im Kartenkatalog.

## Anlegen

1. Wecker Manager aus `v9h45n47mh-lab/wecker-manager` als eigenes HACS-Repository vom Typ **Integration** installieren. Music Manager muss bereits eingerichtet sein. Home Assistant neu starten und unter Geräte & Dienste **Wecker Manager** hinzufügen.
2. Im Dashboard eine neue Karte **Wecker Manager** hinzufügen.
3. Eine eindeutige Weckerkennung und genau ein eingerichtetes Musikkonto wählen. Das Konto entspricht der bestehenden HA-Benutzer-zu-Music-Assistant/Apple-Music-Zuordnung. Der zugehörige Benutzer sowie Administratoren können die Karte bedienen.
4. Eine oder mehrere aktive Sonos-Boxen wählen. Alle verwenden dieses eine Konto. Die Boxen müssen für den Benutzer sowohl in HA als auch in Music Assistant freigegeben sein. Die Karte ändert keine Sonos-Gruppen; bei mehreren Boxen wird dasselbe Wecklied auf jeder gewählten Box gestartet.
5. Optional mehrere Rollläden wählen und für jeden seine Zielposition festlegen: HA-Position **0 = geschlossen**, **100 = offen**. Nur Geräte mit Positionssteuerung stehen zur Auswahl.
6. Optional mehrere Lichter wählen. Für jede dimmbare Lampe Helligkeit und bei unterstützten Geräten Farbtemperatur oder Farbe einstellen. Reine Ein/Aus-Lampen werden eingeschaltet.
7. Optional einen Schulfrei-Kalender und eine Lichtaufhellung vor dem Schultagswecker wählen. Die Aufhellung führt von 1 % zur eingestellten Helligkeit; das Gerät muss Übergänge unterstützen. Rollläden und Musik starten erst zur eigentlichen Weckzeit.
8. Bei einer Umstellung die bisherige Wecker-Automation auswählen. Beim Anlegen wird sie ausgeschaltet, einschließlich eventuell laufender Aktionen. Ohne Auswahl alte Wecker-Automationen selbst vorher ausschalten.
9. In der Vorschau **Karte anlegen** drücken und die Dashboardänderung speichern.

Geräte, Zielpositionen, Lichteinstellungen und Musikkonto sind danach fest zugeordnet. Sie lassen sich weder in den Weckereinstellungen noch nachträglich im Karteneditor ändern. Auch ein verändertes YAML wird nicht als neue Gerätezuordnung akzeptiert. Für Änderungen die Karte neu anlegen; dabei erzeugt der Kartenkatalog eine neue Kartenkennung. Mit derselben Weckerkennung ersetzt sie die bisherige Karte und übernimmt deren Weckzeiten, Schnellzeiten und Lautstärke. Die alte Kartenkennung kann danach nicht erneut aktiviert werden.

Das bloße Kopieren einer vorhandenen Kartenkonfiguration erstellt dieselbe Karte auf einem weiteren Dashboard. Es erstellt keinen unabhängigen Wecker. Für einen unabhängigen Wecker eine neue Karte aus dem Katalog anlegen und eine neue Weckerkennung verwenden.

## Maximilian und Paul umstellen

| Kind | Weckerkennung | Sanftes Licht | Vorhandene Automation auswählen |
| --- | --- | --- | --- |
| Maximilian | `m_wecker_schultag` | 5 Minuten | `M – Wecker` |
| Paul | `p_wecker_schultag` | Aus | `P – Wecker` |

Bei der ersten Anlage werden die aktuellen `input_datetime.<m/p>_wecker_<typ>_zeit` und `input_boolean.<m/p>_wecker_<typ>_aktiv` sowie die Musikschalter für Wochenende/Ferien einmalig übernommen. Die persönliche Musikauswahl bleibt unter derselben Weckerkennung erhalten. Anschließend speichert und verwendet der neue Wecker seine Einstellungen zentral selbst. Die alten Helfer werden nicht mehr für diesen Wecker benötigt; sie werden nicht gelöscht. Zusätzliche Lichtsignale oder andere unabhängige Automationen bleiben bestehen.

Neue unabhängige Wecker beginnen ausgeschaltet. Sie benötigen keine YAML-Helfer und keine YAML-Automationen.

## Bedienen

- Uhrzeit antippen, Stunden und Minuten mit den beiden Rädern wählen und **Übernehmen** drücken. Scrollen, Touch, Pfeiltasten, Bild auf/ab sowie Pos1/Ende werden unterstützt. Abbrechen und Escape speichern nichts.
- Schnellzeit antippen, um sie sofort zu übernehmen.
- Jeden Weckertyp getrennt ein-/ausschalten. Das Ausschalten des Schultagsweckers wird bestätigt.
- Die ausgewählte Weckmusik gilt für alle drei Typen. Schultag verwendet Musik immer; Wochenende und Ferien besitzen eigene Musikschalter.
- Über das Zahnrad null bis drei unterschiedliche Schnellzeiten pro Typ und 5–15 % Musiklautstärke für alle Boxen einstellen. **Speichern** übernimmt die Änderungen, **Abbrechen** verwirft sie.
- Die Einstellungen und Zustände gelten für alle Geräte. Wenn zwei Geräte gleichzeitig ändern, wird eine veraltete Änderung zurückgewiesen, statt neuere Einstellungen zu überschreiben.

## Tageszuordnung und Betrieb

Schultag gilt montags bis freitags bei inaktivem Schulfrei-Kalender, Ferien montags bis freitags bei aktivem Kalender und Wochenende samstags/sonntags. Ohne Kalender gilt Schultag Mo–Fr; Ferien bleibt pausiert. Ist ein ausgewählter Kalender unbekannt oder nicht erreichbar, starten die Werktagswecker nicht. Lichtaufhellung über Mitternacht wird nicht vorgezogen, weil der aktuelle Kalenderzustand den Folgetag nicht zuverlässig beschreibt.

Die Zeit folgt der in Home Assistant eingestellten Zeitzone. Pro lokalem Tag, Typ und Phase wird höchstens einmal ausgeführt, auch bei einer zurückgestellten Uhr oder einem Neustart innerhalb derselben Minute. Ein während eines kompletten Ausfalls verpasster Wecker wird nicht nachgeholt. Musik wird nach fünf Minuten gestoppt; ein beim Neustart überfälliger Stopp erfolgt beim nächsten Minutentakt.

Ein fehlgeschlagenes Ausgabegerät verhindert die übrigen Weckaktionen nicht. Die Karte zeigt Ausführungsfehler. Benutzer- und Geräteberechtigungen sowie die Kontozuordnung werden bei jeder Ausführung erneut geprüft. Wird das festgelegte Musikkonto außerhalb der Karte verändert, pausiert die Karte bis zur Neuanlage.

Zeitpläne bleiben serverseitig erhalten, wenn ein Browser geschlossen oder eine Dashboardkarte entfernt wird. Zum dauerhaften Entfernen zuerst alle drei Weckertypen ausschalten und anschließend die Karte löschen. Eine Neuanlage mit derselben Weckerkennung ersetzt den vorhandenen Zeitplan; es läuft dadurch kein zweiter Wecker parallel.
