# Padel BLE Web 0.3 – lettura continua FFE1 per Bluefy

## Perché questa versione

Nel log reale Bluefy 3.9.3 / iOS 18.7 del 22 ottobre 2026, con entrambi gli iTAG collegabili, `startNotifications()` completava senza errori ma gli eventi `characteristicvaluechanged` non arrivavano. Tuttavia il test `Campiona FFE1` ha rilevato tre sequenze **00 → 01 → 00** durante pressioni fisiche. La versione 0.3 sfrutta quelle transizioni.

## Uso

1. Carica tutti i file contenuti nello ZIP nella radice della pagina GitHub Pages, sostituendo i precedenti.
2. Apri la pagina HTTPS direttamente con Bluefy; verifica il titolo **Bluefy · lettura continua FFE1 0.3**.
3. Premi **Collega A**, scegli l’iTAG e attendi **POLLING FFE1 START** nel registro.
4. Premi il pulsante 10 volte, con 2 secondi tra le pressioni. Aspetta circa un secondo dopo ciascuna pressione per l'assegnazione del punto (riconoscimento doppio clic).
5. Ripeti con B e poi con entrambi collegati. Nel log devono apparire **POLL TRANSIZIONE 00→01** e **01→00**.
6. Usa **Copia** per inviare il log. In caso di errori, registra anche i messaggi `POLLING READ errore` e il totale delle letture.

Il poll si avvia da solo dopo ogni connessione. **Avvia/Ferma lettura A/B** consente di controllare ciascuna connessione. Se usi il test **Campiona FFE1**, il poll viene temporaneamente sospeso e riavviato alla fine. Per **Leggi FFE1** o **Riattiva notifiche**, ferma prima il poll. Il motore del punteggio e la gestione dei game sono quelli della precedente web app (tre regole, niente set).

## Note e limiti

- La rilevazione conta *solo* il fronte `00 → 01`, non ogni risposta che contiene `01`. Si evita così di assegnare punti ripetuti mentre il pulsante mantiene `01`.
- La prima lettura è utilizzata come livello iniziale, e non assegna punti.
- Intervallo: 45 ms **dopo** che una lettura GATT è terminata. Il tempo effettivo tra campioni include la latenza BLE; non equivale a 22 letture/secondo.
- Due dispositivi possono rallentare reciprocamente le letture; la ricezione di tutti i clic **non è garantita**. Verificare con 10 pressioni lente per ciascuna squadra.
- Doppio clic: la logica attuale continua a filtrare eventi separati da meno di 320 ms e consente il doppio clic fino a 950 ms. Due clic molto rapidi potrebbero risultare un clic singolo.
- Consumo energetico potenzialmente maggiore rispetto alle notifiche; tieni Bluefy in primo piano, con schermo acceso.
- Non serve alcuna app nativa iOS, firma o abbonamento; questa resta una web app.

## Verifiche locali

Esegui `node tests.mjs` e `node pulse-tests.mjs` per testare punteggio, clic e transizioni del pulsante. La ricezione BLE deve essere testata su iPhone reale; non è stata verificata in questa consegna.
