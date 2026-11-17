# Wecker 1.14.1

- **Fehlgeschlagene Geräteaktionen werden jetzt im HA-Protokoll erfasst.** Bisher wurden abgefangene Fehler nur in der Karte gespeichert; der Hinweis auf zusätzliche Protokolldetails führte deshalb ins Leere. Jeder neue Fehler enthält dort Wecker-/Kartenkennung, Tagestyp, Phase, Gerät, Aktion und Fehlerklasse sowie die Aufrufstellen. Ungefilterte Fehlermeldungen und Zugangsdaten externer Dienste werden nicht protokolliert.
- **MediaNotFoundError erhält einen passenden Hinweis:** Music Assistant hat die angeforderte Weckmusik nicht gefunden. Die Karte empfiehlt, die Musik für diesen Wecker neu auszuwählen und zu testen. Auch bereits gespeicherte Meldungen dieser Fehlerklasse zeigen den korrigierten Hinweis.
- Neue Musikfehler zeigen Quelle, gewählten Titel und den fehlgeschlagenen Schritt, etwa Lautstärke oder Musikstart. Das Protokoll enthält zusätzlich die zuvor geprüfte Medienkennung. Ältere Fehler erhalten diese damals nicht erfassten Angaben nicht nachträglich.
- Fehlerdetails und Quittierung bleiben ausschließlich für HA-Admins sichtbar. Ausführung, Gerätebindungen, Weckzeiten und Ausschalt-Timer bleiben erhalten. Die Änderung wiederholt keine Gerätebefehle und behebt keinen möglicherweise fehlenden Eintrag im Musikkatalog.

**Update:** In HACS aktualisieren, Home Assistant neu starten und Browser/App vollständig neu laden. Neue Fehler erscheinen unter **Einstellungen → System → Protokolle**, Logger `custom_components.wecker_manager.execution_errors`.

# Wecker 1.14.0

- **Gespeicherte Fehlermeldungen sind ausschließlich für Home-Assistant-Administratoren sichtbar.** Das gilt für die Weckerkarte, die Statuskarte und die Backend-Schnittstelle. Delegierte Wecker-Verwaltungsrechte geben keinen Zugriff auf Diagnosen.
- **Meldung quittieren** entfernt die gespeicherte Meldung dauerhaft und aktualisiert andere geöffnete Karten. Der Button steht als Admin direkt unter den Fehlerdetails. Ein inzwischen neu eingegangener Fehler wird zunächst geladen und bleibt erhalten.
- Das Quittieren verändert weder Weckzeiten noch Aktivierung, Musik, Gerätebindungen oder laufende Stopptimer. Geräte werden nicht erneut geschaltet, erledigte Termine nicht nochmals freigegeben.
- Admin-Entzug, fehlgeschlagenes Speichern, veraltete Meldungen, Neustart und beide Kartentypen sind geprüft. Eingabe- und Berechtigungshinweise bei der normalen Bedienung bleiben sichtbar.

**Update:** Wecker in HACS aktualisieren, Home Assistant neu starten und Browser/App vollständig neu laden. Anschließend als Admin unter der Meldung **Meldung quittieren** wählen.

# Wecker 1.13.2

- **Verschobene Wecker am selben Tag werden neu eingeplant.** Ein früherer Weckversuch blockiert eine anschließend geänderte Weckzeit nicht mehr. Die blaue 24-Stunden-Markierung und die Weckereinträge in den Zeitprogrammen von Light Manager und Shutter Manager verwenden wieder den neuen Termin.
- Beim Neustart werden alte Ausführungsvermerke für noch bevorstehende Termine korrigiert. Damit werden auch bereits vor dem Update auf eine spätere Uhrzeit verschobene Wecker wieder berücksichtigt. Bereits vergangene Termine werden nicht nachgeholt; doppelte Ausführung bei der Zeitumstellung bleibt verhindert.
- Neue Ausführungsvermerke speichern die zugehörige Weckzeit und Sonnenaufgangsdauer. Lautstärke, Musik, Schnellzeiten und einfaches Aus-/Einschalten geben einen erledigten Termin nicht erneut frei. Eine Änderung nur der Sonnenaufgangsdauer betrifft nur die Licht-Vorphase.
- Geprüft mit einem Wecker von 06:30 auf 08:15, zehn Minuten Sonnenaufgang und den tatsächlichen Vorschau-Modulen beider Manager. Die Manager müssen hierfür nicht aktualisiert werden. Der Hue-Fix und die Fehlerdetails aus 1.13.1 bleiben enthalten.

**Update:** Wecker in HACS aktualisieren, Home Assistant neu starten und Browser/App vollständig neu laden.

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
