-- Diagnostica in sola lettura, da eseguire sulla copia di collaudo.
-- Nessuna correzione automatica: confrontare le anomalie con i documenti originali.
BEGIN READ ONLY;

-- Importo dichiarato e quote sui conti devono coincidere.
WITH legs AS (
  SELECT t.id, t.company_id, t.type, ABS(t.amount_total) AS total,
    COALESCE(SUM(ta.amount) FILTER (WHERE ta.direction='in'),0) AS incoming,
    COALESCE(SUM(ta.amount) FILTER (WHERE ta.direction='out'),0) AS outgoing,
    COUNT(ta.id) AS leg_count,
    COUNT(ta.id) FILTER (WHERE a.id IS NULL OR a.company_id<>t.company_id OR ta.amount<=0) AS invalid_legs
  FROM transactions t LEFT JOIN transaction_accounts ta ON ta.transaction_id=t.id
  LEFT JOIN accounts a ON a.id=ta.account_id
  GROUP BY t.id
)
SELECT * FROM legs WHERE leg_count=0 OR invalid_legs>0 OR total<=0
  OR (type='income' AND (incoming<>total OR outgoing<>0))
  OR (type='expense' AND (outgoing<>total OR incoming<>0))
  OR (type='transfer' AND (incoming<>total OR outgoing<>total))
ORDER BY company_id,id;

-- Collegamenti anagrafici tra aziende diverse o direzioni incompatibili.
SELECT 'category_parent' AS relationship, c.company_id, c.id AS entity_id, c.parent_id AS target_id
FROM categories c JOIN categories p ON p.id=c.parent_id
WHERE c.company_id<>p.company_id OR c.direction<>p.direction
UNION ALL
SELECT 'contact_default_category', c.company_id, c.id, c.default_category_id
FROM contacts c JOIN categories cat ON cat.id=c.default_category_id WHERE c.company_id<>cat.company_id
UNION ALL
SELECT 'movement_category', t.company_id, t.id, t.category_id
FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.company_id<>c.company_id
UNION ALL
SELECT 'movement_contact', t.company_id, t.id, t.contact_id
FROM transactions t JOIN contacts c ON c.id=t.contact_id WHERE t.company_id<>c.company_id;

-- Cicli storici nell'albero categorie: ogni cammino termina al primo ciclo.
WITH RECURSIVE ancestors AS (
  SELECT id AS origin_id,company_id,id,parent_id,ARRAY[id] AS path,false AS cycle FROM categories
  UNION ALL
  SELECT a.origin_id,a.company_id,c.id,c.parent_id,a.path||c.id,c.id=ANY(a.path)
  FROM ancestors a JOIN categories c ON c.id=a.parent_id AND c.company_id=a.company_id
  WHERE NOT a.cycle
)
SELECT DISTINCT company_id,origin_id FROM ancestors WHERE cycle ORDER BY company_id,origin_id;

-- Saldi memorizzati diversi da saldo iniziale + quote dei movimenti aziendali.
SELECT a.company_id,a.id,a.balance,
  a.opening_balance+COALESCE(SUM(CASE WHEN t.id IS NULL THEN 0 WHEN ta.direction='in' THEN ta.amount ELSE -ta.amount END),0) AS calculated_balance
FROM accounts a LEFT JOIN transaction_accounts ta ON ta.account_id=a.id
LEFT JOIN transactions t ON t.id=ta.transaction_id AND t.company_id=a.company_id
GROUP BY a.id
HAVING a.balance<>a.opening_balance+COALESCE(SUM(CASE WHEN t.id IS NULL THEN 0 WHEN ta.direction='in' THEN ta.amount ELSE -ta.amount END),0)
ORDER BY a.company_id,a.id;

ROLLBACK;
