# Padel BLE Web 0.4 — polling ottimizzato e monitor prestazioni

Versione sperimentale per **Bluefy su iPhone**. Nasce dalla 0.3, dove il polling su FFE1 permette già di leggere entrambi gli iTAG. La 0.4 cerca di risolvere il rallentamento osservato dopo centinaia di letture, ma non promette una ricezione perfetta degli eventi.

## Correzioni

- **Zero aggiornamenti dell'interfaccia per ogni lettura BLE**: le statistiche vengono aggiornate una volta al secondo con il menu aperto, mentre il tabellone non viene continuamente ridisegnato. Gli eventi significativi (pressioni, release, errori) continuano nel registro.
- **Una sola lettura BLE in corso per dispositivo** e generazione del polling invalidata allo stop; non si aprono due cicli sovrapposti dopo ripartenze rapide.
- **Nessuna richiesta iniziale di notifiche GATT** su Bluefy, dato che i test precedenti mostravano `startNotifications` OK ma zero notifiche effettive. La diagnostica manuale rimane disponibile.
- **Monitor delle prestazioni**: letture/s negli ultimi 10 secondi, tempo medio dell'operazione `readValue()` e ultimo tempo, numero di letture, impulsi e errori per squadra.
- **Avviso di letture lente** sotto circa 3.2 letture/s per almeno 3 aggiornamenti successivi, oppure quando una lettura dura oltre 1.6 s. La soglia è solo diagnostica, non una garanzia di cattura.
- **Ripristina BLE A/B**: disconnette e tenta di ricollegare l'iTAG scelto senza azzerare la partita. È manuale perché il ripristino interrompe brevemente la ricezione; Bluefy potrebbe richiedere di selezionare nuovamente il dispositivo.

Le regole Advantage, Golden Point e Star Point, i game, lo storico e la modalità orizzontale sono invariati. Non sono presenti set.

## Installazione e prova

1. Estrai i file dallo ZIP e sostituisci quelli pubblicati su GitHub Pages **tutti insieme**.
2. Apri il link HTTPS in Bluefy e ricarica la pagina finché non leggi `polling ottimizzato 0.4` nell'intestazione.
3. Collega A e B. Attendi una decina di secondi: leggi nel menu il valore `lett./s` e `media ... ms` per entrambe le squadre.
4. Lascia il telefono acceso con Bluefy in primo piano per **5–10 minuti**. Premi ogni tanto iTAG A e B e verifica che siano riconosciuti, annotando quando la frequenza peggiora.
5. Se compare `LETTURA LENTA`, prova **Ripristina BLE A/B** per verificare se una nuova sessione GATT riporta le letture/s ai valori iniziali. Durante la riconnessione non usare il pulsante per punti importanti.
6. Copia il registro: cerca `PRESTAZIONI`, `AVVISO LETTURA LENTA` e `VELOCITÀ RIPRISTINATA`.

## Come interpretare

- Se la velocità rimane stabile: gli aggiornamenti troppo frequenti della UI erano probabilmente una parte del problema.
- Se la velocità scende insieme all'aumento della latenza `READ media`: il collo di bottiglia è nella comunicazione di lettura BLE (Bluefy/iOS/dispositivo), non soltanto nel tabellone.
- Se peggiora e un ripristino manuale risolve temporaneamente: la sessione GATT potrebbe degradare nel tempo, ma non è dimostrato senza altri test.
- Se i valori `00→01→00` cambiano più velocemente della lettura, è inevitabile perdere alcuni clic: il polling non può garantire ogni pressione.

## Test

`node tests.mjs && node pulse-tests.mjs && node perf-tests.mjs`

I test locali coprono le regole e il calcolo della velocità ma **non simulano l'intero Bluefy**. La prova determinante è sul dispositivo iPhone reale. 
