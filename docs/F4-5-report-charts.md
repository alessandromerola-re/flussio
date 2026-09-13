# F4.5 — Grafici e layout dei report

Grafici Chart.js con selettore linee, barre, barre impilate e torte. I dati provengono dal risultato applicato: cambiare i filtri nella configurazione non cambia il grafico fino alla successiva esecuzione. Le metriche restano selezionabili tra quelle eseguite.

- Serie temporali ordinate cronologicamente, importi in euro e valori negativi conservati.
- Due raggruppamenti trasformati in serie separate per le sole metriche additive; le medie non vengono sommate. Gruppi distinti con lo stesso nome sono disambiguati nel pivot.
- Celle mancanti nel pivot valgono zero solo per risultati completi; per risultati troncati restano mancanti e compare un avviso.
- Torte disponibili solo per una composizione additiva non negativa, senza valori mancanti; dati incompatibili producono una spiegazione, senza trasformare i negativi in valori assoluti.
- Budget: confronto previsto/consuntivo con scelta costi, ricavi o margine. Budget non definiti restano mancanti.
- YoY e MoM: due serie cronologiche, corrente e precedente. Qualità: conteggi per dimensione senza sommarli.
- Desktop: configurazione e report salvati affiancati ai risultati. Sotto 1100px il layout passa a una colonna. Fino a 768px le righe sono schede espandibili con valori esatti e accesso ai movimenti, compreso il periodo precedente.
- Tabella desktop e dettagli mobile rendono accessibili i valori senza dipendere dal canvas. Etichette e spiegazioni IT/EN.

Nessuna nuova dipendenza, migrazione o modifica alle API. I grafici usano i risultati già disponibili: la coerenza dello snapshot tra richieste distinte resta nel successivo F4.6. Le abilitazioni dei moduli restano in F5A.

Verifica: suite frontend logica e DOM, build di produzione. Verifica visiva nel browser e su dispositivo reale ancora da completare: Chromium non è disponibile nell'ambiente locale.
