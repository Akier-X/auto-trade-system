"""
Prompt Templates for LLM Analysis
Centralized prompt definitions for consistent AI analysis.
"""

# ============================================================================
# Extraction Prompts
# ============================================================================

EXTRACTION_PROMPT = """
以下の投稿テキストを解析し、JSON形式で以下の情報を抽出してください:

{{
  "tickers": ["銘柄コード1", "銘柄コード2"],
  "sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
  "key_points": ["重要な点1", "重要な点2", "重要な点3"],
  "keywords": ["キーワード1", "キーワード2"],
  "confidence": 0.85,
  "summary": "簡潔な要約（100文字以内）"
}}

抽出ルール:
1. tickers: 言及されている株式銘柄コード（ティッカーシンボル）をすべて抽出
2. sentiment: 全体的なセンチメント（ポジティブ/ネガティブ/中立）
3. key_points: 投資判断に関連する重要なポイント（3-5個）
4. keywords: 重要なキーワード（業績、M&A、新製品など）
5. confidence: この抽出結果の信頼度（0.0-1.0）
6. summary: テキストの簡潔な要約

テキスト:
{text}

JSONのみを出力してください（説明不要）:
"""

EXTRACTION_PROMPT_EN = """
Analyze the following text and extract information in JSON format:

{{
  "tickers": ["TICKER1", "TICKER2"],
  "sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
  "key_points": ["point 1", "point 2", "point 3"],
  "keywords": ["keyword1", "keyword2"],
  "confidence": 0.85,
  "summary": "Brief summary (max 200 chars)"
}}

Extraction Rules:
1. tickers: Extract all mentioned stock ticker symbols
2. sentiment: Overall sentiment (positive/negative/neutral)
3. key_points: Key points relevant to investment decisions (3-5 items)
4. keywords: Important keywords (earnings, M&A, new products, etc.)
5. confidence: Confidence score for this extraction (0.0-1.0)
6. summary: Concise summary of the text

Text:
{text}

Output JSON only (no explanation):
"""

# ============================================================================
# Verification Prompts
# ============================================================================

VERIFICATION_PROMPT = """
以下のテキストの真偽性・信頼性を100点満点で評価し、JSON形式で返してください:

{{
  "veracity_score": 85,
  "reasoning": "評価の理由を簡潔に（200文字以内）",
  "risks": ["リスク要因1", "リスク要因2"],
  "opportunities": ["機会要因1", "機会要因2"],
  "confidence": 0.85,
  "recommendation": "BUY|HOLD|SELL|WATCH"
}}

評価基準:
1. veracity_score: 情報の信頼性（0-100点）
   - 100点: 公式発表など極めて信頼性が高い
   - 70-90点: 信頼できる情報源からの情報
   - 40-70点: 噂や推測を含む
   - 0-40点: 根拠が乏しい、または虚偽の可能性

2. reasoning: スコアの根拠を簡潔に説明

3. risks: この情報に基づく投資のリスク要因

4. opportunities: この情報に基づく投資機会

5. confidence: この評価の確信度（0.0-1.0）

6. recommendation: 投資推奨
   - BUY: 買い推奨
   - HOLD: 保有継続
   - SELL: 売却推奨
   - WATCH: 監視継続

テキスト:
{text}

過去の関連情報（参考）:
{memory_context}

JSONのみを出力してください:
"""

VERIFICATION_PROMPT_EN = """
Evaluate the veracity and reliability of the following text on a scale of 0-100 and return in JSON format:

{{
  "veracity_score": 85,
  "reasoning": "Brief reasoning (max 300 chars)",
  "risks": ["risk factor 1", "risk factor 2"],
  "opportunities": ["opportunity 1", "opportunity 2"],
  "confidence": 0.85,
  "recommendation": "BUY|HOLD|SELL|WATCH"
}}

Evaluation Criteria:
1. veracity_score: Information reliability (0-100)
   - 100: Official announcements, highly reliable
   - 70-90: Reliable news sources
   - 40-70: Rumors or speculation
   - 0-40: Weak evidence or potentially false

2. reasoning: Brief explanation for the score

3. risks: Risk factors for investing based on this information

4. opportunities: Investment opportunities based on this information

5. confidence: Confidence in this evaluation (0.0-1.0)

6. recommendation: Investment recommendation
   - BUY: Recommend buying
   - HOLD: Continue holding
   - SELL: Recommend selling
   - WATCH: Continue monitoring

Text:
{text}

Historical Context (reference):
{memory_context}

Output JSON only:
"""

# ============================================================================
# Consensus Prompts
# ============================================================================

