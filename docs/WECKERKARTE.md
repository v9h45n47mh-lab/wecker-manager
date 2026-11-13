# Weckerkarte 1.3.1

Die Karte führt frei konfigurierbare Tagestypen aus, zum Beispiel Schultag, Wochenende, Ferien oder Frühdienst. Home Assistant führt die Wecker auch ohne geöffnetes Dashboard aus. Der separat installierte Music Manager liefert Musikauswahl und Wiedergabe.

## Anlegen

1. **Tagestypen:** Die Liste beginnt leer. Kopfleiste einstellen und eigene Typen hinzufügen. Pro Typ Name, Symbol, ausdrücklich gewählte Wochentage, Musikverhalten, Ausschaltbestätigung und optional einen Kalender samt freien oder gebuchten Kalendertagen festlegen. Ein eigener Dialog hält die Einstellungen übersichtlich. Nur ganztägige Termine werden berücksichtigt.
2. **Musik:** Weckername, genau ein Musikkonto und mindestens eine freigegebene Sonos-Box wählen. Mehrere Boxen sind möglich.
3. **Rollläden:** Optional mehrere Rollläden auswählen und pro Gerät die Zielposition einstellen.
4. **Licht:** Optional mehrere Lichter wählen und pro Gerät Helligkeit, Farbtemperatur oder Farbe festlegen. Sonnenaufgang und Vorlaufzeit werden später über das Zahnrad eingestellt.
5. **Prüfen:** Tagestypen, Konto und Geräte prüfen. **Ändern** führt zum passenden Schritt zurück. **Wecker anlegen** speichert die Karte; anschließend das Dashboard speichern.

Zurück/Weiter erhält die Eingaben. Gerätedialoge und Typdialoge haben Übernehmen/Abbrechen. Die Kalender der Tagestypen müssen für das gewählte Musikkonto freigegeben sein. Die technische Karten- und Weckerkennung wird automatisch verwaltet.

Musikkonto, Musikboxen, Rollläden, Lampen und ihre Zielwerte bleiben fest zugeordnet. Für andere Geräte die Karte neu anlegen. Ein Administrator kann dagegen im Karteneditor **Tagestypen bearbeiten** wählen. Bestehende Typen behalten ihre Weckzeiten und Schnellzeiten, wenn Name oder Regeln geändert werden. Neue Typen beginnen ausgeschaltet. Das Entfernen eines aktiven Typs mit Ausschaltbestätigung erfordert ebenfalls eine Bestätigung.

Eine kopierte Karte mit derselben Kartenkennung ist dieselbe Karte auf einem weiteren Dashboard. Für einen unabhängigen Wecker eine neue Karte aus dem Kartenkatalog anlegen.

## Kopfleiste

Im Karteneditor kann die Kopfleiste die passenden Tagestypen für **heute** oder **morgen**, einen **eigenen Text** oder keine Leiste anzeigen. Die Tagesvorschau verwendet die eingerichteten Wochentage und Kalenderregeln in der Home-Assistant-Zeitzone. Bei ausgeblendeter Leiste bleibt das Zahnrad in der Hauptkarte erreichbar. Diese Darstellungswahl lässt sich auch nach der Einrichtung ändern; danach das Dashboard speichern.

## Kalender pro Tagestyp

Ein Typ gilt nur an seinen ausgewählten Wochentagen. Bei gewähltem Kalender kommt eine zweite Bedingung hinzu. Im Setup des Tagestyps wählst du:

- **Gebuchte Kalendertage:** Der Typ gilt, wenn mindestens ein ganztägiger Termin an diesem Datum liegt.
- **Freie Kalendertage:** Der Typ gilt, wenn an diesem Datum kein ganztägiger Termin liegt.

Termine mit Uhrzeit beeinflussen diese Prüfung nicht, auch wenn sie von Mitternacht bis Mitternacht dauern. Mehrtägige Termine gelten ab dem Startdatum bis vor das Enddatum. Ein ganztägiger Termin vom 13. bis 14. gilt daher am 13.

Ohne Kalenderprüfung gilt ein neuer Tagestyp an seinen ausgewählten Wochentagen. Folgende eigene Typen kannst du beispielsweise anlegen:

| Typ | Wochentage | Kalender | Bedingung |
| --- | --- | --- | --- |
| Schultag | Mo–Fr | Schulfreie Tage | Freie Kalendertage |
| Wochenende | Sa/So | Ohne Kalender | Keine weitere Bedingung |
| Ferien / schulfrei | Mo–Fr | Schulfreie Tage | Gebuchte Kalendertage |

