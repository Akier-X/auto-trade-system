"""
Short-Term Trading System Main Orchestrator
Specialized system for day trading and swing trading.
"""

import os
import sys
import logging
import time
from typing import Dict, Any
from datetime import datetime

from dotenv import load_dotenv

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from storage.db_manager import get_db_manager
from strategies.short_term_strategy import ShortTermStrategy
from optimization.risk_manager import RiskManager
from execution.trading_engine import TradingEngine, MockBrokerAPI

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/short_term_system.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ShortTermTradingSystem:
    """
    Short-term trading system orchestrator.

    Features:
    - Intraday and swing trading (hours to 5 days)
    - Technical indicator-based signals
    - Momentum and volume analysis
    - Rapid entry/exit
    - Strict risk management
    """

    def __init__(self, dry_run: bool = True):
        """
        Initialize short-term trading system.

        Args:
            dry_run: If True, simulate trades without real execution
        """
        self.dry_run = dry_run

        logger.info("=" * 70)
        logger.info("Short-Term Trading System Initializing...")
        logger.info("=" * 70)

        # Initialize components
        self.db = get_db_manager()

        # Get capital allocation for short-term trading
        # In production, allocate portion of total capital to this strategy
        initial_capital = float(os.getenv('INITIAL_CAPITAL', 1000000))
        short_term_allocation = float(os.getenv('SHORT_TERM_ALLOCATION', 0.3))  # 30% default
        self.allocated_capital = initial_capital * short_term_allocation

        logger.info(f"Capital allocation: ¥{self.allocated_capital:,.0f} ({short_term_allocation*100}%)")

        # Risk management for short-term trading
        # More conservative parameters than long-term
        self.risk_manager = RiskManager(
            total_assets=self.allocated_capital,
            max_loss_per_trade=0.02,  # 2% max loss per trade
            max_loss_daily=0.05,  # 5% max daily loss
            max_drawdown=0.10,  # 10% max drawdown
            max_position_size=0.10  # 10% max position size
        )

        # Trading engine
        self.trading_engine = TradingEngine(
            broker_api=MockBrokerAPI(),
            risk_manager=self.risk_manager,
            dry_run=dry_run
        )

        # Short-term strategy
        self.strategy = ShortTermStrategy(
            trading_engine=self.trading_engine,
            risk_manager=self.risk_manager,
            max_holding_hours=120,  # 5 days max
            profit_target_pct=3.0,  # 3% profit target
            stop_loss_pct=2.0  # 2% stop loss
        )

        logger.info(f"System initialized (dry_run={dry_run})")

    def get_available_capital(self) -> float:
        """
        Calculate available capital for new trades.

        Returns:
            Available capital
        """
        try:
            # Get current position value
            positions = self.risk_manager.get_open_positions()
            invested_amount = sum(positions.values())

            # Calculate available
            available = self.allocated_capital - invested_amount

            logger.debug(f"Available capital: ¥{available:,.0f} (invested: ¥{invested_amount:,.0f})")

            return max(0, available)

        except Exception as e:
            logger.error(f"Error calculating available capital: {e}")
            return self.allocated_capital * 0.5  # Conservative fallback

    def monitor_risk(self) -> Dict[str, Any]:
        """
        Monitor risk metrics and trading health.

        Returns:
            Risk metrics
        """
        logger.info("Monitoring risk metrics...")

        health = self.risk_manager.check_portfolio_health()
        should_halt, reason = self.risk_manager.should_halt_trading()

        metrics = {
            'health_status': health['status'],
            'warnings': health['warnings'],
            'should_halt': should_halt,
            'halt_reason': reason,
            'metrics': health['metrics']
        }

        if should_halt:
            logger.error(f"🛑 TRADING HALTED: {reason}")
        elif health['status'] == 'WARNING':
            logger.warning(f"⚠ Health warning: {health['warnings']}")

        return metrics

    def update_performance_metrics(self):
        """Update strategy performance metrics in database."""
        try:
            stats = self.strategy.get_performance_stats(days=1)  # Today only

            if stats['total_trades'] > 0:
                query = """
                    INSERT INTO strategy_performance
                    (strategy_type, date, total_trades, winning_trades, losing_trades,
                     total_pnl, avg_pnl_pct, win_rate, avg_holding_hours)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (strategy_type, date)
                    DO UPDATE SET
                        total_trades = EXCLUDED.total_trades,
                        winning_trades = EXCLUDED.winning_trades,
                        losing_trades = EXCLUDED.losing_trades,
                        total_pnl = EXCLUDED.total_pnl,
                        avg_pnl_pct = EXCLUDED.avg_pnl_pct,
                        win_rate = EXCLUDED.win_rate,
                        avg_holding_hours = EXCLUDED.avg_holding_hours
                """

                with self.db.get_cursor(commit=True) as cur:
                    cur.execute(query, (
                        'short_term',
                        datetime.now().date(),
                        stats['total_trades'],
                        stats['winning_trades'],
                        stats['losing_trades'],
                        stats['total_pnl'],
                        stats['avg_pnl_pct'],
                        stats['win_rate'],
                        stats['avg_holding_hours']
                    ))

                logger.info("Updated performance metrics")

        except Exception as e:
            logger.error(f"Error updating performance metrics: {e}")

    def run_cycle(self):
        """Run a single trading cycle."""
        logger.info("\n" + "=" * 70)
        logger.info(f"Short-Term Trading Cycle: {datetime.now()}")
        logger.info("=" * 70)

        try:
            # Step 1: Check risk status
            risk_metrics = self.monitor_risk()

            if risk_metrics['should_halt']:
                logger.error(f"🛑 Trading halted: {risk_metrics['halt_reason']}")
                return

            # Step 2: Get available capital
            available_capital = self.get_available_capital()
            logger.info(f"Available capital: ¥{available_capital:,.0f}")

            # Step 3: Run strategy cycle
            cycle_result = self.strategy.run_cycle(available_capital)

            # Step 4: Log results
            logger.info("\n📊 Cycle Results:")
            logger.info(f"  New entries: {len(cycle_result['entries'])}")
            logger.info(f"  Exits: {len(cycle_result['exits'])}")

            if cycle_result['entries']:
                logger.info("\n  Entries:")
                for entry in cycle_result['entries']:
                    logger.info(f"    {entry['ticker']}: ¥{entry['total_value']:,.0f} @ ¥{entry['price']:,.2f}")

            if cycle_result['exits']:
                logger.info("\n  Exits:")
                for exit in cycle_result['exits']:
                    logger.info(f"    {exit['ticker']}: {exit['pnl_pct']:+.2f}% ({exit['holding_hours']:.1f}h)")

            # Step 5: Update performance metrics
            self.update_performance_metrics()

            # Step 6: Display current stats
            stats = self.strategy.get_performance_stats(days=30)
            logger.info("\n📈 30-Day Performance:")
            logger.info(f"  Total trades: {stats['total_trades']}")
            logger.info(f"  Win rate: {stats['win_rate']:.1f}%")
            logger.info(f"  Total P&L: ¥{stats['total_pnl']:,.0f}")
            logger.info(f"  Avg holding: {stats['avg_holding_hours']:.1f} hours")

            logger.info("\n✓ Cycle completed successfully")

        except Exception as e:
            logger.error(f"Error in trading cycle: {e}")

    def run(self, interval_minutes: int = 15):
        """
        Run system continuously.

        Args:
            interval_minutes: Minutes between cycles (default: 15 for short-term)
        """
        logger.info(f"🚀 Starting Short-Term Trading System")
        logger.info(f"   Cycle interval: {interval_minutes} minutes")
        logger.info(f"   Capital: ¥{self.allocated_capital:,.0f}")
        logger.info(f"   Dry run: {self.dry_run}")
        logger.info("")

        try:
            while True:
                # Check trading hours (9:00-15:00 JST for Japanese market)
                # In production, add market hours check here

                self.run_cycle()

                logger.info(f"\n⏸ Sleeping for {interval_minutes} minutes...")
                time.sleep(interval_minutes * 60)

        except KeyboardInterrupt:
            logger.info("\n🛑 System stopped by user")

        except Exception as e:
            logger.error(f"Fatal error: {e}")

    def backtest_mode(self, start_date: str, end_date: str):
        """
        Run system in backtest mode.

        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
        """
        logger.info(f"📊 Backtesting mode: {start_date} to {end_date}")
        logger.warning("Backtest mode not yet implemented")

        # TODO: Implement backtesting
        # - Load historical price data
        # - Simulate trades day by day
        # - Calculate performance metrics
        # - Generate backtest report


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Short-Term Trading System')
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=True,
        help='Run in dry-run mode (no real trades)'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=15,
        help='Cycle interval in minutes (default: 15)'
    )
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run once and exit'
    )
    parser.add_argument(
        '--backtest',
        action='store_true',
        help='Run in backtest mode'
    )
    parser.add_argument(
        '--start-date',
        type=str,
        help='Backtest start date (YYYY-MM-DD)'
    )
    parser.add_argument(
        '--end-date',
        type=str,
        help='Backtest end date (YYYY-MM-DD)'
    )

    args = parser.parse_args()

    # Create logs directory
    os.makedirs('logs', exist_ok=True)

    try:
        system = ShortTermTradingSystem(dry_run=args.dry_run)

        if args.backtest:
            if not args.start_date or not args.end_date:
                logger.error("Backtest mode requires --start-date and --end-date")
                sys.exit(1)

            system.backtest_mode(args.start_date, args.end_date)

        elif args.once:
            system.run_cycle()

        else:
            system.run(interval_minutes=args.interval)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
