# UI-Kit-Prüfung für Wecker 1.9.0

Der Wecker bindet HA UI Kit 1.4.1 unverändert am Commit `393474e75869ba79195d800624a5a793a51fe2c4` ein. Der Build prüft die festgehaltenen Prüfsummen von JavaScript, CSS und Lizenz.

| Bereich | Verwendung |
| --- | --- |
| Einrichtungsschritte | Gemeinsame Navigation |
| Namen, Kalender, Kalenderbedingung, gemeinsame Tage | Gemeinsame Felder und Auswahlfelder |
| Wochentage | Gemeinsame Wochentagsauswahl |
| Zeilen, Text, Musikschalter, Buttons | Gemeinsame Komponenten und Schrift-/Farbregeln |
| Schnellzeiten | Gemeinsame Filterbuttons ohne eigene Farben, Schrift, Rahmen oder Innenabstände |
| Dialoge und Bestätigungen | Gemeinsame Dialogkomponenten |
| Geräteauswahl, Helligkeit und Farben | Gemeinsame Auswahl-, Bereichs- und Farbkomponenten |

Entfernt wurden die zusätzlichen 48-Pixel-Zeilenhöhen, die eigene 44-Pixel-Zeitbuttonhöhe, eigene Schriftgewichte, der eigene Buttonhintergrund und die graue Schnellzeitengestaltung. Die Musikzeile erhält keine abweichende Touch-Höhe mehr. Die Anordnung von Symbol, Text und Bedienelement bleibt weckerspezifisch; Gruppenabstände verwenden die UI-Kit-Tokens. Die Stunden-/Minutenräder bleiben eine eigene Weckerfunktion.

Die Browserprüfung vergleicht berechnete Schrift-, Farb- und Innenabstandswerte von Zeilentext, Schaltbutton, Schnellzeit und Musikschalter mit separat gerenderten unveränderten UI-Kit-Komponenten, jeweils auf Desktop und schmalen Displays in hellen und dunklen Themes. Screenshots prüfen außerdem Setup, Tagesdialog, 24-Stunden-Farben, vollständige Bearbeitung, zentrale Tagestypen-Verwaltung, Hue-Szenenauswahl und Einstellungen. Der separat installierte Music Manager wird über seine öffentliche Musikzeilen-Komponente eingebunden; dessen interner Shadow DOM wird nicht überschrieben.

Tagessymbole verwenden die primäre Theme-Farbe. Die 24-Stunden-Markierung verwendet dieselbe Farbe mit nur 6 % Deckkraft als Hintergrund des gesamten Weckerbereichs. Schrift, Innenabstände und gemeinsame Bedienelemente bleiben unverändert.

Weckdauer, Minuteneingabe und Aktualisieren verwenden unveränderte Auswahlfelder, Eingabefelder, Abschnitte und Buttons des UI Kits. Die Hintergrundlegende verwendet dessen Hinweistext. Die Browserprüfung deckt Dauer und Titelende in den Wecker-Einstellungen sowie die aktualisierte Verwendungsliste ausdrücklich ab.

Die Browserprüfung zeigt zusätzlich den geprüften Entwurf vor dem Home-Assistant-Speichern und die Bestätigung zum Aufräumen verwaister Wecker, jeweils auf Desktop und Mobilgeräten in beiden Themes. Name, Fortschrittsaktionen, Hinweis und Löschbestätigung verwenden die bestehenden UI-Kit-Komponenten.

Die Weckerverwaltung verwendet gemeinsame Zeilen, Filterbuttons, Hinweis- und Ladeanzeigen sowie den gemeinsamen Bestätigungsdialog. Browserbilder prüfen Liste und Löschbestätigung bei 1100, 390 und 320 Pixeln in hellen und dunklen Themes.
