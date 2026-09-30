# F5A-M3D — Interfaccia guidata dalle capacità aziendali

Quarto blocco degli adapter M3, dopo il merge M3C (#156). Collega menu, route, form, selettori, report e widget alle capacità dell'azienda e del ruolo verificati dal server. `enforcement_ready` resta false, nessuna API pubblica di applicazione dei piani e nessuna nuova migrazione. Il trigger di compatibilità M1 continua ad abilitare Commesse e Immobiliare per aziende esistenti e nuove: questa PR non disattiva moduli e non richiede una release o un aggiornamento NAS.

## Profilo del contesto corrente

`GET /api/modules/current` richiede autenticazione e appartenenza attiva all'azienda selezionata tramite `X-Company-Id` o default della sessione; è disponibile anche ai ruoli di sola consultazione. Restituisce lo snapshot coerente del registro (azienda, versione decimale, catalogo e stati), il ruolo aziendale letto dal database e le azioni ammesse per ogni capacità. Le azioni distinguono lettura, scrittura, cancellazione, export, import anagrafiche e import movimenti. I moduli futuri e i registri opzionali mancanti non concedono capacità; il superadmin non aggira gli stati.

Il profilo è richiesto con `cache: no-store` e restituito con `Cache-Control: no-store`. Non è un'autorizzazione persistente: tutte le route continuano a verificare ruolo e moduli correnti sul backend. Il browser non può concedere accesso tramite stati, capacità o ruoli forniti nella richiesta.

## Comportamento dell'interfaccia

| Area | Modulo disattivato | Modulo in sola lettura |
| --- | --- | --- |
| Anagrafiche | Tab opzionale nascosta, nessuna query dell'elenco; ingresso su anagrafica Base | Consultazione, dettaglio ed export secondo il ruolo; nessuna creazione, modifica, cancellazione o import |
| Dettagli Commessa/Immobile | Route bloccata prima del montaggio della pagina | Dettagli e riepiloghi consultabili; nessuna creazione di movimenti collegati; CSV Commesse secondo il ruolo |
| Prima nota e ricorrenze | Nessuna query delle anagrafiche opzionali; collegamenti storici visibili come riferimenti bloccati | Selettori leggibili ma non modificabili; campi Base ancora modificabili |
| Report avanzati | Dimensioni e filtri opzionali nascosti, template specifici disabilitati, report Base disponibili | Esecuzione/export permessi; salvataggio, sostituzione e cancellazione delle configurazioni specifiche bloccati |
| Dashboard | Dimensione Commesse disabilitata; riepiloghi e dimensioni Base disponibili | Dimensione Commesse consultabile |

La modifica Base di un movimento o una ricorrenza omette dal payload i collegamenti non scrivibili: il backend conserva il riferimento precedente. Non invia `null` e non sostituisce il collegamento con un valore vuoto. Per un collegamento storico assente dagli elenchi il form conserva un'opzione con il riferimento esistente. La cancellazione di un movimento con collegamenti non cancellabili non è proposta. La sospensione della generazione delle ricorrenze resta calcolata dal backend M3B e non impedisce le ricorrenze Base.

Un deep link Prima nota con filtro di un modulo disattivato mostra il motivo e non avvia una query senza quel filtro. Nei report salvati si verifica sia la specifica precedente sia quella nuova prima di proporre aggiornamenti: passare il draft a una dimensione Base non rende sostituibile un report specifico in sola lettura. Export e drilldown continuano a riferirsi al risultato applicato.

## Cambio azienda, sessione e aggiornamento del profilo

Il provider parte senza capacità e carica il profilo prima di montare le pagine protette. Al cambio azienda o sessione cancella immediatamente il profilo precedente; un errore lascia le pagine bloccate con possibilità di riprovare. Ogni richiesta di profilo ha una generazione e una revisione del contesto: risposte precedenti, incluse sequenze A → B → A, non sostituiscono il profilo corrente.

La visibilità della scheda, il ritorno di focus e i rifiuti `MODULE_DISABLED`, `MODULE_READ_ONLY`, `MODULE_UNAVAILABLE` e `MODULE_DEPENDENCY_MISSING` provocano una rilettura. Il ruolo del profilo aggiorna il ruolo usato dall'interfaccia. Una variazione di azienda, versione o ruolo rimonta le pagine e azzera form, filtri, lookup e risultati del contesto precedente; un refresh invariato conserva i draft. Non è previsto polling continuo: un cambio remoto senza eventi visibili viene recepito al focus o al successivo rifiuto, mentre il backend protegge comunque ogni operazione.

Anche il client API controlla revisione e azienda prima della richiesta, dopo la risposta e dopo la lettura JSON/blob. Una risposta obsoleta non aggiorna dati, non scarica un CSV e non forza il logout della nuova sessione. Il rinnovo del token non può sovrascrivere una sessione o azienda cambiata mentre era in corso. Se manca una selezione iniziale può adottare il default verificato dal rinnovo; se invece perde un'azienda già selezionata sceglie il nuovo default ma non ripete lì l'operazione della vecchia azienda. I download delle pagine smontate vengono scartati. I rifiuti JSON delle risposte blob conservano codice e dettagli dei moduli.

## Verifiche

Sei nuove regressioni del client API coprono risposte obsolete, sequenza A → B → A, 401, rinnovo concorrente con cambio sessione, perdita dell'azienda e parsing/download CSV. Ventuno nuovi casi DOM coprono profilo inizialmente negato, race e retry, revoca/ruolo al focus, errori del server, reset/conservazione dei draft, menu e route, collegamenti storici, report salvati e widget. Totale frontend: 47 test logici e 118 DOM; build, sintassi e whitespace verificati localmente.

Cinque nuovi casi HTTP/PostgreSQL verificano versione/stati, capacità in sola lettura e disattivate, superadmin senza bypass, ruoli correnti, isolamento e revoca delle appartenenze, registri mancanti e moduli futuri. La suite backend completa su PostgreSQL 18, regressioni di distribuzione e immagini Docker viene verificata in CI; PostgreSQL e Docker non sono disponibili localmente.

## Prossimo blocco M3

Aprire l'applicazione dei piani al solo superadmin con anteprima, motivo e versione attesa; aggiungere una nuova migrazione per rimuovere il trigger di compatibilità e avviare nuove aziende con il solo Base. Le aziende esistenti conservano gli stati già registrati. Collaudo upgrade, backup/restore e transizioni prima della release operativa. Non modificare manualmente gli stati in questa fase preparatoria; dopo disattivazioni reali una release che ignora i moduli non è un rollback sicuro.
