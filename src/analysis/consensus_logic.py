"""
Consensus Logic
Statistical aggregation and consensus building from multiple LLM results.
"""

import os
import sys
import logging
import json
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.storage.db_manager import get_db_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ConsensusEngine:
    """
    Build consensus from multiple LLM analysis results.

    Features:
    - Statistical aggregation (mean, std, weighted average)
    - Agreement level calculation
    - Final decision logic
    - Database persistence
    """

    def __init__(self):
        """Initialize consensus engine."""
        self.db = get_db_manager()

        # Default weights for each LLM (can be adjusted based on historical performance)
        self.default_weights = {
            'gpt4o': 0.33,
            'claude': 0.34,
            'gemini': 0.33
        }

    def extract_veracity_scores(
        self,
        llm_results: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Extract veracity scores from LLM results.

        Args:
            llm_results: Results from multiple LLMs

        Returns:
            Dictionary of model names to scores
        """
        scores = {}

        for model_name in ['gpt4o', 'claude', 'gemini']:
            if model_name not in llm_results:
                continue

            result = llm_results[model_name]

            # Skip if error
            if result.get('error') or not result.get('response'):
                continue

            # Try to parse JSON response
            response = result.get('response', '')

            try:
                # Find JSON in response
                start_idx = response.find('{')
                end_idx = response.rfind('}')

                if start_idx != -1 and end_idx != -1:
                    json_str = response[start_idx:end_idx + 1]
                    data = json.loads(json_str)

                    # Extract veracity score
                    if 'veracity_score' in data:
                        scores[model_name] = float(data['veracity_score'])

            except Exception as e:
                logger.warning(f"Failed to extract score from {model_name}: {e}")

        return scores

    def calculate_statistics(
        self,
        scores: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Calculate statistical metrics from scores.

        Args:
            scores: Dictionary of scores

        Returns:
            Statistical metrics
        """
        if not scores:
            return {
                'mean': 0.0,
                'median': 0.0,
                'std_dev': 0.0,
                'min': 0.0,
                'max': 0.0,
                'count': 0
            }

        values = list(scores.values())

        return {
            'mean': float(np.mean(values)),
            'median': float(np.median(values)),
            'std_dev': float(np.std(values)),
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'count': len(values)
        }

    def calculate_weighted_score(
        self,
        scores: Dict[str, float],
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Calculate weighted average score.

        Args:
            scores: Dictionary of scores
            weights: Dictionary of weights (defaults to equal weights)

        Returns:
            Weighted average score
        """
        if not scores:
            return 0.0

        if weights is None:
            weights = self.default_weights

        weighted_sum = 0.0
        total_weight = 0.0

        for model_name, score in scores.items():
            weight = weights.get(model_name, 0.33)
            weighted_sum += score * weight
            total_weight += weight

        if total_weight == 0:
            return 0.0

        return weighted_sum / total_weight

    def determine_agreement_level(self, std_dev: float) -> str:
        """
        Determine agreement level based on standard deviation.

        Args:
            std_dev: Standard deviation of scores

        Returns:
            Agreement level ('HIGH', 'MEDIUM', 'LOW')
        """
        if std_dev < 5.0:
            return 'HIGH'
        elif std_dev < 15.0:
            return 'MEDIUM'
        else:
            return 'LOW'

    def make_decision(
        self,
        consensus_score: float,
        agreement_level: str,
        std_dev: float
    ) -> str:
        """
        Make final trading decision based on consensus.

        Args:
            consensus_score: Aggregated consensus score
            agreement_level: Agreement level between LLMs
            std_dev: Standard deviation of scores

        Returns:
            Decision ('EXECUTE', 'WATCH', 'HOLD', 'REJECT')
        """
        # High consensus and agreement -> Execute
        if consensus_score >= 80 and agreement_level in ['HIGH', 'MEDIUM']:
            return 'EXECUTE'

        # Good score but low agreement -> Watch
        elif consensus_score >= 70 and agreement_level == 'LOW':
            return 'WATCH'

        # Moderate score -> Watch or Hold
        elif consensus_score >= 60:
            if agreement_level == 'HIGH':
                return 'WATCH'
            else:
                return 'HOLD'

        # Low score but high agreement -> May still watch
        elif consensus_score >= 40 and agreement_level == 'HIGH':
            return 'HOLD'

        # Low score -> Reject
        else:
            return 'REJECT'

    def build_consensus(
        self,
        llm_results: Dict[str, Any],
        intelligence_id: int,
        custom_weights: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Build consensus from multiple LLM results.

        Args:
            llm_results: Results from LLMs
            intelligence_id: ID of intelligence record
            custom_weights: Optional custom weights for models

        Returns:
            Consensus data
        """
        logger.info(f"Building consensus for intelligence_id={intelligence_id}")

        # Extract scores
        scores = self.extract_veracity_scores(llm_results)

        if not scores:
            logger.warning("No valid scores found in LLM results")
            return {
                'consensus_score': 0.0,
                'agreement_level': 'LOW',
                'final_decision': 'REJECT',
                'reasoning': 'No valid LLM responses',
                'scores': {},
                'stats': {}
            }

        # Calculate statistics
        stats = self.calculate_statistics(scores)

        # Calculate weighted score
        consensus_score = self.calculate_weighted_score(scores, custom_weights)

        # Determine agreement level
        agreement_level = self.determine_agreement_level(stats['std_dev'])

        # Make final decision
        final_decision = self.make_decision(
            consensus_score,
            agreement_level,
            stats['std_dev']
        )

        # Generate reasoning
        reasoning = self._generate_reasoning(
            scores,
            consensus_score,
            agreement_level,
            final_decision,
            stats
        )

        consensus_data = {
            'intelligence_id': intelligence_id,
            'individual_scores': scores,
            'consensus_score': round(consensus_score, 2),
            'std_deviation': round(stats['std_dev'], 2),
            'agreement_level': agreement_level,
            'final_decision': final_decision,
            'reasoning': reasoning,
            'statistics': stats,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Consensus: {final_decision} (score={consensus_score:.2f}, agreement={agreement_level})")

        return consensus_data

    def _generate_reasoning(
        self,
        scores: Dict[str, float],
        consensus_score: float,
        agreement_level: str,
        final_decision: str,
        stats: Dict[str, float]
    ) -> str:
        """Generate human-readable reasoning for the decision."""

        score_str = ", ".join([f"{k}={v:.1f}" for k, v in scores.items()])

        reasoning = f"""
合議制判定結果:
- 個別スコア: {score_str}
- 合意スコア: {consensus_score:.2f}/100
- 標準偏差: {stats['std_dev']:.2f}
- 合意レベル: {agreement_level}
- 最終判定: {final_decision}

判定理由:
"""

        if final_decision == 'EXECUTE':
            reasoning += "複数LLMが高スコアで合意しており、信頼性が高いと判断されました。実行を推奨します。"
        elif final_decision == 'WATCH':
            reasoning += "スコアは中程度ですが、継続的な監視が推奨されます。"
        elif final_decision == 'HOLD':
            reasoning += "現時点では判断材料が不十分です。追加情報を待つことを推奨します。"
        else:  # REJECT
            reasoning += "信頼性が低いと判断されました。この情報に基づく取引は推奨されません。"

        return reasoning.strip()

    def save_to_database(self, consensus_data: Dict[str, Any]) -> int:
        """
        Save consensus result to database.

        Args:
            consensus_data: Consensus data

        Returns:
            ID of saved consensus record
        """
        try:
            query = """
                INSERT INTO final_consensus
                (intelligence_id, aggregated_score, std_deviation, agreement_level,
                 final_decision, reasoning, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """

            with self.db.get_cursor(commit=True) as cur:
                cur.execute(query, (
                    consensus_data['intelligence_id'],
                    consensus_data['consensus_score'],
                    consensus_data['std_deviation'],
                    consensus_data['agreement_level'],
                    consensus_data['final_decision'],
                    consensus_data['reasoning'],
                    datetime.now()
                ))

                consensus_id = cur.fetchone()['id']

            logger.info(f"Saved consensus to database: ID={consensus_id}")
            return consensus_id

        except Exception as e:
            logger.error(f"Failed to save consensus: {e}")
            raise

    def update_source_performance(
        self,
        source_name: str,
        was_successful: bool,
        return_value: Optional[float] = None
    ):
        """
        Update performance metrics for a data source.

        Args:
            source_name: Name of data source
            was_successful: Whether the signal was successful
            return_value: Return value if known
        """
        try:
            query = """
                INSERT INTO source_performance
                (source_name, source_type, total_signals, successful_signals, failed_signals,
                 accuracy_rate, avg_return, last_evaluated_at)
                VALUES (%s, %s, 1, %s, %s, %s, %s, %s)
                ON CONFLICT (source_name)
                DO UPDATE SET
                    total_signals = source_performance.total_signals + 1,
                    successful_signals = source_performance.successful_signals + EXCLUDED.successful_signals,
                    failed_signals = source_performance.failed_signals + EXCLUDED.failed_signals,
                    accuracy_rate = (source_performance.successful_signals + EXCLUDED.successful_signals) * 100.0 /
                                  (source_performance.total_signals + 1),
                    avg_return = CASE
                        WHEN EXCLUDED.avg_return IS NOT NULL
                        THEN (source_performance.avg_return * source_performance.total_signals + EXCLUDED.avg_return) /
                             (source_performance.total_signals + 1)
                        ELSE source_performance.avg_return
                    END,
                    last_evaluated_at = EXCLUDED.last_evaluated_at
            """

            success_count = 1 if was_successful else 0
            fail_count = 0 if was_successful else 1
            accuracy = 100.0 if was_successful else 0.0

            with self.db.get_cursor(commit=True) as cur:
                cur.execute(query, (
                    source_name,
                    'twitter',  # Default type
                    success_count,
                    fail_count,
                    accuracy,
                    return_value,
                    datetime.now()
                ))

            logger.info(f"Updated performance for source: {source_name}")

        except Exception as e:
            logger.error(f"Failed to update source performance: {e}")


if __name__ == '__main__':
    # Test consensus engine
    engine = ConsensusEngine()

    # Mock LLM results
    mock_results = {
        'gpt4o': {
            'response': '{"veracity_score": 85, "confidence": 0.9, "recommendation": "BUY"}',
            'model': 'gpt4o'
        },
        'claude': {
            'response': '{"veracity_score": 82, "confidence": 0.85, "recommendation": "BUY"}',
            'model': 'claude'
        },
        'gemini': {
            'response': '{"veracity_score": 88, "confidence": 0.92, "recommendation": "BUY"}',
            'model': 'gemini'
        }
    }

    consensus = engine.build_consensus(mock_results, intelligence_id=1)

    print("Consensus Result:")
    print(json.dumps(consensus, indent=2, ensure_ascii=False))
