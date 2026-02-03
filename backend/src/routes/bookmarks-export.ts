import { Router } from 'express';
import * as XLSX from 'xlsx';
import { google } from 'googleapis';
import { asyncHandler, validateRequired, validateArray } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';

export const bookmarksExportRouter = Router();

// Sync bookmarks to Google Sheets
bookmarksExportRouter.post('/sync-sheets', asyncHandler(async (req, res) => {
  const { bookmarks, savedAnalyses, accessToken, spreadsheetId } = req.body;

  validateRequired({ accessToken }, ['accessToken']);
  validateArray(bookmarks, 'bookmarks');

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    let targetSpreadsheetId = spreadsheetId;

    // Create new spreadsheet if ID not provided
    if (!targetSpreadsheetId) {
      const createResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `ブックマーク - ${new Date().toLocaleDateString('ja-JP')}`,
            locale: 'ja_JP',
            timeZone: 'Asia/Tokyo'
          }
        }
      });
      targetSpreadsheetId = createResponse.data.spreadsheetId!;
    }

    // Prepare batch update requests
    const requests: any[] = [];

    // Clear existing data (except for the default Sheet1)
    try {
      const existingSheets = await sheets.spreadsheets.get({
        spreadsheetId: targetSpreadsheetId
      });

      // Delete all sheets except the first one
      if (existingSheets.data.sheets && existingSheets.data.sheets.length > 0) {
        for (let i = existingSheets.data.sheets.length - 1; i > 0; i--) {
          requests.push({
            deleteSheet: {
              sheetId: existingSheets.data.sheets[i].properties?.sheetId
            }
          });
        }
      }
    } catch (error) {
      console.log('No existing sheets to delete');
    }

    // Execute delete requests
    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetSpreadsheetId,
        requestBody: { requests }
      });
    }

    // Create overview sheet data
    const overviewData = [
      ['ブックマーク一覧', '', '', '', '', '', ''],
      ['最終更新:', new Date().toLocaleString('ja-JP'), '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['銘柄コード', '会社名', '取引所', '保有状態', '追加日時', '分析回数', 'メモ'],
      ...bookmarks.map((stock: any) => {
        const analyses = savedAnalyses?.filter((a: any) =>
          a.analysis.tickers.includes(stock.ticker)
        ) || [];

        return [
          stock.ticker,
          stock.name,
          stock.exchange,
          stock.isHolding ? '保有中' : 'ウォッチリスト',
          new Date(stock.addedAt).toLocaleString('ja-JP'),
          analyses.length,
          stock.memo || ''
        ];
      })
    ];

    // Update the first sheet (overview)
    await sheets.spreadsheets.values.update({
      spreadsheetId: targetSpreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: overviewData
      }
    });

    // Rename first sheet
    const sheetsList = await sheets.spreadsheets.get({
      spreadsheetId: targetSpreadsheetId
    });
    const firstSheetId = sheetsList.data.sheets?.[0].properties?.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: targetSpreadsheetId,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: {
              sheetId: firstSheetId,
              title: '一覧'
            },
            fields: 'title'
          }
        }]
      }
    });

    // Create sheets for each stock with analyses
    const sheetRequests: any[] = [];
    const valueUpdates: any[] = [];

    bookmarks.forEach((stock: any, index: number) => {
      const stockAnalyses = savedAnalyses?.filter((a: any) =>
        a.analysis.tickers.includes(stock.ticker)
      ) || [];

      if (stockAnalyses.length > 0) {
        // Sort by date (newest first)
        stockAnalyses.sort((a: any, b: any) =>
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        );

        const sheetTitle = `${stock.ticker}`.replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 100);

        // Create sheet
        sheetRequests.push({
          addSheet: {
            properties: {
              title: sheetTitle,
              gridProperties: {
                frozenRowCount: 2
              }
            }
          }
        });

        // Prepare data
        const analysesData = [
          [`${stock.ticker} - ${stock.name}`, '', '', '', '', '', ''],
          ['分析日時', '信頼度', 'センチメント', '影響期間', '推奨アクション', 'ツイート投稿者', 'メモ'],
          ...stockAnalyses.map((analysis: any) => [
            new Date(analysis.savedAt).toLocaleString('ja-JP'),
            analysis.analysis.credibility,
            analysis.analysis.sentiment,
            analysis.analysis.impact,
            analysis.analysis.action,
            analysis.tweetAuthor,
            analysis.analysis.memo
          ])
        ];

        // Add comparison if multiple analyses
        if (stockAnalyses.length > 1) {
          analysesData.push([]);
          analysesData.push(['📊 分析比較', '', '', '', '', '', '']);
          analysesData.push(['項目', '最新', '前回', '変化', '', '', '']);

          const latest = stockAnalyses[0].analysis;
          const previous = stockAnalyses[1].analysis;

          analysesData.push([
            '信頼度',
            latest.credibility,
            previous.credibility,
            latest.credibility === previous.credibility ? '変化なし' : `${previous.credibility} → ${latest.credibility}`
          ]);

          analysesData.push([
            'センチメント',
            latest.sentiment,
            previous.sentiment,
            latest.sentiment === previous.sentiment ? '変化なし' : `${previous.sentiment} → ${latest.sentiment}`
          ]);
        }

        // Add memo
        if (stock.memo) {
          analysesData.push([]);
          analysesData.push(['📝 ブックマークメモ', '', '', '', '', '', '']);
          analysesData.push([stock.memo, '', '', '', '', '', '']);
        }

        valueUpdates.push({
          range: `${sheetTitle}!A1`,
          values: analysesData
        });
      }
    });

    // Create sheets in batch
    if (sheetRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: targetSpreadsheetId,
        requestBody: { requests: sheetRequests }
      });

      // Update values in batch
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: targetSpreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: valueUpdates
        }
      });
    }

    res.json(
      ApiResponse.success({
        spreadsheetId: targetSpreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`
      })
    );
}));

// Export bookmarks to Excel
bookmarksExportRouter.post('/excel', asyncHandler(async (req, res) => {
  const { bookmarks, savedAnalyses } = req.body;

  validateArray(bookmarks, 'bookmarks');

    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Create overview sheet
    const overviewData = [
      ['ブックマーク一覧', '', '', '', '', ''],
      ['銘柄コード', '会社名', '取引所', '保有状態', '追加日時', '分析回数'],
      ...bookmarks.map((stock: any) => {
        // Count analyses for this stock
        const analyses = savedAnalyses?.filter((a: any) =>
          a.analysis.tickers.includes(stock.ticker)
        ) || [];

        return [
          stock.ticker,
          stock.name,
          stock.exchange,
          stock.isHolding ? '保有中' : 'ウォッチリスト',
          new Date(stock.addedAt).toLocaleString('ja-JP'),
          analyses.length
        ];
      })
    ];

    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);

    // Set column widths
    overviewSheet['!cols'] = [
      { wch: 12 },  // 銘柄コード
      { wch: 30 },  // 会社名
      { wch: 15 },  // 取引所
      { wch: 15 },  // 保有状態
      { wch: 20 },  // 追加日時
      { wch: 10 }   // 分析回数
    ];

    XLSX.utils.book_append_sheet(workbook, overviewSheet, '一覧');

    // Create a sheet for each stock with X analysis history
    bookmarks.forEach((stock: any) => {
      // Get all analyses for this ticker
      const stockAnalyses = savedAnalyses?.filter((a: any) =>
        a.analysis.tickers.includes(stock.ticker)
      ) || [];

      if (stockAnalyses.length > 0) {
        // Sort by date (newest first)
        stockAnalyses.sort((a: any, b: any) =>
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
        );

        const analysesData = [
          [`${stock.ticker} - ${stock.name}`, '', '', '', '', '', ''],
          ['分析日時', '信頼度', 'センチメント', '影響期間', '推奨アクション', 'ツイート投稿者', 'メモ'],
          ...stockAnalyses.map((analysis: any) => [
            new Date(analysis.savedAt).toLocaleString('ja-JP'),
            analysis.analysis.credibility,
            analysis.analysis.sentiment,
            analysis.analysis.impact,
            analysis.analysis.action,
            analysis.tweetAuthor,
            analysis.analysis.memo
          ])
        ];

        // Add comparison section
        if (stockAnalyses.length > 1) {
          analysesData.push([]);
          analysesData.push(['分析比較', '', '', '', '', '', '']);
          analysesData.push(['項目', '最新', '前回', '変化', '', '', '']);

          const latest = stockAnalyses[0].analysis;
          const previous = stockAnalyses[1].analysis;

          analysesData.push([
            '信頼度',
            latest.credibility,
            previous.credibility,
            latest.credibility === previous.credibility ? '変化なし' : `${previous.credibility} → ${latest.credibility}`
          ]);

          analysesData.push([
            'センチメント',
            latest.sentiment,
            previous.sentiment,
            latest.sentiment === previous.sentiment ? '変化なし' : `${previous.sentiment} → ${latest.sentiment}`
          ]);
        }

        // Add stock memo
        if (stock.memo) {
          analysesData.push([]);
          analysesData.push(['ブックマークメモ', '', '', '', '', '', '']);
          analysesData.push([stock.memo, '', '', '', '', '', '']);
        }

        const stockSheet = XLSX.utils.aoa_to_sheet(analysesData);

        // Set column widths
        stockSheet['!cols'] = [
          { wch: 20 },  // 分析日時
          { wch: 10 },  // 信頼度
          { wch: 15 },  // センチメント
          { wch: 10 },  // 影響期間
          { wch: 30 },  // 推奨アクション
          { wch: 20 },  // ツイート投稿者
          { wch: 50 }   // メモ
        ];

        // Sanitize sheet name (Excel doesn't allow certain characters)
        const sheetName = `${stock.ticker}`.replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, stockSheet, sheetName);
      } else {
        // No analyses, just create a basic info sheet
        const basicData = [
          [`${stock.ticker} - ${stock.name}`, '', ''],
          ['銘柄コード', stock.ticker, ''],
          ['会社名', stock.name, ''],
          ['取引所', stock.exchange, ''],
          ['保有状態', stock.isHolding ? '保有中' : 'ウォッチリスト', ''],
          ['追加日時', new Date(stock.addedAt).toLocaleString('ja-JP'), ''],
          ['', '', ''],
          ['メモ', '', ''],
          [stock.memo || 'メモなし', '', '']
        ];

        const basicSheet = XLSX.utils.aoa_to_sheet(basicData);
        basicSheet['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 20 }];

        const sheetName = `${stock.ticker}`.replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, basicSheet, sheetName);
      }
    });

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true
    });

    // Send file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `bookmarks_${timestamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
}));
