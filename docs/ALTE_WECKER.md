# Alte YAML-Wecker aufräumen

Nach der Einrichtung und Prüfung der neuen Weckerkarten:

1. Die bisherigen Automationen **M – Wecker** und **P – Wecker** deaktivieren. Danach können sie entfernt werden. Nur die alte Karte zu löschen beendet keine Automation.
2. Die alten Entities-Karten einschließlich ihrer bedingten Zeilen, Schnellzeit-Buttons, Musikschalter und separaten Tagesüberschrift aus den Dashboards entfernen.
3. Die alten Schalter und Zeithelfer mit den Präfixen `input_boolean.m_wecker_`, `input_boolean.p_wecker_`, `input_datetime.m_wecker_` und `input_datetime.p_wecker_` prüfen. Die neue Integration speichert ihre Zeiten und Zustände selbst; bestehende Karten lesen die Helfer nicht laufend.
4. YAML-definierte Helfer an ihrem Ursprung in `configuration.yaml`, einem Package oder einer eingebundenen Datei entfernen. Per Oberfläche angelegte Helfer dort löschen. Gemeinsame YAML-Blöcke anderer Funktionen erhalten.

Sonos-Boxen, Lichter, Rollläden, Schulkalender, Music Manager, persönliche Musikkonten und die vom neuen Wecker verwendeten Zuordnungen bleiben notwendig. `music_manager.play_alarm` ist eine Aktion und keine alte Helferentität. Die Komponente `music-manager-alarm-row` wird auch vom neuen Wecker verwendet.

Die historischen Kennungen `m_wecker_schultag` und `p_wecker_schultag` können weiterhin die Kennungen der neuen Karten sein. In diesem Fall ihre Music-Manager-Zuordnungen und gespeicherten Musikauswahlen behalten. Unabhängige Lichtsignal-Automationen sind gesonderte Funktionen und werden durch den Wecker nicht ersetzt.
