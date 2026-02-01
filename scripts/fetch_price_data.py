"""
Fetch Price Data
Download historical price data for monitored tickers.
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage.db_manager import get_db_manager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PriceDataFetcher:
    """Fetch and store historical price data."""

    def __init__(self):
        """Initialize fetcher."""
        self.db = get_db_manager()

    def get_monitored_tickers(self) -> List[str]:
        """Get list of monitored tickers."""
        query = """
            SELECT DISTINCT ticker_code
            FROM monitored_tickers
            WHERE is_active = TRUE
        """

        results = self.db.execute_query(query)

        return [r['ticker_code'] for r in results]

    def fetch_yahoo_finance(self, ticker: str, days: int = 90) -> List[Dict[str, Any]]:
        """
        Fetch price data from Yahoo Finance.

        Args:
            ticker: Stock ticker
            days: Number of days to fetch

        Returns:
            List of price records
        """
        try:
            import yfinance as yf

            # Download data
            data = yf.download(ticker, period=f"{days}d", interval="1d", progress=False)

            if data.empty:
                logger.warning(f"No data for {ticker}")
                return []

            # Convert to list of dicts
            records = []

            for date, row in data.iterrows():
                records.append({
                    'ticker_code': ticker,
                    'date': date,
                    'open': float(row['Open']),
                    'high': float(row['High']),
                    'low': float(row['Low']),
                    'close': float(row['Close']),
                    'volume': int(row['Volume']),
                    'adjusted_close': float(row['Adj Close']) if 'Adj Close' in row else None
                })

            logger.info(f"Fetched {len(records)} records for {ticker}")

            return records

        except Exception as e:
            logger.error(f"Error fetching data for {ticker}: {e}")
            return []

    def store_price_data(self, records: List[Dict[str, Any]]) -> int:
        """
        Store price data in database.

        Args:
            records: List of price records

        Returns:
            Number of records inserted/updated
        """
        if not records:
            return 0

        query = """
            INSERT INTO price_history
            (ticker_code, date, open, high, low, close, volume, adjusted_close)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ticker_code, date)
            DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                adjusted_close = EXCLUDED.adjusted_close
        """

        count = 0

        try:
            with self.db.get_cursor(commit=True) as cur:
                for record in records:
                    cur.execute(query, (
                        record['ticker_code'],
                        record['date'],
                        record['open'],
                        record['high'],
                        record['low'],
                        record['close'],
                        record['volume'],
                        record.get('adjusted_close')
                    ))
                    count += 1

            logger.info(f"Stored {count} price records")

        except Exception as e:
            logger.error(f"Error storing price data: {e}")

        return count

    def fetch_all_tickers(self, days: int = 90):
        """
        Fetch price data for all monitored tickers.

        Args:
            days: Number of days to fetch
        """
        logger.info(f"Fetching price data for last {days} days")

        tickers = self.get_monitored_tickers()

        if not tickers:
            logger.warning("No monitored tickers found")
            return

        logger.info(f"Found {len(tickers)} monitored tickers")

        total_records = 0

        for ticker in tickers:
            logger.info(f"\nFetching {ticker}...")

            records = self.fetch_yahoo_finance(ticker, days=days)

            if records:
                count = self.store_price_data(records)
                total_records += count

        logger.info(f"\n{'=' * 60}")
        logger.info(f"Fetched total {total_records} price records for {len(tickers)} tickers")
        logger.info(f"{'=' * 60}")

    def update_latest_prices(self):
        """Update latest prices for all tickers (daily update)."""
        logger.info("Updating latest prices...")

        self.fetch_all_tickers(days=5)  # Fetch last 5 days to ensure coverage


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Fetch Price Data')
    parser.add_argument(
        '--days',
        type=int,
        default=90,
        help='Number of days to fetch (default: 90)'
    )
    parser.add_argument(
        '--ticker',
        type=str,
        help='Specific ticker to fetch (optional)'
    )

    args = parser.parse_args()

    try:
        fetcher = PriceDataFetcher()

        if args.ticker:
            logger.info(f"Fetching data for {args.ticker}")
            records = fetcher.fetch_yahoo_finance(args.ticker, days=args.days)
            fetcher.store_price_data(records)

        else:
            fetcher.fetch_all_tickers(days=args.days)

    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    # Check if yfinance is installed
    try:
        import yfinance
    except ImportError:
        print("ERROR: yfinance not installed")
        print("Install it with: pip install yfinance")
        sys.exit(1)

    main()
