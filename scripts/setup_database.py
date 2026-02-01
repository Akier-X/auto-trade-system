"""
Database Setup Script
Initialize database schema and verify tables are created correctly.
"""

import os
import sys
import logging
from pathlib import Path

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage.db_manager import get_db_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatabaseSetup:
    """Handle database initialization and setup."""

    def __init__(self):
        """Initialize with database manager."""
        self.db = get_db_manager()
        self.sql_file = Path(__file__).parent.parent / "src" / "storage" / "queries.sql"

    def read_sql_file(self) -> str:
        """Read SQL file content."""
        try:
            with open(self.sql_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read SQL file: {e}")
            raise

    def execute_sql_script(self, sql_content: str):
        """
        Execute SQL script.

        Args:
            sql_content: SQL script content
        """
        try:
            logger.info("Executing database schema creation...")

            conn = self.db.get_connection()
            cur = conn.cursor()

            # Execute the entire SQL script
            cur.execute(sql_content)
            conn.commit()

            cur.close()
            self.db.release_connection(conn)

            logger.info("✓ Database schema created successfully")

        except Exception as e:
            logger.error(f"Failed to execute SQL script: {e}")
            raise

    def verify_tables(self) -> bool:
        """
        Verify all tables are created.

        Returns:
            True if all tables exist, False otherwise
        """
        try:
            expected_tables = [
                'stocks_master',
                'raw_tweets',
                'raw_news',
                'raw_reddit',
                'raw_tdnet',
                'intelligence_memory',
                'monitored_tickers',
                'analysis_scores',
                'final_consensus',
                'portfolio_mgmt',
                'trade_history',
                'source_performance'
            ]

            query = """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
            """

            tables = self.db.execute_query(query)
            table_names = [t['table_name'] for t in tables]

            logger.info(f"Found {len(table_names)} tables in database")

            missing_tables = []
            for table in expected_tables:
                if table in table_names:
                    logger.info(f"  ✓ {table}")
                else:
                    logger.warning(f"  ✗ {table} (missing)")
                    missing_tables.append(table)

            if missing_tables:
                logger.error(f"Missing tables: {', '.join(missing_tables)}")
                return False

            logger.info("✓ All tables verified successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to verify tables: {e}")
            return False

    def verify_extensions(self) -> bool:
        """
        Verify required PostgreSQL extensions are installed.

        Returns:
            True if all extensions exist, False otherwise
        """
        try:
            query = """
                SELECT extname
                FROM pg_extension
                WHERE extname IN ('uuid-ossp', 'vector')
            """

            extensions = self.db.execute_query(query)
            ext_names = [e['extname'] for e in extensions]

            logger.info("Checking required extensions:")

            if 'uuid-ossp' in ext_names:
                logger.info("  ✓ uuid-ossp")
            else:
                logger.warning("  ✗ uuid-ossp (missing)")

            if 'vector' in ext_names:
                logger.info("  ✓ pgvector")
            else:
                logger.warning("  ! pgvector (will be needed for Phase 4)")

            return True

        except Exception as e:
            logger.error(f"Failed to verify extensions: {e}")
            return False

    def get_table_counts(self):
        """Display record counts for all tables."""
        try:
            tables = [
                'stocks_master',
                'raw_tweets',
                'raw_news',
                'raw_reddit',
                'raw_tdnet',
                'intelligence_memory',
                'monitored_tickers',
                'analysis_scores',
                'final_consensus',
                'portfolio_mgmt',
                'trade_history',
                'source_performance'
            ]

            logger.info("\nTable record counts:")

            for table in tables:
                query = f"SELECT COUNT(*) as count FROM {table}"
                result = self.db.execute_query(query)
                count = result[0]['count'] if result else 0
                logger.info(f"  {table}: {count} records")

        except Exception as e:
            logger.error(f"Failed to get table counts: {e}")

    def run(self):
        """Run the complete setup process."""
        try:
            logger.info("=" * 60)
            logger.info("Database Setup Starting")
            logger.info("=" * 60)

            # Test connection
            logger.info("\n1. Testing database connection...")
            if not self.db.test_connection():
                raise Exception("Database connection failed")

            # Verify extensions
            logger.info("\n2. Verifying PostgreSQL extensions...")
            self.verify_extensions()

            # Read and execute SQL
            logger.info("\n3. Creating database schema...")
            sql_content = self.read_sql_file()
            self.execute_sql_script(sql_content)

            # Verify tables
            logger.info("\n4. Verifying tables...")
            if not self.verify_tables():
                raise Exception("Table verification failed")

            # Show table counts
            logger.info("\n5. Checking table contents...")
            self.get_table_counts()

            logger.info("\n" + "=" * 60)
            logger.info("✓ Database Setup Completed Successfully")
            logger.info("=" * 60)

            return True

        except Exception as e:
            logger.error(f"\n✗ Database setup failed: {e}")
            return False


def main():
    """Main entry point."""
    try:
        setup = DatabaseSetup()
        success = setup.run()

        if success:
            print("\n✓ Database setup completed successfully!")
            print("\nNext steps:")
            print("1. Run: python scripts/import_stocks_master.py --sample")
            print("2. Verify data: psql -d auto_trade_system -c 'SELECT * FROM stocks_master LIMIT 5;'")
        else:
            print("\n✗ Database setup failed!")
            sys.exit(1)

    except Exception as e:
        print(f"\n✗ Setup error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
