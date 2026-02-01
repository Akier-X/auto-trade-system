"""
Signal Generator
Generate short-term trading signals from multiple data sources.
"""

import os
import sys
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager
from src.strategies.technical_indicators import TechnicalIndicators
from src.analysis.memory_search import MemorySearchEngine

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ShortTermSignalGenerator:
    """
    Generate short-term trading signals combining:
    - Technical analysis
    - Recent news/sentiment
    - AI consensus (short-term focused)
    - Volume and momentum
    """

    def __init__(self):
        """Initialize signal generator."""
        self.db = get_db_manager()
        self.memory_engine = MemorySearchEngine()
        self.tech_indicators = TechnicalIndicators()

    def get_price_data(
        self,
        ticker: str,
        days: int = 90
    ) -> Optional[pd.DataFrame]:
        """
        Get historical price data for ticker.

        Args:
            ticker: Stock ticker
            days: Number of days of history

        Returns:
            DataFrame with OHLCV data or None
        """
        try:
            # In production, fetch from broker API or market data provider
            # For now, return mock data or query from a price history table

            # Check if we have a price_history table
            query = """
                SELECT date, open, high, low, close, volume
                FROM price_history
                WHERE ticker_code = %s
                  AND date >= NOW() - INTERVAL '%s days'
                ORDER BY date ASC
            """

            results = self.db.execute_query(query, (ticker, days))

            if not results:
                logger.warning(f"No price data for {ticker}")
                return None

            df = pd.DataFrame([dict(r) for r in results])
            return df

        except Exception as e:
            logger.error(f"Error fetching price data: {e}")
            return None

    def get_recent_sentiment(
        self,
        ticker: str,
        hours: int = 24
    ) -> Dict[str, Any]:
        """
        Get recent sentiment from AI analysis.

        Args:
            ticker: Stock ticker
            hours: Hours to look back

        Returns:
            Sentiment analysis
        """
        try:
            # Get recent consensus decisions
            query = """
                SELECT
                    fc.final_decision,
                    fc.aggregated_score,
                    fc.created_at,
                    im.source_type
                FROM final_consensus fc
                JOIN intelligence_memory im ON fc.intelligence_id = im.id
                WHERE im.ticker_code = %s
                  AND fc.created_at >= NOW() - INTERVAL '%s hours'
                ORDER BY fc.created_at DESC
                LIMIT 10
            """

            results = self.db.execute_query(query, (ticker, hours))

            if not results:
                return {
                    'sentiment': 'NEUTRAL',
                    'score': 50,
                    'count': 0
                }

            # Aggregate sentiment
            decisions = [r['final_decision'] for r in results]
            scores = [r['aggregated_score'] for r in results]

            execute_count = decisions.count('EXECUTE')
            reject_count = decisions.count('REJECT')
            avg_score = np.mean(scores)

            # Determine sentiment
            if execute_count > reject_count and avg_score >= 70:
                sentiment = 'BULLISH'
            elif reject_count > execute_count and avg_score <= 40:
                sentiment = 'BEARISH'
            else:
                sentiment = 'NEUTRAL'

            return {
                'sentiment': sentiment,
                'score': avg_score,
                'count': len(results),
                'execute_count': execute_count,
                'reject_count': reject_count
            }

        except Exception as e:
            logger.error(f"Error getting sentiment: {e}")
            return {
                'sentiment': 'NEUTRAL',
                'score': 50,
                'count': 0
            }

    def calculate_momentum(self, df: pd.DataFrame) -> Dict[str, float]:
        """
        Calculate momentum indicators.

        Args:
            df: DataFrame with price data

        Returns:
            Momentum metrics
        """
        if df.empty or len(df) < 10:
            return {
                'price_momentum_1d': 0,
                'price_momentum_5d': 0,
                'volume_momentum': 0
            }

        close = df['close']
        volume = df['volume']

        # Price momentum
        momentum_1d = ((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2] * 100) if len(close) >= 2 else 0
        momentum_5d = ((close.iloc[-1] - close.iloc[-6]) / close.iloc[-6] * 100) if len(close) >= 6 else 0

        # Volume momentum
        avg_volume_20d = volume.rolling(window=min(20, len(volume))).mean().iloc[-1]
        current_volume = volume.iloc[-1]
        volume_momentum = ((current_volume - avg_volume_20d) / avg_volume_20d * 100) if avg_volume_20d > 0 else 0

        return {
            'price_momentum_1d': momentum_1d,
            'price_momentum_5d': momentum_5d,
            'volume_momentum': volume_momentum
        }

    def generate_signal(
        self,
        ticker: str,
        use_sentiment: bool = True,
        use_technical: bool = True
    ) -> Dict[str, Any]:
        """
        Generate comprehensive short-term trading signal.

        Args:
            ticker: Stock ticker
            use_sentiment: Include sentiment analysis
            use_technical: Include technical analysis

        Returns:
            Trading signal with confidence and details
        """
        logger.info(f"Generating short-term signal for {ticker}")

        signal_components = []
        details = {}

        # Technical analysis
        if use_technical:
            price_data = self.get_price_data(ticker, days=90)

            if price_data is not None and not price_data.empty:
                tech_analysis = self.tech_indicators.generate_signals(price_data)
                details['technical'] = tech_analysis

                # Convert to score (0-100)
                tech_score = tech_analysis['score']
                signal_components.append(tech_score)

                logger.info(f"Technical score: {tech_score:.1f}")

                # Add momentum
                momentum = self.calculate_momentum(price_data)
                details['momentum'] = momentum

                # Momentum contribution
                if momentum['price_momentum_5d'] > 5:
                    signal_components.append(70)
                elif momentum['price_momentum_5d'] < -5:
                    signal_components.append(30)
            else:
                logger.warning(f"No price data for {ticker}")

        # Sentiment analysis
        if use_sentiment:
            sentiment = self.get_recent_sentiment(ticker, hours=48)
            details['sentiment'] = sentiment

            if sentiment['count'] > 0:
                sentiment_score = sentiment['score']
                signal_components.append(sentiment_score)

                logger.info(f"Sentiment score: {sentiment_score:.1f}")

        # Calculate final score
        if not signal_components:
            logger.warning("No signal components available")
            return {
                'ticker': ticker,
                'signal': 'NEUTRAL',
                'confidence': 0,
                'score': 50,
                'details': details,
                'timestamp': datetime.now().isoformat()
            }

        final_score = np.mean(signal_components)
        confidence = min(len(signal_components) / 3, 1.0)  # Max confidence with 3+ components

        # Determine signal
        if final_score >= 65:
            signal = 'BUY'
            confidence = confidence * (final_score / 100)
        elif final_score <= 35:
            signal = 'SELL'
            confidence = confidence * ((100 - final_score) / 100)
        else:
            signal = 'NEUTRAL'
            confidence = confidence * 0.5

        logger.info(f"Final signal for {ticker}: {signal} (score={final_score:.1f}, confidence={confidence:.2f})")

        return {
            'ticker': ticker,
            'signal': signal,
            'confidence': confidence,
            'score': final_score,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }

    def scan_market(
        self,
        min_score: float = 60,
        max_results: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Scan market for trading opportunities.

        Args:
            min_score: Minimum signal score
            max_results: Maximum number of results

        Returns:
            List of trading signals
        """
        logger.info(f"Scanning market for opportunities (min_score={min_score})")

        # Get monitored tickers
        query = """
            SELECT DISTINCT ticker_code
            FROM monitored_tickers
            WHERE is_active = TRUE
            LIMIT 50
        """

        results = self.db.execute_query(query)

        if not results:
            logger.warning("No monitored tickers found")
            return []

        tickers = [r['ticker_code'] for r in results]
        signals = []

        for ticker in tickers:
            try:
                signal = self.generate_signal(ticker)

                if signal['score'] >= min_score and signal['signal'] in ['BUY', 'SELL']:
                    signals.append(signal)

            except Exception as e:
                logger.error(f"Error generating signal for {ticker}: {e}")

        # Sort by score
        signals.sort(key=lambda x: x['score'], reverse=True)

        # Limit results
        signals = signals[:max_results]

        logger.info(f"Found {len(signals)} trading opportunities")

        return signals

    def get_exit_signal(
        self,
        ticker: str,
        entry_price: float,
        current_price: float,
        holding_hours: int
    ) -> Dict[str, Any]:
        """
        Generate exit signal for existing position.

        Args:
            ticker: Stock ticker
            entry_price: Entry price
            current_price: Current price
            holding_hours: Hours held

        Returns:
            Exit signal
        """
        # Calculate return
        pnl_pct = (current_price - entry_price) / entry_price * 100

        # Get current technical signal
        price_data = self.get_price_data(ticker, days=30)

        if price_data is None or price_data.empty:
            return {
                'action': 'HOLD',
                'reason': 'Insufficient data',
                'confidence': 0
            }

        tech_analysis = self.tech_indicators.generate_signals(price_data)

        # Exit rules for short-term trading
        exit_reasons = []
        exit_score = 0

        # Rule 1: Take profit (>3% gain)
        if pnl_pct >= 3.0:
            exit_reasons.append(f"Take profit: +{pnl_pct:.1f}%")
            exit_score += 30

        # Rule 2: Stop loss (<-2% loss)
        if pnl_pct <= -2.0:
            exit_reasons.append(f"Stop loss: {pnl_pct:.1f}%")
            exit_score += 50

        # Rule 3: Technical reversal
        if tech_analysis['signal'] == 'SELL':
            exit_reasons.append("Technical reversal signal")
            exit_score += 25

        # Rule 4: Time-based exit (held >48 hours)
        if holding_hours >= 48:
            exit_reasons.append(f"Time limit: {holding_hours}h")
            exit_score += 20

        # Rule 5: RSI overbought
        if tech_analysis['indicators'].get('rsi', 50) > 75:
            exit_reasons.append("Overbought (RSI)")
            exit_score += 15

        # Determine action
        if exit_score >= 40:
            action = 'EXIT'
            confidence = min(exit_score / 100, 1.0)
        else:
            action = 'HOLD'
            confidence = 0.5

        return {
            'action': action,
            'reasons': exit_reasons,
            'confidence': confidence,
            'pnl_pct': pnl_pct,
            'exit_score': exit_score,
            'technical_signal': tech_analysis['signal']
        }


if __name__ == '__main__':
    # Test signal generator
    generator = ShortTermSignalGenerator()

    # Test single ticker
    ticker = '7203'
    signal = generator.generate_signal(ticker)

    print(f"\n=== Short-Term Signal for {ticker} ===")
    print(f"Signal: {signal['signal']}")
    print(f"Confidence: {signal['confidence']:.2f}")
    print(f"Score: {signal['score']:.1f}")
    print(f"\nDetails:")
    for key, value in signal['details'].items():
        print(f"  {key}: {value}")

    # Test market scan
    print("\n=== Market Scan ===")
    opportunities = generator.scan_market(min_score=60, max_results=5)

    for opp in opportunities:
        print(f"{opp['ticker']}: {opp['signal']} (score={opp['score']:.1f})")