CONSENSUS_PROMPT = """
以下の3つのLLMの分析結果を総合的に判断し、最終的な投資判断を下してください:

GPT-4o の分析:
{gpt_result}

Claude の分析:
{claude_result}

Gemini の分析:
{gemini_result}

以下のJSON形式で最終判断を出力してください:

{{
  "final_decision": "EXECUTE|WATCH|HOLD|REJECT",
  "confidence": 0.85,
  "agreement_level": "HIGH|MEDIUM|LOW",
  "reasoning": "判断の根拠（300文字以内）",
  "action_plan": "具体的なアクションプラン（200文字以内）",
  "risk_assessment": "リスク評価（200文字以内）"
}}

判断基準:
1. final_decision:
   - EXECUTE: 3つのモデルが概ね一致しており、信頼性が高い → 取引実行
   - WATCH: 一部のモデルは肯定的だが、意見が分かれる → 監視継続
   - HOLD: 現時点では判断が難しい → 様子見
   - REJECT: 信頼性が低い、またはネガティブ要因が多い → 却下

2. confidence: 最終判断の確信度（0.0-1.0）

3. agreement_level: 3つのモデル間の合意度
   - HIGH: スコアの標準偏差が5未満
   - MEDIUM: 標準偏差が5-15
   - LOW: 標準偏差が15以上

4. reasoning: 判断の根拠を具体的に説明

5. action_plan: 具体的な次のアクション

6. risk_assessment: 考慮すべきリスク

JSONのみを出力してください:
"""

CONSENSUS_PROMPT_EN = """
Based on the following three LLM analysis results, make a final investment decision:

GPT-4o Analysis:
{gpt_result}

Claude Analysis:
{claude_result}

Gemini Analysis:
{gemini_result}

Output your final decision in the following JSON format:

{{
  "final_decision": "EXECUTE|WATCH|HOLD|REJECT",
  "confidence": 0.85,
  "agreement_level": "HIGH|MEDIUM|LOW",
  "reasoning": "Justification for decision (max 500 chars)",
  "action_plan": "Specific action plan (max 300 chars)",
  "risk_assessment": "Risk assessment (max 300 chars)"
}}

Decision Criteria:
1. final_decision:
   - EXECUTE: Models largely agree, high reliability → Execute trade
   - WATCH: Some positive but opinions differ → Continue monitoring
   - HOLD: Difficult to judge currently → Wait and see
   - REJECT: Low reliability or many negative factors → Reject

2. confidence: Confidence in final decision (0.0-1.0)

3. agreement_level: Agreement between the three models
   - HIGH: Standard deviation of scores < 5
   - MEDIUM: Standard deviation 5-15
   - LOW: Standard deviation > 15

4. reasoning: Explain decision rationale specifically

5. action_plan: Specific next actions

6. risk_assessment: Risks to consider

Output JSON only:
"""

# ============================================================================
# Ticker Extraction Prompt
# ============================================================================

TICKER_EXTRACTION_PROMPT = """
以下のテキストから株式銘柄コード（ティッカーシンボル）を抽出してください。

ルール:
- 日本株: 4桁の数字（例: 7203, 9984）
- 米国株: アルファベット1-5文字（例: AAPL, GOOGL, TSLA）
- 重複を除外
- テキスト内で言及されているもののみ

テキスト:
{text}

JSON形式で出力:
{{
  "tickers": ["TICKER1", "TICKER2"]
}}
"""

# ============================================================================
# Helper Functions
# ============================================================================

def format_extraction_prompt(text: str, language: str = 'ja') -> str:
    """
    Format extraction prompt with text.

    Args:
        text: Text to analyze
        language: Language code ('ja' or 'en')

    Returns:
        Formatted prompt
    """
    template = EXTRACTION_PROMPT if language == 'ja' else EXTRACTION_PROMPT_EN
    return template.format(text=text)


def format_verification_prompt(
    text: str,
    memory_context: str = "",
    language: str = 'ja'
) -> str:
    """
    Format verification prompt with text and memory context.

    Args:
        text: Text to verify
        memory_context: Historical context
        language: Language code ('ja' or 'en')

    Returns:
        Formatted prompt
    """
    template = VERIFICATION_PROMPT if language == 'ja' else VERIFICATION_PROMPT_EN

    if not memory_context:
        memory_context = "関連する過去情報なし" if language == 'ja' else "No relevant historical data"

    return template.format(
        text=text,
        memory_context=memory_context
    )


def format_consensus_prompt(
    gpt_result: str,
    claude_result: str,
    gemini_result: str,
    language: str = 'ja'
) -> str:
    """
    Format consensus prompt with LLM results.

    Args:
        gpt_result: GPT-4o analysis result
        claude_result: Claude analysis result
        gemini_result: Gemini analysis result
        language: Language code ('ja' or 'en')

    Returns:
        Formatted prompt
    """
    template = CONSENSUS_PROMPT if language == 'ja' else CONSENSUS_PROMPT_EN

    return template.format(
        gpt_result=gpt_result,
        claude_result=claude_result,
        gemini_result=gemini_result
    )


def format_ticker_extraction_prompt(text: str) -> str:
    """
    Format ticker extraction prompt.

    Args:
        text: Text to extract tickers from

    Returns:
        Formatted prompt
    """
    return TICKER_EXTRACTION_PROMPT.format(text=text)
