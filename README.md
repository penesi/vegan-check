# 🌱 Vegan-Check

**Barcode scannen und sofort sehen, ob ein Produkt vegan, vegetarisch oder mit Fleisch ist.**

👉 **App öffnen:** https://penesi.github.io/vegan-check/

Läuft direkt im Browser auf iPhone und Android. Du musst nichts aus dem App Store laden und dich nirgends anmelden.

## Was die App anzeigt

| Farbe | Bedeutung | Was du zusätzlich siehst |
|---|---|---|
| 🟢 **Vegan** | keine tierischen Zutaten | Hinweis auf Zutaten, die man kurz prüfen sollte (z. B. „Aroma“) |
| 🟡 **Vegetarisch** | kein Fleisch und kein Fisch, aber andere tierische Zutaten | welche Zutaten nicht vegan sind (z. B. Milchpulver, Ei, Honig) |
| 🔴 **Nicht vegetarisch** | enthält Fleisch, Fisch oder z. B. Gelatine | welche Zutaten nicht vegetarisch sind und was sonst noch nicht vegan ist |
| ⚪ **Unklar / nicht gefunden** | Produkt fehlt in der Datenbank oder die Zutaten sind nicht eindeutig | Bitte die Zutatenliste auf der Packung lesen |

## So benutzt du sie

1. Link oben öffnen.
2. **„Scannen starten“** antippen und den Kamerazugriff erlauben.
3. Den Barcode der Verpackung in den Rahmen halten. Das Ergebnis erscheint automatisch.
4. Mit **„Nächstes Produkt scannen“** geht es weiter.

Wird der Barcode schlecht erkannt? Mit **„🔄 Kamera“** zur nächsten Handykamera wechseln (die App merkt sich die Wahl), mit dem **🔍 Regler** heranzoomen oder mit **💡 Licht** die Taschenlampe einschalten.
Sobald ein Produkt erkannt ist, piept und vibriert das Handy, und das Ergebnis erscheint groß in Grün, Gelb, Rot oder Grau.

Kamera geht nicht? Dann einfach die Zahlen unter dem Barcode eintippen und auf **„Prüfen“** tippen.
Die zuletzt gescannten Produkte stehen unten in der Liste und lassen sich erneut öffnen.

## Auf den Startbildschirm legen (wie eine richtige App)

- **iPhone (Safari):** Teilen-Symbol □↑ → **„Zum Home-Bildschirm“**
- **Android (Chrome):** Menü ⋮ → **„App installieren“** bzw. **„Zum Startbildschirm hinzufügen“**

## Weiterschicken

Oben rechts auf **„Teilen“** tippen und den Link per WhatsApp, Mail usw. verschicken. Oder einfach diesen Link kopieren:
https://penesi.github.io/vegan-check/

## Gut zu wissen

- Zusätzlich zur Datenbank prüft die App die Zutaten selbst mit einer eigenen deutschen Liste (Datei `zutaten.js`): z. B. Sahnepulver, Molke, Butterreinfett, Ei, Honig, Gelatine, Fleisch, Fisch. Lecithine gelten als pflanzlich, außer Ei-Lecithin. Hinweise wie „Kann Spuren von Milch enthalten“ zählen nicht.

- Die Produktdaten kommen von [Open Food Facts](https://de.openfoodfacts.org), einer freien Datenbank, die von Freiwilligen gepflegt wird. Fehlt ein Produkt, kannst du es dort selbst eintragen. Danach erkennt die App es für alle.
- Die Angaben sind **ohne Gewähr**. Bei Allergien oder wenn es dir genau darauf ankommt, lies bitte immer die Zutatenliste auf der Packung.
- Die App braucht Internet für die Produktsuche. Der Verlauf wird nur auf deinem Handy gespeichert.

---

<sub>Technik: statische Web-App (PWA) ohne Server. Barcode-Erkennung mit [html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0), Produktdaten über die Open Food Facts API.</sub>
