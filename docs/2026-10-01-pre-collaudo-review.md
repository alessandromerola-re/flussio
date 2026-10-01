# Revisione pre-collaudo — 1 ottobre 2026

Base revisionata: `main` al commit `7f3368504fc8509f68713c0de5571ee81a63fcb1`, merge della PR #158 (F5A-M3E). Ramo di lavoro: `codex/pre-collaudo-review`.

La revisione attraversa contabilità, anagrafiche, import/export, ricorrenze, allegati, date, permessi/moduli, migrazioni e procedure operative. Le correzioni riguardano difetti concreti del codice; non certificano l'assenza di ogni possibile bug né sostituiscono il collaudo del NAS. Produzione e dati reali non sono stati modificati.

## Riscontri e correzioni

| Priorità | Problema riscontrato | Comportamento corretto |
|---|---|---|
| Alta | POST/PUT Movimenti accettavano quote sui conti diverse dal totale, direzioni incoerenti, frazioni di centesimo e payload account malformati. | Validazione esatta in centesimi prima di qualsiasi scrittura; giroconti bilanciati fra conti distinti; errori 400 senza modificare saldi o movimenti. |
| Alta | Modificare la descrizione di un movimento ripartito lo ricostruiva interamente sul primo conto. | L'editor conserva tutte le quote originali. Per queste operazioni mostra le quote e consente modifiche descrittive/collegamenti, mantenendo bloccati tipo, importo e conti. Un editor completo delle quote è un'evoluzione successiva. |
| Alta | Categoria madre e categoria predefinita del contatto potevano appartenere a un'altra azienda; alcune letture mostravano i metadati di collegamenti storici errati. | Validazione aziendale su creazione/modifica e join limitati all'azienda; gerarchie senza cicli o direzioni incompatibili, anche nei CSV. Scritture delle categorie serializzate sul lock aziendale. |
| Alta | Export/reimport di un movimento ripartito trasferiva l'intero importo al primo conto. | Colonna CSV `account_allocations` con nomi, direzioni e quote; ripartizione ricostruita e validata. I vecchi CSV multi-conto senza quote vengono segnalati e scartati, non reinterpretati. |
| Media | Il parser divideva i campi CSV con note multilinea; l'import Contatti ignorava la categoria predefinita esportata. | Parser di record logici con virgolette/escape/CRLF, righe fisiche negli errori, rifiuto delle virgolette non chiuse prima della transazione; categoria predefinita conservata. Date degli export normalizzate. |
| Alta | Le ricorrenze importate partivano da NOW invece dalla prima scadenza; modifiche descrittive potevano riavvolgere la scadenza; i cicli già eseguiti potevano bloccare il generatore. | Import e CRUD condividono la validazione; prima scadenza calcolata, scadenza esistente preservata per modifiche non di calendario, avanzamento dei cicli già eseguiti senza duplicare movimenti/saldi. |
| Alta | Il controllo della data finale delle ricorrenze non gestiva i valori DATE restituiti dal driver come oggetti Date. | Date del database interpretate correttamente e fine ricorrenza rispettata. Flag tecnico del generatore invariato e predefinito spento. |
| Media | Dashboard e confronto precedente usavano mezzanotte locale e intervalli da 24 ore; ora legale/fuso potevano spostare date e numero di giorni. | Calendario in UTC per i calcoli, giorno corrente determinato in Europe/Rome; test sul cambio d'ora. Date impossibili respinte anche nei filtri Movimenti/Commesse/Report. |
| Media | Audit degli allegati eseguito dopo COMMIT: un errore poteva mostrare fallimento dopo avere già salvato/cancellato. Upload falliti potevano lasciare file orfani. | Dati e audit nella stessa transazione; pulizia dei file di upload se il fallimento precede COMMIT. Se l'esito del COMMIT è incerto si conserva il file per evitare di rimuovere un allegato registrato. |
| Alta | `backup.sh` mascherava gli errori di pg_dump nella pipeline interna; restore senza ON_ERROR_STOP poteva dichiarare successo su SQL fallito o riutilizzare un database preesistente. | Pipeline controllata con pipefail, file temporaneo e nessuna sovrascrittura; ripristino transazionale con ON_ERROR_STOP su database temporaneo univoco e pulizia verificata. Gli script coprono il database: uploads restano da copiare/verificare separatamente. |
| Media | ID azienda fuori intervallo e saldi iniziali non numerici/non rappresentabili arrivavano a PostgreSQL. | Errori di validazione prima delle query. |

