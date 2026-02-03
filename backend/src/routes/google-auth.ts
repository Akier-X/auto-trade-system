import { Router } from 'express';
import { addSystemLog } from './system';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';

export const googleAuthRouter = Router();

interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
}

// Get Google Client ID from environment
googleAuthRouter.get('/client-id', asyncHandler(async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new BadRequestError(
      'GOOGLE_CLIENT_ID not configured',
      'GOOGLE_CLIENT_IDが環境変数に設定されていません'
    );
  }

  res.json(
    ApiResponse.success({
      clientId
    })
  );
}));

// OAuth 2.0認証URLを生成
googleAuthRouter.post('/auth-url', asyncHandler(async (req, res) => {
  const { clientId, redirectUri } = req.body;

  validateRequired({ clientId }, ['clientId']);

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri || 'http://localhost:5173/calendar');
  authUrl.searchParams.append('response_type', 'token');
  authUrl.searchParams.append('scope', scopes.join(' '));
  authUrl.searchParams.append('include_granted_scopes', 'true');
  authUrl.searchParams.append('state', 'calendar_auth');

  addSystemLog('OAuth認証URLを生成', 'info');

  res.json(
    ApiResponse.success({
      authUrl: authUrl.toString(),
    })
  );
}));

// アクセストークンを検証
googleAuthRouter.post('/verify-token', asyncHandler(async (req, res) => {
  const { accessToken } = req.body;

  validateRequired({ accessToken }, ['accessToken']);

  // Googleのトークン情報エンドポイントで検証
  const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || 'Invalid token');
  }

  addSystemLog('アクセストークンを検証', 'success');

  res.json(
    ApiResponse.success({
      tokenInfo: {
        scope: data.scope,
        expiresIn: data.expires_in,
        email: data.email,
      },
    })
  );
}));

// カレンダーイベント一覧を取得（OAuth版）
googleAuthRouter.post('/calendar/events', asyncHandler(async (req, res) => {
  const { accessToken, calendarId = 'primary', timeMin, timeMax, maxResults = 100 } = req.body;

  validateRequired({ accessToken }, ['accessToken']);

  addSystemLog('カレンダーイベントを取得中（OAuth）', 'info');

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.append('maxResults', String(maxResults));
  url.searchParams.append('singleEvents', 'true');
  url.searchParams.append('orderBy', 'startTime');

  if (timeMin) {
    url.searchParams.append('timeMin', timeMin);
  }
  if (timeMax) {
    url.searchParams.append('timeMax', timeMax);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to fetch calendar events');
  }

  const events = (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.summary || '',
    description: item.description || '',
    start: item.start.dateTime || item.start.date,
    end: item.end.dateTime || item.end.date,
    color: item.colorId,
    htmlLink: item.htmlLink,
  }));

  addSystemLog(`カレンダーイベント ${events.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      events,
      count: events.length,
    })
  );
}));

// イベントを作成（OAuth版）
googleAuthRouter.post('/calendar/create-event', asyncHandler(async (req, res) => {
  const { accessToken, calendarId = 'primary', event } = req.body;

  validateRequired({ accessToken, event }, ['accessToken', 'event']);

  addSystemLog(`カレンダーイベントを作成中: ${event.title}`, 'info');

  const eventData = {
    summary: event.title,
    description: event.description || '',
    start: {
      dateTime: event.start,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: event.end,
      timeZone: 'Asia/Tokyo',
    },
    colorId: event.color || getCategoryColor(event.category),
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    }
  );

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to create event');
  }

  addSystemLog(`カレンダーイベントを作成: ${event.title}`, 'success');

  res.json(
    ApiResponse.success({
      event: {
        id: data.id,
        title: data.summary,
        htmlLink: data.htmlLink,
      },
    })
  );
}));

// イベントを削除（OAuth版）
googleAuthRouter.post('/calendar/delete-event', asyncHandler(async (req, res) => {
  const { accessToken, calendarId = 'primary', eventId } = req.body;

  validateRequired({ accessToken, eventId }, ['accessToken', 'eventId']);

  addSystemLog(`カレンダーイベントを削除中: ${eventId}`, 'info');

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 204) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to delete event');
  }

  addSystemLog(`カレンダーイベントを削除: ${eventId}`, 'success');

  res.json(
    ApiResponse.success({
      message: 'Event deleted successfully',
    })
  );
}));

function getCategoryColor(category?: string): string {
  switch (category) {
    case 'trade': return '10'; // Green
    case 'news': return '7';   // Cyan
    case 'trend': return '11'; // Red
    default: return '9';       // Blue
  }
}
