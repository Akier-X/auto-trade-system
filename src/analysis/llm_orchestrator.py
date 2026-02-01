"""
LLM Orchestrator
Manages parallel calls to multiple LLMs (GPT-4o, Claude, Gemini).
"""

import os
import sys
import logging
import asyncio
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

import openai
import anthropic
import google.generativeai as genai
from dotenv import load_dotenv

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.analysis.prompts import (
    format_extraction_prompt,
    format_verification_prompt,
    format_consensus_prompt
)

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LLMOrchestrator:
    """Orchestrate multiple LLMs for consensus-based analysis."""

    def __init__(
        self,
        openai_key: Optional[str] = None,
        anthropic_key: Optional[str] = None,
        google_key: Optional[str] = None
    ):
        """
        Initialize LLM orchestrator.

        Args:
            openai_key: OpenAI API key
            anthropic_key: Anthropic API key
            google_key: Google API key
        """
        # API keys
        self.openai_key = openai_key or os.getenv('OPENAI_API_KEY')
        self.anthropic_key = anthropic_key or os.getenv('ANTHROPIC_API_KEY')
        self.google_key = google_key or os.getenv('GOOGLE_API_KEY')

        # Initialize clients
        self._initialize_clients()

        # Track API calls for rate limiting
        self.call_count = {'gpt': 0, 'claude': 0, 'gemini': 0}
        self.last_call_time = {'gpt': None, 'claude': None, 'gemini': None}

    def _initialize_clients(self):
        """Initialize API clients."""
        try:
            # OpenAI
            if self.openai_key:
                openai.api_key = self.openai_key
                logger.info("OpenAI client initialized")
            else:
                logger.warning("OpenAI API key not found")

            # Anthropic
            if self.anthropic_key:
                self.anthropic_client = anthropic.Anthropic(api_key=self.anthropic_key)
                logger.info("Anthropic client initialized")
            else:
                logger.warning("Anthropic API key not found")
                self.anthropic_client = None

            # Google Gemini
            if self.google_key:
                genai.configure(api_key=self.google_key)
                logger.info("Google Gemini client initialized")
            else:
                logger.warning("Google API key not found")

        except Exception as e:
            logger.error(f"Error initializing clients: {e}")

    async def call_gpt4o(self, prompt: str, temperature: float = 0.7) -> Dict[str, Any]:
        """
        Call GPT-4o asynchronously.

        Args:
            prompt: Prompt text
            temperature: Sampling temperature

        Returns:
            Response data
        """
        try:
            logger.info("Calling GPT-4o...")

            response = await asyncio.to_thread(
                openai.ChatCompletion.create,
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=1500
            )

            result = response.choices[0].message.content
            self.call_count['gpt'] += 1

            logger.info("GPT-4o response received")

            return {
                'model': 'gpt-4o',
                'response': result,
                'tokens': response.usage.total_tokens,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"GPT-4o error: {e}")
            return {
                'model': 'gpt-4o',
                'response': None,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

    async def call_claude(self, prompt: str, temperature: float = 0.7) -> Dict[str, Any]:
        """
        Call Claude 3.5 Sonnet asynchronously.

        Args:
            prompt: Prompt text
            temperature: Sampling temperature

        Returns:
            Response data
        """
        if not self.anthropic_client:
            return {
                'model': 'claude',
                'response': None,
                'error': 'Anthropic client not initialized',
                'timestamp': datetime.now().isoformat()
            }

        try:
            logger.info("Calling Claude 3.5 Sonnet...")

            response = await asyncio.to_thread(
                self.anthropic_client.messages.create,
                model="claude-3-5-sonnet-20241022",
                max_tokens=1500,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}]
            )

            result = response.content[0].text
            self.call_count['claude'] += 1

            logger.info("Claude response received")

            return {
                'model': 'claude',
                'response': result,
                'tokens': response.usage.input_tokens + response.usage.output_tokens,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Claude error: {e}")
            return {
                'model': 'claude',
                'response': None,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

    async def call_gemini(self, prompt: str, temperature: float = 0.7) -> Dict[str, Any]:
        """
        Call Gemini 1.5 Pro asynchronously.

        Args:
            prompt: Prompt text
            temperature: Sampling temperature

        Returns:
            Response data
        """
        try:
            logger.info("Calling Gemini 1.5 Pro...")

            model = genai.GenerativeModel('gemini-1.5-pro')

            generation_config = genai.types.GenerationConfig(
                temperature=temperature,
                max_output_tokens=1500
            )

            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config=generation_config
            )

            result = response.text
            self.call_count['gemini'] += 1

            logger.info("Gemini response received")

            return {
                'model': 'gemini',
                'response': result,
                'timestamp': datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"Gemini error: {e}")
            return {
                'model': 'gemini',
                'response': None,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

    async def analyze_parallel(
        self,
        text: str,
        analysis_type: str = 'verification',
        memory_context: str = "",
        language: str = 'ja'
    ) -> Dict[str, Any]:
        """
        Analyze text with multiple LLMs in parallel.

        Args:
            text: Text to analyze
            analysis_type: Type of analysis ('extraction', 'verification')
            memory_context: Historical context
            language: Language code ('ja' or 'en')

        Returns:
            Combined results from all LLMs
        """
        # Format prompt based on analysis type
        if analysis_type == 'extraction':
            prompt = format_extraction_prompt(text, language=language)
        elif analysis_type == 'verification':
            prompt = format_verification_prompt(text, memory_context, language=language)
        else:
            raise ValueError(f"Unknown analysis type: {analysis_type}")

        logger.info(f"Starting parallel {analysis_type} analysis with 3 LLMs...")

        # Call all LLMs in parallel
        results = await asyncio.gather(
            self.call_gpt4o(prompt),
            self.call_claude(prompt),
            self.call_gemini(prompt),
            return_exceptions=True
        )

        # Parse results
        gpt_result, claude_result, gemini_result = results

        return {
            'analysis_type': analysis_type,
            'text': text[:200] + '...' if len(text) > 200 else text,
            'gpt4o': gpt_result,
            'claude': claude_result,
            'gemini': gemini_result,
            'timestamp': datetime.now().isoformat()
        }

    def parse_json_response(self, response: str) -> Optional[Dict]:
        """
        Parse JSON from LLM response.

        Args:
            response: LLM response text

        Returns:
            Parsed JSON or None
        """
        if not response:
            return None

        try:
            # Try to find JSON in response
            start_idx = response.find('{')
            end_idx = response.rfind('}')

            if start_idx != -1 and end_idx != -1:
                json_str = response[start_idx:end_idx + 1]
                return json.loads(json_str)

            # If no JSON found, try parsing entire response
            return json.loads(response)

        except Exception as e:
            logger.warning(f"Failed to parse JSON: {e}")
            return None

    async def get_consensus(
        self,
        gpt_result: str,
        claude_result: str,
        gemini_result: str,
        language: str = 'ja'
    ) -> Dict[str, Any]:
        """
        Get consensus decision from multiple LLM results.

        Args:
            gpt_result: GPT-4o analysis result
            claude_result: Claude analysis result
            gemini_result: Gemini analysis result
            language: Language code

        Returns:
            Consensus decision
        """
        logger.info("Generating consensus from LLM results...")

        # Format consensus prompt
        prompt = format_consensus_prompt(
            gpt_result=gpt_result,
            claude_result=claude_result,
            gemini_result=gemini_result,
            language=language
        )

        # Use Claude for final consensus (good at reasoning)
        consensus = await self.call_claude(prompt, temperature=0.3)

        # Parse consensus JSON
        if consensus.get('response'):
            parsed = self.parse_json_response(consensus['response'])
            if parsed:
                consensus['parsed'] = parsed

        return consensus

    def get_stats(self) -> Dict[str, Any]:
        """Get API call statistics."""
        return {
            'call_count': self.call_count.copy(),
            'last_call_time': {
                k: v.isoformat() if v else None
                for k, v in self.last_call_time.items()
            }
        }


# Async helper function for synchronous contexts
def analyze_text(
    text: str,
    analysis_type: str = 'verification',
    memory_context: str = "",
    language: str = 'ja'
) -> Dict[str, Any]:
    """
    Synchronous wrapper for parallel analysis.

    Args:
        text: Text to analyze
        analysis_type: Type of analysis
        memory_context: Historical context
        language: Language code

    Returns:
        Analysis results
    """
    orchestrator = LLMOrchestrator()

    # Run async function in event loop
    loop = asyncio.get_event_loop()
    if loop.is_running():
        # If loop is already running, create a new one
        results = asyncio.run(orchestrator.analyze_parallel(
            text=text,
            analysis_type=analysis_type,
            memory_context=memory_context,
            language=language
        ))
    else:
        results = loop.run_until_complete(orchestrator.analyze_parallel(
            text=text,
            analysis_type=analysis_type,
            memory_context=memory_context,
            language=language
        ))

    return results


if __name__ == '__main__':
    # Test the orchestrator
    test_text = """
    トヨタ自動車(7203)が2024年第3四半期の決算を発表。
    営業利益は前年同期比15%増の8,500億円。
    電動車の販売が好調で、特にハイブリッド車の需要が高まっている。
    """

    print("Testing LLM Orchestrator...")
    print("=" * 60)

    results = analyze_text(test_text, analysis_type='extraction', language='ja')

    print("\nGPT-4o Result:")
    print(results['gpt4o'].get('response', 'Error'))

    print("\nClaude Result:")
    print(results['claude'].get('response', 'Error'))

    print("\nGemini Result:")
    print(results['gemini'].get('response', 'Error'))