Nessuna migrazione nuova, modifica ai checksum precedenti o dipendenza applicativa aggiunta. Il catalogo dei moduli, gli stati delle aziende, il flag delle ricorrenze e la configurazione NAS non vengono modificati.

## Verifiche

- Frontend: **47 test di logica e 127 test DOM superati**, build Vite di produzione riuscita. Inclusa la regressione sulla modifica descrittiva dei movimenti ripartiti.
- Backend: **167 test della suite generale superati** e **25 prove mirate superate** su import, ricorrenze e correzioni di questa revisione. Le due esecuzioni si sovrappongono per 12 casi: non sono 192 casi distinti.
- I test backend con database sono stati eseguiti con un adattatore temporaneo verso **PGlite**, isolato dal repository e dalle dipendenze dell'applicazione, con fuso UTC. I casi di concorrenza, attesa su lock e accodamento sono stati esclusi: l'adattatore serializza le connessioni e non può verificarli. PostgreSQL nativo e Docker non erano disponibili nell'ambiente locale. La suite completa `npm test` del backend resta da eseguire nella CI con PostgreSQL 18.
- **7 test mirati senza database superati** su validazione importi, parser CSV, calendario/ora legale e gestione degli errori di backup/restore. Sono compresi anche nella suite generale sopra indicata.
- Controlli di sintassi JavaScript/shell, duplicati dello schema e della dashboard, e `git diff --check` superati.
- Diagnostica `pre-collaudo-data-check.sql`: sei istruzioni eseguite correttamente sullo schema migrato vuoto in PGlite; verifica di compatibilità SQL, non verifica dei dati reali.
- Nessuna prova effettuata sui dati reali; nessuna verifica visiva su browser/dispositivo o ripristino reale eseguito. Le garanzie di lock, concorrenza e interoperabilità del driver PostgreSQL richiedono la CI nativa, oltre al successivo collaudo operativo.

## Prima del collaudo operativo

1. Pubblicare il ramo e aprire la PR; richiedere esito positivo della CI PostgreSQL 18 e delle build Docker prima del merge.
2. Eseguire `docs/pre-collaudo-data-check.sql` sulla copia isolata dei dati reali: queste correzioni prevengono nuovi errori ma non ricostruiscono automaticamente eventuali ripartizioni già alterate. Ogni anomalia storica richiede confronto con i documenti originali.
3. Nel NAS di collaudo provare un movimento ripartito: modifica descrizione, export/reimport su dati di prova, saldi e report per conto devono restare coerenti. Verificare categorie, note CSV multilinea e allegati.
4. Eseguire il percorso F5A-M3E già documentato: aziende esistenti, nuova azienda Base-only, enabled → read_only → disabled → enabled, ruoli differenti, sessioni/cambio azienda, saldi/report Base invariati.
5. Provare backup e ripristino reali di database **e uploads**, incluso branding; annotare immagini/digest, conteggi e saldi. Le prove sugli script con comandi simulati verificano gli errori di orchestrazione, non l'integrità di un backup del NAS.
6. Mantenere il generatore ricorrenti spento in produzione. Un eventuale test con generazione attiva va eseguito esclusivamente nell'ambiente isolato e poi ricondotto alla configurazione prevista.

## Limiti e passi successivi

- Verifica visiva desktop/telefono reale, Docker e restore effettivo sul NAS ancora da eseguire.
- I campi temporali storici TIMESTAMP senza fuso mantengono lo schema esistente; questa revisione non migra gli orari archiviati. L'ambiente di produzione deve mantenere un fuso coerente fra backend e database; in CI le fixture usano UTC.
- L'editor di movimenti ripartiti preserva le quote; una UI dedicata alla modifica delle singole quote resta un miglioramento futuro.
- Gli snapshot dei report restano in memoria con i limiti documentati in F4.6; riavvio o replica richiedono nuova esecuzione. Nessun cambio architetturale introdotto.
- Pubblicazione del ramo e apertura della PR autorizzate dall'utente il 1 ottobre 2026, dopo il blocco iniziale della revisione automatica. Gli esiti della CI nativa saranno riportati nella PR.
