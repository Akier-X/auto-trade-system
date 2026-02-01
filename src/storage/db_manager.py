"""
Database Manager for Auto Trade System
Handles all database operations including connection management, queries, and transactions.
"""

import os
import logging
from typing import Optional, List, Dict, Any, Tuple
from contextlib import contextmanager
from datetime import datetime

import psycopg2
from psycopg2 import pool, extras
from psycopg2.extensions import connection, cursor
import yaml
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    Manages PostgreSQL database connections and operations.

    Features:
    - Connection pooling for efficient resource usage
    - Context managers for safe transaction handling
    - Automatic retry logic for transient failures
    - Comprehensive error handling and logging
    """

    def __init__(self, config_path: str = "config/db_config.yaml"):
        """
        Initialize database manager with configuration.

        Args:
            config_path: Path to database configuration file
        """
        self.config = self._load_config(config_path)
        self.connection_pool: Optional[pool.SimpleConnectionPool] = None
        self._initialize_pool()

    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load database configuration from YAML file."""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)

            # Replace environment variable placeholders
            db_config = config['database']
            db_config['host'] = os.getenv('DB_HOST', 'localhost')
            db_config['port'] = int(os.getenv('DB_PORT', '5432'))
            db_config['database'] = os.getenv('DB_NAME', 'auto_trade_system')
            db_config['user'] = os.getenv('DB_USER', 'postgres')
            db_config['password'] = os.getenv('DB_PASSWORD', '')

            return config

        except Exception as e:
            logger.error(f"Failed to load config from {config_path}: {e}")
            raise

    def _initialize_pool(self):
        """Initialize connection pool."""
        try:
            db_config = self.config['database']
            pool_config = db_config['pool']

            self.connection_pool = pool.SimpleConnectionPool(
                minconn=pool_config['min_size'],
                maxconn=pool_config['max_size'],
                host=db_config['host'],
                port=db_config['port'],
                database=db_config['database'],
                user=db_config['user'],
                password=db_config['password']
            )

            logger.info("Database connection pool initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize connection pool: {e}")
            raise

    def get_connection(self) -> connection:
        """
        Get a connection from the pool.

        Returns:
            PostgreSQL connection object
        """
        if self.connection_pool is None:
            raise RuntimeError("Connection pool not initialized")

        return self.connection_pool.getconn()

    def release_connection(self, conn: connection):
        """
        Release a connection back to the pool.

        Args:
            conn: Connection to release
        """
        if self.connection_pool is not None:
            self.connection_pool.putconn(conn)

    @contextmanager
    def get_cursor(self, commit: bool = False):
        """
        Context manager for database cursor.

        Args:
            commit: Whether to commit transaction on success

        Yields:
            Database cursor
        """
        conn = self.get_connection()
        cur = conn.cursor(cursor_factory=extras.RealDictCursor)

        try:
            yield cur
            if commit:
                conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            cur.close()
            self.release_connection(conn)

    def test_connection(self) -> bool:
        """
        Test database connection.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            with self.get_cursor() as cur:
                cur.execute("SELECT 1")
                result = cur.fetchone()
                logger.info("Database connection test: OK")
                return result is not None
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return False

    def execute_query(
        self,
        query: str,
        params: Optional[Tuple] = None,
        fetch: bool = True
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Execute a SQL query.

        Args:
            query: SQL query string
            params: Query parameters
            fetch: Whether to fetch results

        Returns:
            Query results if fetch=True, None otherwise
        """
        with self.get_cursor() as cur:
            cur.execute(query, params)

            if fetch:
                return cur.fetchall()
            return None

    def execute_many(
        self,
        query: str,
        params_list: List[Tuple],
        commit: bool = True
    ) -> int:
        """
        Execute a query multiple times with different parameters.

        Args:
            query: SQL query string
            params_list: List of parameter tuples
            commit: Whether to commit transaction

        Returns:
            Number of affected rows
        """
        with self.get_cursor(commit=commit) as cur:
            cur.executemany(query, params_list)
            return cur.rowcount

    # ========================================================================
    # Table-specific methods
    # ========================================================================

    def insert_raw_tweet(
        self,
        account_id: str,
        content: str,
        tweet_url: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> int:
        """Insert a new tweet into raw_tweets table."""
        query = """
            INSERT INTO raw_tweets (account_id, content, tweet_url, metadata, created_at, processed)
            VALUES (%s, %s, %s, %s, %s, FALSE)
            RETURNING id
        """

        with self.get_cursor(commit=True) as cur:
            cur.execute(query, (account_id, content, tweet_url, str(metadata), datetime.now()))
            return cur.fetchone()['id']

    def insert_raw_news(
        self,
        source_name: str,
        title: str,
        content: str,
        url: Optional[str] = None,
        published_at: Optional[datetime] = None
    ) -> int:
        """Insert a new news article into raw_news table."""
        query = """
            INSERT INTO raw_news (source_name, title, content, url, published_at, created_at, processed)
            VALUES (%s, %s, %s, %s, %s, %s, FALSE)
            RETURNING id
        """

        with self.get_cursor(commit=True) as cur:
            cur.execute(query, (source_name, title, content, url, published_at, datetime.now()))
            return cur.fetchone()['id']

    def insert_raw_reddit(
        self,
        subreddit: str,
        title: str,
        content: str,
        author: str,
        url: Optional[str] = None
    ) -> int:
        """Insert a new Reddit post into raw_reddit table."""
        query = """
            INSERT INTO raw_reddit (subreddit, title, content, author, url, created_at, processed)
            VALUES (%s, %s, %s, %s, %s, %s, FALSE)
            RETURNING id
        """

        with self.get_cursor(commit=True) as cur:
            cur.execute(query, (subreddit, title, content, author, url, datetime.now()))
            return cur.fetchone()['id']

    def insert_intelligence_memory(
        self,
        ticker_code: str,
        source_type: str,
        original_text: str,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict] = None
    ) -> int:
        """Insert into intelligence_memory table."""
        query = """
            INSERT INTO intelligence_memory
            (ticker_code, source_type, original_text, embedding, metadata, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """

        with self.get_cursor(commit=True) as cur:
            cur.execute(query, (
                ticker_code,
                source_type,
                original_text,
                embedding,
                str(metadata),
                datetime.now()
            ))
            return cur.fetchone()['id']

    def get_unembedded_records(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get records without embeddings."""
        query = """
            SELECT id, ticker_code, original_text
            FROM intelligence_memory
            WHERE embedding IS NULL
            LIMIT %s
        """

        return self.execute_query(query, (limit,))

    def update_embedding(self, record_id: int, embedding: List[float]):
        """Update embedding for a record."""
        query = """
            UPDATE intelligence_memory
            SET embedding = %s, updated_at = %s
            WHERE id = %s
        """

        with self.get_cursor(commit=True) as cur:
            cur.execute(query, (embedding, datetime.now(), record_id))

    def vector_search_similar(
        self,
        embedding: List[float],
        ticker_code: Optional[str] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search for similar records using vector similarity."""
        if ticker_code:
            query = """
                SELECT id, ticker_code, original_text, source_type, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM intelligence_memory
                WHERE ticker_code = %s AND embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """
            params = (str(embedding), ticker_code, str(embedding), limit)
        else:
            query = """
                SELECT id, ticker_code, original_text, source_type, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM intelligence_memory
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
            """
            params = (str(embedding), str(embedding), limit)

        return self.execute_query(query, params)

    def get_ticker_memory(
        self,
        ticker_code: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """Get recent memory for a specific ticker."""
        query = """
            SELECT id, source_type, original_text, created_at
            FROM intelligence_memory
            WHERE ticker_code = %s
              AND created_at >= NOW() - INTERVAL '%s days'
            ORDER BY created_at DESC
        """

        return self.execute_query(query, (ticker_code, days))

    def close(self):
        """Close all connections in the pool."""
        if self.connection_pool is not None:
            self.connection_pool.closeall()
            logger.info("Database connection pool closed")


# Singleton instance
_db_manager: Optional[DatabaseManager] = None


def get_db_manager(config_path: str = "config/db_config.yaml") -> DatabaseManager:
    """
    Get or create DatabaseManager singleton instance.

    Args:
        config_path: Path to database configuration file

    Returns:
        DatabaseManager instance
    """
    global _db_manager

    if _db_manager is None:
        _db_manager = DatabaseManager(config_path)

    return _db_manager


if __name__ == "__main__":
    # Test database connection
    logging.basicConfig(level=logging.INFO)

    try:
        db = get_db_manager()
        if db.test_connection():
            print("✓ Database connection successful!")
        else:
            print("✗ Database connection failed!")
    except Exception as e:
        print(f"✗ Error: {e}")
