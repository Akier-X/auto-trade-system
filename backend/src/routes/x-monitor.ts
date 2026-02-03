import { Router } from 'express';
import cron from 'node-cron';
import { addSystemLog } from './system';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError, InternalServerError } from '../utils/api-response';
import { scrapeUserTweets, validateAuthCredentials, XTweet } from '../utils/x-scraper';

export const xMonitorRouter = Router();

// Store for monitoring state
let monitoringState = {
  isRunning: false,
  lastRun: null as string | null,
  nextRun: null as string | null,
  scheduledJobs: [] as any[],
};

// Store for fetched tweets
let monitoredTweetsCache: XTweet[] = [];

const normalizeTweetTexts = (tweets: XTweet[] | string[]): string[] => {
  if (!Array.isArray(tweets) || tweets.length === 0) {
    return [];
  }
  if (typeof tweets[0] === 'string') {
    return (tweets as string[]).map((text) => String(text)).filter(Boolean);
  }
  return (tweets as XTweet[]).map((tweet) => tweet.text).filter(Boolean);
};

const extractCachedTweetTexts = (username: string): string[] => {
  return monitoredTweetsCache
    .filter((tweet) => tweet?.author?.username?.toLowerCase?.() === username.toLowerCase())
    .map((tweet) => tweet?.text)
    .filter(Boolean);
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? 'Unknown error');
  }
};

// Helper function to check if current time is during trading hours
function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }

  // Morning session: 9:00-11:30
  const morningStart = 9 * 60; // 540
  const morningEnd = 11 * 60 + 30; // 690

  // Afternoon session: 12:30-15:30
  const afternoonStart = 12 * 60 + 30; // 750
  const afternoonEnd = 15 * 60 + 30; // 930

  return (
    (timeInMinutes >= morningStart && timeInMinutes <= morningEnd) ||
    (timeInMinutes >= afternoonStart && timeInMinutes <= afternoonEnd)
  );
}

// Fetch tweets for all monitored users
async function fetchMonitoredUsersTweets(watchedUsers: any[]): Promise<XTweet[]> {
  if (isTradingHours()) {
    addSystemLog('Skipping fetch during trading hours', 'info');
    return [];
  }

  const allTweets: XTweet[] = [];

  for (const user of watchedUsers.filter((u: any) => u.isActive)) {
    try {
      const tweets = await scrapeUserTweets(user.username, { maxTweets: 5 }) as XTweet[];
      allTweets.push(...tweets);

      // Add small delay between users to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`Failed to fetch tweets for ${user.username}:`, err);
    }
  }

  // Sort by date
  allTweets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  monitoredTweetsCache = allTweets;
  monitoringState.lastRun = new Date().toISOString();

  addSystemLog(`Fetched ${allTweets.length} tweets`, 'success');
  return allTweets;
}

// Manual fetch endpoint
xMonitorRouter.post('/fetch', asyncHandler(async (req, res) => {
  const { watchedUsers } = req.body;

  validateRequired(req.body, ['watchedUsers']);

  if (!Array.isArray(watchedUsers)) {
    throw new BadRequestError('watchedUsers must be an array');
  }

  const tweets = await fetchMonitoredUsersTweets(watchedUsers);

  res.json(
    ApiResponse.success({
      tweets,
      count: tweets.length,
      timestamp: new Date().toISOString(),
    })
  );
}));

// Get cached tweets
xMonitorRouter.get('/tweets', (req, res) => {
  res.json(
    ApiResponse.success({
      tweets: monitoredTweetsCache,
      count: monitoredTweetsCache.length,
      lastRun: monitoringState.lastRun,
      nextRun: monitoringState.nextRun,
    })
  );
});

// Get monitoring status
xMonitorRouter.get('/status', (req, res) => {
  res.json(
    ApiResponse.success({
      ...monitoringState,
      isTradingHours: isTradingHours(),
    })
  );
});

