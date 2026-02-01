"""
Short-Term Trading Strategy
Day trading and swing trading strategy with strict risk management.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager
from src.strategies.signal_generator import ShortTermSignalGenerator
from src.optimization.risk_manager import RiskManager
from src.execution.trading_engine import TradingEngine

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ShortTermStrategy:
    """
    Short-term trading strategy.

    Characteristics:
    - Holding period: Hours to 5 days
    - Focus: Technical signals, momentum, short-term sentiment
    - Risk: Tight stop-losses (2%), quick profit-taking (3%+)
    - Position sizing: Conservative (5-10% per position)
    - Turnover: High frequency
    """

    def __init__(
        self,
        trading_engine: TradingEngine,
        risk_manager: RiskManager,
        max_holding_hours: int = 120,  # 5 days
        profit_target_pct: float = 3.0,
        stop_loss_pct: float = 2.0
    ):
        """
        Initialize short-term strategy.

        Args:
            trading_engine: Trading engine instance
            risk_manager: Risk manager instance
            max_holding_hours: Maximum holding period in hours
            profit_target_pct: Profit target percentage
            stop_loss_pct: Stop loss percentage
        """
        self.trading_engine = trading_engine
        self.risk_manager = risk_manager
        self.signal_generator = ShortTermSignalGenerator()
        self.db = get_db_manager()

        self.max_holding_hours = max_holding_hours
        self.profit_target_pct = profit_target_pct
        self.stop_loss_pct = stop_loss_pct

        logger.info("Short-term strategy initialized")
        logger.info(f"  Max holding: {max_holding_hours}h")
        logger.info(f"  Profit target: {profit_target_pct}%")
        logger.info(f"  Stop loss: {stop_loss_pct}%")

    def scan_for_opportunities(
        self,
        min_score: float = 65,
        max_signals: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Scan market for short-term opportunities.

        Args:
            min_score: Minimum signal score
            max_signals: Maximum number of signals

        Returns:
            List of trading opportunities
        """
        logger.info("Scanning for short-term opportunities...")

        opportunities = self.signal_generator.scan_market(
            min_score=min_score,
            max_results=max_signals
        )

        logger.info(f"Found {len(opportunities)} opportunities")

        return opportunities

    def execute_entry(
        self,
        signal: Dict[str, Any],
        available_capital: float
    ) -> Optional[Dict[str, Any]]:
        """
        Execute entry based on signal.

        Args:
            signal: Trading signal
            available_capital: Available capital

        Returns:
            Execution result or None
        """
        ticker = signal['ticker']
        confidence = signal['confidence']
        score = signal['score']

        logger.info(f"Executing entry for {ticker} (confidence={confidence:.2f}, score={score:.1f})")

        # Calculate position size (5-10% of capital based on confidence)
        min_position_pct = 0.05
        max_position_pct = 0.10
        position_pct = min_position_pct + (max_position_pct - min_position_pct) * confidence

        position_size = available_capital * position_pct

        # Create trading signal for engine
        trade_signal = {
            'ticker_code': ticker,
            'action': 'BUY',
            'allocation': position_size,
            'confidence': confidence,
            'expected_return': self.profit_target_pct / 100,
            'expected_loss': self.stop_loss_pct / 100
        }

        # Save signal details to consensus (mock)
        consensus = {
            'id': None,
            'strategy': 'short_term',
            'signal_score': score
        }

        # Execute trade
        result = self.trading_engine.execute_signal(trade_signal, consensus)

        if result:
            # Record strategy-specific metadata
            self._record_strategy_entry(
                trade_id=result['trade_id'],
                signal_details=signal
            )

        return result

    def _record_strategy_entry(
        self,
        trade_id: int,
        signal_details: Dict[str, Any]
    ):
        """Record strategy-specific entry metadata."""
        try:
            query = """
                INSERT INTO trade_metadata
                (trade_id, strategy_type, entry_signal_score,
                 technical_score, sentiment_score, metadata)
                VALUES (%s, %s, %s, %s, %s, %s)
            """

            tech_score = signal_details.get('details', {}).get('technical', {}).get('score', 0)
            sentiment_score = signal_details.get('details', {}).get('sentiment', {}).get('score', 0)

            with self.db.get_cursor(commit=True) as cur:
                cur.execute(query, (
                    trade_id,
                    'short_term',
                    signal_details['score'],
                    tech_score,
                    sentiment_score,
                    str(signal_details)
                ))

            logger.info(f"Recorded strategy metadata for trade {trade_id}")

        except Exception as e:
            logger.error(f"Error recording strategy metadata: {e}")

    def monitor_positions(self) -> List[Dict[str, Any]]:
        """
        Monitor open positions and generate exit signals.

        Returns:
            List of exit recommendations
        """
        logger.info("Monitoring open short-term positions...")

        # Get open trades from this strategy
        query = """
            SELECT
                th.id as trade_id,
                th.ticker_code,
                th.entry_price,
                th.entry_date,
                th.quantity,
                tm.entry_signal_score
            FROM trade_history th
            LEFT JOIN trade_metadata tm ON th.id = tm.trade_id
            WHERE th.status = 'OPEN'
              AND (tm.strategy_type = 'short_term' OR tm.strategy_type IS NULL)
            ORDER BY th.entry_date DESC
        """

        results = self.db.execute_query(query)

        if not results:
            logger.info("No open short-term positions")
            return []

        exit_recommendations = []

        for trade in results:
            trade_id = trade['trade_id']
            ticker = trade['ticker_code']
            entry_price = float(trade['entry_price'])
            entry_date = trade['entry_date']

            # Calculate holding time
            holding_time = datetime.now() - entry_date
            holding_hours = holding_time.total_seconds() / 3600

            # Get current price (in production, fetch real price)
            current_price = self._get_current_price(ticker)

            if not current_price:
                continue

            # Get exit signal
            exit_signal = self.signal_generator.get_exit_signal(
                ticker=ticker,
                entry_price=entry_price,
                current_price=current_price,
                holding_hours=int(holding_hours)
            )

            if exit_signal['action'] == 'EXIT':
                exit_recommendations.append({
                    'trade_id': trade_id,
                    'ticker': ticker,
                    'entry_price': entry_price,
                    'current_price': current_price,
                    'pnl_pct': exit_signal['pnl_pct'],
                    'holding_hours': holding_hours,
                    'reasons': exit_signal['reasons'],
                    'confidence': exit_signal['confidence']
                })

                logger.info(f"Exit recommended for {ticker}: {exit_signal['reasons']}")

        logger.info(f"Generated {len(exit_recommendations)} exit recommendations")

        return exit_recommendations

    def execute_exit(self, trade_id: int) -> bool:
        """
        Execute exit for a trade.

        Args:
            trade_id: Trade ID to close

        Returns:
            Success status
        """
        logger.info(f"Executing exit for trade {trade_id}")

        result = self.trading_engine.close_position(trade_id)

        return result

    def _get_current_price(self, ticker: str) -> Optional[float]:
        """Get current price for ticker."""
        # In production, call broker API
        # For now, return mock or last known price

        if self.trading_engine.dry_run:
            return 2500.0  # Mock price

        return self.trading_engine._get_current_price(ticker)

    def run_cycle(self, available_capital: float) -> Dict[str, Any]:
        """
        Run a single strategy cycle.

        Args:
            available_capital: Available capital for trading

        Returns:
            Cycle summary
        """
        logger.info("\n" + "=" * 60)
        logger.info("Short-Term Strategy Cycle")
        logger.info("=" * 60)

        cycle_summary = {
            'entries': [],
            'exits': [],
            'timestamp': datetime.now().isoformat()
        }

        try:
            # Step 1: Monitor existing positions
            exit_recommendations = self.monitor_positions()

            for rec in exit_recommendations:
                if rec['confidence'] >= 0.6:  # High confidence exits
                    success = self.execute_exit(rec['trade_id'])

                    if success:
                        cycle_summary['exits'].append(rec)

            # Step 2: Scan for new opportunities
            opportunities = self.scan_for_opportunities(min_score=65, max_signals=3)

            # Step 3: Execute new entries
            current_positions = self.risk_manager.get_open_positions()
            max_positions = 5  # Maximum concurrent short-term positions

            if len(current_positions) < max_positions:
                for opp in opportunities:
                    if len(current_positions) >= max_positions:
                        break

                    # Check risk limits
                    can_trade, reason = self.risk_manager.can_execute_trade(
                        signal=opp,
                        current_positions=current_positions,
                        today_pnl=self.risk_manager.get_today_pnl()
                    )

                    if can_trade:
                        result = self.execute_entry(opp, available_capital)

                        if result:
                            cycle_summary['entries'].append(result)
                            current_positions[opp['ticker']] = result['total_value']

            logger.info(f"Cycle complete: {len(cycle_summary['entries'])} entries, {len(cycle_summary['exits'])} exits")

        except Exception as e:
            logger.error(f"Error in strategy cycle: {e}")

        return cycle_summary

    def get_performance_stats(self, days: int = 30) -> Dict[str, Any]:
        """
        Get strategy performance statistics.

        Args:
            days: Number of days to analyze

        Returns:
            Performance metrics
        """
        query = """
            SELECT
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losing_trades,
                AVG(pnl) as avg_pnl,
                SUM(pnl) as total_pnl,
                AVG(pnl_percentage) as avg_pnl_pct,
                AVG(EXTRACT(EPOCH FROM (exit_date - entry_date)) / 3600) as avg_holding_hours
            FROM trade_history th
            LEFT JOIN trade_metadata tm ON th.id = tm.trade_id
            WHERE th.status = 'CLOSED'
              AND (tm.strategy_type = 'short_term' OR tm.strategy_type IS NULL)
              AND th.exit_date >= NOW() - INTERVAL '%s days'
        """

        result = self.db.execute_query(query, (days,))

        if result and result[0]['total_trades']:
            stats = dict(result[0])

            # Calculate win rate
            stats['win_rate'] = (stats['winning_trades'] / stats['total_trades'] * 100) if stats['total_trades'] > 0 else 0

            return stats

        return {
            'total_trades': 0,
            'winning_trades': 0,
            'losing_trades': 0,
            'win_rate': 0,
            'avg_pnl': 0,
            'total_pnl': 0,
            'avg_pnl_pct': 0,
            'avg_holding_hours': 0
        }


if __name__ == '__main__':
    from src.optimization.risk_manager import RiskManager
    from src.execution.trading_engine import MockBrokerAPI

    # Initialize components
    broker = MockBrokerAPI()
    risk_mgr = RiskManager(total_assets=1000000)
    engine = TradingEngine(broker, risk_mgr, dry_run=True)

    # Create strategy
    strategy = ShortTermStrategy(
        trading_engine=engine,
        risk_manager=risk_mgr
    )

    # Run cycle
    result = strategy.run_cycle(available_capital=500000)

    print("\n=== Cycle Summary ===")
    print(f"Entries: {len(result['entries'])}")
    print(f"Exits: {len(result['exits'])}")

    # Performance stats
    stats = strategy.get_performance_stats(days=30)
    print("\n=== Performance (30 days) ===")
    print(f"Total trades: {stats['total_trades']}")
    print(f"Win rate: {stats['win_rate']:.1f}%")
    print(f"Total P&L: ¥{stats['total_pnl']:,.0f}")
    print(f"Avg holding time: {stats['avg_holding_hours']:.1f} hours")
