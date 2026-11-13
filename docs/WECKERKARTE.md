# Weckerkarte 1.5.0

Die Integration führt Wecker zentral in Home Assistant aus. Dashboardkarten zeigen und ändern die zentral gespeicherten Daten. Der separat installierte Music Manager liefert die persönliche Musikauswahl.

## Anlegen und vollständig bearbeiten

Im Karteneditor beziehungsweise als Administrator unter **Zahnrad → Gesamte Karte bearbeiten** stehen dieselben fünf Schritte zur Verfügung:

1. **Tagestypen:** Einen gemeinsamen Tagestyp übernehmen oder einen neuen Namen, ein Symbol und die gültigen Wochentage festlegen. Optional Kalender und freie/gebuchte Tage wählen. Musikverhalten und Ausschaltbestätigung gelten je Karte.
2. **Musik:** Weckername, persönliches Musikkonto und eine oder mehrere freigegebene Sonos-Boxen wählen.
3. **Rollläden:** Optional Geräte und deren Zielpositionen wählen.
4. **Licht:** Optional Geräte wählen und einzeln einstellen oder eine passende Hue-Szene auswählen.
5. **Prüfen:** Mit **Wecker anlegen** beziehungsweise **Änderungen speichern** abschließen.

Bis zum abschließenden Speichern sind es Entwürfe. Abbrechen übernimmt keine neuen Bindungen. Fehler erhalten den Entwurf. Ein veralteter Entwurf überschreibt keine neuere Konfiguration. Eine vorhandene Karte behält ihre Kennung und Weckzeiten. Konto- oder Geräteänderungen werden auf allen Kopien derselben Karte sichtbar. Nur Administratoren dürfen die gesamte Karte bearbeiten; das Bedienen bleibt beim Eigentümer und bei Administratoren.

## Gemeinsame Tage

Name, Symbol, Wochentage, Kalender und die Regel für freie/gebuchte Tage gehören zum gemeinsamen Tagestyp. In jeder Karte bestehen weiterhin eigene Weckzeiten, Schnellzeiten, Aktivierungen, Musikschalter, Sonnenaufgangszeiten und Ausschaltbestätigungen.

Beispiel: **Schultag** bei Maximilian anlegen. Bei Paul im Setup **Gemeinsamen Tagestyp verwenden → Schultag → Tagestyp übernehmen** wählen. Paul erhält eine eigene Weckzeit. Wird später der gemeinsame Schultagskalender oder ein Wochentag geändert, erhalten beide Karten diese Regel. Der Tagestyp-Dialog weist darauf hin. Das Entfernen eines Typs aus einer Karte entfernt ihn nicht aus einer anderen Karte.

Vorhandene Tage werden beim Update übernommen. Identische gemeinsame Regeln werden zusammengeführt. Unterschiedliche Kalenderregeln bleiben getrennt. Kalenderzugriff wird für jeden verknüpften Eigentümer geprüft, bevor eine gemeinsame Änderung gespeichert wird.

## Tagestypen verwalten

Als Administrator **Zahnrad → Tagestypen verwalten** öffnen. Hier können gemeinsame Typen unabhängig von einer Karte angelegt, ihre Regeln bearbeitet und unbenutzte Typen gelöscht werden. Die Liste zeigt die Anzahl der verknüpften Karten. Zum Löschen eines verwendeten Typs muss er zunächst aus diesen Karten entfernt werden; aktive Typen können dabei eine Ausschaltbestätigung verlangen.

Beim Übernehmen eines bereits vorhandenen Typs bleibt dessen lokale Kennung erhalten. Identische Katalogeinträge werden zusammengeführt, ohne persönliche Weckzeiten zu entfernen. Wenn schon mehrere getrennte Wecker mit unterschiedlichen lokalen Kennungen bestehen, können diese bewusst im Karteneditor entfernt werden.

## Hue-Szenen

Unter **Gesamte Karte bearbeiten → Licht** erscheinen die von Home Assistant bereitgestellten Hue-Szenen, deren zugehörige Lampen vollständig in der Auswahl enthalten sind. Die Zuordnung erfolgt über die Hue-Integration, nicht über ähnliche Namen. Nicht ermittelbare Zuordnungen und Szenen mit zusätzlichen Lampen werden nicht angeboten. Eine teilweise überlappende Lichtgruppe darf eine Szene nicht überschreiben. Reguläre Hue-Szenen werden unterstützt; Hue Smart Scenes bleiben ausgeschlossen.

