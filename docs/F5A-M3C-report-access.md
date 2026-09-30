# F5A-M3C — Report, snapshot e dashboard

Terzo blocco degli adapter M3, dopo il merge M3B (#155). `enforcement_ready` resta false, il pannello non applica piani e il trigger di compatibilità M1 resta presente. Nessuna nuova migrazione o configurazione NAS.

## Capacità dei report

`modules/reportAccess.js` deriva le capacità dalla specifica normalizzata dal server: Base sempre, Commesse per raggruppamento/filtro job, budget e qualità della dimensione job; Immobiliare per raggruppamento/filtro property e qualità della dimensione property. Un report combinato richiede tutti i moduli coinvolti. Alias dei filtri vengono normalizzati prima del controllo; eventuali liste di capacità o stati fornite dal browser non concedono accesso.

Esecuzione, CSV legacy e configurazioni salvate usano la stessa funzione. `read_only` permette consultazione, esecuzione ed export ai ruoli già autorizzati; `disabled` blocca i report specifici. I confronti YoY/MoM e i report qualità Base continuano a funzionare se non richiedono dimensioni opzionali. I movimenti collegati non sono esclusi dai totali Base.

Riepilogo Commessa e CSV della Commessa, incluso `scope=movements` e HEAD, richiedono `job_reports`. La torta dashboard con dimensione job richiede la stessa capacità; riepiloghi e dimensioni category/contact/account restano Base. I join delle etichette sono vincolati all'azienda anche in presenza di riferimenti storici incoerenti.

## Snapshot e configurazioni salvate

Gli snapshot memorizzano una copia delle capacità derivate dalla specifica effettivamente eseguita, insieme al CSV immutabile. La modifica del risultato originale o dei metadati restituiti dal getter non altera questa copia. Risultati senza una specifica valida non producono snapshot. Restano validi limiti di memoria, numero, proprietario, scadenza e isolamento per azienda/utente; un risultato scaduto non avvia una nuova query.

Il download ricontrolla permesso corrente e moduli attuali sotto lock, anche per risultati precedenti a una disattivazione. Il body non può sostituire le capacità dello snapshot con una specifica Base. La riattivazione permette nuovamente il download dei dati originali se lo snapshot è ancora disponibile; non lo ricalcola. Gli snapshot Base rimangono scaricabili dopo la disattivazione di moduli opzionali.

Le configurazioni salvate non vengono cancellate alla disattivazione. L'elenco conserva i metadati visibili secondo proprietà/condivisione e aggiunge `module_access`; per un report bloccato omette la configurazione eseguibile (`spec_json:null`). In sola lettura mantiene la specifica consultabile. Creazione, aggiornamento e cancellazione richiedono invece i moduli scrivibili: UPDATE verifica sia specifica precedente sia nuova, per impedire la rimozione implicita di un requisito bloccato. Proprietà, ruolo admin e permesso export restano quelli esistenti.

## Coerenza e concorrenza

Le operazioni protette usano `REPEATABLE READ`, lock FOR SHARE sull'azienda prima delle query e stessa connessione fino al commit. PostgreSQL impedisce FOR SHARE nelle transazioni dichiarate READ ONLY: il nuovo helper mantiene l'isolamento del report senza quella dichiarazione. Le route di lettura eseguono soltanto letture; le mutazioni delle configurazioni salvate partecipano al medesimo protocollo e bloccano il record dopo l'azienda.

Le transizioni dei moduli prendono FOR UPDATE e attendono la conclusione dei report precedenti. Se una transizione modifica l'azienda mentre un report attende il lock, PostgreSQL può restituire `40001`; il helper ripete l'intera transazione, fino a tre tentativi, rileggendo stati e dati da uno snapshot nuovo. Non riutilizza un'autorizzazione precedente. Risposte e scrittura della cache snapshot avvengono solo dopo il commit, senza effetti esterni dentro un tentativo ripetibile.

## Interfaccia e verifiche

Report avanzati e dashboard mostrano i messaggi dei moduli. Un report salvato bloccato rimane nell'elenco, con motivo e apertura disabilitata. L'assenza degli elenchi opzionali per `MODULE_DISABLED` non impedisce i report Base; gli altri errori non sono nascosti. Un CSV rifiutato non produce un download e una sezione dashboard bloccata non cancella i riepiloghi Base.

Verifiche locali: test puri delle capacità, snapshot e policy, frontend (41 test logici e 97 DOM), build, sintassi e whitespace. La suite PostgreSQL 18, regressioni e build Docker vengono validate in CI; PostgreSQL e Docker non sono disponibili localmente.

Dodici nuovi casi HTTP/PostgreSQL coprono gruppi/alias, budget, qualità, Base, export, HEAD, ruoli, isolamento, snapshot congelati, revoca/riattivazione, configurazioni salvate e registri mancanti. Due prove di concorrenza osservano i lock reali in `pg_stat_activity`: un report in lettura conclude prima della revoca accodata; esecuzione e download in attesa di una transizione vedono invece il blocco dopo il commit, con nuovo tentativo della transazione. La seconda prova sospende il servizio reale di transizione con un trigger/advisory lock di test, senza simulare manualmente gli aggiornamenti di stato.

## Seguito M3

Allineare capacità su menu, route, selettori, form, template e widget, con gestione della sola lettura e delle risposte obsolete al cambio azienda. Poi aprire l'applicazione superadmin con motivo/versione, rimuovere il trigger di compatibilità mediante una nuova migrazione e avviare nuove aziende con il solo Base. Collaudo upgrade/restore prima del rollout operativo.

M3C non richiede una release o aggiornamento NAS e non rende ancora operativi i cambi di stato dal pannello. Non modificare manualmente gli stati nel database durante questa fase preparatoria.