// Start scheduled monitoring
xMonitorRouter.post('/start-schedule', asyncHandler(async (req, res) => {
  const { watchedUsers } = req.body;

  validateRequired(req.body, ['watchedUsers']);

  if (!Array.isArray(watchedUsers)) {
    throw new BadRequestError('watchedUsers must be an array');
  }

  // Clear existing jobs
  monitoringState.scheduledJobs.forEach(job => job.stop());
  monitoringState.scheduledJobs = [];

  const scheduleHours = [8, 12, 22];

  for (const hour of scheduleHours) {
    const job = cron.schedule(`0 ${hour} * * 1-5`, async () => {
      addSystemLog(`Scheduled fetch triggered at ${hour}:00`, 'info');
      await fetchMonitoredUsersTweets(watchedUsers);
    }, {
      timezone: 'Asia/Tokyo'
    });
    monitoringState.scheduledJobs.push(job);
  }

  monitoringState.isRunning = true;

  // Calculate next run time
  const now = new Date();
  const nextTimes = scheduleHours.map(hour => {
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  });
  const nextRun = nextTimes.reduce((earliest, current) =>
    current < earliest ? current : earliest
  );
  monitoringState.nextRun = nextRun.toISOString();

  res.json(
    ApiResponse.success({
      schedule: scheduleHours.map(hour => `${hour}:00`),
      nextRun: monitoringState.nextRun,
    }, 'Scheduled monitoring started')
  );
}));

// Stop scheduled monitoring
xMonitorRouter.post('/stop-schedule', asyncHandler(async (req, res) => {
  monitoringState.scheduledJobs.forEach(job => job.stop());
  monitoringState.scheduledJobs = [];
  monitoringState.isRunning = false;
  monitoringState.nextRun = null;

  res.json(ApiResponse.success(null, 'Scheduled monitoring stopped'));
}));

// Analyze account with Gemini AI
async function analyzeAccountWithGemini(username: string, tweets: string[], apiKey: string): Promise<string> {
  if (!tweets || tweets.length === 0) {
    return 'No tweets available for analysis.';
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const material = tweets.map((tweet, index) => `Tweet ${index + 1}: ${tweet}`).join('\n');

    const prompt = `Analyze the following tweets from @${username}. Provide a concise Japanese report including:\n` +
      `- Reliability grade (A+ to E)\n` +
      `- Key themes and bias\n` +
      `- Trading relevance and caution points\n` +
      `- 3 bullet summary\n\n` +
      `${material}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: any) {
    console.error('Gemini analysis error:', error);
    return `Gemini analysis error: ${toErrorMessage(error)}`;
  }
}

// Analyze account endpoint
xMonitorRouter.post('/analyze-account', asyncHandler(async (req, res) => {
  const { username } = req.body;

  validateRequired(req.body, ['username']);

  let auth = undefined as ReturnType<typeof validateAuthCredentials> | undefined;
  try {
    auth = validateAuthCredentials(
      process.env.X_AUTH_TOKEN,
      process.env.X_CT0
    );
  } catch (error) {
    addSystemLog(`X auth credentials missing, using unauthenticated scraping: ${toErrorMessage(error)}`, 'warning');
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new InternalServerError('GEMINI_API_KEY is not set');
  }

  addSystemLog(`Starting account analysis for @${username}`, 'info');

  const timeoutPromise = new Promise<XTweet[] | string[]>((_, reject) =>
    setTimeout(() => reject(new Error('Tweet fetch timeout (90s)')), 90000)
  );

  let tweets: string[] = [];
  try {
    const scraped = await Promise.race([
      scrapeUserTweets(username, { auth, targetCount: 15, maxTweets: 10 }) as Promise<XTweet[] | string[]>,
      timeoutPromise
    ]);
    tweets = normalizeTweetTexts(scraped);
  } catch (error) {
    addSystemLog(`Tweet fetch failed for @${username}, fallback to cache: ${toErrorMessage(error)}`, 'warning');
    tweets = extractCachedTweetTexts(username);
  }

  if (tweets.length < 5) {
    throw new BadRequestError(
      `Not enough tweets fetched (${tweets.length})`,
      'Please ensure the account is public and try again.'
    );
  }

  const analysis = await analyzeAccountWithGemini(username, tweets, geminiApiKey);

  addSystemLog(`Account analysis completed for @${username}`, 'success');

  res.json(
    ApiResponse.success({
      username,
      analysis,
      tweets,
      tweetCount: tweets.length,
      timestamp: new Date().toISOString(),
    }, 'Account analysis completed')
  );
}));
