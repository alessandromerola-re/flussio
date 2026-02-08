INSERT INTO companies (name) VALUES ('Flussio Demo');

INSERT INTO users (company_id, email, password_hash)
VALUES (1, 'dev@flussio.local', 'flussio123');

INSERT INTO accounts (company_id, name, type, balance)
VALUES
  (1, 'Cassa', 'cash', 1500.00),
  (1, 'Banca', 'bank', 4200.00),
  (1, 'Carta', 'card', 300.00);

INSERT INTO categories (company_id, name, direction, color)
VALUES
  (1, 'Vendite', 'income', '#2ecc71'),
  (1, 'Servizi', 'income', '#27ae60'),
  (1, 'Affitto', 'expense', '#e74c3c'),
  (1, 'Utenze', 'expense', '#c0392b');

INSERT INTO categories (company_id, name, direction, parent_id, color)
VALUES
  (1, 'Elettricità', 'expense', 4, '#e67e22');

INSERT INTO contacts (company_id, name, email, phone, default_category_id)
VALUES
  (1, 'Cliente Alpha', 'alpha@example.com', '+39 333 000 111', 1),
  (1, 'Fornitore Beta', 'beta@example.com', '+39 333 000 222', 3);

INSERT INTO properties (company_id, name, notes)
VALUES
  (1, 'Immobile Centro', 'Appartamento principale'),
  (1, 'Progetto Verde', 'Ristrutturazione 2024');

INSERT INTO transactions (company_id, date, type, amount_total, description, category_id, contact_id, property_id)
VALUES
  (1, CURRENT_DATE - INTERVAL '10 days', 'income', 1200.00, 'Fattura vendita', 1, 1, 1),
  (1, CURRENT_DATE - INTERVAL '3 days', 'expense', 450.00, 'Bollette', 4, 2, 1),
  (1, CURRENT_DATE - INTERVAL '1 day', 'transfer', 200.00, 'Giroconto Cassa-Banca', NULL, NULL, NULL);

INSERT INTO transaction_accounts (transaction_id, account_id, direction, amount)
VALUES
  (1, 2, 'in', 1200.00),
  (2, 2, 'out', 450.00),
  (3, 1, 'out', 200.00),
  (3, 2, 'in', 200.00);
