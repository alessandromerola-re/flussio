# F5A-M0 — Catalogo, policy e inventario dei moduli

Data: 29 settembre 2026. Base di lavoro: v1.8.0 / merge #150 (`2bd57f4`).
Riferimento: Flussio_Moduli_Specifica_2026.md, revisione 1 del 12 settembre 2026; roadmap revisione 2.

## Stato del lavoro

L'utente ha confermato il collaudo funzionale desktop/mobile, permessi e isolamento, backup/ripristino nel QNAP di collaudo, confronto con dati reali e ripristino dei file caricati. Ha inoltre confermato aggiornamento e funzionamento della produzione v1.8.0. F4/Gate B sono chiusi per il perimetro collaudato (CSV; XLSX non implementato). Sono conferme operative dell'utente, non verifiche remote eseguite dall'agente sul NAS.

M0 introduce codice puro e testato, senza migrazioni, endpoint o modifiche all'accesso corrente. Le policy non sono ancora collegate alle richieste: questa PR NON rende i moduli disattivabili. Disponibile nel catalogo significa che esistono le funzionalità della release, non che il pannello di abilitazione sia già operativo. La gestione completa segue in M1–M3.

## Catalogo e contratto

`backend/src/modules/catalog.js` è la fonte unica versionata (revisione 1). Base (`core`) invariabile; `jobs` e `real_estate` disponibili. `wealth`, `investments`, `market_data`, `crypto_sync`, `api_excel` indisponibili fino alle rispettive fasi F6–F10. Immobiliare e Family Office sono indipendenti; viste integrate richiederanno entrambe le capacità. Le dipendenze transitive non si attivano implicitamente.

Il catalogo espone capacità funzionali, non permessi personali. Nomi e descrizioni UI saranno tradotti nel pannello M2. Prima nota, ricorrenze e report generali restano Base. Nessun progetto/commessa diventa un contesto di sicurezza.

`createModulePolicy().evaluate(...)` riceve capacità richieste, azione (`read`, `export`, `write`, `delete`, `run`), stati, permesso già risolto e disponibilità tecnica. Il permesso ha default negato. L'esito contiene `allowed` e un codice deterministico. I chiamanti devono risolvere ruolo, membership, azienda e permessi sensibili sul server; MAI prendere `states`, `permissionGranted` o flag tecnici dal body HTTP. La policy non verifica identità o membership da sola e non sostituisce `companyContextMiddleware`.

Riga assente → modulo disabilitato. `read_only` ammette lettura/export solo se già autorizzati dal ruolo; nega scrittura, cancellazione e worker. `core` resta attivo anche se un input incoerente prova a spegnerlo. Moduli futuri e capacità/azioni sconosciute negano accesso. Le funzionalità trasversali richiedono l'intera lista di capacità: mai ridurre un report silenziosamente.

`preview(states, changes)` verifica solo un piano ipotetico, senza I/O: core immutabile, dipendenze nello stato necessario, nessuna cascata nascosta, nessuna mutazione degli input. Valida anche i dipendenti non inclusi nel piano. Un dipendente `enabled` richiede dipendenze `enabled`; un dipendente `read_only` accetta dipendenze `enabled` o `read_only`. In M1 l'API dovrà aggiungere superadmin, versione attesa, motivo, transazione, lock e audit: il risultato di M0 non è autorizzazione a scrivere sul DB.

## Inventario verificato nel repository

