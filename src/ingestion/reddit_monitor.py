"""
Reddit Monitor
Monitors investment-related subreddits for stock discussions.
"""

import os
import sys
import logging
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import praw
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


class RedditMonitor:
    """Monitor Reddit subreddits for stock-related posts."""

    # Default subreddits to monitor
    DEFAULT_SUBREDDITS = [
        'stocks',
        'investing',
        'SecurityAnalysis',
        'wallstreetbets',
        'StockMarket',
        'options',
        'DayTrading'
    ]

    def __init__(self, subreddits: List[str] = None):
        """
        Initialize Reddit monitor.

        Args:
            subreddits: List of subreddit names to monitor
        """
        self.db = get_db_manager()
        self.subreddits = subreddits or self.DEFAULT_SUBREDDITS
        self.reddit = self._initialize_reddit()
        self.processed_ids = set()  # Track processed post IDs

    def _initialize_reddit(self) -> Optional[praw.Reddit]:
        """
        Initialize Reddit API client.

        Returns:
            Reddit client instance or None if credentials missing
        """
        try:
            client_id = os.getenv('REDDIT_CLIENT_ID')
            client_secret = os.getenv('REDDIT_CLIENT_SECRET')
            user_agent = os.getenv('REDDIT_USER_AGENT', 'AutoTradingBot/1.0')

            if not client_id or not client_secret:
                logger.warning("Reddit credentials not found in environment variables")
                logger.warning("Please set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET")
                logger.warning("Get credentials at: https://www.reddit.com/prefs/apps")
                return None

            reddit = praw.Reddit(
                client_id=client_id,
                client_secret=client_secret,
                user_agent=user_agent
            )

            # Test connection
            reddit.user.me()
            logger.info("Reddit API connection successful")

            return reddit

        except Exception as e:
            logger.error(f"Failed to initialize Reddit API: {e}")
            return None

    def fetch_subreddit_posts(
        self,
        subreddit_name: str,
        limit: int = 100,
        sort: str = 'new'
    ) -> List[Dict[str, Any]]:
        """
        Fetch posts from a subreddit.

        Args:
            subreddit_name: Name of subreddit
            limit: Maximum number of posts to fetch
            sort: Sort method ('new', 'hot', 'top', 'rising')

        Returns:
            List of post data dictionaries
        """
        if not self.reddit:
            logger.warning("Reddit API not initialized, skipping fetch")
            return []

        try:
            logger.info(f"Fetching posts from r/{subreddit_name} (sort={sort}, limit={limit})")

            subreddit = self.reddit.subreddit(subreddit_name)

            # Get posts based on sort method
            if sort == 'new':
                posts = subreddit.new(limit=limit)
            elif sort == 'hot':
                posts = subreddit.hot(limit=limit)
            elif sort == 'top':
                posts = subreddit.top(limit=limit, time_filter='day')
            elif sort == 'rising':
                posts = subreddit.rising(limit=limit)
            else:
                posts = subreddit.new(limit=limit)

            post_data = []

            for submission in posts:
                # Skip if already processed
                if submission.id in self.processed_ids:
                    continue

                post = {
                    'subreddit': subreddit_name,
                    'title': submission.title,
                    'content': submission.selftext if submission.is_self else '',
                    'author': str(submission.author) if submission.author else '[deleted]',
                    'url': f"https://reddit.com{submission.permalink}",
                    'score': submission.score,
                    'num_comments': submission.num_comments,
                    'created_utc': datetime.fromtimestamp(submission.created_utc)
                }

                post_data.append(post)
                self.processed_ids.add(submission.id)

            logger.info(f"Fetched {len(post_data)} new posts from r/{subreddit_name}")
            return post_data

        except Exception as e:
            logger.error(f"Error fetching from r/{subreddit_name}: {e}")
            return []

    def store_posts(self, posts: List[Dict[str, Any]]) -> int:
        """
        Store Reddit posts in database.

        Args:
            posts: List of post data dictionaries

        Returns:
            Number of posts stored
        """
        stored_count = 0

        for post in posts:
            try:
                # Insert into database
                post_id = self.db.insert_raw_reddit(
                    subreddit=post['subreddit'],
                    title=post['title'],
                    content=post['content'],
                    author=post['author'],
                    url=post['url']
                )

                stored_count += 1
                logger.debug(f"Stored Reddit post: {post['title'][:50]}... (ID={post_id})")

            except Exception as e:
                logger.error(f"Error storing Reddit post: {e}")

        return stored_count

    def monitor_subreddits(self, limit_per_subreddit: int = 50):
        """
        Monitor all configured subreddits.

        Args:
            limit_per_subreddit: Max posts to fetch per subreddit
        """
        logger.info(f"Starting Reddit monitoring cycle at {datetime.now()}")
        logger.info(f"Monitoring {len(self.subreddits)} subreddits")

        total_stored = 0

        for subreddit_name in self.subreddits:
            try:
                # Fetch posts
                posts = self.fetch_subreddit_posts(
                    subreddit_name=subreddit_name,
                    limit=limit_per_subreddit,
                    sort='new'
                )

                # Store in database
                stored = self.store_posts(posts)
                total_stored += stored

                # Delay to respect rate limits
                time.sleep(2)

            except Exception as e:
                logger.error(f"Error processing r/{subreddit_name}: {e}")

        logger.info(f"Reddit monitoring cycle completed: {total_stored} new posts stored")

    def search_ticker_mentions(self, ticker: str, subreddit_name: str = 'all', limit: int = 100):
        """
        Search for mentions of a specific ticker.

        Args:
            ticker: Stock ticker symbol
            subreddit_name: Subreddit to search (or 'all')
            limit: Maximum results

        Returns:
            List of posts mentioning the ticker
        """
        if not self.reddit:
            logger.warning("Reddit API not initialized")
            return []

        try:
            logger.info(f"Searching for ticker ${ticker} in r/{subreddit_name}")

            subreddit = self.reddit.subreddit(subreddit_name)
            search_results = subreddit.search(
                query=f"${ticker} OR {ticker}",
                limit=limit,
                sort='new'
            )

            posts = []

            for submission in search_results:
                post = {
                    'subreddit': submission.subreddit.display_name,
                    'title': submission.title,
                    'content': submission.selftext if submission.is_self else '',
                    'author': str(submission.author) if submission.author else '[deleted]',
                    'url': f"https://reddit.com{submission.permalink}",
                    'score': submission.score,
                    'num_comments': submission.num_comments,
                    'created_utc': datetime.fromtimestamp(submission.created_utc)
                }

                posts.append(post)

            logger.info(f"Found {len(posts)} posts mentioning ${ticker}")
            return posts

        except Exception as e:
            logger.error(f"Error searching for ticker {ticker}: {e}")
            return []

    def run_once(self, limit_per_subreddit: int = 50):
        """Run a single monitoring cycle."""
        logger.info("Running single Reddit monitoring cycle")
        self.monitor_subreddits(limit_per_subreddit=limit_per_subreddit)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Reddit Monitor')
    parser.add_argument(
        '--limit',
        type=int,
        default=50,
        help='Posts to fetch per subreddit (default: 50)'
    )
    parser.add_argument(
        '--search',
        type=str,
        help='Search for a specific ticker symbol'
    )
    parser.add_argument(
        '--subreddit',
        type=str,
        default='all',
        help='Subreddit to search (with --search)'
    )

    args = parser.parse_args()

    try:
        monitor = RedditMonitor()

        if args.search:
            # Search for specific ticker
            posts = monitor.search_ticker_mentions(
                ticker=args.search,
                subreddit_name=args.subreddit,
                limit=100
            )

            if posts:
                stored = monitor.store_posts(posts)
                logger.info(f"Stored {stored} posts about ${args.search}")
            else:
                logger.info(f"No posts found about ${args.search}")

        else:
            # Regular monitoring
            monitor.run_once(limit_per_subreddit=args.limit)

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
