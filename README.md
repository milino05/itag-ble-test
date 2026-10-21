# Padel BLE — Bluefy Web 0.1 (sperimentale)

Sito statico per **iPhone con Bluefy**, con lo stesso motore di punteggio della versione Android 0.2. Non necessita di Android Studio, compilazione, server applicativo, account o servizi a pagamento. Va **pubblicato con HTTPS** prima di usarlo con Bluetooth; l'apertura diretta di `index.html` da `file://` non basta.

## Cosa fa

- Tabellone orizzontale con due punteggi enormi, game mostrati soltanto dopo un game vinto; primo tocco iTAG del game successivo torna ai punti **e conta il punto**.
- Tre modalità selezionabili nelle impostazioni: **Vantaggi classici**, **Punto de Oro** e **Star Point** (due vantaggi annullati prima del punto decisivo).
- Nessun set.
- Due iTAG indipendenti, collegati dalla finestra Bluetooth di Bluefy con filtro sul servizio **FFE0**. L'app ascolta gli eventi della caratteristica **FFE1**.
- Un clic: punto dopo 950 ms; doppio clic con notifiche valide distanti almeno 320 ms, entro 950 ms: annulla l'ultimo punto della propria squadra.
- Test manuali e simulazione di notifiche, registro Bluetooth copiabile e cronologia salvata in `localStorage` del browser. Nessun invio di dati a server.

## Limite fondamentale di Bluefy / Web Bluetooth

I nostri iTAG espongono FFE1 come `READ, NOTIFY` ma **non espongono il CCCD standard 0x2902** (al suo posto è stato osservato `0x0229`). Android funziona perché la nostra app può chiamare l'API nativa `BluetoothGatt.setCharacteristicNotification(...)` senza scrivere quel descrittore.

**Web Bluetooth non espone questa API nativa**. Può usare solo `characteristic.startNotifications()` e l'evento `characteristicvaluechanged`. La specifica Web Bluetooth *prevede* la sottoscrizione a caratteristiche con NOTIFY anche se manca il CCCD, ma il risultato dipende dall'implementazione di Bluefy. Nelle prove precedenti Bluefy si collegava, trovava FFE0/FFE1 e diceva «NOTIFICHE ATTIVE», ma premendo l'iTAG non apparivano eventi. Questa versione tenta ancora il percorso standard, con listener registrato prima della sottoscrizione e gestione di due dispositivi separati. **Non è garantito che funzioni su iPhone.**

Se un pulsante non produce righe `NOTIFY FFE1 [01]` nel registro dopo `startNotifications OK`, il blocco è il trasporto BLE/Web Bluetooth, non il calcolo dei punti. Leggere ripetutamente FFE1 non ha funzionato nei test e non è utilizzato per rilevare le pressioni. In tal caso occorrerà una piccola app iOS nativa (CoreBluetooth), un adattatore o un pulsante differente; la sola web app non può forzare l'ascolto locale come Android.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub (per esempio `padel-ble-web`).
2. Carica **nella radice del repository** i quattro file `index.html`, `app.css`, `app.mjs`, `core.mjs`. `tests.mjs` e questo README sono facoltativi per la pubblicazione.
3. In **Settings → Pages → Build and deployment**, seleziona **Deploy from a branch**, branch `main`, cartella `/ (root)`, quindi salva.
4. Quando GitHub ha completato la pubblicazione, apri in Bluefy su iPhone `https://TUO-UTENTE.github.io/padel-ble-web/`.
5. Metti l'iPhone **in orizzontale**, tocca il tabellone per aprire le impostazioni e premi `Collega A`. Seleziona il primo iTAG. Ripeti con `Collega B` per il secondo iTAG.
6. Chiudi le impostazioni e premi un iTAG. Per controllare la ricezione, riapri il menu, vai al **Registro Bluetooth** e verifica la presenza di `NOTIFY FFE1`.

Puoi anche caricare questi stessi file su qualsiasi hosting HTTPS statico. Bluefy deve restare aperto e lo schermo non deve andare in standby. La modalità fullscreen e il blocco orizzontale non sono garantiti su iOS/Bluefy; la pagina sfrutta la viewport disponibile.

## Sequenza di test consigliata

1. Senza pulsanti collegati: premi `+ punto A/B (test)`. Verifica 0 → 15 → 30 → 40 → GAME, poi la schermata con i game vinti e la pressione successiva che ritorna ai punti.
2. Premi `Simula FFE1 A` una volta, attendi un secondo. Deve aggiungere un punto. È una prova della logica, **non** del Bluetooth.
3. Collega **solo A** in Bluefy, premi fisicamente l'iTAG una volta, attendi un secondo e copia il registro.
4. Se appare `NOTIFY FFE1`, prova il secondo pulsante. Se no, registra il messaggio e non perdere tempo con tentativi di polling FFE1.
5. Se la ricezione funziona, prova i doppi clic con distanza **400–800 ms**: iTAG può emettere doppioni automatici a ~220 ms, che vengono ignorati.

## Test automatici e limiti

Per testare il motore del punteggio in Node.js 18+:

```
node tests.mjs
```

Questi test non verificano il driver Bluetooth né sostituiscono un test reale su iPhone. Il codice usa solo API web standard e non include librerie esterne, tracker o backend.

## File inclusi

- `index.html` — markup tabellone, menu, controlli e registro.
- `app.css` — stile responsive, cifre ad alto contrasto.
- `core.mjs` — motore punteggio e riconoscimento clic (indipendente dal browser).
- `app.mjs` — driver Web Bluetooth e interfaccia.
- `tests.mjs` — test JavaScript per le tre modalità e annullamento.
