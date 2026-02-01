"""
Technical Indicators
Calculate technical analysis indicators for short-term trading.
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TechnicalIndicators:
    """
    Technical analysis indicators for short-term trading.

    Indicators:
    - Simple Moving Average (SMA)
    - Exponential Moving Average (EMA)
    - Relative Strength Index (RSI)
    - MACD (Moving Average Convergence Divergence)
    - Bollinger Bands
    - Average True Range (ATR)
    - Volume analysis
    """

    @staticmethod
    def sma(prices: pd.Series, period: int) -> pd.Series:
        """
        Simple Moving Average.

        Args:
            prices: Price series
            period: Period length

        Returns:
            SMA series
        """
        return prices.rolling(window=period).mean()

    @staticmethod
    def ema(prices: pd.Series, period: int) -> pd.Series:
        """
        Exponential Moving Average.

        Args:
            prices: Price series
            period: Period length

        Returns:
            EMA series
        """
        return prices.ewm(span=period, adjust=False).mean()

    @staticmethod
    def rsi(prices: pd.Series, period: int = 14) -> pd.Series:
        """
        Relative Strength Index.

        Args:
            prices: Price series
            period: Period length (default: 14)

        Returns:
            RSI series (0-100)
        """
        # Calculate price changes
        delta = prices.diff()

        # Separate gains and losses
        gains = delta.where(delta > 0, 0)
        losses = -delta.where(delta < 0, 0)

        # Calculate average gains and losses
        avg_gains = gains.rolling(window=period).mean()
        avg_losses = losses.rolling(window=period).mean()

        # Calculate RS and RSI
        rs = avg_gains / avg_losses
        rsi = 100 - (100 / (1 + rs))

        return rsi

    @staticmethod
    def macd(
        prices: pd.Series,
        fast_period: int = 12,
        slow_period: int = 26,
        signal_period: int = 9
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        MACD (Moving Average Convergence Divergence).

        Args:
            prices: Price series
            fast_period: Fast EMA period
            slow_period: Slow EMA period
            signal_period: Signal line period

        Returns:
            (MACD line, Signal line, Histogram)
        """
        # Calculate MACD line
        fast_ema = TechnicalIndicators.ema(prices, fast_period)
        slow_ema = TechnicalIndicators.ema(prices, slow_period)
        macd_line = fast_ema - slow_ema

        # Calculate signal line
        signal_line = TechnicalIndicators.ema(macd_line, signal_period)

        # Calculate histogram
        histogram = macd_line - signal_line

        return macd_line, signal_line, histogram

    @staticmethod
    def bollinger_bands(
        prices: pd.Series,
        period: int = 20,
        std_dev: float = 2.0
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        Bollinger Bands.

        Args:
            prices: Price series
            period: Period length
            std_dev: Number of standard deviations

        Returns:
            (Upper band, Middle band, Lower band)
        """
        middle_band = TechnicalIndicators.sma(prices, period)
        std = prices.rolling(window=period).std()

        upper_band = middle_band + (std * std_dev)
        lower_band = middle_band - (std * std_dev)

        return upper_band, middle_band, lower_band

    @staticmethod
    def atr(
        high: pd.Series,
        low: pd.Series,
        close: pd.Series,
        period: int = 14
    ) -> pd.Series:
        """
        Average True Range.

        Args:
            high: High prices
            low: Low prices
            close: Close prices
            period: Period length

        Returns:
            ATR series
        """
        # Calculate True Range
        tr1 = high - low
        tr2 = abs(high - close.shift())
        tr3 = abs(low - close.shift())

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        # Calculate ATR
        atr = tr.rolling(window=period).mean()

        return atr

    @staticmethod
    def stochastic_oscillator(
        high: pd.Series,
        low: pd.Series,
        close: pd.Series,
        period: int = 14,
        smooth_k: int = 3,
        smooth_d: int = 3
    ) -> Tuple[pd.Series, pd.Series]:
        """
        Stochastic Oscillator.

        Args:
            high: High prices
            low: Low prices
            close: Close prices
            period: Period length
            smooth_k: %K smoothing period
            smooth_d: %D smoothing period

        Returns:
            (%K, %D)
        """
        # Calculate %K
        lowest_low = low.rolling(window=period).min()
        highest_high = high.rolling(window=period).max()

        k = 100 * ((close - lowest_low) / (highest_high - lowest_low))
        k = k.rolling(window=smooth_k).mean()

        # Calculate %D
        d = k.rolling(window=smooth_d).mean()

        return k, d

    @staticmethod
    def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
        """
        On-Balance Volume.

        Args:
            close: Close prices
            volume: Volume

        Returns:
            OBV series
        """
        obv = (np.sign(close.diff()) * volume).fillna(0).cumsum()
        return obv

    @staticmethod
    def vwap(
        high: pd.Series,
        low: pd.Series,
        close: pd.Series,
        volume: pd.Series
    ) -> pd.Series:
        """
        Volume Weighted Average Price.

        Args:
            high: High prices
            low: Low prices
            close: Close prices
            volume: Volume

        Returns:
            VWAP series
        """
        typical_price = (high + low + close) / 3
        vwap = (typical_price * volume).cumsum() / volume.cumsum()

        return vwap

    @staticmethod
    def analyze_trend(prices: pd.Series, periods: List[int] = [5, 10, 20, 50]) -> Dict[str, Any]:
        """
        Analyze overall trend using multiple moving averages.

        Args:
            prices: Price series
            periods: MA periods to analyze

        Returns:
            Trend analysis
        """
        if len(prices) < max(periods):
            return {
                'trend': 'UNKNOWN',
                'strength': 0,
                'mas': {}
            }

        current_price = prices.iloc[-1]
        mas = {}
        above_ma_count = 0

        for period in periods:
            ma = TechnicalIndicators.sma(prices, period).iloc[-1]
            mas[f'ma{period}'] = ma

            if current_price > ma:
                above_ma_count += 1

        # Determine trend
        if above_ma_count >= len(periods) * 0.75:
            trend = 'UPTREND'
            strength = above_ma_count / len(periods)
        elif above_ma_count <= len(periods) * 0.25:
            trend = 'DOWNTREND'
            strength = (len(periods) - above_ma_count) / len(periods)
        else:
            trend = 'SIDEWAYS'
            strength = 0.5

        return {
            'trend': trend,
            'strength': strength,
            'mas': mas,
            'current_price': current_price
        }

    @staticmethod
    def generate_signals(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Generate comprehensive trading signals from OHLCV data.

        Args:
            df: DataFrame with columns: open, high, low, close, volume

        Returns:
            Dictionary of signals and scores
        """
        if len(df) < 50:
            logger.warning("Insufficient data for signal generation")
            return {
                'signal': 'NEUTRAL',
                'score': 50,
                'indicators': {}
            }

        close = df['close']
        high = df['high']
        low = df['low']
        volume = df['volume']

        signals = {}
        scores = []

        # RSI Signal
        rsi = TechnicalIndicators.rsi(close).iloc[-1]
        signals['rsi'] = rsi

        if rsi < 30:
            scores.append(70)  # Oversold - bullish
        elif rsi > 70:
            scores.append(30)  # Overbought - bearish
        else:
            scores.append(50)  # Neutral

        # MACD Signal
        macd_line, signal_line, histogram = TechnicalIndicators.macd(close)
        signals['macd'] = macd_line.iloc[-1]
        signals['macd_signal'] = signal_line.iloc[-1]
        signals['macd_histogram'] = histogram.iloc[-1]

        if histogram.iloc[-1] > 0 and histogram.iloc[-2] <= 0:
            scores.append(75)  # Bullish crossover
        elif histogram.iloc[-1] < 0 and histogram.iloc[-2] >= 0:
            scores.append(25)  # Bearish crossover
        elif histogram.iloc[-1] > 0:
            scores.append(60)  # Above signal
        else:
            scores.append(40)  # Below signal

        # Bollinger Bands Signal
        upper, middle, lower = TechnicalIndicators.bollinger_bands(close)
        signals['bb_upper'] = upper.iloc[-1]
        signals['bb_middle'] = middle.iloc[-1]
        signals['bb_lower'] = lower.iloc[-1]

        current_price = close.iloc[-1]

        if current_price < lower.iloc[-1]:
            scores.append(70)  # Below lower band - bullish
        elif current_price > upper.iloc[-1]:
            scores.append(30)  # Above upper band - bearish
        else:
            scores.append(50)  # Within bands

        # Trend Signal
        trend_analysis = TechnicalIndicators.analyze_trend(close)
        signals['trend'] = trend_analysis['trend']
        signals['trend_strength'] = trend_analysis['strength']

        if trend_analysis['trend'] == 'UPTREND':
            scores.append(50 + trend_analysis['strength'] * 30)
        elif trend_analysis['trend'] == 'DOWNTREND':
            scores.append(50 - trend_analysis['strength'] * 30)
        else:
            scores.append(50)

        # Volume Signal
        avg_volume = volume.rolling(window=20).mean().iloc[-1]
        current_volume = volume.iloc[-1]
        volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1

        signals['volume_ratio'] = volume_ratio

        if volume_ratio > 1.5:
            scores.append(65)  # High volume - confirmation
        elif volume_ratio < 0.5:
            scores.append(45)  # Low volume - weak signal
        else:
            scores.append(50)

        # Calculate overall score
        overall_score = np.mean(scores)

        # Determine signal
        if overall_score >= 60:
            signal = 'BUY'
        elif overall_score <= 40:
            signal = 'SELL'
        else:
            signal = 'NEUTRAL'

        logger.info(f"Technical analysis: {signal} (score={overall_score:.1f})")

        return {
            'signal': signal,
            'score': overall_score,
            'indicators': signals,
            'component_scores': scores
        }


if __name__ == '__main__':
    # Test with mock data
    import yfinance as yf

    # Download sample data
    ticker = "AAPL"
    data = yf.download(ticker, period="3mo", interval="1d", progress=False)

    if not data.empty:
        # Prepare data
        df = pd.DataFrame({
            'open': data['Open'],
            'high': data['High'],
            'low': data['Low'],
            'close': data['Close'],
            'volume': data['Volume']
        })

        # Generate signals
        result = TechnicalIndicators.generate_signals(df)

        print(f"\n=== Technical Analysis for {ticker} ===")
        print(f"Signal: {result['signal']}")
        print(f"Score: {result['score']:.1f}/100")
        print(f"\nIndicators:")
        for key, value in result['indicators'].items():
            if isinstance(value, (int, float)):
                print(f"  {key}: {value:.2f}")
            else:
                print(f"  {key}: {value}")
    else:
        print("No data available for testing")
