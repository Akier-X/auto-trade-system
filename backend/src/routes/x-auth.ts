import { Router } from 'express';
import { addSystemLog } from './system';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';

export const xAuthRouter = Router();

interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
  entities?: {
    cashtags?: Array<{ tag: string }>;
    hashtags?: Array<{ tag: string }>;
  };
}

// Helper function to extract media from tweet page using Playwright
async function captureMediaFromTweet(tweetUrl: string): Promise<{
  images: string[],
  videos: string[],
  description: string
}> {
  let browser;
  let context;
  try {
    // Normalize URL - try both twitter.com and x.com
    let normalizedUrl = tweetUrl;
    if (tweetUrl.includes('x.com')) {
      normalizedUrl = tweetUrl; // Use x.com as-is
    } else if (tweetUrl.includes('twitter.com')) {
      normalizedUrl = tweetUrl; // Use twitter.com as-is
    }

    addSystemLog(`ツイートページからメディアを取得中: ${normalizedUrl}`, 'info');

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      timeout: 60000
    });

    // Create context WITHOUT video recording to avoid crashes
    context = await browser.newContext({
      viewport: { width: 1200, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Navigate to the tweet URL with extended timeout and relaxed wait condition
    try {
      await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    } catch (gotoError: any) {
      // If initial navigation fails, try with load state
      addSystemLog('初回読み込み失敗、リトライ中', 'info');
      await page.goto(tweetUrl, { waitUntil: 'load', timeout: 40000 });
    }

    // Wait for tweet content to appear
    try {
      await page.waitForSelector('article', { timeout: 10000 });
    } catch (e) {
      addSystemLog('記事要素の読み込みに時間がかかっています', 'info');
    }

    // Additional wait for dynamic content
    await page.waitForTimeout(3000);

    const capturedImages: string[] = [];
    const capturedVideos: string[] = [];
    let mediaDescription = '';

    // Extract images from the tweet - try multiple selectors for compatibility
    let imageElements = await page.$$('article img[src*="pbs.twimg.com/media"]');

    // Fallback: try alternative selectors
    if (imageElements.length === 0) {
      imageElements = await page.$$('img[src*="pbs.twimg.com/media"]');
      addSystemLog('代替セレクタで画像を検索中', 'info');
    }

    if (imageElements.length > 0) {
      addSystemLog(`画像 ${imageElements.length}件を検出`, 'info');

      for (let i = 0; i < Math.min(imageElements.length, 4); i++) {
        try {
          const imgSrc = await imageElements[i].getAttribute('src');
          if (imgSrc && imgSrc.includes('pbs.twimg.com/media')) {
            // Get high quality version (remove size parameter and add large)
            let highQualityUrl = imgSrc;
            if (highQualityUrl.includes('?')) {
              highQualityUrl = imgSrc.split('?')[0] + '?format=jpg&name=large';
            } else {
              highQualityUrl = imgSrc + '?format=jpg&name=large';
            }

            addSystemLog(`画像 ${i + 1} をダウンロード中: ${highQualityUrl.substring(0, 80)}...`, 'info');

            // Fetch the image with retry
            let imageBuffer;
            try {
              const imageResponse = await page.context().request.get(highQualityUrl, { timeout: 15000 });
              imageBuffer = await imageResponse.body();
            } catch (fetchError) {
              // Retry with original URL if high quality fails
              addSystemLog(`高画質版の取得失敗、オリジナルURLで再試行`, 'info');
              const imageResponse = await page.context().request.get(imgSrc, { timeout: 15000 });
              imageBuffer = await imageResponse.body();
            }

            const base64Image = imageBuffer.toString('base64');
            capturedImages.push(base64Image);
            addSystemLog(`画像 ${i + 1} を取得完了`, 'success');
          }
        } catch (err: any) {
          console.error(`Failed to capture image ${i}:`, err);
          addSystemLog(`画像 ${i + 1} の取得失敗: ${err.message}`, 'warning');
        }
      }

      if (capturedImages.length > 0) {
        mediaDescription += `【画像: ${capturedImages.length}件】`;
      }
    } else {
      addSystemLog('画像要素が見つかりませんでした', 'info');
    }

    // Check for videos - capture screenshots instead of recording
    const videoElements = await page.$$('video');
    if (videoElements.length > 0) {
      addSystemLog(`動画 ${videoElements.length}件を検出`, 'info');

      // Take screenshot of first video frame
      for (let i = 0; i < Math.min(videoElements.length, 2); i++) {
        try {
          const video = videoElements[i];

          // Try to capture video thumbnail
          await video.evaluate((v: any) => {
            v.currentTime = 0;
            v.muted = true;
          });

          await page.waitForTimeout(500);

          // Take screenshot of video element
          const videoScreenshot = await video.screenshot({ type: 'png' });
          const base64VideoImage = videoScreenshot.toString('base64');
          capturedImages.push(base64VideoImage);

          addSystemLog(`動画 ${i + 1}: サムネイルを取得`, 'success');
        } catch (err: any) {
          console.error(`Failed to capture video ${i}:`, err);
          addSystemLog(`動画 ${i + 1} のキャプチャ失敗: ${err.message}`, 'warning');
        }
      }

      if (videoElements.length > 0) {
        if (mediaDescription) mediaDescription += ' ';
        mediaDescription += `【動画: ${videoElements.length}件（サムネイル取得）】`;
      }
    }

    // Check for quoted tweet (引用ツイート)
    const quotedTweet = await page.$('article[role="article"] + div article[role="article"]');
    if (quotedTweet) {
      mediaDescription += ' 【引用ツイートあり】';
      addSystemLog('引用ツイートを検出', 'info');
    }

    // Close browser
    await context.close();
    await browser.close();

    const totalMedia = capturedImages.length + capturedVideos.length;
    if (totalMedia > 0) {
      addSystemLog(`合計 ${totalMedia}件のメディアを取得完了 (画像:${capturedImages.length}, 動画:${capturedVideos.length})`, 'success');
    } else {
      addSystemLog('メディアが見つかりませんでした', 'info');
    }

    return {
      images: capturedImages,
      videos: capturedVideos,
      description: mediaDescription || ''
    };
  } catch (error: any) {
    console.error('Media capture error:', error);
    addSystemLog(`メディア取得エラー: ${error.message}`, 'error');
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
    return { images: [], videos: [], description: '' };
  }
}

// Verify tweet authenticity using AI
xAuthRouter.post('/verify', asyncHandler(async (req, res) => {
  const { apiKey, tweet, provider = 'gemini', tweetUrl } = req.body;

  validateRequired({ apiKey, tweet }, ['apiKey', 'tweet']);

  addSystemLog('ツイートの真偽を判定中', 'info');

    // Capture media from tweet page using Playwright
    let capturedImages: string[] = [];
    let capturedVideos: string[] = [];
    let mediaDescription = '';

    if (tweetUrl) {
      try {
        addSystemLog('ツイートページからメディアを取得中', 'info');
        const mediaResult = await captureMediaFromTweet(tweetUrl);
        capturedImages = mediaResult.images;
        capturedVideos = mediaResult.videos;
        mediaDescription = mediaResult.description;

        const totalMedia = capturedImages.length + capturedVideos.length;
        if (totalMedia > 0) {
          addSystemLog(`${totalMedia}件のメディアを取得完了 (画像:${capturedImages.length}, 動画:${capturedVideos.length})`, 'success');
        } else {
          addSystemLog('メディアが見つかりませんでした（テキストのみで分析を続行）', 'info');
        }
      } catch (mediaError: any) {
        console.error('Media capture failed, continuing with text-only analysis:', mediaError);
        addSystemLog(`メディア取得失敗（テキストのみで分析を続行）: ${mediaError.message}`, 'warning');
        // Continue with text-only analysis
      }
    }

    // ツイートから銘柄コードを抽出（日本株の4桁コード）
    const tickerMatches = tweet.text.match(/\b[0-9]{4}\b/g) || [];
    const uniqueTickers = [...new Set(tickerMatches)];

    // ツイート投稿日時を取得
    const tweetDate = new Date(tweet.created_at);
    const tweetTimestamp = Math.floor(tweetDate.getTime() / 1000);

    // ツイート本文から時間参照を抽出
    const timeReferences: Array<{label: string, daysAgo: number}> = [];

    // 週数参照（「3週間前」「2週前」など）
    const weekMatches = tweet.text.matchAll(/([0-9]+)週間?前/g);
    for (const match of weekMatches) {
      const weeks = parseInt(match[1]);
      timeReferences.push({
        label: `${weeks}週間前`,
        daysAgo: weeks * 7
      });
    }

    // 月数参照（「1ヶ月前」「3か月前」など）
    const monthMatches = tweet.text.matchAll(/([0-9]+)[ヶか]月前/g);
    for (const match of monthMatches) {
      const months = parseInt(match[1]);
      timeReferences.push({
        label: `${months}ヶ月前`,
        daysAgo: months * 30
      });
    }

    // 日数参照（「10日前」など）
    const dayMatches = tweet.text.matchAll(/([0-9]+)日前/g);
    for (const match of dayMatches) {
      const days = parseInt(match[1]);
      timeReferences.push({
        label: `${days}日前`,
        daysAgo: days
      });
    }

    // 年数参照（「去年」「1年前」など）
    if (tweet.text.includes('去年') || tweet.text.includes('昨年')) {
      timeReferences.push({
        label: '去年',
        daysAgo: 365
      });
    }
    const yearMatches = tweet.text.matchAll(/([0-9]+)年前/g);
    for (const match of yearMatches) {
      const years = parseInt(match[1]);
      timeReferences.push({
        label: `${years}年前`,
        daysAgo: years * 365
      });
    }

    // 銘柄情報を取得（Yahoo Finance API使用）
    let stockInfoText = '';
    const stockInfoArray: any[] = []; // スコープ外で定義

    if (uniqueTickers.length > 0) {
      addSystemLog(`銘柄情報を取得中: ${uniqueTickers.join(', ')}`, 'info');

      for (const ticker of uniqueTickers) {
        try {
          // 日本株の場合は .T を付ける（東京証券取引所）
          const yahooSymbol = `${ticker}.T`;

          // Yahoo Finance Japan APIから日本語名を取得
          let japaneseName = '';
          let sector = '';
          let industry = '';

          try {
            // Yahoo Finance JapanのAPIエンドポイント
            const jpUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?region=JP&lang=ja-JP`;
            const jpResponse = await fetch(jpUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'ja-JP,ja;q=0.9'
              }
            });
            const jpData: any = await jpResponse.json();

            if (jpResponse.ok && !jpData.chart.error) {
              const jpMeta = jpData.chart.result[0].meta;
              japaneseName = jpMeta.longName || jpMeta.shortName || '';
            }
          } catch (err) {
            console.log('Failed to fetch Japanese name, using English fallback');
          }

          // 現在の株価データを取得
          const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`;
          const response = await fetch(yahooUrl);
          const data: any = await response.json();

          if (response.ok && !data.chart.error) {
            const result = data.chart.result[0];
            const meta = result.meta;
            const quote = result.indicators.quote[0];
            const latestIndex = quote.close.length - 1;
            const currentPrice = quote.close[latestIndex];
            const previousClose = meta.chartPreviousClose || meta.previousClose;
            const change = ((currentPrice - previousClose) / previousClose) * 100;

            // 詳細情報を取得
            try {
              const quoteUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=assetProfile,summaryProfile`;
              const quoteResponse = await fetch(quoteUrl);
              const quoteData: any = await quoteResponse.json();

              if (quoteResponse.ok && quoteData.quoteSummary?.result?.[0]) {
                const profile = quoteData.quoteSummary.result[0].assetProfile || quoteData.quoteSummary.result[0].summaryProfile;
                sector = profile?.sector || '';
                industry = profile?.industry || '';
              }
            } catch (err) {
              // 詳細情報の取得に失敗しても継続
            }

            // 投稿時点の株価データを取得（履歴データ）
            let historicalPriceInfo = '';
            try {
              // 投稿日時と過去参照時点のデータを取得
              // 最も古い時間参照を見つける
              const maxDaysAgo = timeReferences.length > 0
                ? Math.max(...timeReferences.map(ref => ref.daysAgo))
                : 7;

              // データ取得範囲を設定（参照された過去時点 + 余裕を持って1週間前まで）
              const startDate = tweetTimestamp - ((maxDaysAgo + 7) * 24 * 60 * 60);
              const endDate = tweetTimestamp + (24 * 60 * 60); // 投稿翌日

              const histUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d`;
              const histResponse = await fetch(histUrl);
              const histData: any = await histResponse.json();

              if (histResponse.ok && !histData.chart.error) {
                const histResult = histData.chart.result[0];
                const timestamps = histResult.timestamp || [];
                const histQuote = histResult.indicators.quote[0];

                // 投稿日時に最も近い取引日のデータを見つける
                let closestIndex = 0;
                let minDiff = Math.abs(timestamps[0] - tweetTimestamp);

                for (let i = 1; i < timestamps.length; i++) {
                  const diff = Math.abs(timestamps[i] - tweetTimestamp);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                  }
                }

                const tweetDayPrice = histQuote.close[closestIndex];
                const tweetDayOpen = histQuote.open[closestIndex];
                const tweetDayHigh = histQuote.high[closestIndex];
                const tweetDayLow = histQuote.low[closestIndex];
                const tweetDayDate = new Date(timestamps[closestIndex] * 1000);

                // 前日の終値（存在する場合）
                const prevDayClose = closestIndex > 0 ? histQuote.close[closestIndex - 1] : null;
                const dayChange = prevDayClose ? ((tweetDayPrice - prevDayClose) / prevDayClose) * 100 : null;

                historicalPriceInfo = `\n  投稿時点の株価（${tweetDayDate.toLocaleDateString('ja-JP')}）:`;
                historicalPriceInfo += `\n    - 終値: ¥${tweetDayPrice?.toFixed(2) || 'N/A'}`;
                historicalPriceInfo += `\n    - 始値: ¥${tweetDayOpen?.toFixed(2) || 'N/A'}`;
                historicalPriceInfo += `\n    - 高値: ¥${tweetDayHigh?.toFixed(2) || 'N/A'}`;
                historicalPriceInfo += `\n    - 安値: ¥${tweetDayLow?.toFixed(2) || 'N/A'}`;
                if (dayChange !== null) {
                  historicalPriceInfo += `\n    - 前日比: ${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}%`;
                }

                // 過去の時間参照がある場合、その時点の株価も取得
                if (timeReferences.length > 0) {
                  historicalPriceInfo += '\n\n  ツイートで言及された過去時点の株価:';

                  for (const timeRef of timeReferences) {
                    const refTimestamp = tweetTimestamp - (timeRef.daysAgo * 24 * 60 * 60);

                    // その時点に最も近い取引日を見つける
                    let refClosestIndex = 0;
                    let refMinDiff = Math.abs(timestamps[0] - refTimestamp);

                    for (let i = 1; i < timestamps.length; i++) {
                      const diff = Math.abs(timestamps[i] - refTimestamp);
                      if (diff < refMinDiff) {
                        refMinDiff = diff;
                        refClosestIndex = i;
                      }
                    }

                    const refPrice = histQuote.close[refClosestIndex];
                    const refDate = new Date(timestamps[refClosestIndex] * 1000);
                    const refOpen = histQuote.open[refClosestIndex];
                    const refHigh = histQuote.high[refClosestIndex];
                    const refLow = histQuote.low[refClosestIndex];

                    // その時点から投稿日までの変化
                    const changeFromRef = ((tweetDayPrice - refPrice) / refPrice) * 100;

                    historicalPriceInfo += `\n  【${timeRef.label}】（${refDate.toLocaleDateString('ja-JP')}）:`;
                    historicalPriceInfo += `\n    - 終値: ¥${refPrice?.toFixed(2) || 'N/A'}`;
                    historicalPriceInfo += `\n    - 始値: ¥${refOpen?.toFixed(2) || 'N/A'}`;
                    historicalPriceInfo += `\n    - 高値: ¥${refHigh?.toFixed(2) || 'N/A'}`;
                    historicalPriceInfo += `\n    - 安値: ¥${refLow?.toFixed(2) || 'N/A'}`;
                    historicalPriceInfo += `\n    - ${timeRef.label}から投稿日までの変化: ${changeFromRef >= 0 ? '+' : ''}${changeFromRef.toFixed(2)}%`;
                  }

                  addSystemLog(`${ticker}の過去参照時点（${timeReferences.map(r => r.label).join(', ')}）の株価を取得`, 'success');
                }

                addSystemLog(`${ticker}の投稿時点の株価を取得: ¥${tweetDayPrice}`, 'success');
              }
            } catch (histError) {
              console.error(`Failed to fetch historical data for ${ticker}:`, histError);
              addSystemLog(`${ticker}の履歴データ取得失敗`, 'warning');
            }

            stockInfoArray.push({
              code: ticker,
              name: japaneseName || meta.longName || meta.shortName || ticker,
              price: currentPrice,
              change: change.toFixed(2) + '%',
              exchange: 'Tokyo Stock Exchange',
              sector: sector,
              industry: industry,
              historicalInfo: historicalPriceInfo
            });
          }
        } catch (error) {
          console.error(`Failed to fetch stock info for ${ticker}:`, error);
        }
      }

      if (stockInfoArray.length > 0) {
        stockInfoText = '\n\n【取得した銘柄情報（Yahoo Finance）】\n';
        stockInfoText += `\n投稿日時: ${tweetDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n`;

        stockInfoArray.forEach(stock => {
          let stockLine = `\n- ${stock.code}: ${stock.name}`;
          if (stock.sector) stockLine += ` [業種: ${stock.sector}]`;
          if (stock.industry) stockLine += ` [産業: ${stock.industry}]`;
          stockLine += `\n  現在値（最新）: ¥${stock.price} (${stock.change})`;
          if (stock.historicalInfo) {
            stockLine += stock.historicalInfo;
          }
          stockInfoText += stockLine + '\n';
        });
        stockInfoText += '\n※上記は実際のAPI取得データです。';
        stockInfoText += '\n※「投稿時点の株価」と「現在値」を比較して、ツイート内容の正確性を判定してください。';
        stockInfoText += '\n※投稿時点で言及されていた株価が実際の株価と一致するか、必ず確認してください。';
      }
    }

    if (provider === 'gemini') {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);

      // gemini-2.5-flash: Stable model supporting text, images, video, and audio
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      let promptPrefix = '';
      const totalMedia = capturedImages.length + capturedVideos.length;
      if (totalMedia > 0) {
        promptPrefix = `【画像/動画コンテンツあり】${mediaDescription}

このツイートには画像・動画が含まれています。添付された画像・動画の内容を詳しく分析し、以下の点を必ず含めてください：
- 画像・動画に表示されている情報（株価チャート、グラフ、数値、テキストなど）
- 視覚的データが示す内容の正確性
- 画像・動画から読み取れる追加情報
- **動画の場合**: 複数フレーム（開始、途中、終了）を含むため、時系列での変化も分析してください
- 動画内で株価の推移、チャートの動き、説明テキストの変化などがあれば必ず言及してください

視覚的な情報を最優先で分析に含めてください。

`;
      }

      const prompt = `${promptPrefix}あなたは金融・株式市場の専門家です。以下のツイートで言及されている銘柄情報の正確性を分析してください。

**重要**: 投稿の誘導性や詐欺性は評価しないでください。純粋に銘柄に関する情報の正確性のみを評価してください。

ツイート内容:
"${tweet.text}"

投稿者: @${tweet.author.username} (${tweet.author.name})
投稿日時: ${tweet.created_at}
エンゲージメント: いいね ${tweet.public_metrics?.like_count || 0}, リツイート ${tweet.public_metrics?.retweet_count || 0}
キャッシュタグ: ${tweet.cashtags?.length > 0 ? tweet.cashtags.join(', ') : 'なし'}${timeReferences.length > 0 ? `\n\n【検出された時間参照】: ${timeReferences.map(r => r.label).join(', ')}` : ''}${stockInfoText}

以下の観点から分析してください:

1. **情報の正確性** (信頼度: 高/中/低)
   - 銘柄コードと会社名は正しいか
   - **重要**: ツイート内で言及されている株価と、実際の株価を照合${timeReferences.length > 0 ? `
     - **過去時点参照がある場合**: 上記「ツイートで言及された過去時点の株価」と、ツイート内の数値を比較
     - 例: 「3週間前 5,661円→7,178円」の場合:
       * 3週間前の実際の終値が5,661円だったか確認
       * 投稿時点の実際の終値が7,178円だったか確認
       * 両方の数値が実際のデータと一致するか、または許容範囲内（±5%程度）かを評価` : `
     - 例: ツイートで「株価155円」と言っている場合、投稿日の実際の株価が155円だったか確認`}
   - 株価の値動き（「急騰」「下落」など）の記述が実際のデータと一致するか${timeReferences.length > 0 ? `
     - **過去時点参照がある場合**: 言及された期間の実際の変化率と、ツイートで主張された変化を比較` : `
     - 例: 「急騰中」と言っている場合、投稿日の前日比が実際にプラスだったか確認`}
   - 業績や事業内容の記述は正確か
   - **評価しないこと**: 投稿の誘導性、煽り文句、リンクへの誘導など
   - **時系列の確認**: 投稿日時と現在の時間差を考慮し、情報の鮮度を評価

2. **関連銘柄の抽出と企業特定**
   - ツイート内で言及されている株式銘柄（ティッカーシンボル）
   - **重要**: 上記の「取得した銘柄情報」がある場合、必ずそこに記載された正式な会社名を使用してください
   - **銘柄コードが明示されていない場合**: ツイートの内容から、どの企業のことを指しているのか推測してください
     - 事業内容、製品、業績などのヒントから企業を特定
     - 複数の候補がある場合は、すべてリストアップ
     - 例: 「次世代自動車用電池の主力」→ 電池メーカー各社の候補を挙げる
   - 不確実な場合でも、可能性のある企業名と銘柄コードを候補として列挙してください

3. **投資情報の評価**
   - ツイートで述べられている銘柄の見通しは妥当か
   - 株価予想や目標価格は現実的か
   - センチメント: ポジティブ/ネガティブ/中立

4. **推奨アクション**
   - この銘柄情報に基づいて、さらに調査すべき点

5. **要約メモ**
   - 銘柄メモに追加すべき簡潔な要約（1-2文）

JSON形式で回答してください:
{
  "credibility": "高" | "中" | "低",
  "reasoning": "判定理由",
  "tickers": ["AAPL", "TSLA", ...],
  "sentiment": "ポジティブ" | "ネガティブ" | "中立",
  "impact": "短期" | "中期" | "長期",
  "action": "推奨アクション",
  "memo": "銘柄メモ用の要約"
}`;

      // Build content array with prompt, images, and videos
      const contentParts: any[] = [{ text: prompt }];

      // Add images if present
      if (capturedImages.length > 0) {
        for (const imageBase64 of capturedImages) {
          contentParts.push({
            inlineData: {
              data: imageBase64,
              mimeType: 'image/png'
            }
          });
        }
      }

      // Add videos if present (Gemini supports video)
      if (capturedVideos.length > 0) {
        for (const videoBase64 of capturedVideos) {
          contentParts.push({
            inlineData: {
              data: videoBase64,
              mimeType: 'video/webm'
            }
          });
        }
      }

      const result = await model.generateContent(contentParts);
      const response = await result.response;
      let analysisText = response.text();

      // Extract JSON from markdown code blocks if present
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        analysisText = jsonMatch[1];
      }

      const analysis = JSON.parse(analysisText);

      addSystemLog('ツイート真偽判定完了', 'success');

      res.json(
        ApiResponse.success({
          analysis,
          stockInfo: stockInfoArray, // 銘柄詳細情報を追加
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (provider === 'anthropic' || provider === 'claude') {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey });

      let promptPrefix = '';
      if (capturedImages.length > 0) {
        promptPrefix = `【画像/動画コンテンツあり】${mediaDescription}

このツイートには画像・動画が含まれています。添付された画像・動画の内容を詳しく分析し、以下の点を必ず含めてください：
- 画像・動画に表示されている情報（株価チャート、グラフ、数値、テキストなど）
- 視覚的データが示す内容の正確性
- 画像・動画から読み取れる追加情報
- **動画の場合**: 複数フレーム（開始、途中、終了）を含むため、時系列での変化も分析してください
- 動画内で株価の推移、チャートの動き、説明テキストの変化などがあれば必ず言及してください

視覚的な情報を最優先で分析に含めてください。

`;
      }

      const prompt = `${promptPrefix}あなたは金融・株式市場の専門家です。以下のツイートで言及されている銘柄情報の正確性を分析してください。

**重要**: 投稿の誘導性や詐欺性は評価しないでください。純粋に銘柄に関する情報の正確性のみを評価してください。

ツイート内容:
"${tweet.text}"

投稿者: @${tweet.author.username} (${tweet.author.name})
投稿日時: ${tweet.created_at}
エンゲージメント: いいね ${tweet.public_metrics?.like_count || 0}, リツイート ${tweet.public_metrics?.retweet_count || 0}
キャッシュタグ: ${tweet.cashtags?.length > 0 ? tweet.cashtags.join(', ') : 'なし'}${timeReferences.length > 0 ? `\n\n【検出された時間参照】: ${timeReferences.map(r => r.label).join(', ')}` : ''}${stockInfoText}

以下の観点から分析してください:

1. **情報の正確性** (信頼度: 高/中/低)
   - 銘柄コードと会社名は正しいか
   - **重要**: ツイート内で言及されている株価と、実際の株価を照合${timeReferences.length > 0 ? `
     - **過去時点参照がある場合**: 上記「ツイートで言及された過去時点の株価」と、ツイート内の数値を比較
     - 例: 「3週間前 5,661円→7,178円」の場合:
       * 3週間前の実際の終値が5,661円だったか確認
       * 投稿時点の実際の終値が7,178円だったか確認
       * 両方の数値が実際のデータと一致するか、または許容範囲内（±5%程度）かを評価` : `
     - 例: ツイートで「株価155円」と言っている場合、投稿日の実際の株価が155円だったか確認`}
   - 株価の値動き（「急騰」「下落」など）の記述が実際のデータと一致するか${timeReferences.length > 0 ? `
     - **過去時点参照がある場合**: 言及された期間の実際の変化率と、ツイートで主張された変化を比較` : `
     - 例: 「急騰中」と言っている場合、投稿日の前日比が実際にプラスだったか確認`}
   - 業績や事業内容の記述は正確か
   - **評価しないこと**: 投稿の誘導性、煽り文句、リンクへの誘導など
   - **時系列の確認**: 投稿日時と現在の時間差を考慮し、情報の鮮度を評価

2. **関連銘柄の抽出と企業特定**
   - ツイート内で言及されている株式銘柄（ティッカーシンボル）
   - **重要**: 上記の「取得した銘柄情報」がある場合、必ずそこに記載された正式な会社名を使用してください
   - **銘柄コードが明示されていない場合**: ツイートの内容から、どの企業のことを指しているのか推測してください
     - 事業内容、製品、業績などのヒントから企業を特定
     - 複数の候補がある場合は、すべてリストアップ
     - 例: 「次世代自動車用電池の主力」→ 電池メーカー各社の候補を挙げる
   - 不確実な場合でも、可能性のある企業名と銘柄コードを候補として列挙してください

3. **投資情報の評価**
   - ツイートで述べられている銘柄の見通しは妥当か
   - 株価予想や目標価格は現実的か
   - センチメント: ポジティブ/ネガティブ/中立

4. **推奨アクション**
   - この銘柄情報に基づいて、さらに調査すべき点

5. **要約メモ**
   - 銘柄メモに追加すべき簡潔な要約（1-2文）

JSON形式で回答してください:
{
  "credibility": "高" | "中" | "低",
  "reasoning": "判定理由",
  "tickers": ["7603", "1234", ...],
  "sentiment": "ポジティブ" | "ネガティブ" | "中立",
  "impact": "短期" | "中期" | "長期",
  "action": "推奨アクション",
  "memo": "銘柄メモ用の要約"
}`;

      // Build content array with prompt and images
      // Note: Claude doesn't support video directly, so only images are sent
      const messageContent: any[] = [{ type: 'text', text: prompt }];

      // Add images if present
      if (capturedImages.length > 0) {
        for (const imageBase64 of capturedImages) {
          messageContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64
            }
          });
        }
      }

      // Note: Videos are not supported by Claude API
      // If you need video analysis with Claude, consider extracting frames first

      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [{ role: 'user', content: messageContent }],
      });

      let analysisText = message.content[0].text;

      // Extract JSON from markdown code blocks if present
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        analysisText = jsonMatch[1];
      }

      const analysis = JSON.parse(analysisText);

      addSystemLog('ツイート真偽判定完了（Claude）', 'success');

      res.json(
        ApiResponse.success({
          analysis,
          stockInfo: stockInfoArray,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    throw new BadRequestError(
      'Unsupported provider',
      'Supported providers: gemini, anthropic, claude'
    );
}));

