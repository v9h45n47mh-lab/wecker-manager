# Weckerkarte 1.7.0

Die Integration führt Wecker zentral in Home Assistant aus. Dashboardkarten zeigen und ändern die zentral gespeicherten Daten. Der separat installierte Music Manager liefert die persönliche Musikauswahl.

## Anlegen und vollständig bearbeiten

Im Karteneditor beziehungsweise als Administrator unter **Zahnrad → Gesamte Karte bearbeiten** stehen dieselben fünf Schritte zur Verfügung:

1. **Tagestypen:** Einen gemeinsamen Tagestyp übernehmen oder einen neuen Namen und Anzeigenamen, ein Symbol und die gültigen Wochentage festlegen. Optional Kalender und freie/gebuchte Tage wählen. Musikverhalten und Ausschaltbestätigung gelten je Karte.
2. **Musik:** Weckername, persönliches Musikkonto und eine oder mehrere freigegebene Sonos-Boxen wählen.
3. **Rollläden:** Optional Geräte und deren Zielpositionen wählen.
4. **Licht:** Optional Geräte wählen und einzeln einstellen oder eine passende Hue-Szene auswählen.
5. **Prüfen:** Mit **Wecker anlegen** beziehungsweise **Änderungen speichern** abschließen.

Bis zum abschließenden Speichern sind es Entwürfe. Abbrechen übernimmt keine neuen Bindungen. Fehler erhalten den Entwurf. Ein veralteter Entwurf überschreibt keine neuere Konfiguration. Eine vorhandene Karte behält ihre Kennung und Weckzeiten. Konto- oder Geräteänderungen werden auf allen Kopien derselben Karte sichtbar. Nur Administratoren dürfen die gesamte Karte bearbeiten; das Bedienen bleibt beim Eigentümer und bei Administratoren.

## Gemeinsame Tage

Der **Name** identifiziert den Tagestyp eindeutig in Verwaltung und Auswahl. Der **Anzeigename** wird auf der Weckerkarte dargestellt. Zum Beispiel können „Schultag Kinder“ und „Schultag Erwachsene“ beide den Anzeigenamen „Schultag“ haben. Alte Namen werden beim Update als Anzeigenamen übernommen; Kennungen, Uhrzeiten und Aktivierungen bleiben erhalten.

Name, Symbol, Wochentage, Kalender und die Regel für freie/gebuchte Tage gehören zum gemeinsamen Tagestyp. In jeder Karte bestehen weiterhin eigene Weckzeiten, Schnellzeiten, Aktivierungen, Musikschalter, Sonnenaufgangszeiten und Ausschaltbestätigungen.

Beispiel: **Schultag** bei Maximilian anlegen. Bei Paul im Setup **Gemeinsamen Tagestyp verwenden → Schultag → Tagestyp übernehmen** wählen. Paul erhält eine eigene Weckzeit. Wird später der gemeinsame Schultagskalender oder ein Wochentag geändert, erhalten beide Karten diese Regel. Der Tagestyp-Dialog weist darauf hin. Das Entfernen eines Typs aus einer Karte entfernt ihn nicht aus einer anderen Karte.

Vorhandene Tage werden beim Update übernommen. Identische gemeinsame Regeln werden zusammengeführt. Unterschiedliche Kalenderregeln bleiben getrennt. Kalenderzugriff wird für jeden verknüpften Eigentümer geprüft, bevor eine gemeinsame Änderung gespeichert wird.

## Tagestypen verwalten

Als Administrator **Zahnrad → Tagestypen verwalten** öffnen. Hier können gemeinsame Typen unabhängig von einer Karte angelegt, ihre Regeln bearbeitet und unbenutzte Typen gelöscht werden. Die Liste und der Bearbeitungsdialog zeigen, in welchen Weckerkarten und bei welchen Benutzern der Tagestyp verwendet wird. Zum Löschen eines verwendeten Typs muss er zunächst aus diesen Karten entfernt werden; aktive Typen können dabei eine Ausschaltbestätigung verlangen.

Beim Übernehmen eines bereits vorhandenen Typs bleibt dessen lokale Kennung erhalten. Identische Katalogeinträge werden zusammengeführt, ohne persönliche Weckzeiten zu entfernen. Wenn schon mehrere getrennte Wecker mit unterschiedlichen lokalen Kennungen bestehen, können diese bewusst im Karteneditor entfernt werden.

## Hue-Szenen je Lampe

Unter **Gesamte Karte bearbeiten → Licht → betreffende Lampe bearbeiten** steht die **Hue-Szene für diese Lampe**. Die Szene liefert deren gespeicherte Helligkeit, Farbe und gegebenenfalls Effekte. Mit **Individuell einstellen** wird wieder die manuelle Einstellung verwendet. Abbrechen verwirft die Änderung an der Lampe.

Es werden die gespeicherten Szenenwerte nur dieser Lampe übertragen. Ist ein Hue-Raum als Lichtgruppe ausgewählt, betrifft dies nur deren Mitglieder. Weitere Lampen derselben Szene werden nicht aktiviert. Die Zuordnung verwendet die tatsächlichen Hue-Ressourcen und wird einschließlich der Lampenrechte vor jeder Ausführung erneut geprüft. Reguläre Hue-Szenen werden unterstützt; Hue Smart Scenes bleiben ausgeschlossen.

