# F5A-M3B — Importazioni, esportazioni e ricorrenze

Secondo blocco degli adapter M3, dopo il merge M3A (#154). Il pannello resta di consultazione e anteprima: `enforcement_ready:false`, nessuna API pubblica di applicazione dei piani, nessuna migrazione nuova. Il trigger di compatibilità M1 continua ad abilitare Commesse e Immobiliare per le aziende esistenti e nuove.

## Importazioni ed esportazioni

- CSV di Commesse e Immobili: lettura/esportazione consentita in `enabled` e `read_only`, negata in `disabled`, incluso HEAD e superadmin. Importazioni consentite solo in `enabled`, sempre dopo membership e permesso del ruolo.
- Export e import prendono il lock condiviso aziendale e rileggono gli stati nello stesso client. Il cambio di stato prende il lock esclusivo e attende la conclusione delle operazioni precedenti. Nessuna autorizzazione in cache o stato passato dal browser.
- Export Base di movimenti e ricorrenze mantiene i codici storici minimi dei collegamenti, con join Commesse/Immobili vincolati all'azienda; nessun indirizzo, nota privata o budget del modulo viene incluso.
- CSV delle ricorrenze aggiunge `property_external_id` e `job_code`, risolti solo nell'azienda corrente. Colonna assente conserva il collegamento; colonna presente e vuota lo rimuove. Assegnazione, sostituzione e rimozione richiedono il modulo scrivibile. Omissione di `is_active` conserva lo stato esistente; una nuova ricorrenza è attiva per default. Riattivare una ricorrenza collegata richiede tutti i moduli collegati scrivibili.
- L'import generico usa savepoint per riga: un errore SQL annulla quella riga e permette alle altre valide di proseguire, con conteggi effettivi. Un diniego relativo ai moduli annulla invece tutto il file, comprese le righe precedenti. Audit e dati sono nella medesima transazione.
- Il wizard CSV di Prima nota applica un controllo preventivo sui collegamenti richiesti dall'intero file, quindi blocca atomicamente il batch se un modulo non è scrivibile. I conti sono bloccati in ordine stabile prima delle scritture. Una commessa sconosciuta produce una riga scartata motivata, senza perdere silenziosamente il collegamento. L'audit precede il commit.
- L'endpoint generico di import dei movimenti continua a rimandare al wizard dedicato; il ramo SQL ormai irraggiungibile viene rimosso per evitare un futuro percorso senza registrazioni contabili e saldi.

## Ricorrenze e generatore

- CRUD con lock aziendale prima del template, validazione dei riferimenti e audit sullo stesso client. PUT preserva i collegamenti omessi, distingue null esplicito e alias concordanti, controlla anche la riattivazione. Riferimenti invariati sono conservati anche in `read_only`/`disabled`.
- Disattivazione e cancellazione logica restano consentite ai ruoli già autorizzati anche con modulo collegato bloccato: fermano la ricorrenza e conservano i dati e i collegamenti. Non consentono la rimozione o sostituzione del riferimento.
- Generazione singola, batch manuale e worker globale rileggono gli stati sotto lock per ogni azienda/template. Un modulo collegato non scrivibile produce `module_suspended` con codice e modulo, senza modificare `is_active`, collegamenti, scadenza, ultimo avvio, esecuzioni, movimenti o saldi. Riferimenti storici a un'altra azienda producono `RECURRING_INVALID_REFERENCE` e non generano movimenti.
- La sospensione è calcolata dagli stati correnti, senza un flag persistente aggiuntivo. Riabilitare il modulo permette di riprendere dalla scadenza conservata; l'unicità template/ciclo impedisce duplicazioni. Le ricorrenze prive di collegamenti opzionali restano Base.
- `RECURRING_GENERATOR_ENABLED` ha precedenza sugli stati dei moduli: solo `true` abilita il servizio. Ora anche chiamate HTTP manuali e chiamate dirette al servizio rispettano il flag, coerentemente con i pulsanti già disabilitati nell'interfaccia. Con `false` il servizio restituisce `RECURRING_GENERATOR_DISABLED` prima di accedere al database; non basta un modulo attivo per riaccenderlo. La configurazione del NAS non viene modificata.
- Generazione, esecuzione, aggiornamento del template, movimento, registrazione sul conto, saldo e audit sono atomici. Un errore di audit annulla tutte queste scritture.

## Interfaccia e verifiche

La schermata Ricorrenze mostra motivo della sospensione e filtro dedicato, disabilita generazione/riattivazione e permette di fermare la ricorrenza. Continua a funzionare se gli elenchi opzionali rispondono `MODULE_DISABLED`, preservando i riferimenti storici durante la modifica. Altri errori di accesso continuano a essere mostrati. Messaggi tradotti in italiano e inglese.

Test puri della policy, collegamenti e precedenza del flag tecnico; 14 casi PostgreSQL/HTTP per import/export, ruoli, isolamento aziendale, savepoint, batch atomici, omissione/null, sospensione, riattivazione, saldi, riferimenti esterni e rollback audit. Due prove di concorrenza osservano i lock reali in `pg_stat_activity`: import e worker concludono prima di una revoca già in attesa, mentre le operazioni successive sono bloccate. Tre nuovi test DOM coprono sospensione, riferimenti storici e errori di accesso.

Test frontend (41 logici e 92 DOM), build, test puri backend, sintassi e whitespace verificati localmente. La suite completa PostgreSQL 18 e le build Docker vengono validate in CI; PostgreSQL e Docker non sono disponibili nell'ambiente locale.

## Seguito M3

1. Report normalizzati e salvati, budget, `qualityDimensions`, snapshot esistenti e download, dashboard con dimensioni dei moduli.
2. Capacità su menu, route, selettori, form e widget; completamento dell'interfaccia in sola lettura.
3. Applicazione superadmin con motivo/versione e migrazione che rimuove il trigger di compatibilità, provisioning delle nuove aziende con il solo Base, collaudo upgrade/restore prima del rollout.

M3B non richiede una nuova release o aggiornamento NAS e non completa ancora M3. Non modificare manualmente gli stati nel database durante questa fase preparatoria.
