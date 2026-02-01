"""
News Feed Monitor
Fetches news from RSS feeds and stores in database.
"""

import os
import sys
import logging
import time
from datetime import datetime
from typing import List, Dict, Any
import feedparser
import schedule
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


class NewsFeedMonitor:
    """Monitor RSS feeds for stock-related news."""

    # Default news sources (RSS feeds)
    DEFAULT_SOURCES = [
        {
            'name': 'Google News - 日本株',
            'url': 'https://news.google.com/rss/search?q=日本株&hl=ja&gl=JP&ceid=JP:ja',
            'language': 'ja'
        },
        {
            'name': 'Google News - 株式市場',
            'url': 'https://news.google.com/rss/search?q=株式市場&hl=ja&gl=JP&ceid=JP:ja',
            'language': 'ja'
        },
        {
            'name': 'Yahoo Finance - Stock Market',
            'url': 'https://finance.yahoo.com/news/rssindex',
            'language': 'en'
        },
        {
            'name': 'Reuters - Markets',
            'url': 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
            'language': 'en'
        },
        {
            'name': 'Bloomberg - Markets',
            'url': 'https://www.bloomberg.com/feed/podcast/etf-report.xml',
            'language': 'en'
        }
    ]

    def __init__(self, sources: List[Dict[str, str]] = None):
        """
        Initialize news feed monitor.

        Args:
            sources: List of RSS feed sources
        """
        self.db = get_db_manager()
        self.sources = sources or self.DEFAULT_SOURCES
        self.processed_urls = set()  # Track processed URLs to avoid duplicates

    def fetch_feed(self, source: Dict[str, str]) -> List[Dict[str, Any]]:
        """
        Fetch and parse RSS feed.

        Args:
            source: Feed source configuration

        Returns:
            List of parsed articles
        """
        try:
            logger.info(f"Fetching feed from {source['name']}...")

            feed = feedparser.parse(source['url'])

            if feed.bozo:
                logger.warning(f"Feed parsing warning for {source['name']}: {feed.bozo_exception}")

            articles = []

            for entry in feed.entries:
                # Extract article data
                article = {
                    'source_name': source['name'],
                    'title': entry.get('title', ''),
                    'content': entry.get('summary', entry.get('description', '')),
                    'url': entry.get('link', ''),
                    'published_at': None
                }

                # Parse published date
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    article['published_at'] = datetime(*entry.published_parsed[:6])
                elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                    article['published_at'] = datetime(*entry.updated_parsed[:6])

                # Skip if no URL (can't deduplicate)
                if not article['url']:
                    continue

                # Skip if already processed
                if article['url'] in self.processed_urls:
                    continue

                articles.append(article)

            logger.info(f"Found {len(articles)} new articles from {source['name']}")
            return articles

        except Exception as e:
            logger.error(f"Error fetching feed from {source['name']}: {e}")
            return []

    def store_articles(self, articles: List[Dict[str, Any]]) -> int:
        """
        Store articles in database.

        Args:
            articles: List of articles to store

        Returns:
            Number of articles stored
        """
        stored_count = 0

        for article in articles:
            try:
                # Insert into database
                news_id = self.db.insert_raw_news(
                    source_name=article['source_name'],
                    title=article['title'],
                    content=article['content'],
                    url=article['url'],
                    published_at=article['published_at']
                )

                # Track processed URL
                self.processed_urls.add(article['url'])
                stored_count += 1

                logger.debug(f"Stored article: {article['title'][:50]}... (ID={news_id})")

            except Exception as e:
                # Skip if duplicate (unique constraint on URL)
                if 'duplicate' in str(e).lower() or 'unique' in str(e).lower():
                    logger.debug(f"Skipping duplicate article: {article['url']}")
                else:
                    logger.error(f"Error storing article: {e}")

        return stored_count

    def fetch_all_sources(self):
        """Fetch news from all configured sources."""
        logger.info(f"Starting news fetch cycle at {datetime.now()}")
        logger.info(f"Monitoring {len(self.sources)} sources")

        total_stored = 0

        for source in self.sources:
            try:
                # Fetch articles
                articles = self.fetch_feed(source)

                # Store in database
                stored = self.store_articles(articles)
                total_stored += stored

                # Small delay between sources to be polite
                time.sleep(2)

            except Exception as e:
                logger.error(f"Error processing source {source['name']}: {e}")

        logger.info(f"Fetch cycle completed: {total_stored} new articles stored")

    def run_scheduler(self, interval_minutes: int = 30):
        """
        Run news monitor with scheduled intervals.

        Args:
            interval_minutes: Interval between fetch cycles
        """
        logger.info(f"Starting news feed monitor (interval: {interval_minutes} minutes)")

        # Initial fetch
        self.fetch_all_sources()

        # Schedule periodic fetches
        schedule.every(interval_minutes).minutes.do(self.fetch_all_sources)

        # Run scheduler loop
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)  # Check every minute

        except KeyboardInterrupt:
            logger.info("News feed monitor stopped by user")

    def run_once(self):
        """Run a single fetch cycle."""
        logger.info("Running single news fetch cycle")
        self.fetch_all_sources()


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='News Feed Monitor')
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run once and exit (don\'t start scheduler)'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=30,
        help='Fetch interval in minutes (default: 30)'
    )

    args = parser.parse_args()

    try:
        monitor = NewsFeedMonitor()

        if args.once:
            monitor.run_once()
        else:
            monitor.run_scheduler(interval_minutes=args.interval)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