Beim Sonnenaufgang werden dimmbare, in der Szene eingeschaltete Lampen zunächst auf 1 % gesetzt und anschließend mit der Szenenüberblendung bis zur Weckzeit aufgeblendet. Bestehende gemeinsame Hue-Szenen bleiben bis zur Bearbeitung verwendbar. Wenn alle benötigten Einzelwerte verfügbar sind, übernimmt das Setup sie automatisch auf die betreffenden Lampen.

## Kalender

Die gewählten Wochentage gelten immer. Ein Kalender fügt eine weitere Bedingung hinzu:

| Setup-Auswahl | Bedingung |
| --- | --- |
| Freie Kalendertage | Kein ganztägiger Termin an diesem Datum |
| Gebuchte Kalendertage | Mindestens ein ganztägiger Termin an diesem Datum |
| Ohne Kalenderprüfung | Nur die ausgewählten Wochentage |

Termine mit Uhrzeit zählen nicht, selbst wenn sie 24 Stunden dauern. Das Enddatum ganztägiger Termine ist exklusiv. Bei einem nicht erreichbaren Kalender pausiert der abhängige Typ; unabhängige Typen können weiterlaufen. Zur tatsächlichen Weckzeit wird der Kalender erneut abgefragt.

## Markierung für die nächsten 24 Stunden

Ein sehr leicht blauer Hintergrund des **gesamten Weckerbereichs** zeigt eine aktivierte, nach Wochentagen und Kalender passende Ausführung in den nächsten 24 Stunden. Ohne passende Ausführung bleibt der normale Hintergrund erhalten. Alle Symbole sind blau.

Bereits ausgeführte Wecker werden nicht erneut als ausstehend gezählt. Die Vorschau verwendet die Home-Assistant-Zeitzone und 24 tatsächlich verstrichene Stunden, auch bei Sommer-/Winterzeitwechseln. Nicht vorhandene Uhrzeiten beim Vorstellen der Uhr werden übersprungen. Die Anzeige aktualisiert sich regelmäßig und nach Änderungen. Es gibt keine Tagesüberschrift.

## Abspieldauer der Weckmusik

**Weckmusik → Auswählen** öffnen. Unter **Weckmusik beenden** eine feste Minutendauer oder **Wenn Titel endet** wählen. Mit einem neuen Titel wird die Dauer mitgespeichert. **Dauer übernehmen** speichert nur die Dauer.

Bei einer festen Dauer von 1 bis 1440 Minuten wird der gewählte Titel bei Bedarf wiederholt und zum geplanten Ende gestoppt. Beim Titelende spielt ein einzelner Titel mit ausgeschalteter Wiederholung vollständig aus; eine feste Abschaltfrist gibt es in diesem Modus nicht. Für Radiosender und die letzte Sonos-Wiedergabe ist eine feste Dauer erforderlich. Die Einstellung gilt für alle Tagestypen und Boxen dieser Weckerkarte. Bestehende Wecker behalten zunächst fünf Minuten.

Die feste Abschaltzeit wird in Home Assistant gespeichert und mit einem eigenen Timer ausgeführt. Nach einem Neustart werden ausstehende und überfällige Stopps erneut geplant. Gerätefehler bleiben sichtbar und werden erneut versucht. Die vorherige Wiederholungseinstellung wird nach einer festen Dauer wiederhergestellt.

## Laufende Einstellungen

Uhrzeit antippen und die Räder verwenden. Eine Schnellzeit übernimmt die Zeit sofort. Aktivierung und schaltbare Musik werden zentral gespeichert. Eine konfigurierte Ausschaltbestätigung wird auch serverseitig geprüft.

Unter dem Zahnrad stehen Lautstärke 5–15 %, bis zu drei Schnellzeiten und Sonnenaufgang je Typ. Der Dialog ist höchstens 480 Pixel breit und passt sich kleineren Bildschirmen an. Unten im Dialog stehen Wecker-, Integrations- und UI-Kit-Version. Dimmbare Lichter werden beim Sonnenaufgang bis zur Weckzeit zur zugeordneten Zielhelligkeit aufgeblendet.

## Kompakte Statusübersicht

Die zusätzliche Karte **Wecker-Status** zeigt je Typ Symbol, An/Aus und die eingestellte Weckzeit. [Anleitung und YAML für zwei Karten nebeneinander](STATUSKARTE.md).

## Betrieb

Pro lokalem Tag, Typ und Phase wird höchstens einmal ausgeführt. Vollständig verpasste Wecker werden nicht nachgeholt. Musik stoppt nach der gewählten festen Dauer; ein überfälliger Stopp wird nach einem Neustart nachgeholt. Sonnenaufgang wird nicht über Mitternacht vorgezogen. Berechtigungen werden bei der Ausführung erneut geprüft.

Zeitpläne bleiben erhalten, wenn eine Dashboardkarte entfernt wird. Zum dauerhaften Beenden zuerst alle Tagestypen ausschalten und danach die Karte entfernen. Eine neu angelegte Karte mit derselben Weckerkennung ersetzt den vorherigen Zeitplan.
