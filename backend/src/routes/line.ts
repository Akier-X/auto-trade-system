import { Router } from 'express';
import { Client } from '@line/bot-sdk';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse } from '../utils/api-response';

export const lineRouter = Router();

interface LineNotifyRequest {
  channelAccessToken: string;
  userId: string;
  message: string;
}

lineRouter.post('/line', asyncHandler(async (req, res) => {
  const { channelAccessToken, userId, message }: LineNotifyRequest = req.body;

  validateRequired({ channelAccessToken, userId, message }, ['channelAccessToken', 'userId', 'message']);

  // Create LINE client
  const client = new Client({
    channelAccessToken: channelAccessToken,
  });

  // Send push message
  await client.pushMessage(userId, {
    type: 'text',
    text: message,
  });

  res.json(
    ApiResponse.success({
      message: 'Notification sent successfully',
      timestamp: new Date().toISOString(),
    })
  );
}));

// Test endpoint to send a test notification
lineRouter.post('/line/test', asyncHandler(async (req, res) => {
  const { channelAccessToken, userId } = req.body;

  validateRequired({ channelAccessToken, userId }, ['channelAccessToken', 'userId']);

  const client = new Client({
    channelAccessToken: channelAccessToken,
  });

  const testMessage = `🔔 テスト通知\n\n取引ダッシュボードからのテスト通知です。\n送信時刻: ${new Date().toLocaleString('ja-JP')}`;

  await client.pushMessage(userId, {
    type: 'text',
    text: testMessage,
  });

  res.json(
    ApiResponse.success({
      message: 'Test notification sent successfully',
      timestamp: new Date().toISOString(),
    })
  );
}));

// Send trading signal notification
lineRouter.post('/line/signal', asyncHandler(async (req, res) => {
  const { channelAccessToken, userId, signal } = req.body;

  validateRequired({ channelAccessToken, userId, signal }, ['channelAccessToken', 'userId', 'signal']);

  const client = new Client({
    channelAccessToken: channelAccessToken,
  });

  const signalMessage = `
📊 トレードシグナル

${signal.type === 'BUY' ? '🟢 買い' : '🔴 売り'} ${signal.ticker}
${signal.companyName}

コンセンサススコア: ${signal.consensusScore}%
ケリーサイズ: ${signal.kellySize}%
推奨金額: $${signal.kellyAmount.toLocaleString()}

${signal.reasoning || ''}
`.trim();

  await client.pushMessage(userId, {
    type: 'text',
    text: signalMessage,
  });

  res.json(
    ApiResponse.success({
      message: 'Signal notification sent successfully',
      timestamp: new Date().toISOString(),
    })
  );
}));
