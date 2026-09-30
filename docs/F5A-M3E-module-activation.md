# F5A-M3E — Applicazione dei piani e nuove aziende Base

Ultimo blocco di sviluppo dell'attivazione operativa M3, dopo il merge M3D (#157). Questa versione espone l'applicazione dei piani ai superadmin e dichiara `enforcement_ready:true`: CRUD, import/export, ricorrenze, report/snapshot, dashboard e UI applicano già i controlli M3A–M3D. Il collaudo upgrade/restore sul NAS resta un gate operativo da eseguire prima della release di produzione; non è stato eseguito dall'agente.

## Contratto pubblico e autorità

`POST /api/companies/:id/modules/apply` accetta `{ expected_version, reason, changes }`, dove la versione è una stringa decimale, il motivo è non vuoto dopo trim e lungo al massimo 1000 caratteri, e `changes` contiene gli stati desiderati. L'azienda è esclusivamente quella dell'URL, verificata dal middleware; autore, ruoli, stati e capacità forniti nel body non concedono autorità.

La route richiede un superadmin attivo verificato dal database. Il servizio rilegge questa autorità sotto lock dopo aver acquisito il lock esclusivo aziendale: la revoca dei privilegi mentre una richiesta attende viene rispettata. La policy valida l'intero piano: Base invariabile, moduli futuri non attivabili, dipendenze e stati validi. Admin aziendali e altri ruoli non applicano piani, neppure per l'azienda di appartenenza.

La transazione verifica la versione, aggiorna tutti i cambi reali, incrementa la versione aziendale una sola volta e registra motivo/autore/versione con lo stesso `operation_id` negli eventi. Se uno stato o l'audit fallisce, tutto viene annullato. Due piani concorrenti alla stessa versione producono un commit e un `MODULE_VERSION_CONFLICT` (409). Un piano già corrispondente agli stati correnti è un no-op: stessa versione, nessun evento e `operation_id:null`.

La risposta include lo snapshot aggiornato e l'identificativo dell'operazione. Le operazioni già protette condividono il protocollo di lock aziendale di M3A–M3C: non si inseriscono nuove cache di autorizzazione né percorsi di scrittura alternativi. Una risposta di rete persa dopo il commit non dimostra che il piano sia fallito: rileggere stati e storico prima di riprovare; il client non ripete automaticamente l'applicazione.

## Anteprima e pannello

L'anteprima rimane una lettura coerente senza prenotazioni. `can_apply` è true solo se la release applica i controlli e il piano ha cambi reali; un no-op ha impatto vuoto e `can_apply:false`. I conteggi sono quelli dello snapshot dell'anteprima, non un blocco degli inserimenti futuri. L'applicazione rivalida stati e versione sotto lock.

Il pannello mostra l'azienda destinataria, l'impatto, il motivo obbligatorio e “Applica piano”. Il pulsante richiede un'anteprima valida dell'esatto draft/versione/azienda corrente. Modificare il draft invalida l'anteprima; motivo e versione non possono diventare un'autorizzazione a un altro piano. Durante l'applicazione target, stati, motivo, refresh e doppi clic sono bloccati. Un conflitto annulla l'anteprima e ricarica gli stati, senza ripetere la mutazione.

Dopo il successo vengono aggiornati snapshot e storico; se il target è l'azienda attiva si rilegge anche il profilo M3D, che azzera i dati delle pagine alla nuova versione. Un target diverso non sostituisce le capacità dell'azienda attiva. Risposte di pagine smontate non aggiornano il nuovo contesto. L'anteprima HTTP può essere richiamata separatamente e non è un token di autorizzazione: anche l'API Apply diretta esige superadmin, motivo, piano e versione validi.

## Migrazione 017 e provisioning

`017_20260930__activate_company_modules.sql` è una nuova migrazione, identica nelle cartelle backend e database. Rimuove il trigger `companies_provision_legacy_modules` e le due funzioni di provisioning legacy. Non modifica saldi, registri, versioni, dati collegati o eventi e non cambia i checksum delle migrazioni precedenti.

Su upgrade da una versione precedente alla 016, la 016 conserva le funzionalità delle aziende esistenti, poi la 017 elimina il provisioning futuro. Se la 016 è già applicata, la 017 conserva tutti gli stati già registrati, anche `disabled` e `read_only`. Dopo l'upgrade ogni nuova azienda parte con Base, versione 0 e nessun evento di attivazione opzionale: righe opzionali mancanti significano disattivato. Questo vale per creazione API, SQL e bootstrap, inclusa la creazione con conti/categorie predefiniti.