// Get tweet by URL using oEmbed API (No authentication required)
xAuthRouter.post('/tweet-oembed', asyncHandler(async (req, res) => {
  const { tweetUrl } = req.body;

  validateRequired({ tweetUrl }, ['tweetUrl']);

  addSystemLog('oEmbed APIでツイートを取得中', 'info');

    // Twitter oEmbed API - No authentication required
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;

    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error(`oEmbed API error: ${response.statusText}`);
    }

    const data: any = await response.json();

    // Parse HTML to extract tweet content
    const $ = cheerio.load(data.html);
    const tweetText = $('p').text();

    // Extract tweet ID from URL
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    const tweetId = tweetIdMatch ? tweetIdMatch[1] : '';

    // Extract username from author_url
    const usernameMatch = data.author_url?.match(/twitter\.com\/([^/]+)/);
    const username = usernameMatch ? usernameMatch[1] : 'unknown';

    // Parse date if available (from blockquote)
    const dateText = $('blockquote a').last().text();
    let created_at = new Date().toISOString();
    try {
      const parsedDate = new Date(dateText);
      if (!isNaN(parsedDate.getTime())) {
        created_at = parsedDate.toISOString();
      }
    } catch (e) {
      // Use current date as fallback
    }

    // Extract hashtags and cashtags from text
    const hashtags: string[] = [];
    const cashtags: string[] = [];

    const hashtagMatches = tweetText.matchAll(/#(\w+)/g);
    for (const match of hashtagMatches) {
      hashtags.push(match[1]);
    }

    const cashtagMatches = tweetText.matchAll(/\$([A-Z]{1,5})\b/g);
    for (const match of cashtagMatches) {
      cashtags.push(match[1]);
    }

    // Extract media URLs from HTML
    const mediaUrls: string[] = [];
    $('img').each((i, elem) => {
      const src = $(elem).attr('src');
      if (src && (src.includes('pbs.twimg.com') || src.includes('video.twimg.com'))) {
        mediaUrls.push(src);
      }
    });

    const tweet = {
      id: tweetId,
      text: tweetText,
      author: {
        id: username, // Using username as ID since we don't have numeric ID
        username: username,
        name: data.author_name || username,
        profile_image_url: undefined,
      },
      created_at: created_at,
      public_metrics: undefined, // Not available via oEmbed
      cashtags: cashtags,
      hashtags: hashtags,
      mediaUrls: mediaUrls,
    };

    addSystemLog('ツイート取得完了（oEmbed）', 'success');

    res.json(
      ApiResponse.success({
        tweet: tweet,
      })
    );
}));
