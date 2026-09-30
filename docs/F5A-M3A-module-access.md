# F5A-M3A — CRUD e collegamenti dei movimenti

Primo blocco degli adapter M3, dopo il merge M2 (#153). Non chiude M3 e non apre l'applicazione dei piani: `enforcement_ready` resta false, nessuna API di mutazione dei moduli, nessun pulsante Applica, nessun provisioning Base-only anticipato. Il trigger di compatibilità M1 resta presente; stati e funzionalità delle aziende attuali non vengono cambiati.

## Percorsi coperti

- Commesse e Immobili: elenchi e dettagli (anche HEAD) richiedono lettura del modulo; creazione/modifica/cancellazione richiedono lo stato enabled. read_only ammette letture; disabled nega le API specifiche. Ruoli e membership esistenti continuano a precedere i controlli dei moduli; neppure il superadmin aggira lo stato.
- Scritture CRUD: transazione unica, lock FOR SHARE sull'azienda prima dei lock sulle entità, lettura degli stati dal database, commit prima della risposta. Le query di validazione usano lo stesso client. L'audit Commesse è atomico con la mutazione.
- Movimenti: POST/PUT/DELETE prendono lo stesso lock aziendale prima di entità/conti. Le transizioni M1 usano FOR UPDATE e attendono il completamento delle scritture precedenti. Nessuna cache di autorizzazione e nessun flag o stato accettato dal body.
- Assegnazione, sostituzione o rimozione di job_id/property_id richiedono scrittura nel relativo modulo. PUT preserva un collegamento omesso e ammette il valore identico, anche con modulo disabilitato/in sola lettura. null esplicito significa rimozione. Alias camelCase supportati; alias discordanti sono rifiutati, compreso null canonico con un alias valorizzato. Limiti degli identificativi verificati prima delle query.
- Cancellare un movimento collegato rimuove anche il riferimento: è quindi impedito se il modulo collegato non è scrivibile. Restano possibili correzioni Base che conservano i riferimenti e operazioni su movimenti senza tali collegamenti. La riattivazione consente nuovamente la rimozione senza ricreare dati.
- Lista ed export CSV dei movimenti mantengono tutte le righe, importi e saldi Base. Nomi/codici storici minimi restano visibili; indirizzi, note private e budget non vengono proiettati. Join e ricerca delle etichette Commesse/Immobili sono vincolati alla stessa azienda. Filtri job_id/property_id e missing_job/missing_property richiedono lettura del modulo; read_only consente questi filtri e il CSV già autorizzato dai permessi esistenti.
- Audit dei movimenti prima del commit, sul medesimo client: un errore di audit annulla anche righe, registrazioni contabili e saldi. Nessuna risposta positiva prima del commit.
- Messaggi MODULE_DISABLED/MODULE_READ_ONLY in italiano e inglese.

## Verifiche

Test puri per default negato, flag tecnici, campi omessi/null/alias, identificativi invalidi e collegamenti invariati. Suite HTTP PostgreSQL per ruoli, isolamento fra aziende, superadmin, disabled/read_only, CRUD, rollback dell'audit, saldi, riferimenti esterni, dati storici, filtri/CSV, righe di registro assenti e riattivazione senza duplicazioni.

Il test di concorrenza blocca esplicitamente un conto, osserva il writer HTTP in attesa sul lock, poi osserva la transizione in attesa sul lock aziendale. Dopo il rilascio verifica commit del writer precedente e rifiuto delle successive assegnazioni. L'ordine è determinato da pg_stat_activity, con una scadenza per diagnosticare un test fallito, non da una pausa temporale stimata.

Le fixture delle suite che ora attraversano i controlli caricano le migrazioni correnti; resetDb senza opzioni conserva il percorso baseline per le altre suite. PostgreSQL/Docker non sono disponibili localmente: integrazione e regressioni vengono eseguite dalla CI PostgreSQL 18. Build frontend, test puri, sintassi e whitespace verificati localmente.

## Seguito M3

1. Import/export di entità, aggiornamenti/cancellazioni implicite e ricorrenze manuali/worker: stesso lock e controlli sui riferimenti, sospensione motivata, precedenza dei flag tecnici.
2. Report normalizzati/salvati, budget, qualityDimensions, snapshot esistenti e download; dashboard con dimensioni specifiche. I controlli M3A non sostituiscono questi adapter ancora da implementare.
3. Frontend coerente con capacità e sola lettura su menu, route, selettori, form, template e widget; poi applicazione superadmin con motivo/versione e migrazione che rimuove il trigger per nuove aziende Base-only.

Nessuna nuova migrazione o release NAS richiesta per M3A. Non effettuare disattivazioni manuali nel database durante questa fase preparatoria. Prima del rollout completo M3: collaudo upgrade/restore, UI e concorrenza sui percorsi completati. Dopo disattivazioni operative, una release precedente che ignora gli stati non è un rollback sicuro.