La riattivazione crea o aggiorna il registro e rende nuovamente accessibili i dati conservati; non ricrea anagrafiche o movimenti. I moduli futuri Family Office/Investimenti e le relative dipendenze restano non disponibili fino alle rispettive fasi.

I test che esercitano dati di aziende precedenti configurano esplicitamente quelle fixture con `seedLegacyModules`. Il helper è solo nei test: non reinstalla il trigger rimosso e non cambia il default produttivo. I nuovi test di provisioning e migrazione esercitano invece il default reale Base-only.

## Verifiche

Dieci nuovi casi HTTP/PostgreSQL coprono creazione SQL/API/bootstrap, piano atomico e isolamento del target, ruoli e input, no-op, transizioni complete con dati storici/saldi/configurazioni/snapshot, piani concorrenti, rollback dell'audit, revoca del superadmin durante l'attesa del lock e upgrade/idempotenza della migrazione. Le regressioni precedenti continuano a verificare import, generazione delle ricorrenze e concorrenza con i moduli.

Sette nuovi casi DOM coprono motivo/anteprima obbligatori, payload esatto e refresh del contesto, target separato, doppio clic, invalidazione del draft, conflitto senza retry e risposte dopo smontaggio. Frontend verificato localmente: 47 test logici, 126 DOM e build Vite; 14 test puri backend, sintassi, schema/dashboard duplicati e whitespace. Suite backend completa su PostgreSQL 18 e immagini Docker sono verificate in CI; PostgreSQL e Docker non sono disponibili localmente.

## Collaudo prima della release

Usare esclusivamente l'installazione di collaudo separata dalla produzione. Riferimento operativo: backup verificato della produzione v1.8.0 e stato finale M3E; niente modifiche manuali agli stati SQL. Annotare tag/digest effettivo delle immagini frontend/backend, data del backup e risultato di ogni prova.

1. Creare una copia coerente di database e uploads (allegati, loghi e icone) e conservare la configurazione necessaria al ripristino. Ripristinarla nell'installazione di collaudo con volumi e porte propri. Tenere ferma la produzione durante la copia se la procedura scelta lo richiede.
2. Prima dell'upgrade annotare saldi, numero di movimenti, anagrafiche, ricorrenze e report salvati per almeno un'azienda reale. Aggiornare soltanto il collaudo alla versione candidata M3E. Verificare healthcheck, esecuzione della 017 e assenza di errori di checksum; confrontare dati e branding con i valori annotati.
3. Verificare che le aziende esistenti conservino i moduli attivi. Creare dal pannello una nuova azienda: solo Base visibile, optional disattivati, funzioni Base utilizzabili. Attivare Commesse e Immobiliare con il superadmin e verificare disponibilità, motivo e autore nello storico. Un admin aziendale deve poter consultare gli stati senza applicarli.
4. Sull'azienda di collaudo con dati collegati, provare `enabled → read_only → disabled → enabled`. In sola lettura mantenere consultazione/export e bloccare modifiche specifiche e generazione collegata. Da disattivato verificare route dirette, template/report/snapshot specifici bloccati e prima nota/saldi/report Base ancora completi. Modificare un campo Base e verificare che i link storici siano conservati. Riattivare e confrontare gli stessi ID e conteggi: nessuna duplicazione.
5. Con due sessioni superadmin, preparare due anteprime alla stessa versione. Applicare la prima: la seconda deve ricevere conflitto e richiedere una nuova anteprima. Provare cambio azienda, utente di sola consultazione, allegati, personalizzazioni e ricorrenze Base/collegate. Se si abilita temporaneamente il generatore nel collaudo, annotarlo e riportarlo alla configurazione prevista.
6. Verificare il ripristino del backup pre-upgrade su un'ulteriore copia isolata, controllando dati e uploads. Conservare inoltre un backup della versione candidata e verificarne il ripristino con codice M3E compatibile. Annotare gli esiti prima di preparare la release.

Solo dopo esito positivo del collaudo: scegliere la versione di release, creare il tag e aggiornare la produzione con backup verificato e immagini fissate a quella versione. Le build main/latest non sostituiscono questo passaggio. Dopo disattivazioni reali una release precedente che ignora gli stati non è un rollback sicuro: usare una correzione compatibile o un ripristino coordinato di codice e backup del checkpoint pre-upgrade, con gli effetti sui dati successivi esplicitamente valutati.