Die gewählte Szene bestimmt Farbe und Zielhelligkeit ihrer Lampen. Andere ausgewählte Lampen verwenden weiterhin ihre Einzelwerte. Mit **Lampen einzeln einstellen** wird die Szene abgewählt. Wird die Lichtauswahl geändert, wird eine nicht mehr passende Szene entfernt und ein Hinweis angezeigt.

Beim Sonnenaufgang werden die zugehörigen dimmbaren Lampen zunächst auf 1 % gesetzt und anschließend mit der Szenenüberblendung bis zur Weckzeit aufgeblendet. Die tatsächliche Überblendung hängt von den Hue-Geräten ab. Die Integration prüft Zuordnung und Berechtigungen beim Speichern und erneut vor der Ausführung. Hat die Szene inzwischen zusätzliche Lampen erhalten, wird sie nicht aktiviert; die individuell gewählten Lampen können weiterhin normal eingeschaltet werden. Ein Gerätefehler wird an der Karte angezeigt.

## Kalender

Die gewählten Wochentage gelten immer. Ein Kalender fügt eine weitere Bedingung hinzu:

| Setup-Auswahl | Bedingung |
| --- | --- |
| Freie Kalendertage | Kein ganztägiger Termin an diesem Datum |
| Gebuchte Kalendertage | Mindestens ein ganztägiger Termin an diesem Datum |
| Ohne Kalenderprüfung | Nur die ausgewählten Wochentage |

Termine mit Uhrzeit zählen nicht, selbst wenn sie 24 Stunden dauern. Das Enddatum ganztägiger Termine ist exklusiv. Bei einem nicht erreichbaren Kalender pausiert der abhängige Typ; unabhängige Typen können weiterlaufen. Zur tatsächlichen Weckzeit wird der Kalender erneut abgefragt.

## Zwei Symbolfarben für die nächsten 24 Stunden

- **Blau:** Ein aktivierter, nach Wochentag und Kalender passender Wecker wird zwischen jetzt und dem Ende der nächsten 24 Stunden ausgeführt.
- **Grau:** Keine passende Ausführung in diesem Zeitraum; dazu gehören ausgeschaltete Typen, unpassende Tage und fehlgeschlagene Kalenderprüfungen.

Bereits ausgeführte Wecker werden nicht erneut als ausstehend gezählt. Die Vorschau verwendet die Home-Assistant-Zeitzone und 24 tatsächlich verstrichene Stunden, auch bei Sommer-/Winterzeitwechseln. Nicht vorhandene Uhrzeiten beim Vorstellen der Uhr werden übersprungen. Die Anzeige aktualisiert sich regelmäßig und nach Änderungen; eine kurze Beschreibung steht am Symbol. Es gibt keine Tagesüberschrift und keine dritte Statusfarbe.

## Laufende Einstellungen

Uhrzeit antippen und die Räder verwenden. Eine Schnellzeit übernimmt die Zeit sofort. Aktivierung und schaltbare Musik werden zentral gespeichert. Eine konfigurierte Ausschaltbestätigung wird auch serverseitig geprüft.

Unter dem Zahnrad stehen Lautstärke 5–15 %, bis zu drei Schnellzeiten und Sonnenaufgang je Typ. Der Dialog ist höchstens 480 Pixel breit und passt sich kleineren Bildschirmen an. Direkt im Dialog stehen Wecker-, Integrations- und UI-Kit-Version. Dimmbare Lichter werden beim Sonnenaufgang bis zur Weckzeit zur zugeordneten Zielhelligkeit aufgeblendet.

## Kompakte Statusübersicht

Die zusätzliche Karte **Wecker-Status** zeigt je Typ Symbol und An/Aus. [Anleitung und YAML für zwei Karten nebeneinander](STATUSKARTE.md).

## Betrieb

Pro lokalem Tag, Typ und Phase wird höchstens einmal ausgeführt. Vollständig verpasste Wecker werden nicht nachgeholt. Musik stoppt nach fünf Minuten; ein überfälliger Stopp wird nach einem Neustart nachgeholt. Sonnenaufgang wird nicht über Mitternacht vorgezogen. Berechtigungen werden bei der Ausführung erneut geprüft.

Zeitpläne bleiben erhalten, wenn eine Dashboardkarte entfernt wird. Zum dauerhaften Beenden zuerst alle Tagestypen ausschalten und danach die Karte entfernen. Eine neu angelegte Karte mit derselben Weckerkennung ersetzt den vorherigen Zeitplan.
