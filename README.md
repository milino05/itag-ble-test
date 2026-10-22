# Padel BLE Web 0.5 — fix compatibilità Bluefy/iTAG

La versione 0.4 non ha riconosciuto nessuna pressione negli esperimenti su Bluefy 3.9.3 / iOS 18.7: non sono state registrate transizioni `00→01` (ma la 0.4 non registrava nel log ogni valore letto). La versione 0.3 aveva invece riconosciuto le pressioni.

## Differenza decisiva fra v0.3 e v0.4

La v0.3 eseguiva `await characteristic.startNotifications()` **prima** del polling `readValue()`. Nella v0.4 questa chiamata era stata omessa perché Bluefy non consegnava eventi JS. La v0.5 la ripristina, pur continuando a usare i valori READ per rilevare la pressione.

**Ipotesi da verificare**: il percorso nativo di Bluefy/iTAG necessita l'avvio di notifiche per rendere visibile il livello del pulsante alle letture, anche senza consegnare notifiche JavaScript. Questa spiegazione non è ancora dimostrata sul dispositivo.

## Diagnosticabilità

- I log mostrano `startNotifications OK PRIMA del polling` oppure un errore esplicito.
- Il monitor esistente mantiene le statistiche di letture/s e latenze. Ogni ~20 secondi il registro mostra anche: `FFE1[00]=`, `FFE1[01]=`, `altri=`, `impulsi=` e `notifSub=`.
- `FFE1[01] > 0` significa che almeno una lettura ha visto il segnale attivo, anche se la logica non lo ha contato come nuova pressione.
- `FFE1[01] = 0` significa che la pagina non ha letto nessun segnale alto; può dipendere da configurazione GATT o campionamento troppo lento, non prova che l'iTAG non abbia trasmesso nulla.

Il calcolo di punti/game, le tre modalità sul 40–40 (Vantaggi, Punto de Oro, Star Point), lo storico, il doppio clic e il tabellone sono invariati. I set non sono implementati.

## Pubblicazione

1. Estrai **tutti** i file del pacchetto nella radice del repository usato con GitHub Pages, sostituendo quelli della 0.4.
2. Apri l'indirizzo HTTPS in Bluefy e aggiorna fino a vedere `Bluefy · compatibilità iTAG 0.5` nell'intestazione impostazioni.
3. Collega soltanto **A** e verifica nel registro `startNotifications OK PRIMA del polling` seguito da `POLLING FFE1 START`.
4. Premi A cinque volte lentamente (circa 2 secondi fra i clic), con pagina in primo piano e iTAG vicino al telefono.
5. Controlla `POLL TRANSIZIONE 00→01`, i punti e il conteggio `FFE1[01]` in `PRESTAZIONI`.
6. Solo dopo verifica il secondo iTAG simultaneamente; ripeti per 5–10 minuti e guarda se le latenze READ aumentano ancora fino a ~420 ms.

Se anche la 0.5 non riceve punti, prova temporaneamente la **v0.3** originale come controllo sullo stesso iPhone/ambiente. Questo isola eventuali cambiamenti di browser, firmware e GATT, e rende il confronto più affidabile.

## Test locali

Eseguiti:
- `node tests.mjs` (sette gruppi: punti/game/regole/storico/clic)
- `node pulse-tests.mjs` (transizioni)
- `node perf-tests.mjs` (monitor prestazioni)
- verifica sintattica dei file JS
- test di integrazione in Chromium con due iTAG **simulati**: le letture restituiscono `01` soltanto dopo l'attivazione di notifiche e il contatore avanza per entrambe le squadre.

Non è una prova della ricezione su Bluefy reale. La velocità di polling può comunque scendere a ~2 letture/s, facendo perdere pressioni brevi: non utilizzare questa versione per tenere il punteggio di una partita importante finché il comportamento non è stabile.
