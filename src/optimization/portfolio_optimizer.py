"""
Portfolio Optimizer
Optimize portfolio allocation using Kelly Criterion and modern portfolio theory.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

import numpy as np
from scipy.optimize import minimize

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PortfolioOptimizer:
    """
    Portfolio optimization using various strategies.

    Features:
    - Kelly Criterion for position sizing
    - Modern Portfolio Theory optimization
    - Risk-adjusted allocation
    - Diversification constraints
    """

    def __init__(self):
        """Initialize portfolio optimizer."""
        self.db = get_db_manager()

    def kelly_criterion(
        self,
        win_rate: float,
        avg_win: float,
        avg_loss: float,
        max_fraction: float = 0.25
    ) -> float:
        """
        Calculate optimal position size using Kelly Criterion.

        Formula: f* = (p * b - q) / b
        where:
        - f*: optimal fraction of capital to invest
        - p: win probability
        - q: loss probability (1 - p)
        - b: win/loss ratio

        Args:
            win_rate: Historical win rate (0-1)
            avg_win: Average winning trade return
            avg_loss: Average losing trade return
            max_fraction: Maximum fraction to invest (safety cap)

        Returns:
            Optimal fraction of capital (0-max_fraction)
        """
        if avg_loss <= 0 or win_rate <= 0 or win_rate >= 1:
            logger.warning(f"Invalid Kelly params: win_rate={win_rate}, avg_loss={avg_loss}")
            return 0.0

        p = win_rate
        q = 1 - p
        b = avg_win / avg_loss

        kelly_fraction = (p * b - q) / b

        # Apply safety cap (never invest more than max_fraction)
        optimal_fraction = max(0, min(kelly_fraction, max_fraction))

        logger.debug(f"Kelly: {kelly_fraction:.3f} -> capped at {optimal_fraction:.3f}")

        return optimal_fraction

    def calculate_position_size(
        self,
        total_capital: float,
        confidence: float,
        win_rate: float,
        expected_return: float,
        max_position_pct: float = 0.20
    ) -> float:
        """
        Calculate position size for a trade.

        Args:
            total_capital: Total available capital
            confidence: Confidence in signal (0-1)
            win_rate: Historical win rate
            expected_return: Expected return of trade
            max_position_pct: Maximum position as % of capital

        Returns:
            Position size in currency units
        """
        # Base Kelly calculation
        avg_win = expected_return if expected_return > 0 else 0.05
        avg_loss = 0.05  # Assume 5% average loss

        kelly_fraction = self.kelly_criterion(
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            max_fraction=max_position_pct
        )

        # Adjust by confidence
        adjusted_fraction = kelly_fraction * confidence

        # Calculate position size
        position_size = total_capital * adjusted_fraction

        logger.info(f"Position size: ¥{position_size:,.0f} ({adjusted_fraction*100:.1f}% of capital)")

        return position_size

    def optimize_allocation(
        self,
        signals: List[Dict[str, Any]],
        total_capital: float,
        risk_limit: float = 0.05
    ) -> Dict[str, float]:
        """
        Optimize capital allocation across multiple signals.

        Args:
            signals: List of trading signals with confidence and expected return
            total_capital: Total available capital
            risk_limit: Maximum risk per trade (as fraction)

        Returns:
            Dictionary mapping ticker to allocated amount
        """
        logger.info(f"Optimizing allocation for {len(signals)} signals")

        if not signals:
            return {}

        # Sort signals by confidence * expected_return
        sorted_signals = sorted(
            signals,
            key=lambda x: x.get('confidence', 0) * x.get('expected_return', 0),
            reverse=True
        )

        allocations = {}
        remaining_capital = total_capital
        max_risk_amount = total_capital * risk_limit

        for signal in sorted_signals:
            ticker = signal.get('ticker_code')
            confidence = signal.get('confidence', 0.5)
            expected_return = signal.get('expected_return', 0.05)
            win_rate = signal.get('win_rate', 0.6)

            # Calculate position size
            position_size = self.calculate_position_size(
                total_capital=total_capital,  # Use total, not remaining
                confidence=confidence,
                win_rate=win_rate,
                expected_return=expected_return
            )

            # Check risk limit
            potential_loss = position_size * 0.05  # Assume 5% stop loss
            if potential_loss > max_risk_amount:
                position_size = max_risk_amount / 0.05

            # Check if we have enough capital
            if position_size > remaining_capital:
                position_size = remaining_capital

            if position_size > 0:
                allocations[ticker] = position_size
                remaining_capital -= position_size

                logger.info(f"{ticker}: ¥{position_size:,.0f} (confidence={confidence:.2f})")

            # Stop if no capital left
            if remaining_capital <= 0:
                break

        total_allocated = sum(allocations.values())
        logger.info(f"Total allocated: ¥{total_allocated:,.0f} ({total_allocated/total_capital*100:.1f}%)")

        return allocations

    def diversification_score(self, allocations: Dict[str, float]) -> float:
        """
        Calculate diversification score (0-1, higher is more diversified).

        Args:
            allocations: Dictionary of ticker to allocation

        Returns:
            Diversification score
        """
        if not allocations:
            return 0.0

        total = sum(allocations.values())
        if total == 0:
            return 0.0

        # Calculate Herfindahl-Hirschman Index (HHI)
        weights = [amount / total for amount in allocations.values()]
        hhi = sum(w ** 2 for w in weights)

        # Convert to diversification score (inverse of HHI, normalized)
        n = len(allocations)
        max_hhi = 1.0  # Maximum concentration (all in one)
        min_hhi = 1.0 / n  # Minimum concentration (equal weights)

        if max_hhi == min_hhi:
            return 1.0

        diversification = 1 - (hhi - min_hhi) / (max_hhi - min_hhi)

        return diversification

    def rebalance_portfolio(
        self,
        current_positions: Dict[str, float],
        target_allocation: Dict[str, float],
        tolerance: float = 0.05
    ) -> List[Dict[str, Any]]:
        """
        Generate rebalancing trades to match target allocation.

        Args:
            current_positions: Current holdings (ticker -> value)
            target_allocation: Target allocation (ticker -> value)
            tolerance: Rebalance tolerance (0.05 = 5%)

        Returns:
            List of rebalancing trades
        """
        logger.info("Calculating rebalancing trades...")

        trades = []

        # Get all tickers
        all_tickers = set(current_positions.keys()) | set(target_allocation.keys())

        for ticker in all_tickers:
            current = current_positions.get(ticker, 0)
            target = target_allocation.get(ticker, 0)

            diff = target - current
            diff_pct = abs(diff) / max(current, target, 1)  # Avoid division by zero

            # Only rebalance if difference exceeds tolerance
            if diff_pct > tolerance:
                trade_type = 'BUY' if diff > 0 else 'SELL'
                amount = abs(diff)

                trades.append({
                    'ticker': ticker,
                    'action': trade_type,
                    'amount': amount,
                    'current': current,
                    'target': target,
                    'diff_pct': diff_pct
                })

                logger.info(f"{trade_type} {ticker}: ¥{amount:,.0f} ({diff_pct*100:.1f}% diff)")

        logger.info(f"Generated {len(trades)} rebalancing trades")

        return trades

    def get_portfolio_metrics(self) -> Dict[str, Any]:
        """
        Get current portfolio metrics from database.

        Returns:
            Portfolio metrics
        """
        try:
            query = """
                SELECT *
                FROM portfolio_mgmt
                ORDER BY snapshot_at DESC
                LIMIT 1
            """

            result = self.db.execute_query(query)

            if result:
                metrics = dict(result[0])
                return metrics

            return {}

        except Exception as e:
            logger.error(f"Error getting portfolio metrics: {e}")
            return {}

    def update_portfolio_metrics(
        self,
        total_assets: float,
        available_cash: float,
        invested_amount: float,
        unrealized_pnl: float = 0.0
    ) -> int:
        """
        Update portfolio metrics in database.

        Args:
            total_assets: Total portfolio value
            available_cash: Available cash
            invested_amount: Amount invested
            unrealized_pnl: Unrealized profit/loss

        Returns:
            ID of created record
        """
        try:
            query = """
                INSERT INTO portfolio_mgmt
                (total_assets, available_cash, invested_amount, unrealized_pnl, snapshot_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """

            with self.db.get_cursor(commit=True) as cur:
                cur.execute(query, (
                    total_assets,
                    available_cash,
                    invested_amount,
                    unrealized_pnl,
                    datetime.now()
                ))

                record_id = cur.fetchone()['id']

            logger.info(f"Updated portfolio metrics: ID={record_id}")

            return record_id

        except Exception as e:
            logger.error(f"Error updating portfolio metrics: {e}")
            raise


if __name__ == '__main__':
    # Test portfolio optimizer
    optimizer = PortfolioOptimizer()

    # Mock trading signals
    mock_signals = [
        {
            'ticker_code': '7203',
            'confidence': 0.85,
            'expected_return': 0.08,
            'win_rate': 0.65
        },
        {
            'ticker_code': '9984',
            'confidence': 0.78,
            'expected_return': 0.06,
            'win_rate': 0.60
        },
        {
            'ticker_code': 'AAPL',
            'confidence': 0.92,
            'expected_return': 0.10,
            'win_rate': 0.70
        }
    ]

    # Optimize allocation
    allocations = optimizer.optimize_allocation(
        signals=mock_signals,
        total_capital=1000000,  # ¥1,000,000
        risk_limit=0.05
    )

    print("\nOptimized Allocations:")
    for ticker, amount in allocations.items():
        print(f"{ticker}: ¥{amount:,.0f}")

    # Diversification score
    div_score = optimizer.diversification_score(allocations)
    print(f"\nDiversification Score: {div_score:.3f}")
