"""
Trading Execution Engine
Execute trades through broker APIs with safety checks and logging.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager
from src.optimization.risk_manager import RiskManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TradingEngine:
    """
    Execute trades with risk management and database logging.

    Features:
    - Pre-trade risk checks
    - Order execution through broker API
    - Execution confirmation
    - Database persistence
    - Trade history tracking
    """

    def __init__(
        self,
        broker_api,
        risk_manager: RiskManager,
        dry_run: bool = True
    ):
        """
        Initialize trading engine.

        Args:
            broker_api: Broker API instance
            risk_manager: Risk manager instance
            dry_run: If True, simulate trades without execution
        """
        self.broker = broker_api
        self.risk_manager = risk_manager
        self.dry_run = dry_run
        self.db = get_db_manager()

        logger.info(f"Trading Engine initialized (dry_run={dry_run})")

    def execute_signal(
        self,
        signal: Dict[str, Any],
        consensus: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Execute a trading signal.

        Args:
            signal: Trading signal
            consensus: Consensus decision data

        Returns:
            Execution result or None if failed
        """
        ticker = signal.get('ticker_code')
        action = signal.get('action', 'BUY')
        allocation = signal.get('allocation', 0)

        logger.info(f"{'[DRY RUN] ' if self.dry_run else ''}Executing {action} {ticker}: ¥{allocation:,.0f}")

        try:
            # Pre-trade checks
            if not self._pre_trade_checks(signal):
                logger.warning("Pre-trade checks failed")
                return None

            # Get current price
            current_price = self._get_current_price(ticker)

            if not current_price or current_price <= 0:
                logger.error(f"Invalid price for {ticker}: {current_price}")
                return None

            # Calculate quantity
            quantity = int(allocation / current_price)

            if quantity <= 0:
                logger.error(f"Invalid quantity: {quantity}")
                return None

            # Calculate stop-loss
            stop_loss_price = self.risk_manager.calculate_stop_loss(
                entry_price=current_price,
                position_size=allocation
            )

            # Execute order
            if self.dry_run:
                order_result = self._simulate_order(
                    ticker=ticker,
                    action=action,
                    quantity=quantity,
                    price=current_price
                )
            else:
                order_result = self._execute_order(
                    ticker=ticker,
                    action=action,
                    quantity=quantity,
                    price=current_price
                )

            if not order_result or not order_result.get('success'):
                logger.error(f"Order execution failed: {order_result}")
                return None

            # Record trade in database
            trade_id = self._record_trade(
                ticker=ticker,
                action=action,
                quantity=quantity,
                entry_price=current_price,
                stop_loss=stop_loss_price,
                consensus_id=consensus.get('id'),
                order_result=order_result
            )

            logger.info(f"✓ Trade recorded: ID={trade_id}, {action} {quantity}x{ticker}@¥{current_price:,.2f}")

            return {
                'trade_id': trade_id,
                'ticker': ticker,
                'action': action,
                'quantity': quantity,
                'price': current_price,
                'total_value': quantity * current_price,
                'stop_loss': stop_loss_price,
                'order_result': order_result,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Error executing trade: {e}")
            return None

    def _pre_trade_checks(self, signal: Dict[str, Any]) -> bool:
        """Run pre-trade safety checks."""
        # Check if trading is halted
        should_halt, reason = self.risk_manager.should_halt_trading()

        if should_halt:
            logger.error(f"🛑 Trading halted: {reason}")
            return False

        # Get current positions and today's PnL
        positions = self.risk_manager.get_open_positions()
        today_pnl = self.risk_manager.get_today_pnl()

        # Check if trade can be executed
        can_execute, reason = self.risk_manager.can_execute_trade(
            signal=signal,
            current_positions=positions,
            today_pnl=today_pnl
        )

        if not can_execute:
            logger.warning(f"Risk check failed: {reason}")
            return False

        return True

    def _get_current_price(self, ticker: str) -> Optional[float]:
        """
        Get current market price for ticker.

        Args:
            ticker: Stock ticker

        Returns:
            Current price or None
        """
        try:
            if self.dry_run:
                # Return mock price
                return 2500.0

            # Call broker API
            price = self.broker.get_price(ticker)

            return price

        except Exception as e:
            logger.error(f"Error getting price for {ticker}: {e}")
            return None

    def _simulate_order(
        self,
        ticker: str,
        action: str,
        quantity: int,
        price: float
    ) -> Dict[str, Any]:
        """Simulate order execution (dry run)."""
        logger.info(f"[SIMULATED] {action} {quantity}x{ticker}@¥{price:,.2f}")

        return {
            'success': True,
            'order_id': f'SIM-{datetime.now().strftime("%Y%m%d%H%M%S")}',
            'ticker': ticker,
            'action': action,
            'quantity': quantity,
            'price': price,
            'status': 'FILLED',
            'simulated': True
        }

    def _execute_order(
        self,
        ticker: str,
        action: str,
        quantity: int,
        price: float
    ) -> Dict[str, Any]:
        """
        Execute real order through broker API.

        Args:
            ticker: Stock ticker
            action: BUY or SELL
            quantity: Number of shares
            price: Limit price

        Returns:
            Order result
        """
        try:
            logger.info(f"[REAL] Sending order: {action} {quantity}x{ticker}@¥{price:,.2f}")

            # Call broker API
            order_result = self.broker.send_order(
                ticker=ticker,
                action=action,
                quantity=quantity,
                price=price,
                order_type='MARKET'  # or 'LIMIT'
            )

            return order_result

        except Exception as e:
            logger.error(f"Order execution error: {e}")
            return {'success': False, 'error': str(e)}

    def _record_trade(
        self,
        ticker: str,
        action: str,
        quantity: int,
        entry_price: float,
        stop_loss: float,
        consensus_id: Optional[int],
        order_result: Dict[str, Any]
    ) -> int:
        """Record trade in database."""
        try:
            query = """
                INSERT INTO trade_history
                (ticker_code, order_type, quantity, entry_price, entry_date,
                 status, consensus_id, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """

            notes = {
                'stop_loss': stop_loss,
                'order_result': order_result,
                'dry_run': self.dry_run
            }

            with self.db.get_cursor(commit=True) as cur:
                cur.execute(query, (
                    ticker,
                    action,
                    quantity,
                    entry_price,
                    datetime.now(),
                    'OPEN',
                    consensus_id,
                    str(notes)
                ))

                trade_id = cur.fetchone()['id']

            return trade_id

        except Exception as e:
            logger.error(f"Error recording trade: {e}")
            raise

    def close_position(
        self,
        trade_id: int,
        exit_price: Optional[float] = None
    ) -> bool:
        """
        Close an open position.

        Args:
            trade_id: Trade ID to close
            exit_price: Exit price (if None, get current price)

        Returns:
            Success status
        """
        try:
            # Get trade details
            query = """
                SELECT ticker_code, quantity, entry_price
                FROM trade_history
                WHERE id = %s AND status = 'OPEN'
            """

            result = self.db.execute_query(query, (trade_id,))

            if not result:
                logger.error(f"Trade {trade_id} not found or already closed")
                return False

            trade = result[0]
            ticker = trade['ticker_code']
            quantity = trade['quantity']
            entry_price = trade['entry_price']

            # Get exit price
            if exit_price is None:
                exit_price = self._get_current_price(ticker)

            if not exit_price:
                logger.error(f"Could not get exit price for {ticker}")
                return False

            # Calculate P&L
            pnl = (exit_price - entry_price) * quantity
            pnl_pct = (exit_price - entry_price) / entry_price * 100

            # Execute sell order
            if not self.dry_run:
                order_result = self._execute_order(
                    ticker=ticker,
                    action='SELL',
                    quantity=quantity,
                    price=exit_price
                )

                if not order_result.get('success'):
                    logger.error("Failed to close position")
                    return False

            # Update database
            update_query = """
                UPDATE trade_history
                SET exit_price = %s,
                    exit_date = %s,
                    pnl = %s,
                    pnl_percentage = %s,
                    status = 'CLOSED'
                WHERE id = %s
            """

            self.db.execute_query(update_query, (
                exit_price,
                datetime.now(),
                pnl,
                pnl_pct,
                trade_id
            ), fetch=False)

            logger.info(f"✓ Position closed: Trade #{trade_id}, P&L: ¥{pnl:,.0f} ({pnl_pct:+.2f}%)")

            return True

        except Exception as e:
            logger.error(f"Error closing position: {e}")
            return False

    def get_open_trades(self) -> List[Dict[str, Any]]:
        """Get all open trades."""
        try:
            query = """
                SELECT *
                FROM trade_history
                WHERE status = 'OPEN'
                ORDER BY entry_date DESC
            """

            results = self.db.execute_query(query)

            return [dict(r) for r in results]

        except Exception as e:
            logger.error(f"Error getting open trades: {e}")
            return []


# Mock broker API for testing
class MockBrokerAPI:
    """Mock broker API for testing."""

    def get_price(self, ticker: str) -> float:
        """Get mock price."""
        return 2500.0

    def send_order(
        self,
        ticker: str,
        action: str,
        quantity: int,
        price: float,
        order_type: str = 'MARKET'
    ) -> Dict[str, Any]:
        """Send mock order."""
        return {
            'success': True,
            'order_id': f'ORD-{datetime.now().strftime("%Y%m%d%H%M%S")}',
            'status': 'FILLED'
        }


if __name__ == '__main__':
    # Test trading engine
    broker = MockBrokerAPI()
    risk_mgr = RiskManager(total_assets=1000000)
    engine = TradingEngine(broker, risk_mgr, dry_run=True)

    # Mock signal
    mock_signal = {
        'ticker_code': '7203',
        'action': 'BUY',
        'allocation': 200000,
        'confidence': 0.85
    }

    mock_consensus = {
        'id': 1,
        'consensus_score': 85,
        'final_decision': 'EXECUTE'
    }

    # Execute trade
    result = engine.execute_signal(mock_signal, mock_consensus)

    if result:
        print("\n✓ Trade Executed:")
        print(f"  Ticker: {result['ticker']}")
        print(f"  Action: {result['action']}")
        print(f"  Quantity: {result['quantity']}")
        print(f"  Price: ¥{result['price']:,.2f}")
        print(f"  Total: ¥{result['total_value']:,.0f}")
        print(f"  Stop-Loss: ¥{result['stop_loss']:,.2f}")
