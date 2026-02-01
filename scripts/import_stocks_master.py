"""
Import Stock Master Data
Fetch stock list from JPX and import into stocks_master table.
"""

import os
import sys
import logging
import requests
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage.db_manager import get_db_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class StocksMasterImporter:
    """Import stocks master data from various sources."""

    # JPX listed companies data
    JPX_URL = "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"

    # Alternative: Use a CSV file if JPX URL is unavailable
    FALLBACK_CSV = "data/stocks_master.csv"

    def __init__(self):
        """Initialize importer with database connection."""
        self.db = get_db_manager()

    def download_jpx_data(self) -> pd.DataFrame:
        """
        Download stock list from JPX (Japan Exchange Group).

        Returns:
            DataFrame with stock information
        """
        try:
            logger.info("Downloading stock list from JPX...")

            response = requests.get(self.JPX_URL, timeout=30)
            response.raise_for_status()

            # Save to temporary file
            temp_file = "temp_jpx_data.xls"
            with open(temp_file, 'wb') as f:
                f.write(response.content)

            # Read Excel file
            df = pd.read_excel(temp_file, skiprows=0)

            # Clean up
            os.remove(temp_file)

            logger.info(f"Downloaded {len(df)} stock records from JPX")
            return df

        except Exception as e:
            logger.error(f"Failed to download JPX data: {e}")
            return None

    def load_fallback_csv(self) -> pd.DataFrame:
        """
        Load stock data from fallback CSV file.

        Returns:
            DataFrame with stock information
        """
        try:
            logger.info(f"Loading fallback data from {self.FALLBACK_CSV}...")
            df = pd.read_csv(self.FALLBACK_CSV)
            logger.info(f"Loaded {len(df)} records from CSV")
            return df

        except Exception as e:
            logger.error(f"Failed to load fallback CSV: {e}")
            return None

    def create_sample_data(self) -> pd.DataFrame:
        """
        Create sample stock data for testing.

        Returns:
            DataFrame with sample stock data
        """
        logger.info("Creating sample stock data...")

        sample_stocks = [
            {
                'ticker_code': '7203',
                'company_name': 'トヨタ自動車',
                'sector': '輸送用機器',
                'subsector': '自動車',
                'market_cap': 35000000000000,
                'exchange': 'TSE',
                'currency': 'JPY',
                'is_active': True
            },
            {
                'ticker_code': '9984',
                'company_name': 'ソフトバンクグループ',
                'sector': '情報・通信業',
                'subsector': '通信',
                'market_cap': 12000000000000,
                'exchange': 'TSE',
                'currency': 'JPY',
                'is_active': True
            },
            {
                'ticker_code': '6758',
                'company_name': 'ソニーグループ',
                'sector': '電気機器',
                'subsector': 'エレクトロニクス',
                'market_cap': 15000000000000,
                'exchange': 'TSE',
                'currency': 'JPY',
                'is_active': True
            },
            {
                'ticker_code': '8306',
                'company_name': '三菱UFJフィナンシャル・グループ',
                'sector': '銀行業',
                'subsector': 'メガバンク',
                'market_cap': 13000000000000,
                'exchange': 'TSE',
                'currency': 'JPY',
                'is_active': True
            },
            {
                'ticker_code': '9432',
                'company_name': '日本電信電話',
                'sector': '情報・通信業',
                'subsector': '通信',
                'market_cap': 17000000000000,
                'exchange': 'TSE',
                'currency': 'JPY',
                'is_active': True
            },
            {
                'ticker_code': 'AAPL',
                'company_name': 'Apple Inc.',
                'sector': 'Technology',
                'subsector': 'Consumer Electronics',
                'market_cap': 3000000000000,
                'exchange': 'NASDAQ',
                'currency': 'USD',
                'is_active': True
            },
            {
                'ticker_code': 'GOOGL',
                'company_name': 'Alphabet Inc.',
                'sector': 'Technology',
                'subsector': 'Internet Services',
                'market_cap': 1800000000000,
                'exchange': 'NASDAQ',
                'currency': 'USD',
                'is_active': True
            },
            {
                'ticker_code': 'MSFT',
                'company_name': 'Microsoft Corporation',
                'sector': 'Technology',
                'subsector': 'Software',
                'market_cap': 2800000000000,
                'exchange': 'NASDAQ',
                'currency': 'USD',
                'is_active': True
            },
            {
                'ticker_code': 'TSLA',
                'company_name': 'Tesla Inc.',
                'sector': 'Automotive',
                'subsector': 'Electric Vehicles',
                'market_cap': 800000000000,
                'exchange': 'NASDAQ',
                'currency': 'USD',
                'is_active': True
            },
            {
                'ticker_code': 'NVDA',
                'company_name': 'NVIDIA Corporation',
                'sector': 'Technology',
                'subsector': 'Semiconductors',
                'market_cap': 1200000000000,
                'exchange': 'NASDAQ',
                'currency': 'USD',
                'is_active': True
            }
        ]

        df = pd.DataFrame(sample_stocks)
        logger.info(f"Created {len(df)} sample stock records")
        return df

    def normalize_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize DataFrame columns to match database schema.

        Args:
            df: Raw DataFrame

        Returns:
            Normalized DataFrame
        """
        # Define expected columns
        expected_columns = [
            'ticker_code',
            'company_name',
            'sector',
            'subsector',
            'market_cap',
            'trading_volume',
            'exchange',
            'currency',
            'listing_date',
            'is_active'
        ]

        # Ensure all expected columns exist
        for col in expected_columns:
            if col not in df.columns:
                df[col] = None

        # Data type conversions
        if 'market_cap' in df.columns:
            df['market_cap'] = pd.to_numeric(df['market_cap'], errors='coerce')

        if 'trading_volume' in df.columns:
            df['trading_volume'] = pd.to_numeric(df['trading_volume'], errors='coerce')

        # Fill default values
        df['is_active'] = df['is_active'].fillna(True)
        df['currency'] = df['currency'].fillna('JPY')

        return df[expected_columns]

    def import_to_database(self, df: pd.DataFrame) -> int:
        """
        Import stock data to database.

        Args:
            df: DataFrame with stock data

        Returns:
            Number of records imported
        """
        try:
            logger.info("Importing stock data to database...")

            # Normalize data
            df = self.normalize_dataframe(df)

            # Prepare insert query
            query = """
                INSERT INTO stocks_master
                (ticker_code, company_name, sector, subsector, market_cap, trading_volume,
                 exchange, currency, listing_date, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (ticker_code)
                DO UPDATE SET
                    company_name = EXCLUDED.company_name,
                    sector = EXCLUDED.sector,
                    subsector = EXCLUDED.subsector,
                    market_cap = EXCLUDED.market_cap,
                    trading_volume = EXCLUDED.trading_volume,
                    exchange = EXCLUDED.exchange,
                    currency = EXCLUDED.currency,
                    listing_date = EXCLUDED.listing_date,
                    is_active = EXCLUDED.is_active,
                    updated_at = CURRENT_TIMESTAMP
            """

            # Convert DataFrame to list of tuples
            records = []
            for _, row in df.iterrows():
                records.append((
                    row['ticker_code'],
                    row['company_name'],
                    row['sector'],
                    row['subsector'],
                    int(row['market_cap']) if pd.notna(row['market_cap']) else None,
                    int(row['trading_volume']) if pd.notna(row['trading_volume']) else None,
                    row['exchange'],
                    row['currency'],
                    row['listing_date'],
                    row['is_active']
                ))

            # Execute batch insert
            count = self.db.execute_many(query, records)

            logger.info(f"Successfully imported {count} stock records")
            return count

        except Exception as e:
            logger.error(f"Failed to import stock data: {e}")
            raise

    def run(self, use_sample: bool = False):
        """
        Run the import process.

        Args:
            use_sample: If True, use sample data instead of downloading
        """
        try:
            if use_sample:
                # Use sample data
                df = self.create_sample_data()
            else:
                # Try to download from JPX
                df = self.download_jpx_data()

                if df is None:
                    # Try fallback CSV
                    df = self.load_fallback_csv()

                if df is None:
                    # Use sample data as last resort
                    logger.warning("Using sample data as fallback")
                    df = self.create_sample_data()

            # Import to database
            if df is not None and len(df) > 0:
                count = self.import_to_database(df)
                logger.info(f"✓ Import completed: {count} stocks")
                return count
            else:
                logger.error("No data available to import")
                return 0

        except Exception as e:
            logger.error(f"Import failed: {e}")
            raise


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Import stocks master data')
    parser.add_argument(
        '--sample',
        action='store_true',
        help='Use sample data instead of downloading from JPX'
    )

    args = parser.parse_args()

    try:
        importer = StocksMasterImporter()
        count = importer.run(use_sample=args.sample)

        if count > 0:
            print(f"\n✓ Successfully imported {count} stock records")
        else:
            print("\n✗ No records imported")

    except Exception as e:
        print(f"\n✗ Import failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
