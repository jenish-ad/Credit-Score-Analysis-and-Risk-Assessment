-- Credit Risk Analysis database schema + seed data
-- PostgreSQL-compatible

BEGIN;

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS credit_accounts CASCADE;
DROP TABLE IF EXISTS score_history CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  user_id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  monthly_income NUMERIC(14,2),
  employment_type VARCHAR(80),
  address TEXT,
  dob DATE,
  phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_accounts (
  account_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  account_type VARCHAR(50) NOT NULL,
  purpose TEXT,
  tenure_months INTEGER,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE TABLE payments (
  payment_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES credit_accounts(account_id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  paid_date DATE,
  amount_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'due'
);

CREATE TABLE score_history (
  score_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 300 AND 850),
  risk_level VARCHAR(20) NOT NULL,
  factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user_id ON credit_accounts(user_id);
CREATE INDEX idx_payments_account_id ON payments(account_id);
CREATE INDEX idx_score_user_id_time ON score_history(user_id, calculated_at DESC);

-- Seed users; support evaluation lookups by APP IDs, numeric IDs, and usernames.
INSERT INTO users (
  user_id, full_name, username, email, password_hash, monthly_income, employment_type, address, dob, phone
) VALUES
  (
    1,
    'Demo User',
    'Chamber',
    'demo_user@example.com',
    'pbkdf2_sha256$600000$eDAQmZ9yXS8gdITP72Aiy6$2Jbkna/l7u07gA0rGocVHBzzAp3vOWbxN09H7DA6QXw=',
    78000,
    'Salaried',
    'Baneshwor, Kathmandu',
    DATE '1993-05-16',
    '+977-9800000000'
  ),
  (
    2,
    'Aarav Shrestha',
    'aarav_s',
    'aarav@example.com',
    'pbkdf2_sha256$600000$Q7AL3f6KQ1zQ9rY2XvV8Vh$examplehashforseed000000000000000000000000000=',
    92000,
    'Self-employed',
    'Lalitpur-14, Nepal',
    DATE '1990-11-03',
    '+977-9811111111'
  ),
  (
    3,
    'Nisha Karki',
    'nisha_k',
    'nisha@example.com',
    'pbkdf2_sha256$600000$6W9Uq1PqVx3G3zC2Mn4HkF$examplehashforseed111111111111111111111111111=',
    64000,
    'Contract',
    'Pokhara-8, Kaski',
    DATE '1996-01-22',
    '+977-9822222222'
  ),
  (
    4,
    'Ritesh Gautam',
    'ritesh_g',
    'ritesh@example.com',
    'pbkdf2_sha256$600000$Pk5h7TsN2qD8mBa0VfY4nE$examplehashforseed222222222222222222222222222=',
    110000,
    'Business',
    'Butwal-10, Rupandehi',
    DATE '1988-07-30',
    '+977-9833333333'
  ),
  (
    5,
    'Sita Thapa',
    'sita_t',
    'sita@example.com',
    'pbkdf2_sha256$600000$Mz2Jc9YkT1vE7rLi8Ns3qD$examplehashforseed333333333333333333333333333=',
    55000,
    'Government',
    'Dharan-5, Sunsari',
    DATE '1998-09-12',
    '+977-9844444444'
  );

INSERT INTO credit_accounts (
  account_id, user_id, account_type, purpose, tenure_months, credit_limit, current_balance, opened_date, status
) VALUES
  (1, 1, 'loan_general', 'Home renovation', 24, 250000, 85000, CURRENT_DATE - INTERVAL '240 days', 'active'),
  (2, 1, 'credit_card_usage', 'General spending', NULL, 120000, 35000, CURRENT_DATE - INTERVAL '600 days', 'active'),
  (3, 2, 'loan_general', 'Vehicle financing', 36, 350000, 145000, CURRENT_DATE - INTERVAL '420 days', 'active'),
  (4, 3, 'credit_card_usage', 'Travel and expenses', NULL, 90000, 41000, CURRENT_DATE - INTERVAL '300 days', 'active'),
  (5, 4, 'loan_general', 'Small business expansion', 48, 500000, 260000, CURRENT_DATE - INTERVAL '720 days', 'active'),
  (6, 5, 'education_loan', 'Postgraduate tuition', 30, 200000, 118000, CURRENT_DATE - INTERVAL '180 days', 'active');

INSERT INTO payments (account_id, due_date, paid_date, amount_due, amount_paid, status) VALUES
  (1, CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '61 days', 12000, 12000, 'paid'),
  (1, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '30 days', 12000, 12000, 'paid'),
  (2, CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '14 days', 7000, 7000, 'paid'),
  (3, CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE - INTERVAL '42 days', 18000, 18000, 'paid'),
  (4, CURRENT_DATE - INTERVAL '20 days', CURRENT_DATE - INTERVAL '18 days', 8500, 8500, 'paid'),
  (5, CURRENT_DATE - INTERVAL '35 days', CURRENT_DATE - INTERVAL '28 days', 26000, 26000, 'paid'),
  (6, CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '9 days', 14000, 14000, 'paid');

INSERT INTO score_history (user_id, score, risk_level, factors, calculated_at) VALUES
  (1, 701, 'low', '{"payment_history": 86, "credit_utilization": 72, "credit_age": 68, "inquiries": 80, "debt_to_income": 74, "income_stability": 79, "employment_history": 76, "credit_mix": 70, "delinquencies": 84, "collateral_strength": 66}'::jsonb, NOW() - INTERVAL '60 days'),
  (1, 718, 'low', '{"payment_history": 89, "credit_utilization": 76, "credit_age": 69, "inquiries": 81, "debt_to_income": 77, "income_stability": 80, "employment_history": 77, "credit_mix": 71, "delinquencies": 86, "collateral_strength": 68}'::jsonb, NOW() - INTERVAL '30 days'),
  (1, 732, 'low', '{"payment_history": 92, "credit_utilization": 80, "credit_age": 70, "inquiries": 82, "debt_to_income": 79, "income_stability": 82, "employment_history": 79, "credit_mix": 73, "delinquencies": 88, "collateral_strength": 70}'::jsonb, NOW() - INTERVAL '1 day'),
  (2, 688, 'medium', '{"payment_history": 84, "credit_utilization": 66, "credit_age": 64, "inquiries": 73, "debt_to_income": 68, "income_stability": 78, "employment_history": 75, "credit_mix": 69, "delinquencies": 82, "collateral_strength": 72}'::jsonb, NOW() - INTERVAL '2 days'),
  (3, 654, 'medium', '{"payment_history": 78, "credit_utilization": 62, "credit_age": 58, "inquiries": 69, "debt_to_income": 63, "income_stability": 70, "employment_history": 68, "credit_mix": 64, "delinquencies": 77, "collateral_strength": 61}'::jsonb, NOW() - INTERVAL '2 days'),
  (4, 739, 'low', '{"payment_history": 93, "credit_utilization": 75, "credit_age": 79, "inquiries": 84, "debt_to_income": 74, "income_stability": 85, "employment_history": 83, "credit_mix": 76, "delinquencies": 89, "collateral_strength": 81}'::jsonb, NOW() - INTERVAL '2 days'),
  (5, 623, 'high', '{"payment_history": 71, "credit_utilization": 54, "credit_age": 52, "inquiries": 61, "debt_to_income": 57, "income_stability": 65, "employment_history": 63, "credit_mix": 59, "delinquencies": 69, "collateral_strength": 55}'::jsonb, NOW() - INTERVAL '2 days');

COMMIT;
