# F5A-M1 — Registro aziendale e audit

## Perimetro

Migrazione additiva `016_20260929__company_module_registry.sql`, identica nelle due directory del progetto. Non modifica baseline né migrazioni già applicate. Aggiunge versione complessiva all'azienda, stati/versioni dei moduli e storico append-only. Base resta implicito e non può comparire come riga modificabile.

Le aziende preesistenti ricevono Commesse e Immobiliare, anche senza dati. Durante M1 un trigger di provisioning applica la stessa compatibilità alle aziende create da API, bootstrap e altri percorsi SQL: non dichiariamo Base-only mentre le funzioni sono ancora accessibili. Il trigger sarà rimosso dalla migrazione di attivazione M3; allora le nuove aziende partiranno con il solo Base. Moduli futuri non vengono abilitati. Il provisioning è idempotente e non sovrascrive stati già presenti.

**Non distribuire disattivazioni manuali tramite SQL o richiamare il servizio interno su produzione.** Le API correnti non applicano ancora gli stati. Nessuna API di mutazione, nessun pannello e nessun interruttore di ambiente per anticipare l'enforcement. `enforcement_ready: false` è esplicito nelle nuove letture.

## API di sola lettura

- `GET /api/modules`: autenticazione obbligatoria, catalogo versionato e disponibilità nella release.
- `GET /api/companies/:id/modules`: membership attiva (con compatibilità legacy esistente) oppure superadmin. L'azienda viene risolta dalla URL: un header X-Company-Id discordante non può autorizzare l'accesso a un'altra azienda. Restituisce versione stringa, stati, disponibilità e timestamp; nessun elenco di capacità effettivamente concesse.
- Nessuna API PATCH/POST per stati, anteprime o storico in M1. La consultazione amministrativa dello storico verrà integrata col pannello M2.

La lettura degli stati e della versione usa una sola query per evitare snapshot incoerenti. Nessuna cache di autorizzazione.

## Servizio transazionale interno

`applyCompanyModulePlan` è preparato per M2–M3 e usato dai test; non è collegato a route o worker. Rilegge autore attivo/superadmin dal database, richiede motivo non vuoto e versione attesa in forma di stringa decimale (BIGINT senza perdita di precisione), prende lock esclusivo sull'azienda, rivalida l'intero piano M0 e aggiorna registro/versione/audit nella stessa transazione. Modifica concorrente con versione obsoleta → `MODULE_VERSION_CONFLICT`. Piano senza cambi reali → nessun incremento o evento.

Ogni operazione ha un UUID condiviso tra tutti i suoi eventi. Il fallimento dell'audit annulla anche gli stati. `lockCompanyModules` prepara il lock condiviso per i futuri writer: richiede un client già in transazione, da mantenere fino al commit/rollback. Ordine di lock: azienda, poi autore/entità. Finché i writer reali non adottano questo protocollo non è sicuro esporre transizioni.

## Conservazione dello storico

Gli eventi non hanno FK con cancellazione o modifica a cascata: conservano gli identificativi di azienda e autore anche dopo la loro eliminazione. Non contengono copie di dati finanziari o credenziali. Motivo limitato a 1000 caratteri. Trigger bloccano UPDATE, DELETE e TRUNCATE dello storico; sono una protezione del contratto applicativo, non una barriera contro un amministratore PostgreSQL che può modificare lo schema. La tabella degli stati segue invece la cancellazione dell'azienda e azzera il riferimento all'autore cancellato.

Il dump/ripristino completo deve conservare registro, sequenze, eventi, funzioni e trigger; usare l'archivio completo, non copiare soltanto `company_modules`. In un ripristino completo su database vuoto i trigger vengono ripristinati dopo i dati. Nessuno script distruttivo di downgrade incluso.

## Verifiche e rilascio

Test PostgreSQL: upgrade con dati preesistenti, nuove aziende in modalità compatibilità, schema fresco, migrazione ripetuta senza riattivazioni, isolamento URL/header, membership revocata, superadmin attivo, conflitto di versione, audit atomico, no-op, piano parzialmente invalido, serializzazione con lock condiviso e conservazione audit alla cancellazione azienda. Test della policy M0 invariati. La CI usa PostgreSQL 18; non è stato eseguito un ripristino operativo di M1 sul QNAP.

M1 può essere integrata senza abilitare il pannello. Nessun aggiornamento QNAP o nuova release richiesto in questo passaggio. Prima della release che applicherà davvero gli stati: adapter e UI M2–M3, blocco dei bypass (snapshot CSV inclusi), prova migrazione/restore nel collaudo, quindi rollout. Dopo disattivazioni operative non tornare a codice che ignora i moduli.
