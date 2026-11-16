# Wecker 1.13.1

- **Hue-Lichtausfall behoben:** Einzelne Hue-Szenen werden mit der korrekten Home-Assistant-Aufrufsignatur angewendet. Der bisherige Aufruf scheiterte sowohl beim Sonnenaufgang als auch beim Wecken. Die Korrektur ist mit zwei Lampen, individuellen Szenen und zehn Minuten Sonnenaufgang geprüft.
- Fehlgeschlagene Weckaktionen zeigen unter **Fehlerdetails** das betroffene Gerät, die Aktion, den Fehlergrund und die Entitätskennung. Zeitpunkt, Tagestyp und Phase unterscheiden Wecken und Sonnenaufgang. Die Angaben stehen auch in der Statuskarte.
- Neue Fehlerdetails bleiben über einen Home-Assistant-Neustart hinweg erhalten. Eine spätere erfolgreiche Ausführung entfernt den bisherigen Gerätefehler. Unabhängige Aktionen werden weiterhin ausgeführt; Geräte werden durch die Fehleranzeige nicht erneut geschaltet.
- Meldungen unterscheiden unter anderem fehlende Geräteberechtigungen, nicht erreichbare Geräte, Zeitüberschreitungen und abgelehnte Befehlsparameter. Ungefilterte Fehlermeldungen externer Dienste werden nicht angezeigt oder gespeichert.
- Bereits vor dem Update entstandene Sammelmeldungen enthalten keine rückwirkend rekonstruierbaren Geräteinformationen. Bestehende Zeiten, Musik, Gerätebindungen und Family-Access-Rechte bleiben erhalten.

**Update:** In HACS aktualisieren, Home Assistant neu starten und Browser/App vollständig neu laden.

# Wecker 1.13.0

Eigenen Wecker verwalten bündelt Ansicht, Tagesinfo, Zeitvorschau, Bedienung und Änderungen eigener Wecker. Das zusätzliche Ansichtsrecht wird nicht mehr vorausgesetzt. Die feste Eigentümer-, Geräte- und Musikkonto-Zuordnung bleibt wirksam; fremde Wecker und Tagestypen benötigen weiterhin Verwaltungsrechte.

Ein altes reines Leserecht allein gewährt keine Bedienung. Bei Entzug des eigenen Verwaltungsrechts verschwinden angezeigte Weckzeiten und Bedienfelder; offene Dialoge schließen. Gespeicherte Wecker, Tagestypen und laufende Zeitpläne bleiben erhalten.

Nach dem Update HA neu starten und Browser/App vollständig neu laden.
