-- ============================================================================
-- Auto Trade System - Database Schema
-- ============================================================================
-- This file contains all table definitions for the auto trade system
-- 12 core tables for data ingestion, analysis, and trading execution
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";  -- For Phase 4: Vector embeddings

-- ============================================================================
-- Table 1: stocks_master
-- Purpose: Master table for all stock symbols (~3,800 stocks)
-- Record Growth: LOW - Updated occasionally
-- Importance: ⭐⭐⭐⭐⭐ (5/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stocks_master (
    ticker_code VARCHAR(10) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    subsector VARCHAR(100),
    market_cap BIGINT,
    trading_volume BIGINT,
    exchange VARCHAR(50),  -- TSE, NASDAQ, NYSE, etc.
    currency VARCHAR(3) DEFAULT 'JPY',
    listing_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_stocks_company_name ON stocks_master(company_name);
CREATE INDEX IF NOT EXISTS idx_stocks_sector ON stocks_master(sector);
CREATE INDEX IF NOT EXISTS idx_stocks_market_cap ON stocks_master(market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_stocks_is_active ON stocks_master(is_active);

COMMENT ON TABLE stocks_master IS 'Master table containing all monitored stock symbols';

-- ============================================================================
-- Table 2: raw_tweets
-- Purpose: Raw data from X (Twitter) posts
-- Record Growth: HIGH - Continuous ingestion
-- Importance: ⭐⭐⭐⭐ (4/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_tweets (
    id BIGSERIAL PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    tweet_url VARCHAR(500),
    metadata JSONB,  -- Additional metadata (likes, retweets, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    CONSTRAINT raw_tweets_content_check CHECK (length(content) > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_tweets_account ON raw_tweets(account_id);
CREATE INDEX IF NOT EXISTS idx_raw_tweets_processed ON raw_tweets(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_tweets_created ON raw_tweets(created_at DESC);

COMMENT ON TABLE raw_tweets IS 'Raw tweets from monitored X (Twitter) accounts';

-- ============================================================================
-- Table 3: raw_news
-- Purpose: Raw news articles from RSS feeds and news sites
-- Record Growth: MEDIUM - Regular updates
-- Importance: ⭐⭐⭐⭐ (4/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_news (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    url VARCHAR(1000) UNIQUE,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    CONSTRAINT raw_news_title_check CHECK (length(title) > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_news_source ON raw_news(source_name);
CREATE INDEX IF NOT EXISTS idx_raw_news_processed ON raw_news(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_news_published ON raw_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_news_created ON raw_news(created_at DESC);

COMMENT ON TABLE raw_news IS 'Raw news articles from various sources';

-- ============================================================================
-- Table 4: raw_reddit
-- Purpose: Raw posts from Reddit (r/stocks, r/investing, etc.)
-- Record Growth: MEDIUM - Regular monitoring
-- Importance: ⭐⭐⭐ (3/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_reddit (
    id BIGSERIAL PRIMARY KEY,
    subreddit VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    author VARCHAR(255),
    url VARCHAR(1000),
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_reddit_subreddit ON raw_reddit(subreddit);
CREATE INDEX IF NOT EXISTS idx_raw_reddit_processed ON raw_reddit(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_reddit_score ON raw_reddit(score DESC);
CREATE INDEX IF NOT EXISTS idx_raw_reddit_created ON raw_reddit(created_at DESC);

COMMENT ON TABLE raw_reddit IS 'Raw Reddit posts from investment-related subreddits';

-- ============================================================================
-- Table 5: raw_tdnet
-- Purpose: Corporate disclosure data from TDnet (Timely Disclosure Network)
-- Record Growth: MEDIUM - Corporate announcements
-- Importance: ⭐⭐⭐⭐ (4/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS raw_tdnet (
    id BIGSERIAL PRIMARY KEY,
    ticker_code VARCHAR(10),
    disclosure_type VARCHAR(100) NOT NULL,  -- Earnings, M&A, etc.
    title VARCHAR(500) NOT NULL,
    content TEXT,
    pdf_url VARCHAR(1000),
    disclosure_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    FOREIGN KEY (ticker_code) REFERENCES stocks_master(ticker_code) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_raw_tdnet_ticker ON raw_tdnet(ticker_code);
CREATE INDEX IF NOT EXISTS idx_raw_tdnet_type ON raw_tdnet(disclosure_type);
CREATE INDEX IF NOT EXISTS idx_raw_tdnet_processed ON raw_tdnet(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_tdnet_date ON raw_tdnet(disclosure_date DESC);

COMMENT ON TABLE raw_tdnet IS 'Corporate disclosure data from TDnet';

-- ============================================================================
-- Table 6: intelligence_memory
-- Purpose: Unified memory store integrating all data sources
-- Record Growth: HIGH - Central data repository
-- Importance: ⭐⭐⭐⭐⭐ (5/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS intelligence_memory (
    id BIGSERIAL PRIMARY KEY,
    ticker_code VARCHAR(10),
    source_type VARCHAR(20) NOT NULL,  -- 'tweet', 'news', 'reddit', 'tdnet'
    source_id BIGINT,  -- Reference to original record
    original_text TEXT NOT NULL,
    extracted_keywords TEXT[],  -- Array of keywords
    sentiment VARCHAR(20),  -- 'POSITIVE', 'NEGATIVE', 'NEUTRAL'
    embedding vector(1536),  -- OpenAI embedding (Phase 4)
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticker_code) REFERENCES stocks_master(ticker_code) ON DELETE SET NULL,
    CONSTRAINT intelligence_source_type_check CHECK (source_type IN ('tweet', 'news', 'reddit', 'tdnet', 'other'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intelligence_ticker ON intelligence_memory(ticker_code);
CREATE INDEX IF NOT EXISTS idx_intelligence_source_type ON intelligence_memory(source_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_created ON intelligence_memory(created_at DESC);
-- Vector similarity index (Phase 4)
CREATE INDEX IF NOT EXISTS idx_intelligence_embedding ON intelligence_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE intelligence_memory IS 'Central memory store with vector embeddings for RAG';

-- ============================================================================
-- Table 7: monitored_tickers
-- Purpose: Dynamic list of tickers to monitor with priority levels
-- Record Growth: MEDIUM - Adaptive monitoring
-- Importance: ⭐⭐⭐⭐ (4/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS monitored_tickers (
    ticker_code VARCHAR(10) PRIMARY KEY,
    priority_level INTEGER DEFAULT 1,  -- 1=LOW, 2=MEDIUM, 3=HIGH, 4=CRITICAL
    accuracy_rate NUMERIC(5,2) DEFAULT 0.00,  -- Historical accuracy
    total_signals INTEGER DEFAULT 0,
    successful_signals INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_signal_at TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (ticker_code) REFERENCES stocks_master(ticker_code) ON DELETE CASCADE,
    CONSTRAINT monitored_priority_check CHECK (priority_level BETWEEN 1 AND 4),
    CONSTRAINT monitored_accuracy_check CHECK (accuracy_rate BETWEEN 0 AND 100)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monitored_priority ON monitored_tickers(priority_level DESC);
CREATE INDEX IF NOT EXISTS idx_monitored_accuracy ON monitored_tickers(accuracy_rate DESC);
CREATE INDEX IF NOT EXISTS idx_monitored_active ON monitored_tickers(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE monitored_tickers IS 'Dynamically managed list of monitored stock symbols';

-- ============================================================================
-- Table 8: analysis_scores
-- Purpose: Individual LLM analysis scores for each intelligence
-- Record Growth: HIGH - Multiple LLM analyses
-- Importance: ⭐⭐⭐⭐ (4/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analysis_scores (
    id BIGSERIAL PRIMARY KEY,
    intelligence_id BIGINT NOT NULL,
    model_name VARCHAR(50) NOT NULL,  -- 'gpt4o', 'claude', 'gemini'
    veracity_score NUMERIC(5,2) NOT NULL,  -- 0-100
    confidence_score NUMERIC(3,2) NOT NULL,  -- 0.00-1.00
    reasoning TEXT,
    extracted_data JSONB,  -- Structured extraction result
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (intelligence_id) REFERENCES intelligence_memory(id) ON DELETE CASCADE,
    CONSTRAINT analysis_model_check CHECK (model_name IN ('gpt4o', 'claude', 'gemini', 'other')),
    CONSTRAINT analysis_veracity_check CHECK (veracity_score BETWEEN 0 AND 100),
    CONSTRAINT analysis_confidence_check CHECK (confidence_score BETWEEN 0 AND 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analysis_intelligence ON analysis_scores(intelligence_id);
CREATE INDEX IF NOT EXISTS idx_analysis_model ON analysis_scores(model_name);
CREATE INDEX IF NOT EXISTS idx_analysis_score ON analysis_scores(veracity_score DESC);

COMMENT ON TABLE analysis_scores IS 'Individual LLM analysis results for consensus building';

-- ============================================================================
-- Table 9: final_consensus
-- Purpose: Aggregated multi-LLM consensus results
-- Record Growth: HIGH - Final decisions
-- Importance: ⭐⭐⭐⭐⭐ (5/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS final_consensus (
    id BIGSERIAL PRIMARY KEY,
    intelligence_id BIGINT NOT NULL,
    aggregated_score NUMERIC(5,2) NOT NULL,  -- Weighted average
    std_deviation NUMERIC(5,2),  -- Measure of LLM agreement
    agreement_level VARCHAR(20),  -- 'HIGH', 'MEDIUM', 'LOW'
    final_decision VARCHAR(50) NOT NULL,  -- 'EXECUTE', 'WATCH', 'HOLD', 'REJECT'
    reasoning TEXT,
    is_executed BOOLEAN DEFAULT FALSE,
    executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (intelligence_id) REFERENCES intelligence_memory(id) ON DELETE CASCADE,
    CONSTRAINT consensus_decision_check CHECK (final_decision IN ('EXECUTE', 'WATCH', 'HOLD', 'REJECT')),
    CONSTRAINT consensus_agreement_check CHECK (agreement_level IN ('HIGH', 'MEDIUM', 'LOW'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_consensus_intelligence ON final_consensus(intelligence_id);
CREATE INDEX IF NOT EXISTS idx_consensus_decision ON final_consensus(final_decision);
CREATE INDEX IF NOT EXISTS idx_consensus_executed ON final_consensus(is_executed) WHERE is_executed = FALSE;
CREATE INDEX IF NOT EXISTS idx_consensus_created ON final_consensus(created_at DESC);

COMMENT ON TABLE final_consensus IS 'Multi-LLM consensus decisions for trading signals';

-- ============================================================================
-- Table 10: portfolio_mgmt
-- Purpose: Portfolio and asset management
-- Record Growth: LOW - Snapshot updates
-- Importance: ⭐⭐⭐⭐⭐ (5/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_mgmt (
    id BIGSERIAL PRIMARY KEY,
    total_assets NUMERIC(15,2) NOT NULL,
    available_cash NUMERIC(15,2) NOT NULL,
    invested_amount NUMERIC(15,2) DEFAULT 0.00,
    unrealized_pnl NUMERIC(15,2) DEFAULT 0.00,
    realized_pnl NUMERIC(15,2) DEFAULT 0.00,
    win_rate NUMERIC(5,2) DEFAULT 0.00,  -- Percentage
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    max_drawdown NUMERIC(15,2) DEFAULT 0.00,
    sharpe_ratio NUMERIC(5,2),
    snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT portfolio_cash_check CHECK (available_cash >= 0),
    CONSTRAINT portfolio_winrate_check CHECK (win_rate BETWEEN 0 AND 100)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshot ON portfolio_mgmt(snapshot_at DESC);

COMMENT ON TABLE portfolio_mgmt IS 'Portfolio performance tracking and metrics';

-- ============================================================================
-- Table 11: trade_history
-- Purpose: Complete trading history
-- Record Growth: MEDIUM - Trade executions
-- Importance: ⭐⭐⭐⭐ (4/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_history (
    id BIGSERIAL PRIMARY KEY,
    ticker_code VARCHAR(10) NOT NULL,
    order_type VARCHAR(20) NOT NULL,  -- 'BUY', 'SELL'
    quantity INTEGER NOT NULL,
    entry_price NUMERIC(10,2) NOT NULL,
    exit_price NUMERIC(10,2),
    entry_date TIMESTAMP NOT NULL,
    exit_date TIMESTAMP,
    pnl NUMERIC(15,2),  -- Profit and Loss
    pnl_percentage NUMERIC(5,2),
    commission NUMERIC(10,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'OPEN',  -- 'OPEN', 'CLOSED', 'CANCELLED'
    strategy VARCHAR(100),
    consensus_id BIGINT,  -- Link to decision
    notes TEXT,
    FOREIGN KEY (ticker_code) REFERENCES stocks_master(ticker_code) ON DELETE RESTRICT,
    FOREIGN KEY (consensus_id) REFERENCES final_consensus(id) ON DELETE SET NULL,
    CONSTRAINT trade_order_check CHECK (order_type IN ('BUY', 'SELL')),
    CONSTRAINT trade_status_check CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    CONSTRAINT trade_quantity_check CHECK (quantity > 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_ticker ON trade_history(ticker_code);
CREATE INDEX IF NOT EXISTS idx_trade_status ON trade_history(status);
CREATE INDEX IF NOT EXISTS idx_trade_entry_date ON trade_history(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_trade_pnl ON trade_history(pnl DESC);

COMMENT ON TABLE trade_history IS 'Complete history of all executed trades';

-- ============================================================================
-- Table 12: source_performance
-- Purpose: Track accuracy and performance of each data source
-- Record Growth: LOW - Periodic updates
-- Importance: ⭐⭐⭐ (3/5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_performance (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(255) UNIQUE NOT NULL,
    source_type VARCHAR(20) NOT NULL,  -- 'account', 'rss', 'subreddit', etc.
    total_signals INTEGER DEFAULT 0,
    successful_signals INTEGER DEFAULT 0,
    failed_signals INTEGER DEFAULT 0,
    accuracy_rate NUMERIC(5,2) DEFAULT 0.00,  -- Percentage
    avg_return NUMERIC(6,3) DEFAULT 0.000,  -- Average return per signal
    weight NUMERIC(3,2) DEFAULT 0.50,  -- Weight in future decisions (0-1)
    is_active BOOLEAN DEFAULT TRUE,
    last_evaluated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT source_accuracy_check CHECK (accuracy_rate BETWEEN 0 AND 100),
    CONSTRAINT source_weight_check CHECK (weight BETWEEN 0 AND 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_source_type ON source_performance(source_type);
CREATE INDEX IF NOT EXISTS idx_source_accuracy ON source_performance(accuracy_rate DESC);
CREATE INDEX IF NOT EXISTS idx_source_active ON source_performance(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE source_performance IS 'Performance tracking for data sources to adjust weights';

-- ============================================================================
-- Utility Views
-- ============================================================================

-- View: Current Portfolio Status
CREATE OR REPLACE VIEW v_portfolio_current AS
SELECT
    total_assets,
    available_cash,
    invested_amount,
    unrealized_pnl,
    realized_pnl,
    win_rate,
    total_trades,
    winning_trades,
    losing_trades,
    snapshot_at
FROM portfolio_mgmt
ORDER BY snapshot_at DESC
LIMIT 1;

-- View: Open Positions
CREATE OR REPLACE VIEW v_open_positions AS
SELECT
    th.ticker_code,
    sm.company_name,
    th.quantity,
    th.entry_price,
    th.entry_date,
    th.strategy,
    EXTRACT(DAY FROM NOW() - th.entry_date) AS days_held
FROM trade_history th
JOIN stocks_master sm ON th.ticker_code = sm.ticker_code
WHERE th.status = 'OPEN'
ORDER BY th.entry_date DESC;

-- View: Top Performing Sources
CREATE OR REPLACE VIEW v_top_sources AS
SELECT
    source_name,
    source_type,
    total_signals,
    accuracy_rate,
    avg_return,
    weight
FROM source_performance
WHERE is_active = TRUE
ORDER BY accuracy_rate DESC, total_signals DESC;

-- ============================================================================
-- Triggers for automatic timestamp updates
-- ============================================================================

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
CREATE TRIGGER update_stocks_master_updated_at
    BEFORE UPDATE ON stocks_master
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intelligence_memory_updated_at
    BEFORE UPDATE ON intelligence_memory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Initial Data & Constraints
-- ============================================================================

-- Insert default portfolio entry
INSERT INTO portfolio_mgmt (total_assets, available_cash)
VALUES (1000000.00, 1000000.00)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Grants & Permissions (Adjust as needed)
-- ============================================================================

-- Example: Grant permissions to application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ============================================================================
-- Database Maintenance Functions
-- ============================================================================

-- Function to clean old processed records (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_processed_records(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM raw_tweets
    WHERE processed = TRUE
      AND processed_at < NOW() - INTERVAL '1 day' * days_to_keep;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- End of Schema Definition
-- ============================================================================
