# F4.6 — Esportazione coerente e report salvati

## Risultato applicato e CSV

L'esecuzione restituisce `export_snapshot: { id, expires_at }` agli utenti con permesso export. Il frontend invia esclusivamente `snapshot_id` al download: non ripete la query e non usa i filtri modificati nella bozza. Il CSV conserva le righe restituite dal report, ordine, centesimi, valori null e limite; i totali globali rimangono separati dalle righe, come nell'export precedente. In caso di troncamento il CSV contiene solo le righe mostrate, non il totale completo. Sono disponibili gli header `X-Report-Generated-At` e `X-Report-Truncated`.

Snapshot privati per coppia azienda/utente, UUID casuale, permessi e appartenenza aziendale verificati nuovamente a ogni richiesta. Durata massima 15 minuti, 10 risultati per utente/azienda, 200 risultati e 32 MiB di CSV per processo. L'export non prolunga la durata. Scadenza, rimozione o identificativo non accessibile restituiscono 410 con `REPORT_SNAPSHOT_EXPIRED`: nessuna riesecuzione silenziosa.

La memoria è locale al processo: riavvio o richieste dirette a una replica diversa richiedono una nuova esecuzione. Questa soluzione serve l'installazione a singolo backend; prima di scalare a più repliche occorre uno store condiviso con gli stessi vincoli. Non è un archivio storico persistente. Risultati eccedenti il limite di memoria possono essere visualizzati ma richiedono un report più ristretto per esportare.

Compatibilità: l'endpoint continua ad accettare una specifica completa dai vecchi client, con il comportamento storico di rilettura del database. Solo il percorso con snapshot garantisce l'identità con il risultato mostrato. Report salvati conservano configurazioni, non snapshot; aprirli genera sempre dati nuovi.

## Report salvati

Ricerca per nome senza distinzione maiuscole/minuscole, stato vuoto e segnalazione degli errori di caricamento, salvataggio e cancellazione. Le regole backend esistenti continuano a isolare l'azienda e a limitare modifiche/cancellazioni a proprietario o amministratore.

## Collaudo e Gate B

Test automatici per congelamento CSV, scadenza, isolamento, limiti di memoria, permessi HTTP, modifica dati dopo l'esecuzione, export scaduto senza riesecuzione e ricerca/apertura di una configurazione salvata. Suite frontend e build locale; golden HTTP verificati dalla CI su PostgreSQL 18.

Il Gate B non è dichiarato chiuso: resta la verifica visiva dei grafici F4.5 su desktop/mobile e il collaudo operativo con dati aziendali (template, filtri, CSV, report salvati). Il formato implementato è CSV; XLSX non viene introdotto in questa PR. Nessuna migrazione o deploy. Le abilitazioni per azienda restano nella successiva F5A.
