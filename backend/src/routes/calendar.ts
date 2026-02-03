import { Router } from 'express';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';
import { addSystemLog } from './system';
import { toQueryString, toQueryNumber } from '../utils/query-helpers';

export const calendarRouter = Router();

interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  color?: string;
  category?: 'trade' | 'news' | 'trend' | 'other';
  data?: any;
}

// Google Calendar API統合
// Note: Google Calendar APIを使用する場合は、google-auth-library と googleapis をインストールする必要があります
// npm install googleapis google-auth-library

// イベント一覧を取得
calendarRouter.post('/events/list', asyncHandler(async (req, res) => {
  const { apiKey, calendarId = 'primary', timeMin, timeMax, maxResults = 100 } = req.body;

  validateRequired(req.body, ['apiKey']);

  addSystemLog('カレンダーイベントを取得中', 'info');

  // Google Calendar API v3 - Events: list
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events');
  url.searchParams.append('key', apiKey);
  url.searchParams.append('maxResults', String(maxResults));
  url.searchParams.append('singleEvents', 'true');
  url.searchParams.append('orderBy', 'startTime');

  if (timeMin) {
    url.searchParams.append('timeMin', timeMin);
  }
  if (timeMax) {
    url.searchParams.append('timeMax', timeMax);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to fetch calendar events');
  }

  const data: any = await response.json();

  const events: CalendarEvent[] = (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.summary || '',
    description: item.description || '',
    start: item.start.dateTime || item.start.date,
    end: item.end.dateTime || item.end.date,
    color: item.colorId,
    category: extractCategory(item.description),
    data: item,
  }));

  addSystemLog(`カレンダーイベント ${events.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      events,
      count: events.length,
    })
  );
}));

// 新規イベントを作成
calendarRouter.post('/events/create', asyncHandler(async (req, res) => {
  const { apiKey, calendarId = 'primary', event } = req.body;

  validateRequired(req.body, ['apiKey']);

  if (!event || !event.title || !event.start || !event.end) {
    throw new BadRequestError('Missing required event fields', 'title, start, end are required');
  }

  addSystemLog(`カレンダーイベントを作成中: ${event.title}`, 'info');

  // Google Calendar API v3 - Events: insert
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}`;

  const eventData = {
    summary: event.title,
    description: formatEventDescription(event),
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to create calendar event');
  }

  const data: any = await response.json();

  addSystemLog(`カレンダーイベントを作成: ${event.title}`, 'success');

  res.json(
    ApiResponse.success(
      {
        event: {
          id: data.id,
          title: data.summary,
          description: data.description,
          start: data.start.dateTime || data.start.date,
          end: data.end.dateTime || data.end.date,
        },
      },
      'Event created successfully'
    )
  );
}));

