"""
Embedding Generator
Generate vector embeddings for text data and store in PostgreSQL with pgvector.
"""

import os
import sys
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

import openai
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


class EmbeddingGenerator:
    """
    Generate embeddings for text data using OpenAI's embedding models.

    Features:
    - Text-to-vector conversion
    - Batch processing
    - Automatic database storage
    - Progress tracking
    """

    def __init__(self, api_key: Optional[str] = None, model: str = "text-embedding-3-small"):
        """
        Initialize embedding generator.

        Args:
            api_key: OpenAI API key
            model: Embedding model to use
        """
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        self.model = model
        self.db = get_db_manager()

        # Initialize OpenAI
        if self.api_key:
            openai.api_key = self.api_key
            logger.info(f"Embedding generator initialized with model: {model}")
        else:
            logger.warning("OpenAI API key not found")

    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        try:
            # Clean text
            text = text.strip().replace('\n', ' ')

            if not text:
                logger.warning("Empty text provided")
                return []

            # Generate embedding
            response = openai.Embedding.create(
                input=text,
                model=self.model
            )

            embedding = response['data'][0]['embedding']

            logger.debug(f"Generated embedding for text (length={len(text)})")

            return embedding

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return []

    def generate_embeddings_batch(
        self,
        texts: List[str],
        batch_size: int = 100
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of texts
            batch_size: Batch size for API calls

        Returns:
            List of embeddings
        """
        logger.info(f"Generating embeddings for {len(texts)} texts (batch_size={batch_size})")

        embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            try:
                # Clean texts
                cleaned_batch = [text.strip().replace('\n', ' ') for text in batch]

                # Generate embeddings
                response = openai.Embedding.create(
                    input=cleaned_batch,
                    model=self.model
                )

                batch_embeddings = [item['embedding'] for item in response['data']]
                embeddings.extend(batch_embeddings)

                logger.info(f"Processed batch {i // batch_size + 1}/{(len(texts) - 1) // batch_size + 1}")

            except Exception as e:
                logger.error(f"Error in batch {i // batch_size + 1}: {e}")
                # Add empty embeddings for failed batch
                embeddings.extend([[] for _ in batch])

        return embeddings

    def embed_unprocessed_data(self, limit: int = 100) -> int:
        """
        Process unembedded records from database.

        Args:
            limit: Maximum number of records to process

        Returns:
            Number of records processed
        """
        logger.info(f"Processing up to {limit} unembedded records...")

        # Get unembedded records
        records = self.db.get_unembedded_records(limit=limit)

        if not records:
            logger.info("No unembedded records found")
            return 0

        logger.info(f"Found {len(records)} unembedded records")

        processed_count = 0

        for record in records:
            try:
                # Generate embedding
                text = record['original_text']
                embedding = self.generate_embedding(text)

                if not embedding:
                    logger.warning(f"Failed to generate embedding for record {record['id']}")
                    continue

                # Update database
                self.db.update_embedding(record['id'], embedding)

                processed_count += 1

                if processed_count % 10 == 0:
                    logger.info(f"Processed {processed_count}/{len(records)} records")

            except Exception as e:
                logger.error(f"Error processing record {record['id']}: {e}")

        logger.info(f"Successfully processed {processed_count} records")

        return processed_count

    def embed_and_store(
        self,
        ticker_code: str,
        source_type: str,
        original_text: str,
        metadata: Optional[Dict] = None
    ) -> int:
        """
        Generate embedding and store in database.

        Args:
            ticker_code: Stock ticker code
            source_type: Source type ('tweet', 'news', etc.)
            original_text: Original text
            metadata: Additional metadata

        Returns:
            ID of created intelligence record
        """
        try:
            # Generate embedding
            embedding = self.generate_embedding(original_text)

            if not embedding:
                logger.warning("Failed to generate embedding")
                return 0

            # Store in database
            intelligence_id = self.db.insert_intelligence_memory(
                ticker_code=ticker_code,
                source_type=source_type,
                original_text=original_text,
                embedding=embedding,
                metadata=metadata
            )

            logger.info(f"Created intelligence record with embedding: ID={intelligence_id}")

            return intelligence_id

        except Exception as e:
            logger.error(f"Error in embed_and_store: {e}")
            return 0

    def batch_process_table(
        self,
        table_name: str,
        text_column: str,
        limit: int = 1000
    ) -> int:
        """
        Process all records from a specific table.

        Args:
            table_name: Table to process
            text_column: Column containing text
            limit: Maximum records to process

        Returns:
            Number of records processed
        """
        logger.info(f"Batch processing table: {table_name}")

        try:
            # Get unprocessed records
            query = f"""
                SELECT id, {text_column}
                FROM {table_name}
                WHERE processed = FALSE
                LIMIT %s
            """

            records = self.db.execute_query(query, (limit,))

            if not records:
                logger.info(f"No unprocessed records in {table_name}")
                return 0

            logger.info(f"Found {len(records)} unprocessed records in {table_name}")

            processed_count = 0

            for record in records:
                text = record[text_column]

                # Generate embedding
                embedding = self.generate_embedding(text)

                if not embedding:
                    continue

                # Create intelligence record
                self.embed_and_store(
                    ticker_code=None,  # Extract from text if needed
                    source_type=table_name.replace('raw_', ''),
                    original_text=text,
                    metadata={'source_id': record['id'], 'table': table_name}
                )

                # Mark as processed
                update_query = f"""
                    UPDATE {table_name}
                    SET processed = TRUE, processed_at = %s
                    WHERE id = %s
                """

                self.db.execute_query(update_query, (datetime.now(), record['id']), fetch=False)

                processed_count += 1

            logger.info(f"Processed {processed_count} records from {table_name}")

            return processed_count

        except Exception as e:
            logger.error(f"Error processing table {table_name}: {e}")
            return 0

    def get_embedding_stats(self) -> Dict[str, Any]:
        """Get statistics about embeddings in database."""
        try:
            query = """
                SELECT
                    COUNT(*) as total_records,
                    COUNT(embedding) as embedded_count,
                    COUNT(*) - COUNT(embedding) as unembedded_count
                FROM intelligence_memory
            """

            result = self.db.execute_query(query)

            if result:
                stats = result[0]
                stats['embedding_rate'] = (
                    stats['embedded_count'] / stats['total_records'] * 100
                    if stats['total_records'] > 0 else 0
                )
                return stats

            return {}

        except Exception as e:
            logger.error(f"Error getting embedding stats: {e}")
            return {}


def main():
    """Main entry point for batch processing."""
    import argparse

    parser = argparse.ArgumentParser(description='Embedding Generator')
    parser.add_argument(
        '--limit',
        type=int,
        default=100,
        help='Maximum records to process'
    )
    parser.add_argument(
        '--table',
        type=str,
        choices=['raw_tweets', 'raw_news', 'raw_reddit', 'raw_tdnet', 'all'],
        default='all',
        help='Table to process'
    )

    args = parser.parse_args()

    try:
        generator = EmbeddingGenerator()

        # Show stats
        stats = generator.get_embedding_stats()
        logger.info(f"Embedding stats: {stats}")

        if args.table == 'all':
            # Process intelligence_memory table
            processed = generator.embed_unprocessed_data(limit=args.limit)
            logger.info(f"Processed {processed} records from intelligence_memory")

        else:
            # Process specific table
            text_columns = {
                'raw_tweets': 'content',
                'raw_news': 'content',
                'raw_reddit': 'content',
                'raw_tdnet': 'title'
            }

            text_column = text_columns.get(args.table)
            if text_column:
                processed = generator.batch_process_table(
                    table_name=args.table,
                    text_column=text_column,
                    limit=args.limit
                )
                logger.info(f"Processed {processed} records")

    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
