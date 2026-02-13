-- ==============================
-- Enable UUID extension
-- ==============================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ==============================
-- USERS
-- ==============================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);


-- ==============================
-- ALGORITHMS
-- ==============================

CREATE TABLE algorithms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    code TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_algorithms_user_id ON algorithms(user_id);


-- ==============================
-- ENUMS
-- ==============================

CREATE TYPE run_status AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED'
);

CREATE TYPE paper_status AS ENUM (
    'ACTIVE',
    'PAUSED',
    'STOPPED'
);

CREATE TYPE trade_side AS ENUM (
    'BUY',
    'SELL'
);

CREATE TYPE trade_type AS ENUM (
    'BACKTEST',
    'PAPER'
);


-- ==============================
-- BACKTEST RUNS
-- ==============================

CREATE TABLE backtest_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    algorithm_id UUID NOT NULL REFERENCES algorithms(id) ON DELETE CASCADE,

    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    initial_balance NUMERIC(18,8) NOT NULL,

    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,

    status run_status DEFAULT 'PENDING',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_backtest_user ON backtest_runs(user_id);
CREATE INDEX idx_backtest_algorithm ON backtest_runs(algorithm_id);


-- ==============================
-- PAPER RUNS
-- ==============================

CREATE TABLE paper_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    algorithm_id UUID NOT NULL REFERENCES algorithms(id) ON DELETE CASCADE,

    symbol VARCHAR(20) NOT NULL,
    timeframe VARCHAR(10) NOT NULL,
    initial_balance NUMERIC(18,8) NOT NULL,
    current_balance NUMERIC(18,8) NOT NULL,

    status paper_status DEFAULT 'ACTIVE',

    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_paper_user ON paper_runs(user_id);
CREATE INDEX idx_paper_algorithm ON paper_runs(algorithm_id);


-- ==============================
-- TRADES
-- ==============================

CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    run_id UUID NOT NULL,
    run_type trade_type NOT NULL,

    side trade_side NOT NULL,

    entry_price NUMERIC(18,8) NOT NULL,
    exit_price NUMERIC(18,8),

    quantity NUMERIC(18,8) NOT NULL,

    pnl NUMERIC(18,8),
    pnl_percent NUMERIC(10,4),

    opened_at TIMESTAMP NOT NULL,
    closed_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trades_run ON trades(run_id);
CREATE INDEX idx_trades_type ON trades(run_type);


-- ==============================
-- METRICS
-- ==============================

CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    run_id UUID NOT NULL,
    run_type trade_type NOT NULL,

    total_return_percent NUMERIC(10,4),
    total_return_usdt NUMERIC(18,8),

    max_drawdown_percent NUMERIC(10,4),
    sharpe_ratio NUMERIC(10,4),
    win_rate_percent NUMERIC(10,4),
    profit_factor NUMERIC(10,4),

    total_trades INTEGER,

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_run ON metrics(run_id);
CREATE INDEX idx_metrics_type ON metrics(run_type);
