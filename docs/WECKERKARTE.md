# Weckerkarte 1.0.0

Die Karte bündelt Schultag, Wochenende und Ferien/schulfrei. Home Assistant führt die Wecker aus; ein geöffnetes Dashboard oder Handy wird nicht benötigt. Die Karte wird mit der eigenständigen Integration Wecker Manager installiert und erscheint als **Wecker Manager** im Kartenkatalog.

## Anlegen

Die Einrichtung führt durch fünf überschaubare Schritte. Zurück/Weiter und die Schrittnavigation erlauben jederzeit Korrekturen, ohne die bisherige Auswahl zu verlieren.

1. **Musik:** Weckername, genau ein Musikkonto und mindestens eine Sonos-Box wählen. Die Boxenauswahl öffnet einen eigenen durchsuchbaren Dialog.
2. **Rollläden:** Optional Rollläden auswählen. Neben jedem gewählten Gerät öffnet das Stiftsymbol ausschließlich dessen Zielposition. Ohne Rollläden direkt weitergehen.
3. **Licht:** Optional Lichter auswählen und jeweils einzeln Helligkeit, Farbtemperatur oder Farbe einstellen. Nicht unterstützte Funktionen werden nicht angeboten. Sanftes Licht vor dem Schultagswecker ist hier ebenfalls wählbar.
4. **Schultage:** Optional einen Kalender für schulfreie Tage wählen. Ohne Kalender gilt der Schultagswecker Mo–Fr; der Ferienwecker bleibt pausiert.
5. **Prüfen:** Die Übersicht zeigt Konto, Boxen und alle Geräteeinstellungen. **Ändern** führt direkt zum passenden Schritt zurück. Erst **Wecker anlegen** speichert die feste Zuordnung. Danach das Dashboard speichern.

Geräteauswahl und Geräteeinstellungen haben **Übernehmen** und **Abbrechen**. Abbrechen verwirft nur die Änderungen im geöffneten Dialog. Technische Karten- und Weckerkennungen werden automatisch verwaltet.

Bestehende alte Wecker werden nicht automatisch ausgeschaltet oder verändert. Deaktiviere sie bei einer Umstellung selbst.

Geräte, Zielpositionen, Lichteinstellungen und Musikkonto sind danach fest zugeordnet. Sie lassen sich weder in den Weckereinstellungen noch nachträglich im Karteneditor ändern. Auch ein verändertes YAML wird nicht als neue Gerätezuordnung akzeptiert. Für Änderungen die Karte neu anlegen; dabei erzeugt der Kartenkatalog eine neue Kartenkennung. Bei manueller Wiederverwendung derselben Weckerkennung ersetzt sie die bisherige Karte und übernimmt deren Weckzeiten, Schnellzeiten und Lautstärke. Die alte Kartenkennung kann danach nicht erneut aktiviert werden.

Das bloße Kopieren einer vorhandenen Kartenkonfiguration erstellt dieselbe Karte auf einem weiteren Dashboard. Es erstellt keinen unabhängigen Wecker. Für einen unabhängigen Wecker eine neue Karte aus dem Katalog anlegen und eine neue Weckerkennung verwenden.

## Maximilian und Paul umstellen

| Kind | Weckerkennung | Sanftes Licht |
| --- | --- | --- |
| Maximilian | `m_wecker_schultag` | 5 Minuten |
| Paul | `p_wecker_schultag` | Aus |

Bei manueller Anlage mit der bisherigen Weckerkennung werden die aktuellen `input_datetime.<m/p>_wecker_<typ>_zeit` und `input_boolean.<m/p>_wecker_<typ>_aktiv` sowie die Musikschalter für Wochenende/Ferien einmalig übernommen. Bei bereits vorhandenen Karten oder manueller Übernahme derselben Weckerkennung bleibt die persönliche Musikauswahl erhalten. Anschließend speichert und verwendet der neue Wecker seine Einstellungen zentral selbst. Die alten Helfer werden nicht mehr für diesen Wecker benötigt; sie werden nicht gelöscht. Zusätzliche Lichtsignale oder andere unabhängige Automationen bleiben bestehen.

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