Ist ein ausgewählter Kalender nicht erreichbar, gilt weder die Termin- noch die Frei-Bedingung. Der betroffene Typ pausiert. Andere Typen ohne diese Kalenderabhängigkeit bleiben funktionsfähig. Zur Weckzeit wird der Kalender frisch abgefragt. Die Morgen-Anzeige verwendet dieselben Regeln und die Home-Assistant-Zeitzone; sie kann auch mehrere passende Typen nennen.

## Bedienen

- Uhrzeit antippen und Stunden/Minuten mit den Rädern wählen. Übernehmen speichert; Abbrechen oder Escape verwirft.
- Eine Schnellzeit übernimmt die Zeit sofort. Die gewählte Zeit wird mit dem gemeinsamen UI-Kit-Stil hervorgehoben.
- Ein- und Ausschalten über den Button des jeweiligen Typs. Eine konfigurierte Bestätigung wird vor dem Ausschalten abgefragt und serverseitig geprüft.
- Bei **Musik immer an** gibt es keinen Musikschalter. Bei **schaltbar** kann die Musik in der Karte ein-/ausgeschaltet werden. Die gemeinsame Weckmusikauswahl gilt für alle Typen.
- Kalender und freie/gebuchte Tage im Karteneditor über **Tagestypen bearbeiten** ändern. Die laufende Karte zeigt keine Kalenderauswahl.
- Über das Zahnrad: Musiklautstärke 5–15 % für alle Boxen, bis zu drei Schnellzeiten je Typ und pro Typ Sonnenaufgang Aus oder bis zu 30 Minuten Vorlauf. Die dimmbaren zugeordneten Lampen beginnen bei 1 % und erreichen zur Weckzeit ihre feste Zielhelligkeit.
- Einstellungen und Setup-Änderungen werden über eine Versionsprüfung abgesichert. Ein-/Ausschalten speichert gezielt nur den gewählten Tagestyp und erhält gleichzeitige Änderungen anderer Felder.

## Bestehende Wecker übernehmen

Vorhandene Karten behalten ihre Weckerkennung und Gerätebindung. Die bisherigen drei Typen werden mit Symbolen, Wochentagen, Musikverhalten und Kalenderzuordnung übernommen. Schultag verwendet zunächst immer Musik und eine Ausschaltbestätigung; Wochenende und Ferien besitzen die bisherigen Musikschalter.

| Kind | Bisherige Weckerkennung | Bisheriger Lichtvorlauf |
| --- | --- | --- |
| Maximilian | `m_wecker_schultag` | 5 Minuten beim Schultag |
| Paul | `p_wecker_schultag` | Aus |

Bei manueller Neuanlage mit einer bisherigen Weckerkennung werden vorhandene Helferzeiten, Aktivierungen, Musikschalter und gespeicherte Weckmusik einmalig übernommen. Bestehende Karten verwenden weiterhin ihre zentral gespeicherten Werte. Ein alter Ferienwecker ohne Kalender bleibt bis zur ausdrücklichen Neukonfiguration pausiert.

Alte YAML-Automationen werden nicht automatisch verändert. **M – Wecker** beziehungsweise **P – Wecker** bei der Umstellung selbst deaktivieren; die alte Karte allein zu entfernen genügt nicht. Unabhängige Lichtsignale bleiben bestehen. Die alten Helfer werden nicht gelöscht.

## Betrieb

Die Zeit folgt Home Assistant. Pro lokalem Tag, Typ und Phase wird höchstens einmal ausgeführt, auch bei Neustart oder zurückgestellter Uhr. Ein komplett verpasster Wecker wird nicht nachgeholt. Musik stoppt nach fünf Minuten; ein beim Neustart überfälliger Stopp wird nachgeholt.

Sonnenaufgang wird nicht über Mitternacht vorgezogen. Geräte- und Kontoberechtigungen werden bei der Ausführung erneut geprüft. Ein einzelnes ausgefallenes Ausgabegerät verhindert die anderen Weckaktionen nicht. Änderungen der festen Musikkontozuordnung pausieren die Karte bis zur Neuanlage.

Zeitpläne bleiben erhalten, wenn eine Dashboardkarte entfernt wird. Zum dauerhaften Beenden zuerst alle Tagestypen ausschalten und anschließend die Karte löschen. Eine neu angelegte Karte mit derselben Weckerkennung ersetzt den bisherigen Zeitplan; es entsteht kein zweiter unabhängiger Wecker.