| Percorso | Appartenenza e adeguamento necessario prima di consentire disattivazioni |
|---|---|
| `routes/jobs.js`, `routes/reports.js` (`/job/:jobId/summary`, `/export.csv`) | `jobs` / `job_reports`. Controlli su elenco, dettaglio, budget, CRUD ed export. |
| `routes/properties.js` | `properties` / Immobiliare. Coprire anagrafica, dettagli e mutazioni. |
| `routes/transactions.js` | Base + `job_links`/`property_links` per collegamenti, filtri e proiezioni. Oggi PUT normalizza campi omessi a null: distinguere omissione da cancellazione esplicita prima di bloccare moduli. Preservare collegamenti storici quando si modifica altro. |
| `routes/importExport.js` | Import/export di jobs/properties richiede il modulo; transazioni e ricorrenze richiedono controlli sui riferimenti. Controllare anche risoluzione/creazione via external_id, aggiornamenti e cancellazioni implicite; mantenere distinti `import` e `import_movements`. |
| `routes/advancedReports.js`, `services/advancedReports.js`, `services/reportComparisons.js` | Budget → Commesse; groupBy, filtri jobId/propertyId e qualityDimensions opzionali richiedono i moduli specifici. Validare dopo la normalizzazione di alias; stessa funzione per run, export legacy e report salvati. YoY/MoM generali restano Base. |
| `services/reportSnapshots.js` | Ogni snapshot deve conservare le capacità richieste al momento della generazione; al download ricontrollare lo stato attuale. Uno snapshot generato prima della disattivazione non deve aggirarla. Nessun solo controllo al run. |
| `routes/dashboard.js` | Riepiloghi Base sempre completi; torta con dimensione job richiede Commesse. Non escludere dai saldi Base i movimenti con riferimenti a moduli disattivati. |
| `routes/recurringTemplates.js`, `services/recurring.js` | Ricorrenze Base, riferimenti opzionali e generazione manuale/automatica da proteggere. Una ricorrenza con modulo non scrivibile resta conservata e sospesa con motivo; non generare movimenti privati silenziosamente del riferimento. I flag tecnici mantengono precedenza. |
| `routes/attachments.js`, `routes/settings.js`, `routes/publicBranding.js` | Allegati a movimenti e branding restano Base; non bloccare in massa gli upload perché manca Immobiliare. Verificare eventuali proiezioni di dettagli specifici e permessi. |
| `routes/companies.js`, `bootstrapAdmin.js` | Due percorsi di creazione aziende, oltre al seed di sviluppo. Coordinare provisioning Base-only con l'entrata in funzione dei controlli; nessun auto-enable dei moduli futuri. |
| `middleware/auth.js`, `middleware/companyContext.js`, `middleware/permissions.js`, `routes/users.js` | Riutilizzare identità, membership e ruoli esistenti. Solo `req.user.is_super_admin` amministrerà le abilitazioni; il ruolo admin aziendale non basta. Il superadmin non aggira disponibilità/dipendenze. Permessi patrimoniali sensibili separati in F5/F6. |
| `frontend/src/App.jsx`, `routes.jsx`, pagine Registry, Movements, JobDetail, PropertyDetail, Dashboard, AdvancedReports, RecurringTemplates | Menu, route, selettori, template, form e widget da allineare al server; svuotare dati al cambio azienda e ignorare risposte obsolete. Mostrare chiaramente sola lettura/disponibilità. |

### Dati condivisi: decisioni operative

- La disattivazione non elimina righe, saldi, allegati o collegamenti.
- Le viste Base conserveranno solo identificativi/etichette storiche minime necessarie; non esporranno automaticamente dettagli riservati. Filtri e report specifici richiedono il modulo.
- La funzione che determina le capacità di un report deve includere dimensioni, filtri normalizzati, reportKind e qualityDimensions, non soltanto il template selezionato.
- CRUD Commesse/Immobili, assegnazione/rimozione link, import e generatori devono partecipare allo stesso protocollo di lock delle transizioni. Un controllo in middleware seguito da una scrittura fuori transazione è insufficiente.

## Disegno della migrazione M1 (non applicata in M0)

