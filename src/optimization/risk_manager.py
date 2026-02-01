"""
Risk Manager
Manage trading risk with automatic stop-loss, position limits, and drawdown protection.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RiskManager:
    """
    Comprehensive risk management system.

    Features:
    - Position size limits
    - Daily loss limits
    - Maximum drawdown protection
    - Correlation risk management
    - Automatic stop-loss calculation
    """

    def __init__(
        self,
        total_assets: float,
        max_loss_per_trade: float = 0.01,
        max_loss_daily: float = 0.05,
        max_drawdown: float = 0.15,
        max_position_size: float = 0.20
    ):
        """
        Initialize risk manager.

        Args:
            total_assets: Total portfolio assets
            max_loss_per_trade: Maximum loss per trade (fraction)
            max_loss_daily: Maximum daily loss (fraction)
            max_drawdown: Maximum drawdown from peak (fraction)
            max_position_size: Maximum position size (fraction)
        """
        self.total_assets = total_assets
        self.max_loss_per_trade = max_loss_per_trade
        self.max_loss_daily = max_loss_daily
        self.max_drawdown = max_drawdown
        self.max_position_size = max_position_size

        self.db = get_db_manager()

        logger.info(f"Risk Manager initialized: Assets=¥{total_assets:,.0f}")
        logger.info(f"  Max loss per trade: {max_loss_per_trade*100}%")
        logger.info(f"  Max daily loss: {max_loss_daily*100}%")
        logger.info(f"  Max drawdown: {max_drawdown*100}%")

    def can_execute_trade(
        self,
        signal: Dict[str, Any],
        current_positions: Dict[str, float],
        today_pnl: float = 0.0
    ) -> Tuple[bool, str]:
        """
        Check if a trade can be executed based on risk rules.

        Args:
            signal: Trading signal with ticker, action, amount
            current_positions: Current position values
            today_pnl: Today's profit/loss

        Returns:
            (can_execute, reason)
        """
        ticker = signal.get('ticker_code')
        action = signal.get('action', 'BUY')
        amount = signal.get('amount', 0)
        expected_loss = signal.get('expected_loss', amount * 0.05)

        # Check 1: Per-trade loss limit
        max_trade_loss = self.total_assets * self.max_loss_per_trade

        if expected_loss > max_trade_loss:
            reason = f"Trade exceeds max loss limit: ¥{expected_loss:,.0f} > ¥{max_trade_loss:,.0f}"
            logger.warning(reason)
            return False, reason

        # Check 2: Daily loss limit
        max_daily_loss = self.total_assets * self.max_loss_daily

        if today_pnl < 0 and abs(today_pnl) >= max_daily_loss:
            reason = f"Daily loss limit reached: ¥{abs(today_pnl):,.0f} >= ¥{max_daily_loss:,.0f}"
            logger.warning(reason)
            return False, reason

        # Check 3: Position size limit
        max_position = self.total_assets * self.max_position_size

        if action == 'BUY' and amount > max_position:
            reason = f"Position size exceeds limit: ¥{amount:,.0f} > ¥{max_position:,.0f}"
            logger.warning(reason)
            return False, reason

        # Check 4: Concentration risk (don't over-allocate to single ticker)
        current_position_value = current_positions.get(ticker, 0)

        if action == 'BUY':
            new_position_value = current_position_value + amount
            position_pct = new_position_value / self.total_assets

            if position_pct > self.max_position_size:
                reason = f"Would exceed position limit for {ticker}: {position_pct*100:.1f}%"
                logger.warning(reason)
                return False, reason

        # Check 5: Drawdown check
        current_drawdown = self.calculate_current_drawdown()

        if current_drawdown >= self.max_drawdown:
            reason = f"Max drawdown reached: {current_drawdown*100:.1f}% >= {self.max_drawdown*100}%"
            logger.warning(reason)
            return False, reason

        # All checks passed
        logger.info(f"✓ Trade approved for {ticker}: ¥{amount:,.0f}")
        return True, "OK"

    def calculate_stop_loss(
        self,
        entry_price: float,
        position_size: float,
        max_loss_pct: float = 0.05
    ) -> float:
        """
        Calculate stop-loss price.

        Args:
            entry_price: Entry price
            position_size: Position size in currency
            max_loss_pct: Maximum loss percentage

        Returns:
            Stop-loss price
        """
        stop_loss_price = entry_price * (1 - max_loss_pct)

        logger.info(f"Stop-loss: ¥{stop_loss_price:,.2f} ({max_loss_pct*100}% below ¥{entry_price:,.2f})")

        return stop_loss_price

    def calculate_position_size_with_risk(
        self,
        entry_price: float,
        stop_loss_price: float,
        risk_amount: Optional[float] = None
    ) -> float:
        """
        Calculate position size based on risk (R-based sizing).

        Args:
            entry_price: Entry price
            stop_loss_price: Stop-loss price
            risk_amount: Amount to risk (defaults to max_loss_per_trade)

        Returns:
            Position size (number of shares)
        """
        if risk_amount is None:
            risk_amount = self.total_assets * self.max_loss_per_trade

        risk_per_share = entry_price - stop_loss_price

        if risk_per_share <= 0:
            logger.warning("Invalid stop-loss: must be below entry price")
            return 0

        position_size = risk_amount / risk_per_share

        logger.info(f"Position size: {position_size:.0f} shares (risk=¥{risk_amount:,.0f})")

        return position_size

    def calculate_current_drawdown(self) -> float:
        """
        Calculate current drawdown from peak.

        Returns:
            Drawdown as fraction
        """
        try:
            # Get historical portfolio values
            query = """
                SELECT total_assets, snapshot_at
                FROM portfolio_mgmt
                ORDER BY snapshot_at DESC
                LIMIT 100
            """

            results = self.db.execute_query(query)

            if not results or len(results) < 2:
                return 0.0

            # Find peak value
            peak_value = max(r['total_assets'] for r in results)

            # Current value
            current_value = results[0]['total_assets']

            # Calculate drawdown
            if peak_value <= 0:
                return 0.0

            drawdown = (peak_value - current_value) / peak_value

            return max(0, drawdown)

        except Exception as e:
            logger.error(f"Error calculating drawdown: {e}")
            return 0.0

    def get_today_pnl(self) -> float:
        """
        Get today's realized profit/loss.

        Returns:
            Today's PnL
        """
        try:
            query = """
                SELECT COALESCE(SUM(pnl), 0) as total_pnl
                FROM trade_history
                WHERE DATE(exit_date) = CURRENT_DATE
                  AND status = 'CLOSED'
            """

            result = self.db.execute_query(query)

            if result:
                return float(result[0]['total_pnl'])

            return 0.0

        except Exception as e:
            logger.error(f"Error getting today's PnL: {e}")
            return 0.0

    def get_open_positions(self) -> Dict[str, float]:
        """
        Get current open positions.

        Returns:
            Dictionary of ticker to position value
        """
        try:
            query = """
                SELECT
                    ticker_code,
                    SUM(quantity * entry_price) as position_value
                FROM trade_history
                WHERE status = 'OPEN'
                GROUP BY ticker_code
            """

            results = self.db.execute_query(query)

            positions = {
                r['ticker_code']: float(r['position_value'])
                for r in results
            }

            return positions

        except Exception as e:
            logger.error(f"Error getting open positions: {e}")
            return {}

    def check_portfolio_health(self) -> Dict[str, Any]:
        """
        Comprehensive portfolio health check.

        Returns:
            Health metrics and warnings
        """
        logger.info("Running portfolio health check...")

        health = {
            'status': 'HEALTHY',
            'warnings': [],
            'metrics': {}
        }

        # Check drawdown
        drawdown = self.calculate_current_drawdown()
        health['metrics']['drawdown'] = drawdown

        if drawdown >= self.max_drawdown * 0.8:
            health['warnings'].append(f"High drawdown: {drawdown*100:.1f}%")
            health['status'] = 'WARNING'

        if drawdown >= self.max_drawdown:
            health['warnings'].append(f"MAX DRAWDOWN EXCEEDED: {drawdown*100:.1f}%")
            health['status'] = 'CRITICAL'

        # Check daily loss
        today_pnl = self.get_today_pnl()
        health['metrics']['today_pnl'] = today_pnl

        if today_pnl < 0:
            daily_loss_pct = abs(today_pnl) / self.total_assets

            if daily_loss_pct >= self.max_loss_daily * 0.8:
                health['warnings'].append(f"High daily loss: {daily_loss_pct*100:.1f}%")
                health['status'] = 'WARNING'

            if daily_loss_pct >= self.max_loss_daily:
                health['warnings'].append(f"DAILY LOSS LIMIT EXCEEDED: {daily_loss_pct*100:.1f}%")
                health['status'] = 'CRITICAL'

        # Check position concentration
        positions = self.get_open_positions()
        health['metrics']['open_positions'] = len(positions)

        if positions:
            max_position_value = max(positions.values())
            max_position_pct = max_position_value / self.total_assets

            if max_position_pct > self.max_position_size:
                health['warnings'].append(f"Over-concentrated position: {max_position_pct*100:.1f}%")
                health['status'] = 'WARNING'

        logger.info(f"Portfolio health: {health['status']}")

        for warning in health['warnings']:
            logger.warning(f"  ⚠ {warning}")

        return health

    def should_halt_trading(self) -> Tuple[bool, str]:
        """
        Determine if trading should be halted.

        Returns:
            (should_halt, reason)
        """
        health = self.check_portfolio_health()

        if health['status'] == 'CRITICAL':
            reason = "Critical risk conditions detected: " + ", ".join(health['warnings'])
            logger.error(f"🛑 TRADING HALTED: {reason}")
            return True, reason

        return False, ""


if __name__ == '__main__':
    # Test risk manager
    risk_mgr = RiskManager(total_assets=1000000)

    # Mock signal
    mock_signal = {
        'ticker_code': '7203',
        'action': 'BUY',
        'amount': 150000,
        'expected_loss': 7500
    }

    # Check if trade can be executed
    can_execute, reason = risk_mgr.can_execute_trade(
        signal=mock_signal,
        current_positions={'9984': 100000},
        today_pnl=-20000
    )

    print(f"\nTrade Decision: {'✓ APPROVED' if can_execute else '✗ REJECTED'}")
    print(f"Reason: {reason}")

    # Calculate stop-loss
    stop_loss = risk_mgr.calculate_stop_loss(
        entry_price=2500,
        position_size=150000,
        max_loss_pct=0.05
    )

    print(f"\nStop-Loss Price: ¥{stop_loss:,.2f}")

    # Portfolio health check
    health = risk_mgr.check_portfolio_health()

    print(f"\nPortfolio Health: {health['status']}")
    print("Metrics:", health['metrics'])
    print("Warnings:", health['warnings'])
