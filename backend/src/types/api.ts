// Common API response types

export interface YahooFinanceQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketTime: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  averageDailyVolume3Month: number;
  marketCap: number;
  trailingPE?: number;
  dividendYield?: number;
  shortName?: string;
  longName?: string;
  currency?: string;
  exchange?: string;
  quoteType?: string;
}

export interface YahooFinanceResponse {
  quoteResponse?: {
    result?: YahooFinanceQuote[];
    error?: string;
  };
  chart?: {
    result?: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
      };
    }>;
  };
}

export interface SlackAPIResponse {
  ok: boolean;
  error?: string;
  messages?: any[];
  channels?: any[];
  team?: string;
  user?: string;
  team_id?: string;
  user_id?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  htmlLink?: string;
}

export interface GoogleCalendarResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  summary?: string;
  timeZone?: string;
}

export interface AIResponse {
  text?: string;
  content?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface NewsAPIResponse {
  news?: Array<{
    title: string;
    summary?: string;
    description?: string;
    link: string;
    publisher: string;
    providerPublishTime: number;
    thumbnail?: {
      resolutions?: Array<{
        url: string;
      }>;
    };
    relatedTickers?: string[];
  }>;
  articles?: Array<{
    title: string;
    description?: string;
    content?: string;
    url: string;
    source: {
      name: string;
    };
    publishedAt: string;
    urlToImage?: string;
    author?: string;
  }>;
  message?: string;
}
