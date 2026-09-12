# F4.4 — Template di confronto

## Comportamento

- `reportKind`: standard (default e report salvati precedenti), budget, yoy, mom, quality.
- Budget: ricavi/costi previsti reali delle commesse, consuntivi su tutta la durata, commesse senza movimenti incluse. Budget assente resta null; zero è un budget definito. Nessuna ripartizione temporale implicita. Solo filtro commessa; movimenti privi di commessa esclusi.
- YoY: netto mensile contro il periodo corrispondente dell'anno precedente.
- MoM: spese contro il periodo corrispondente del mese precedente.
- Mesi parziali: stessi estremi di calendario traslati, con clipping dei giorni non esistenti; mesi completi restano completi. I periodi effettivi sono visibili in tabella. Non si equiparano giorni lavorativi. Al massimo 120 mesi per esecuzione.
- Percentuale: (corrente - precedente) / abs(precedente) * 100; base zero produce null, mostrato come trattino, anche se entrambi i valori sono zero. Calcolo in BigInt e troncamento a due decimali. Le spese mantengono una variazione positiva quando aumentano.
- Qualità dati: conto/categoria di default; contatto, commessa e immobile solo su selezione. Si contano collegamenti assenti o non validi nell'azienda; conteggi non additivi. Nessuna correzione automatica o drilldown ambiguo del riepilogo qualità.
- Collegamenti ai movimenti del periodo corrente e precedente; budget apre tutti i movimenti della commessa. Filtri e quote per conto conservati.

## Coerenza

Run ed export dei nuovi template usano lo stesso servizio e una transazione REPEATABLE READ READ ONLY. Ogni nuova esportazione rilegge i dati: lo snapshot tra richieste distinte è rinviato a F4.6. L'ordinamento è deterministico e il limite è segnalato. I report salvati preservano reportKind; quelli esistenti senza questo campo restano standard, per evitare reinterpretazioni silenziose. Per ottenere un confronto da un vecchio report occorre selezionare il nuovo template e salvarlo.

I grafici dei nuovi template sono rinviati a F4.5; le tabelle rendono già visibili i confronti. UI e note disponibili in italiano e inglese. La verifica visiva su dispositivo reale resta da eseguire.

## Moduli e distribuzione

Calcoli budget separati nel servizio dei confronti, con proprietà funzionale del modulo Commesse; report generali e confronti temporali restano nel Base. F5A aggiungerà le abilitazioni per azienda: non si anticipa un sistema parziale di flag in questa PR. Nessuna migrazione, modifica del generatore ricorrenti o deploy.

## Verifiche

Test frontend logici e DOM, build, unit test calendario/percentuali/validazione, golden HTTP su budget, ripartizioni, periodi, qualità dati, isolamento e salvataggio/export. Verifica locale SQL con PostgreSQL embedded PGlite tramite adattatore temporaneo di pg. La CI verifica la suite backend sul PostgreSQL 18 del progetto.