// イベントを更新
calendarRouter.post('/events/update', asyncHandler(async (req, res) => {
  const { apiKey, calendarId = 'primary', eventId, event } = req.body;

  validateRequired(req.body, ['apiKey', 'eventId']);

  addSystemLog(`カレンダーイベントを更新中: ${eventId}`, 'info');

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?key=${apiKey}`;

  const eventData: any = {};
  if (event.title) eventData.summary = event.title;
  if (event.description) eventData.description = formatEventDescription(event);
  if (event.start) {
    eventData.start = {
      dateTime: event.start,
      timeZone: 'Asia/Tokyo',
    };
  }
  if (event.end) {
    eventData.end = {
      dateTime: event.end,
      timeZone: 'Asia/Tokyo',
    };
  }
  if (event.color) eventData.colorId = event.color;
  if (event.category) eventData.colorId = getCategoryColor(event.category);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to update calendar event');
  }

  const data: any = await response.json();

  addSystemLog(`カレンダーイベントを更新: ${eventId}`, 'success');

  res.json(
    ApiResponse.success(
      {
        event: {
          id: data.id,
          title: data.summary,
          description: data.description,
          start: data.start.dateTime || data.start.date,
          end: data.end.dateTime || data.end.date,
        },
      },
      'Event updated successfully'
    )
  );
}));

// イベントを削除
calendarRouter.post('/events/delete', asyncHandler(async (req, res) => {
  const { apiKey, calendarId = 'primary', eventId } = req.body;

  validateRequired(req.body, ['apiKey', 'eventId']);

  addSystemLog(`カレンダーイベントを削除中: ${eventId}`, 'info');

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 204) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to delete calendar event');
  }

  addSystemLog(`カレンダーイベントを削除: ${eventId}`, 'success');

  res.json(
    ApiResponse.success({}, 'Event deleted successfully')
  );
}));

// 株価変動を自動記録
calendarRouter.post('/auto-record/stock-change', asyncHandler(async (req, res) => {
  const { apiKey, calendarId = 'primary', ticker, name, change, changePercent, reason } = req.body;

  validateRequired(req.body, ['apiKey', 'ticker']);

  const now = new Date();
  const endTime = new Date(now.getTime() + 60 * 60 * 1000); // 1時間後

  const event = {
    title: `📈 ${name || ticker} ${changePercent > 0 ? '急騰' : '急落'} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
    description: `銘柄: ${ticker}\n変動: ${change > 0 ? '+' : ''}${change} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n理由: ${reason || '不明'}\n記録時刻: ${now.toLocaleString('ja-JP')}`,
    start: now.toISOString(),
    end: endTime.toISOString(),
    category: 'trend' as const,
  };

  addSystemLog(`株価変動を自動記録: ${ticker} ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`, 'info');

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}`;

  const eventData = {
    summary: event.title,
    description: event.description,
    start: {
      dateTime: event.start,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: event.end,
      timeZone: 'Asia/Tokyo',
    },
    colorId: getCategoryColor(event.category),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to auto-record stock change');
  }

  const data: any = await response.json();

  addSystemLog(`株価変動を記録完了: ${ticker}`, 'success');

  res.json(
    ApiResponse.success({
      event: {
        id: data.id,
        title: data.summary,
      },
    })
  );
}));

// ニュースを自動記録
calendarRouter.post('/auto-record/news', asyncHandler(async (req, res) => {
  const { apiKey, calendarId = 'primary', title, summary, url, source } = req.body;

  validateRequired(req.body, ['apiKey', 'title']);

  const now = new Date();
  const endTime = new Date(now.getTime() + 60 * 60 * 1000); // 1時間後

  const event = {
    title: `📰 ${title}`,
    description: `${summary || ''}\n\nソース: ${source || '不明'}\nURL: ${url || ''}\n記録時刻: ${now.toLocaleString('ja-JP')}`,
    start: now.toISOString(),
    end: endTime.toISOString(),
    category: 'news' as const,
  };

  addSystemLog(`ニュースを自動記録: ${title}`, 'info');

  const urlApi = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}`;

  const eventData = {
    summary: event.title,
    description: event.description,
    start: {
      dateTime: event.start,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: event.end,
      timeZone: 'Asia/Tokyo',
    },
    colorId: getCategoryColor(event.category),
  };

  const response = await fetch(urlApi, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const data: any = await response.json();
    throw new Error(data.error?.message || 'Failed to auto-record news');
  }

  const data: any = await response.json();

  addSystemLog(`ニュースを記録完了: ${title}`, 'success');

  res.json(
    ApiResponse.success({
      event: {
        id: data.id,
        title: data.summary,
      },
    })
  );
}));

// Helper functions

function extractCategory(description?: string): 'trade' | 'news' | 'trend' | 'other' {
  if (!description) return 'other';

  if (description.includes('取引') || description.includes('売買')) return 'trade';
  if (description.includes('ニュース') || description.includes('📰')) return 'news';
  if (description.includes('変動') || description.includes('急騰') || description.includes('急落') || description.includes('📈') || description.includes('📉')) return 'trend';

  return 'other';
}

function getCategoryColor(category?: string): string {
  // Google Calendar color IDs
  // https://developers.google.com/calendar/api/v3/reference/colors
  switch (category) {
    case 'trade': return '10'; // Green
    case 'news': return '7';   // Cyan
    case 'trend': return '11'; // Red
    default: return '9';       // Blue
  }
}

function formatEventDescription(event: any): string {
  let description = event.description || '';

  if (event.category) {
    description = `[${event.category.toUpperCase()}] ${description}`;
  }

  if (event.data) {
    description += `\n\n--- データ ---\n${JSON.stringify(event.data, null, 2)}`;
  }

  return description;
}
