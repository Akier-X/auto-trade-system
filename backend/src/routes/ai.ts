import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';
import { addSystemLog } from './system';

export const aiRouter = Router();

// Test Gemini API
aiRouter.post('/gemini/test', asyncHandler(async (req, res) => {
  const { apiKey } = req.body;

  validateRequired(req.body, ['apiKey']);

  addSystemLog('Gemini APIテスト開始', 'info');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = '簡単な市場分析のテストです。「Hello」と返答してください。';
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  addSystemLog('Gemini APIテスト成功', 'success');

  res.json(
    ApiResponse.success(
      {
        response: text,
      },
      'Gemini API test successful'
    )
  );
}));

// Analyze stock with Gemini
aiRouter.post('/gemini/analyze', asyncHandler(async (req, res) => {
  const { apiKey, ticker, data } = req.body;

  validateRequired(req.body, ['apiKey', 'ticker']);

  addSystemLog(`${ticker} の分析開始 (Gemini)`, 'info');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
株式分析：${ticker}

以下のデータに基づいて、この銘柄の短期的な取引判断を行ってください：
${data ? JSON.stringify(data, null, 2) : '基本的な分析を行ってください'}

以下の形式で回答してください：
1. 判断（BUY/SELL/NEUTRAL）
2. 信頼度（0-100%）
3. 理由（3-5文）
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  addSystemLog(`${ticker} の分析完了`, 'success', true);

  res.json(
    ApiResponse.success({
      ticker,
      analysis: text,
    })
  );
}));

// Test OpenAI API
aiRouter.post('/openai/test', asyncHandler(async (req, res) => {
  const { apiKey } = req.body;

  validateRequired(req.body, ['apiKey']);

  addSystemLog('OpenAI APIテスト開始', 'info');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'user',
          content: '簡単な市場分析のテストです。「Hello」と返答してください。'
        }
      ],
      max_tokens: 100,
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API error');
  }

  addSystemLog('OpenAI APIテスト成功', 'success');

  res.json(
    ApiResponse.success(
      {
        response: data.choices[0].message.content,
      },
      'OpenAI API test successful'
    )
  );
}));

// Test Anthropic API
aiRouter.post('/anthropic/test', asyncHandler(async (req, res) => {
  const { apiKey } = req.body;

  validateRequired(req.body, ['apiKey']);

  addSystemLog('Anthropic APIテスト開始', 'info');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: '簡単な市場分析のテストです。「Hello」と返答してください。'
        }
      ],
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Anthropic API error');
  }

  addSystemLog('Anthropic APIテスト成功', 'success');

  res.json(
    ApiResponse.success(
      {
        response: data.content[0].text,
      },
      'Anthropic API test successful'
    )
  );
}));
