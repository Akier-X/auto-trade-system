"""
Main Orchestrator
Coordinates all system components for automated trading.
"""

import os
import sys
import logging
import asyncio
from typing import Dict, Any, List
from datetime import datetime
import time

from dotenv import load_dotenv

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from storage.db_manager import get_db_manager
from ingestion.news_feed import NewsFeedMonitor
from ingestion.reddit_monitor import RedditMonitor
from analysis.llm_orchestrator import LLMOrchestrator
from analysis.consensus_logic import ConsensusEngine
from analysis.embedding_generator import EmbeddingGenerator
from optimization.portfolio_optimizer import PortfolioOptimizer
from optimization.risk_manager import RiskManager
from execution.trading_engine import TradingEngine, MockBrokerAPI

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/system.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class AutoTradingSystem:
    """
    Main orchestrator for automated trading system.

    Coordinates:
    - Data ingestion from multiple sources
    - AI analysis with multiple LLMs
    - Consensus building
    - Portfolio optimization
    - Risk management
    - Trade execution
    """

    def __init__(self, dry_run: bool = True):
        """
        Initialize trading system.

        Args:
            dry_run: If True, simulate trades without real execution
        """
        self.dry_run = dry_run

        logger.info("=" * 60)
        logger.info("Auto Trading System Initializing...")
        logger.info("=" * 60)

        # Initialize components
        self.db = get_db_manager()
        self.news_monitor = NewsFeedMonitor()
        self.reddit_monitor = RedditMonitor()
        self.llm_orchestrator = LLMOrchestrator()
        self.consensus_engine = ConsensusEngine()
        self.embedding_gen = EmbeddingGenerator()
        self.portfolio_optimizer = PortfolioOptimizer()

        # Get initial capital
        initial_capital = float(os.getenv('INITIAL_CAPITAL', 1000000))

        self.risk_manager = RiskManager(total_assets=initial_capital)
        self.trading_engine = TradingEngine(
            broker_api=MockBrokerAPI(),
            risk_manager=self.risk_manager,
            dry_run=dry_run
        )

        logger.info(f"System initialized (dry_run={dry_run})")
        logger.info(f"Initial capital: ¥{initial_capital:,.0f}")

    def collect_data(self):
        """Collect data from all sources."""
        logger.info("📥 Data Collection Phase")

        try:
            # Fetch news
            self.news_monitor.fetch_all_sources()

            # Monitor Reddit
            self.reddit_monitor.monitor_subreddits(limit_per_subreddit=20)

            logger.info("✓ Data collection completed")

        except Exception as e:
            logger.error(f"Error in data collection: {e}")

    def process_unprocessed_data(self):
        """Process unprocessed raw data."""
        logger.info("🔄 Processing unprocessed data")

        try:
            # Generate embeddings for new data
            processed = self.embedding_gen.embed_unprocessed_data(limit=50)
            logger.info(f"✓ Generated {processed} embeddings")

        except Exception as e:
            logger.error(f"Error processing data: {e}")

    async def analyze_intelligence(self, intelligence_id: int) -> Dict[str, Any]:
        """
        Analyze a single intelligence record.

        Args:
            intelligence_id: Intelligence record ID

        Returns:
            Analysis result
        """
        try:
            # Get intelligence record
            query = "SELECT * FROM intelligence_memory WHERE id = %s"
            result = self.db.execute_query(query, (intelligence_id,))

            if not result:
                logger.warning(f"Intelligence {intelligence_id} not found")
                return {}

            intelligence = result[0]
            text = intelligence['original_text']
            ticker = intelligence.get('ticker_code')

            logger.info(f"📊 Analyzing intelligence #{intelligence_id}: {ticker}")

            # Get memory context
            from analysis.memory_search import MemorySearchEngine

            memory_engine = MemorySearchEngine()
            context_records = memory_engine.get_ticker_context(ticker, days=30) if ticker else []
            memory_context = memory_engine.build_context_string(context_records)

            # Parallel LLM analysis
            llm_results = await self.llm_orchestrator.analyze_parallel(
                text=text,
                analysis_type='verification',
                memory_context=memory_context
            )

            # Build consensus
            consensus = self.consensus_engine.build_consensus(
                llm_results=llm_results,
                intelligence_id=intelligence_id
            )

            # Save consensus to database
            consensus_id = self.consensus_engine.save_to_database(consensus)

            logger.info(f"✓ Consensus: {consensus['final_decision']} (score={consensus['consensus_score']})")

            return consensus

        except Exception as e:
            logger.error(f"Error analyzing intelligence: {e}")
            return {}

    def generate_trading_signals(self) -> List[Dict[str, Any]]:
        """
        Generate trading signals from consensus decisions.

        Returns:
            List of trading signals
        """
        logger.info("💡 Generating trading signals")

        try:
            # Get EXECUTE decisions
            query = """
                SELECT
                    fc.*,
                    im.ticker_code,
                    im.original_text
                FROM final_consensus fc
                JOIN intelligence_memory im ON fc.intelligence_id = im.id
                WHERE fc.final_decision = 'EXECUTE'
                  AND fc.is_executed = FALSE
                  AND fc.created_at >= NOW() - INTERVAL '24 hours'
                ORDER BY fc.aggregated_score DESC
            """

            decisions = self.db.execute_query(query)

            signals = []

            for decision in decisions:
                ticker = decision.get('ticker_code')
                confidence = decision.get('aggregated_score', 0) / 100.0

                # Estimate expected return (simple heuristic)
                expected_return = confidence * 0.10  # Max 10% expected return

                signal = {
                    'ticker_code': ticker,
                    'action': 'BUY',
                    'confidence': confidence,
                    'expected_return': expected_return,
                    'win_rate': 0.65,  # Historical average
                    'consensus_id': decision['id']
                }

                signals.append(signal)

            logger.info(f"✓ Generated {len(signals)} trading signals")

            return signals

        except Exception as e:
            logger.error(f"Error generating signals: {e}")
            return []

    def execute_trading_strategy(self):
        """Execute trading strategy."""
        logger.info("🎯 Executing Trading Strategy")

        try:
            # Generate signals
            signals = self.generate_trading_signals()

            if not signals:
                logger.info("No signals to execute")
                return

            # Get portfolio metrics
            metrics = self.portfolio_optimizer.get_portfolio_metrics()
            available_cash = metrics.get('available_cash', 1000000)

            logger.info(f"Available cash: ¥{available_cash:,.0f}")

            # Optimize allocation
            allocations = self.portfolio_optimizer.optimize_allocation(
                signals=signals,
                total_capital=available_cash,
                risk_limit=0.05
            )

            # Execute trades
            for ticker, amount in allocations.items():
                # Find signal for this ticker
                signal = next((s for s in signals if s['ticker_code'] == ticker), None)

                if not signal:
                    continue

                signal['allocation'] = amount

                # Find consensus
                consensus = {'id': signal.get('consensus_id')}

                # Execute trade
                result = self.trading_engine.execute_signal(signal, consensus)

                if result:
                    logger.info(f"✓ Executed: {ticker} for ¥{amount:,.0f}")

                    # Mark consensus as executed
                    update_query = """
                        UPDATE final_consensus
                        SET is_executed = TRUE, executed_at = %s
                        WHERE id = %s
                    """

                    self.db.execute_query(update_query, (datetime.now(), consensus['id']), fetch=False)

        except Exception as e:
            logger.error(f"Error executing strategy: {e}")

    def run_cycle(self):
        """Run a single system cycle."""
        logger.info("\n" + "=" * 60)
        logger.info(f"Starting Cycle: {datetime.now()}")
        logger.info("=" * 60)

        try:
            # Step 1: Collect data
            self.collect_data()

            # Step 2: Process unprocessed data
            self.process_unprocessed_data()

            # Step 3: Analyze recent intelligence
            # (In production, this would be triggered by new data)

            # Step 4: Execute trading strategy
            self.execute_trading_strategy()

            # Step 5: Monitor portfolio health
            health = self.risk_manager.check_portfolio_health()
            logger.info(f"Portfolio Health: {health['status']}")

            logger.info("✓ Cycle completed")

        except Exception as e:
            logger.error(f"Error in cycle: {e}")

    def run(self, interval_minutes: int = 60):
        """
        Run system continuously.

        Args:
            interval_minutes: Minutes between cycles
        """
        logger.info(f"🚀 Starting Auto Trading System (interval={interval_minutes}min)")

        try:
            while True:
                self.run_cycle()

                logger.info(f"⏸ Sleeping for {interval_minutes} minutes...")
                time.sleep(interval_minutes * 60)

        except KeyboardInterrupt:
            logger.info("🛑 System stopped by user")

        except Exception as e:
            logger.error(f"Fatal error: {e}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Auto Trading System')
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=True,
        help='Run in dry-run mode (no real trades)'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=60,
        help='Cycle interval in minutes'
    )
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run once and exit'
    )

    args = parser.parse_args()

    # Create logs directory
    os.makedirs('logs', exist_ok=True)

    try:
        system = AutoTradingSystem(dry_run=args.dry_run)

        if args.once:
            system.run_cycle()
        else:
            system.run(interval_minutes=args.interval)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
