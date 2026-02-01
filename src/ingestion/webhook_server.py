"""
Webhook Server for Data Ingestion
Receives data from external sources (IFTTT, etc.) and stores in database.
"""

import os
import sys
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from flask import Flask, request, jsonify
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

# Initialize Flask app
app = Flask(__name__)

# Initialize database manager
db = get_db_manager()


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'webhook-server'
    }), 200


@app.route('/webhook/x', methods=['POST'])
def handle_x_webhook():
    """
    Handle X (Twitter) webhook from IFTTT.

    Expected payload:
    {
        "username": "account_name",
        "text": "tweet content",
        "url": "https://twitter.com/...",
        "created_at": "2024-01-01T12:00:00Z"
    }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Extract tweet data
        account_id = data.get('username', 'unknown')
        content = data.get('text', '')
        tweet_url = data.get('url')
        metadata = {
            'source': 'ifttt',
            'raw_data': data
        }

        # Validate content
        if not content or len(content) < 1:
            return jsonify({'error': 'Invalid content'}), 400

        # Insert into database
        tweet_id = db.insert_raw_tweet(
            account_id=account_id,
            content=content,
            tweet_url=tweet_url,
            metadata=metadata
        )

        logger.info(f"Stored tweet from @{account_id}: ID={tweet_id}")

        return jsonify({
            'status': 'success',
            'id': tweet_id,
            'message': 'Tweet stored successfully'
        }), 201

    except Exception as e:
        logger.error(f"Error handling X webhook: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/webhook/news', methods=['POST'])
def handle_news_webhook():
    """
    Handle news webhook.

    Expected payload:
    {
        "source": "Reuters",
        "title": "News headline",
        "content": "Full article text",
        "url": "https://...",
        "published_at": "2024-01-01T12:00:00Z"
    }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Extract news data
        source_name = data.get('source', 'unknown')
        title = data.get('title', '')
        content = data.get('content', '')
        url = data.get('url')
        published_at = data.get('published_at')

        # Parse published date
        if published_at:
            try:
                published_at = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
            except:
                published_at = None

        # Validate
        if not title or not content:
            return jsonify({'error': 'Missing title or content'}), 400

        # Insert into database
        news_id = db.insert_raw_news(
            source_name=source_name,
            title=title,
            content=content,
            url=url,
            published_at=published_at
        )

        logger.info(f"Stored news from {source_name}: ID={news_id}")

        return jsonify({
            'status': 'success',
            'id': news_id,
            'message': 'News stored successfully'
        }), 201

    except Exception as e:
        logger.error(f"Error handling news webhook: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/webhook/reddit', methods=['POST'])
def handle_reddit_webhook():
    """
    Handle Reddit webhook.

    Expected payload:
    {
        "subreddit": "stocks",
        "title": "Post title",
        "content": "Post content",
        "author": "username",
        "url": "https://reddit.com/...",
        "score": 150,
        "num_comments": 42
    }
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Extract Reddit data
        subreddit = data.get('subreddit', 'unknown')
        title = data.get('title', '')
        content = data.get('content', '')
        author = data.get('author', 'unknown')
        url = data.get('url')

        # Validate
        if not title:
            return jsonify({'error': 'Missing title'}), 400

        # Insert into database
        reddit_id = db.insert_raw_reddit(
            subreddit=subreddit,
            title=title,
            content=content,
            author=author,
            url=url
        )

        logger.info(f"Stored Reddit post from r/{subreddit}: ID={reddit_id}")

        return jsonify({
            'status': 'success',
            'id': reddit_id,
            'message': 'Reddit post stored successfully'
        }), 201

    except Exception as e:
        logger.error(f"Error handling Reddit webhook: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/webhook/test', methods=['POST'])
def handle_test_webhook():
    """Test webhook endpoint for debugging."""
    try:
        data = request.get_json()
        logger.info(f"Test webhook received: {data}")

        return jsonify({
            'status': 'success',
            'message': 'Test webhook received',
            'received_data': data
        }), 200

    except Exception as e:
        logger.error(f"Error in test webhook: {e}")
        return jsonify({'error': str(e)}), 500


def main():
    """Run the webhook server."""
    port = int(os.getenv('WEBHOOK_PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

    logger.info(f"Starting webhook server on port {port}...")
    logger.info("Available endpoints:")
    logger.info("  POST /webhook/x - X (Twitter) data")
    logger.info("  POST /webhook/news - News articles")
    logger.info("  POST /webhook/reddit - Reddit posts")
    logger.info("  POST /webhook/test - Test endpoint")
    logger.info("  GET  /health - Health check")

    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )


if __name__ == '__main__':
    main()