1. Migrazione nuova nelle due directory `backend/migrations` e `database/migrations`, senza cambiare checksum delle migrazioni già applicate o baseline adottata. Aggiornare il contratto di verifica schema e i test fresh/upgrade/restore del runner.
2. `companies.modules_version BIGINT NOT NULL DEFAULT 0` come versione complessiva e punto comune di serializzazione. `company_modules`: PK `(company_id,module_code)`, stato vincolato, versione per riga, timestamp, autore nullable con FK. `core` implicito, nessuna riga modificabile.
3. `company_module_events`: operation_id, company_id, module_code, stato prima/dopo, autore, motivo, versione aziendale, timestamp. Scrittura nella stessa transazione delle abilitazioni; nessuna API di modifica/cancellazione eventi. Il contratto append-only va verificato anche nel percorso di eliminazione dell'azienda, senza introdurre cancellazioni a cascata dell'audit per comodità.
4. Assegnare alle aziende preesistenti `jobs=enabled` e `real_estate=enabled`, anche se le tabelle di dettaglio sono vuote. I codici sono espliciti (`LEGACY_MODULE_CODES`), non derivati da tutti i moduli disponibili in una release futura. Seed idempotente, nessun ON CONFLICT che riattivi stati esistenti.
5. Aziende nuove Base-only nella release che porta i controlli end-to-end. M1–M2 potranno essere integrati come preparazione, ma non esporranno transizioni operative/provisioning Base-only incompleto prima di M3. Nessun pannello che dichiari spento un modulo ancora accessibile.
6. `company_module_permissions` per capacità patrimoniali sensibili: design successivo con FK alla membership esistente e assegnazione superadmin. Nessuna concessione automatica agli utenti attuali; non creare adesso un sistema di permessi parallelo inutilizzato.

### Concorrenza e cache

- La transizione prende `SELECT ... FOR UPDATE` sulla riga dell'azienda, verifica versione attesa, rilegge gli stati, valida il piano, aggiorna e scrive audit prima del commit.
- Ogni scrittura con effetti specifici prende un lock compatibile con la serializzazione (proposta `FOR SHARE` sulla stessa riga azienda) PRIMA di leggere gli stati e acquisire lock sulle entità. Lo mantiene fino al commit. Ordine unico: azienda → entità, per evitare deadlock tra route e worker.
- Le scritture iniziate prima della transizione finiscono prima della sua conferma; quelle successive vedono la revoca. Test con due connessioni e barriere esplicite, non attese temporali fragili.
- Prima versione: lettura dello stato dal DB, senza cache di autorizzazione process-local. Il frontend può memorizzare capacità per UX ma non concede accesso; le richieste obsolete non aggiornano il nuovo contesto.
- Report e download ricontrollano moduli e permessi in modo coerente alla richiesta. Export snapshot mantiene l'identità dei dati senza congelare autorizzazioni.

## Sequenza successiva e criteri di accettazione

M1: registro persistente, audit, letture aziendali autorizzate, transazioni/lock e test di migrazione; nessuna disattivazione pubblica anticipata.

M2–M3: adapter su tutti i percorsi inventariati, frontend e pannello superadmin con anteprima/motivo/versione; attivazione operativa solo dopo la copertura end-to-end. Test obbligatori: aziende diverse, ruoli, richieste HTTP dirette, read_only, revoca durante worker/import, snapshot precedenti, link omessi vs null, report salvati, cache obsolete, restore e riattivazione senza duplicazioni.

Rollback dopo disattivazioni reali: release correttiva compatibile o fermo controllato; v1.8.0 ignora gli stati e non è un rollback sicuro. Conservare sempre un backup verificato prima delle migrazioni.

## Verifiche M0

Unit test del catalogo e della policy: disponibilità, core invariabile, dipendenze sconosciute/cicliche, capacità duplicate, permessi, flag tecnici, sola lettura, moduli futuri, piani atomici come struttura pura e assenza di mutazioni. La dipendenza Family Office/Investimenti viene esercitata con un catalogo di test che simula una release futura; nessuna funzione futura viene abilitata in produzione.

La CI completa resta il controllo di regressione. Non sono previste modifiche al QNAP o una nuova release per utilizzare M0. La precedente anomalia dei workflow che assegnano `latest` anche alle build main resta un intervento di distribuzione distinto da F5A.
