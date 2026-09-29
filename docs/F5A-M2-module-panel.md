# F5A-M2 — Pannello, storico e anteprima

## Comportamento

La voce Moduli nell'amministrazione apre `/modules`, riservata ad admin aziendali e superadmin. Gli admin consultano l'azienda corrente e lo storico; i superadmin possono selezionare un'azienda e simulare stati alternativi. Base è invariabile; moduli futuri sono in preparazione senza selettore. Nomi, spiegazioni, stati ed errori IT/EN. Schede e storico si dispongono su una colonna sui piccoli schermi.

L'avviso spiega che gli stati sono registrati e le funzioni attuali restano disponibili. Nessun pulsante Applica e nessuna chiamata al servizio di transizione M1. `enforcement_ready` resta false. L'anteprima non altera stati, versioni o storico e restituisce sempre `can_apply:false`.

## API

- `GET /api/companies/:id/modules/events`: admin dell'azienda o superadmin; membership attiva sul target della URL. Paginazione per ID decrescente, 20 eventi di default, massimo 100; cursore BIGINT come stringa, validato e parametrizzato. Non restituisce lo storico di altre aziende. Gli eventi di aziende eliminate restano conservati in DB, ma questa API richiede che l'azienda sia ancora presente.
- `POST /api/companies/:id/modules/preview`: solo superadmin; body con `expected_version` stringa e lista esplicita `changes`. Verifica versione, core immutabile, disponibilità, dipendenze e piano completo con la policy M0. Risposta con cambi e conteggi di schede, movimenti collegati e ricorrenze attive coinvolti nell'azienda.
- Le anteprime usano una transazione REPEATABLE READ READ ONLY: stati/versione/conteggi appartengono allo stesso snapshot. Non sono prenotazioni di una modifica; in M3 l'applicazione dovrà rivalidare tutto con lock e versione attesa.
- Il target viene risolto dalla URL per tutte le route dei moduli: header discordanti non autorizzano una lettura su un'altra azienda.

I conteggi delle ricorrenze descrivono template attivi con riferimenti, non processi in esecuzione o autorizzazione a riavviare un generatore tecnicamente spento. Le conseguenze illustrate appartengono al comportamento futuro con enforcement: i dati e i saldi Base si conservano, i collegamenti specifici non diventano scrivibili.

## Gestione delle risposte asincrone

Cambio azienda/aggiornamento svuotano stato, bozza, anteprima e storico. Risposte obsolete o con company_id diverso vengono ignorate/rifiutate. Cambiare la bozza invalida anche l'anteprima già mostrata o ancora in corso. Lock UI evita invii doppi di anteprime e richieste duplicate delle pagine dello storico. Lo stato di un'altra azienda non viene mostrato neppure nel render intermedio del cambio selezione. Nessuna cache client concede accesso: l'autorizzazione è sempre nel backend.

## Verifiche

Suite frontend: 41 test logici e 89 DOM (6 nuovi test del pannello), build di produzione riuscita. I test nuovi coprono admin senza controlli, payload/versione dell'anteprima, risposte dopo edit/cambio azienda, paginazione, errori e company_id inatteso. Controlli sintassi e whitespace.

Test HTTP PostgreSQL aggiunti: storico autorizzato e paginato, isolamento URL/header, preview riservata al superadmin, conteggi mirati, nessuna scrittura, versione obsoleta e piani incompatibili. Eseguiti dalla CI PostgreSQL 18. La verifica visiva in browser/dispositivo resta da fare nel collaudo; Chromium locale non disponibile.

## Prossimo blocco M3

Prima di aprire attivazioni/disattivazioni: middleware e adapter per CRUD, link movimenti omessi/null, import/export, report e snapshot già generati, dashboard, ricorrenze/worker; protocollo di lock condiviso delle scritture; frontend coerente con capacità e sola lettura. Poi pannello di applicazione con motivo/versione, provisioning Base-only per nuove aziende e migrazione che rimuove il trigger di compatibilità M1. Nessuna attivazione per commessa.

Nessuna migrazione nuova o deploy QNAP in M2. Prima del rollout M3 provare upgrade e restore nell'ambiente di collaudo; dopo disattivazioni reali usare solo release compatibili con gli stati.
