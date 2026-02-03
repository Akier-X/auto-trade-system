import { Router } from 'express';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse } from '../utils/api-response';

export const slackRouter = Router();

interface SlackNotifyRequest {
  webhookUrl: string;
  message: string;
}

interface SlackSignalRequest {
  webhookUrl: string;
  signal: any;
}

// Send custom message to Slack
slackRouter.post('/slack', asyncHandler(async (req, res) => {
  const { webhookUrl, message }: SlackNotifyRequest = req.body;

  validateRequired({ webhookUrl, message }, ['webhookUrl', 'message']);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: message,
    }),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.statusText}`);
  }

  res.json(
    ApiResponse.success({
      message: 'Slack notification sent successfully',
      timestamp: new Date().toISOString(),
    })
  );
}));

// Send test notification to Slack
slackRouter.post('/slack/test', asyncHandler(async (req, res) => {
  const { webhookUrl } = req.body;

  validateRequired({ webhookUrl }, ['webhookUrl']);

  const testMessage = {
    text: '🔔 テスト通知',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔔 テスト通知',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '取引ダッシュボードからのテスト通知です。'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `送信時刻: ${new Date().toLocaleString('ja-JP')}`
          }
        ]
      }
    ]
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testMessage),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.statusText}`);
  }

  res.json(
    ApiResponse.success({
      message: 'Test notification sent successfully',
      timestamp: new Date().toISOString(),
    })
  );
}));

// Send trading signal notification to Slack
slackRouter.post('/slack/signal', asyncHandler(async (req, res) => {
  const { webhookUrl, signal }: SlackSignalRequest = req.body;

  validateRequired({ webhookUrl, signal }, ['webhookUrl', 'signal']);

  const signalType = signal.type === 'BUY' ? '🟢 買い' : '🔴 売り';
  const color = signal.type === 'BUY' ? '#10b981' : '#ef4444';

  const signalMessage = {
    text: `${signalType} ${signal.ticker}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 トレードシグナル',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${signalType} ${signal.ticker}*\n${signal.companyName}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*コンセンサススコア:*\n${signal.consensusScore}%`
          },
          {
            type: 'mrkdwn',
            text: `*ケリーサイズ:*\n${signal.kellySize}%`
          },
          {
            type: 'mrkdwn',
            text: `*推奨金額:*\n$${signal.kellyAmount.toLocaleString()}`
          },
          {
            type: 'mrkdwn',
            text: `*取引所:*\n${signal.exchange}`
          }
        ]
      }
    ],
    attachments: signal.reasoning ? [
      {
        color: color,
        text: signal.reasoning
      }
    ] : []
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signalMessage),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.statusText}`);
  }

  res.json(
    ApiResponse.success({
      message: 'Signal notification sent successfully',
      timestamp: new Date().toISOString(),
    })
  );
}));
