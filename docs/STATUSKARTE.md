# Kompakte Wecker-Statusübersicht

Ab Wecker **1.5.0** steht zusätzlich **Wecker-Status** zur Verfügung. Die Karte zeigt eine Überschrift und je Tagestyp ein Symbol sowie **An/Aus**. Seit **1.6.1** steht rechts in jeder Zeile zusätzlich die eingestellte Weckzeit im Format **HH:MM**, auch bei ausgeschaltetem Wecker. Sie liest denselben zentral gespeicherten Zustand wie die bedienbare Weckerkarte und aktualisiert sich automatisch.

1. Die zugehörige normale Weckerkarte bearbeiten und **Code-Editor anzeigen** wählen.
2. Deren Werte für `alarm_id` und `card_id` kopieren. Die Werte unverändert lassen.
3. Eine neue Karte **Wecker-Status** hinzufügen. Überschrift und beide Kennungen eintragen. Oder die folgende Rasterkarte im Code-Editor anlegen und die vier Platzhalter ersetzen.

```yaml
type: grid
columns: 2
square: false
cards:
  - type: custom:wecker-manager-status-card
    name: Maximilian
    alarm_id: hier_alarm_id_maximilian
    card_id: hier_card_id_maximilian
  - type: custom:wecker-manager-status-card
    name: Paul
    alarm_id: hier_alarm_id_paul
    card_id: hier_card_id_paul
```

**An/Aus** und der Punkt daneben zeigen, ob der jeweilige Tagestyp eingeschaltet ist. Alle Tagessymbole sind blau. Ein sehr leicht blauer Zeilenhintergrund markiert eine passende Ausführung innerhalb der nächsten 24 Stunden. Eigene Tagestypen erscheinen automatisch in derselben Reihenfolge.

Die Statuskarte bedient keinen Wecker und benötigt keine alten `input_boolean`-Helfer. Vorhandene alte Statuskarten mit diesen Helfern würden weiterhin nur deren alten Zustand anzeigen. Zum Ändern der Aktivierung wird die normale Weckerkarte verwendet.

Berechtigungen gelten unverändert: Administratoren können beide Kinder sehen. Ein Kind kann die Statuskarte für seinen eigenen Wecker sehen, erhält dadurch aber keinen Zugriff auf den anderen Wecker.
