"""
TDnet Monitor
Monitor timely disclosure network for corporate announcements.
"""

import os
import sys
import logging
import time
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TDnetMonitor:
    """Monitor TDnet (Timely Disclosure Network) for corporate disclosures."""

    # TDnet URLs
    TDNET_BASE_URL = "https://www.release.tdnet.info/inbs"
    TDNET_LIST_URL = f"{TDNET_BASE_URL}/I_list_001_{}_.html"  # Format with date YYYYMMDD

    def __init__(self):
        """Initialize TDnet monitor."""
        self.db = get_db_manager()
        self.processed_urls = set()

    def get_today_disclosures_url(self) -> str:
        """Get URL for today's disclosures."""
        today = datetime.now().strftime("%Y%m%d")
        return self.TDNET_LIST_URL.format(today)

    def get_date_disclosures_url(self, date: datetime) -> str:
        """Get URL for specific date's disclosures."""
        date_str = date.strftime("%Y%m%d")
        return self.TDNET_LIST_URL.format(date_str)

    def extract_ticker_from_text(self, text: str) -> Optional[str]:
        """
        Extract ticker code from text.

        Args:
            text: Text to search

        Returns:
            Ticker code or None
        """
        # Japanese stocks: 4-digit number
        match = re.search(r'(\d{4})', text)
        if match:
            return match.group(1)
        return None

    def fetch_disclosure_list(self, url: str) -> List[Dict[str, Any]]:
        """
        Fetch disclosure list from TDnet.

        Args:
            url: TDnet list URL

        Returns:
            List of disclosure data
        """
        try:
            logger.info(f"Fetching disclosures from: {url}")

            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            disclosures = []

            # Parse disclosure table
            # Note: TDnet structure may vary, this is a basic implementation
            rows = soup.find_all('tr')

            for row in rows:
                cells = row.find_all('td')

                if len(cells) < 3:
                    continue

                # Extract disclosure info
                time_cell = cells[0].get_text(strip=True) if len(cells) > 0 else ''
                company_cell = cells[1].get_text(strip=True) if len(cells) > 1 else ''
                title_cell = cells[2].get_text(strip=True) if len(cells) > 2 else ''

                # Extract PDF link
                pdf_link = None
                pdf_tag = cells[2].find('a') if len(cells) > 2 else None
                if pdf_tag and 'href' in pdf_tag.attrs:
                    pdf_link = self.TDNET_BASE_URL + '/' + pdf_tag['href']

                # Extract ticker code
                ticker_code = self.extract_ticker_from_text(company_cell)

                # Determine disclosure type
                disclosure_type = self._classify_disclosure_type(title_cell)

                disclosure = {
                    'ticker_code': ticker_code,
                    'disclosure_type': disclosure_type,
                    'title': title_cell,
                    'company_name': company_cell,
                    'time': time_cell,
                    'pdf_url': pdf_link,
                    'disclosure_date': datetime.now()
                }

                # Skip if already processed
                if pdf_link and pdf_link in self.processed_urls:
                    continue

                disclosures.append(disclosure)

                if pdf_link:
                    self.processed_urls.add(pdf_link)

            logger.info(f"Found {len(disclosures)} new disclosures")
            return disclosures

        except Exception as e:
            logger.error(f"Error fetching disclosures: {e}")
            return []

    def _classify_disclosure_type(self, title: str) -> str:
        """
        Classify disclosure type based on title.

        Args:
            title: Disclosure title

        Returns:
            Disclosure type
        """
        title_lower = title.lower()

        if '決算' in title or '業績' in title or 'earnings' in title_lower:
            return 'Earnings'
        elif 'M&A' in title or '買収' in title or '合併' in title:
            return 'M&A'
        elif '配当' in title or 'dividend' in title_lower:
            return 'Dividend'
        elif '株式' in title or 'stock' in title_lower:
            return 'Stock'
        elif '人事' in title or '役員' in title:
            return 'Personnel'
        elif '設備投資' in title or '投資' in title:
            return 'Investment'
        elif '訂正' in title or 'correction' in title_lower:
            return 'Correction'
        else:
            return 'Other'

    def store_disclosures(self, disclosures: List[Dict[str, Any]]) -> int:
        """
        Store disclosures in database.

        Args:
            disclosures: List of disclosure data

        Returns:
            Number of disclosures stored
        """
        stored_count = 0

        for disclosure in disclosures:
            try:
                query = """
                    INSERT INTO raw_tdnet
                    (ticker_code, disclosure_type, title, content, pdf_url, disclosure_date, created_at, processed)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE)
                    RETURNING id
                """

                with self.db.get_cursor(commit=True) as cur:
                    cur.execute(query, (
                        disclosure['ticker_code'],
                        disclosure['disclosure_type'],
                        disclosure['title'],
                        disclosure.get('company_name', ''),
                        disclosure['pdf_url'],
                        disclosure['disclosure_date'],
                        datetime.now()
                    ))

                    disclosure_id = cur.fetchone()['id']
                    stored_count += 1

                    logger.debug(f"Stored disclosure: {disclosure['title'][:50]}... (ID={disclosure_id})")

            except Exception as e:
                if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                    logger.debug(f"Skipping duplicate disclosure: {disclosure['title']}")
                else:
                    logger.error(f"Error storing disclosure: {e}")

        return stored_count

    def monitor_today(self):
        """Monitor today's disclosures."""
        logger.info("Monitoring TDnet for today's disclosures")

        url = self.get_today_disclosures_url()
        disclosures = self.fetch_disclosure_list(url)

        if disclosures:
            stored = self.store_disclosures(disclosures)
            logger.info(f"Stored {stored} new disclosures")
        else:
            logger.info("No new disclosures found")

    def monitor_date_range(self, start_date: datetime, end_date: datetime):
        """
        Monitor disclosures for a date range.

        Args:
            start_date: Start date
            end_date: End date
        """
        logger.info(f"Monitoring TDnet from {start_date} to {end_date}")

        current_date = start_date
        total_stored = 0

        while current_date <= end_date:
            url = self.get_date_disclosures_url(current_date)
            disclosures = self.fetch_disclosure_list(url)

            if disclosures:
                stored = self.store_disclosures(disclosures)
                total_stored += stored
                logger.info(f"{current_date.date()}: Stored {stored} disclosures")

            # Move to next day
            current_date += timedelta(days=1)

            # Delay to be polite
            time.sleep(2)

        logger.info(f"Total stored: {total_stored} disclosures")

    def run_once(self):
        """Run a single monitoring cycle."""
        logger.info("Running single TDnet monitoring cycle")
        self.monitor_today()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='TDnet Monitor')
    parser.add_argument(
        '--days',
        type=int,
        default=1,
        help='Number of days to fetch (from today backwards)'
    )

    args = parser.parse_args()

    try:
        monitor = TDnetMonitor()

        if args.days == 1:
            # Monitor today only
            monitor.run_once()
        else:
            # Monitor date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=args.days - 1)
            monitor.monitor_date_range(start_date, end_date)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
