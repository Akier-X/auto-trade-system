"""
Memory Search Engine
Vector similarity search for retrieving relevant historical context.
"""

import os
import sys
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager
from src.analysis.embedding_generator import EmbeddingGenerator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MemorySearchEngine:
    """
    Search historical intelligence using vector similarity.

    Features:
    - Semantic search using embeddings
    - Ticker-specific context retrieval
    - Time-based filtering
    - Relevance scoring
    """

    def __init__(self):
        """Initialize memory search engine."""
        self.db = get_db_manager()
        self.embedding_gen = EmbeddingGenerator()

    def search_similar(
        self,
        query_text: str,
        ticker_code: Optional[str] = None,
        limit: int = 5,
        min_similarity: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Search for similar intelligence using vector similarity.

        Args:
            query_text: Query text
            ticker_code: Optional ticker filter
            limit: Maximum results
            min_similarity: Minimum similarity threshold

        Returns:
            List of similar intelligence records
        """
        logger.info(f"Searching similar content (ticker={ticker_code}, limit={limit})")

        try:
            # Generate embedding for query
            query_embedding = self.embedding_gen.generate_embedding(query_text)

            if not query_embedding:
                logger.warning("Failed to generate query embedding")
                return []

            # Search database
            results = self.db.vector_search_similar(
                embedding=query_embedding,
                ticker_code=ticker_code,
                limit=limit
            )

            # Filter by minimum similarity
            filtered_results = [
                r for r in results
                if r.get('similarity', 0) >= min_similarity
            ]

            logger.info(f"Found {len(filtered_results)} similar records (>= {min_similarity} similarity)")

            return filtered_results

        except Exception as e:
            logger.error(f"Error in similarity search: {e}")
            return []

    def get_ticker_context(
        self,
        ticker_code: str,
        days: int = 30,
        max_records: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get recent context for a specific ticker.

        Args:
            ticker_code: Stock ticker code
            days: Number of days to look back
            max_records: Maximum records to return

        Returns:
            List of intelligence records
        """
        logger.info(f"Getting context for {ticker_code} (last {days} days)")

        try:
            records = self.db.get_ticker_memory(
                ticker_code=ticker_code,
                days=days
            )

            # Limit results
            if len(records) > max_records:
                records = records[:max_records]

            logger.info(f"Found {len(records)} records for {ticker_code}")

            return records

        except Exception as e:
            logger.error(f"Error getting ticker context: {e}")
            return []

    def build_context_string(
        self,
        records: List[Dict[str, Any]],
        max_length: int = 2000
    ) -> str:
        """
        Build context string from records for LLM input.

        Args:
            records: Intelligence records
            max_length: Maximum context length

        Returns:
            Formatted context string
        """
        if not records:
            return "関連する過去情報はありません。"

        context_parts = []
        current_length = 0

        for record in records:
            # Format record
            date_str = record.get('created_at', datetime.now()).strftime('%Y-%m-%d')
            source = record.get('source_type', 'unknown')
            text = record.get('original_text', '')[:200]  # Truncate long texts

            part = f"[{date_str}][{source}] {text}"

            # Check length
            if current_length + len(part) > max_length:
                break

            context_parts.append(part)
            current_length += len(part)

        context = "\n\n".join(context_parts)

        return context

    def search_by_keywords(
        self,
        keywords: List[str],
        ticker_code: Optional[str] = None,
        days: int = 90,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Search intelligence by keywords.

        Args:
            keywords: List of keywords
            ticker_code: Optional ticker filter
            days: Days to look back
            limit: Maximum results

        Returns:
            Matching records
        """
        logger.info(f"Searching by keywords: {keywords}")

        try:
            # Build query
            keyword_conditions = " OR ".join([
                f"original_text ILIKE '%{kw}%'" for kw in keywords
            ])

            query = f"""
                SELECT id, ticker_code, source_type, original_text, created_at
                FROM intelligence_memory
                WHERE ({keyword_conditions})
                  AND created_at >= NOW() - INTERVAL '%s days'
            """

            params = [days]

            if ticker_code:
                query += " AND ticker_code = %s"
                params.append(ticker_code)

            query += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)

            results = self.db.execute_query(query, tuple(params))

            logger.info(f"Found {len(results)} records matching keywords")

            return results

        except Exception as e:
            logger.error(f"Error in keyword search: {e}")
            return []

    def find_related_tickers(
        self,
        query_text: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find tickers related to query text.

        Args:
            query_text: Query text
            limit: Maximum tickers to return

        Returns:
            List of related tickers with context
        """
        logger.info("Finding related tickers...")

        try:
            # Search for similar content
            similar_records = self.search_similar(
                query_text=query_text,
                ticker_code=None,
                limit=limit * 3  # Get more to group by ticker
            )

            # Group by ticker and count
            ticker_counts = {}
            ticker_contexts = {}

            for record in similar_records:
                ticker = record.get('ticker_code')
                if not ticker:
                    continue

                if ticker not in ticker_counts:
                    ticker_counts[ticker] = 0
                    ticker_contexts[ticker] = []

                ticker_counts[ticker] += 1
                ticker_contexts[ticker].append(record)

            # Sort by count
            sorted_tickers = sorted(
                ticker_counts.items(),
                key=lambda x: x[1],
                reverse=True
            )[:limit]

            # Build result
            results = []
            for ticker, count in sorted_tickers:
                results.append({
                    'ticker_code': ticker,
                    'relevance_count': count,
                    'recent_context': ticker_contexts[ticker][:3]  # Top 3 most similar
                })

            logger.info(f"Found {len(results)} related tickers")

            return results

        except Exception as e:
            logger.error(f"Error finding related tickers: {e}")
            return []

    def get_trending_topics(
        self,
        days: int = 7,
        min_mentions: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Get trending topics based on keyword frequency.

        Args:
            days: Days to analyze
            min_mentions: Minimum mentions required

        Returns:
            List of trending topics
        """
        logger.info(f"Analyzing trending topics (last {days} days)")

        try:
            query = """
                SELECT
                    unnest(extracted_keywords) as keyword,
                    COUNT(*) as mentions,
                    array_agg(DISTINCT ticker_code) as related_tickers
                FROM intelligence_memory
                WHERE created_at >= NOW() - INTERVAL '%s days'
                  AND extracted_keywords IS NOT NULL
                GROUP BY keyword
                HAVING COUNT(*) >= %s
                ORDER BY mentions DESC
                LIMIT 20
            """

            results = self.db.execute_query(query, (days, min_mentions))

            logger.info(f"Found {len(results)} trending topics")

            return results

        except Exception as e:
            logger.error(f"Error getting trending topics: {e}")
            return []


def main():
    """Test memory search."""
    import argparse

    parser = argparse.ArgumentParser(description='Memory Search Engine')
    parser.add_argument(
        '--query',
        type=str,
        help='Search query text'
    )
    parser.add_argument(
        '--ticker',
        type=str,
        help='Ticker code to filter'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=5,
        help='Maximum results'
    )

    args = parser.parse_args()

    try:
        engine = MemorySearchEngine()

        if args.query:
            # Similarity search
            results = engine.search_similar(
                query_text=args.query,
                ticker_code=args.ticker,
                limit=args.limit
            )

            print(f"\nFound {len(results)} similar records:\n")
            for i, record in enumerate(results, 1):
                print(f"{i}. [{record['ticker_code']}] {record['original_text'][:100]}...")
                print(f"   Similarity: {record.get('similarity', 0):.3f}")
                print()

        elif args.ticker:
            # Ticker context
            context_records = engine.get_ticker_context(
                ticker_code=args.ticker,
                days=30,
                max_records=args.limit
            )

            print(f"\nContext for {args.ticker}:\n")
            for record in context_records:
                print(f"- [{record['created_at']}] {record['original_text'][:100]}...")
                print()

        else:
            # Show trending topics
            trending = engine.get_trending_topics(days=7)

            print("\nTrending Topics (last 7 days):\n")
            for topic in trending:
                print(f"- {topic['keyword']}: {topic['mentions']} mentions")
                print(f"  Related tickers: {', '.join(topic.get('related_tickers', []) or [])}")
                print()

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
