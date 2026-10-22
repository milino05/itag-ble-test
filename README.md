# Padel BLE – Bluefy diagnostica 0.2

Questa è una variante **diagnostica** della web app per iPhone. Mantiene il tabellone e il motore del punteggio della Web 0.1, aggiungendo strumenti per capire perché Bluefy mostra `startNotifications OK` senza mai ricevere `NOTIFY FFE1`.

## Pubblicazione

Sostituisci nella radice del repository GitHub Pages già utilizzato **quattro file**:
- `index.html`
- `app.css`
- `app.mjs`
- `core.mjs`

Pubblica su GitHub Pages e apri l'indirizzo HTTPS in Bluefy. I file hanno query `?v=debug02` per ridurre il rischio che Bluefy usi una versione precedente in cache. In alto deve apparire **Bluefy · diagnostica BLE 0.2**.

## Prova consigliata (prima squadra A, poi eventualmente B)

1. Chiudi altre app che potrebbero usare l'iTAG, apri la web app in Bluefy e collega **solo A**. Attendi `startNotifications OK`.
2. Tocca **Esamina BLE A**. Alla fine copia le righe `DESCRITTORI`, `getDescriptor(0x2902)` e `getDescriptor(0x229)` dal registro. Questa è una lettura/esplorazione: non viene scritto nulla nel dispositivo.
3. Tocca **Ascolta 15 s · A**. Premi fisicamente il suo pulsante **5 volte**, distanziate di circa 1–2 secondi. Non usare i pulsanti `Leggi FFE1` durante questo test. Al termine vedrai il numero di eventi ricevuti: se è zero, il browser non ha inoltrato eventi al JavaScript in quei 15 secondi.
4. Tocca **Campiona FFE1 · A** e premi più volte durante gli 8 secondi del test. Confronta i valori. Le letture possono restare invarianti anche se esistono eventi momentanei, perciò l'esito non è da solo definitivo.
5. Tocca **Riattiva notifiche · A**, poi **Ascolta 15 s · A** e ripeti cinque pressioni. Questo prova la sequenza `stopNotifications()` / `startNotifications()`; è un tentativo, non una soluzione garantita.
6. Usa **Copia** sotto Registro Bluetooth e manda il testo (o screenshot del registro e del riepilogo). Se non appare `NOTIFY FFE1` in nessuno dei test, probabilmente Bluefy non consente la sottoscrizione locale necessaria a questo modello di iTAG.

La web app registra versione/ambiente browser, tempi e stato GATT, proprietà di FFE1 e descrittori (se esposti dal browser), errori, numero di notifiche reali, letture eseguite e variazioni dei valori.

**Attenzione:** durante `Campiona` disattiviamo temporaneamente l'assegnazione dei punti dalle callback perché alcuni browser inviano `characteristicvaluechanged` anche per le letture. Eventuali vere pressioni in quel periodo potrebbero non venire contate. Lo scopo è solo la diagnosi. Non rivelare pubblicamente informazioni del registro che vuoi mantenere private (identificatori dispositivo/browser).

## Cosa non può fare una pagina web

Un `startNotifications OK` non prova che le notifiche arrivino. Web Bluetooth non dà accesso alla chiamata nativa Android `BluetoothGatt.setCharacteristicNotification(...)`, che avevamo usato con successo nell'app Android in assenza di CCCD `0x2902`. Non esiste un modo JavaScript standard per forzare questa chiamata su iOS.

## Test locali

`node tests.mjs` verifica il motore del punteggio e l'annullamento. Non può simulare realmente l'implementazione BLE di Bluefy.
