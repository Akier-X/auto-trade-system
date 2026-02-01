"""
Setup Short-Term Trading Tables
Create additional tables for short-term strategy.
"""

import os
import sys
import logging

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.storage.db_manager import get_db_manager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def setup_short_term_tables():
    """Create short-term trading tables."""
    logger.info("=" * 60)
    logger.info("Setting up Short-Term Trading Tables")
    logger.info("=" * 60)

    db = get_db_manager()

    # Read SQL file
    sql_file = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'src', 'storage', 'short_term_tables.sql'
    )

    logger.info(f"Reading SQL from: {sql_file}")

    with open(sql_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    # Execute SQL
    try:
        with db.get_cursor(commit=True) as cur:
            cur.execute(sql_content)

        logger.info("✓ Tables created successfully")

    except Exception as e:
        logger.error(f"Error creating tables: {e}")
        raise

    # Verify tables
    logger.info("\nVerifying tables...")

    tables_to_check = [
        'price_history',
        'trade_metadata',
        'strategy_performance',
        'intraday_signals',
        'market_conditions'
    ]

    for table in tables_to_check:
        query = f"""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = '{table}'
            )
        """

        result = db.execute_query(query)

        if result and result[0]['exists']:
            logger.info(f"✓ {table}")
        else:
            logger.error(f"✗ {table} - NOT FOUND")

    # Verify views
    logger.info("\nVerifying views...")

    views_to_check = [
        'v_active_short_term_positions',
        'v_short_term_performance',
        'v_signal_performance'
    ]

    for view in views_to_check:
        query = f"""
            SELECT EXISTS (
                SELECT FROM information_schema.views
                WHERE table_name = '{view}'
            )
        """

        result = db.execute_query(query)

        if result and result[0]['exists']:
            logger.info(f"✓ {view}")
        else:
            logger.error(f"✗ {view} - NOT FOUND")

    logger.info("\n" + "=" * 60)
    logger.info("Setup Complete!")
    logger.info("=" * 60)


if __name__ == '__main__':
    try:
        setup_short_term_tables()

    except Exception as e:
        logger.error(f"Setup failed: {e}")
        sys.exit(1)
