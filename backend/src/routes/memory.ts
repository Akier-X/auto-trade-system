import { Router } from 'express';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError, NotFoundError } from '../utils/api-response';
import { query } from '../utils/db';
import { addSystemLog } from './system';

export const memoryRouter = Router();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

memoryRouter.post('/search', asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const { query: queryTextRaw, limit, threshold, tags } = req.body || {};

  const queryText = typeof queryTextRaw === 'string' ? queryTextRaw.trim() : '';
  const likeQuery = `%${queryText}%`;
  const limitValue = clamp(Number(limit || 10), 1, 100);
  const thresholdValue = Number.isFinite(Number(threshold)) ? Number(threshold) : 0;
  const tagList = Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0) : [];

  const sql = `
    SELECT id, ticker_code, source_type, original_text, extracted_keywords, created_at, metadata
    FROM intelligence_memory
    WHERE
      ($1 = '' OR original_text ILIKE $2 OR EXISTS (
        SELECT 1 FROM unnest(COALESCE(extracted_keywords, '{}')) kw WHERE kw ILIKE $2
      ))
      AND (array_length($3::text[], 1) IS NULL OR COALESCE(extracted_keywords, '{}') && $3::text[])
    ORDER BY created_at DESC
    LIMIT $4
  `;

  const result = await query(sql, [queryText, likeQuery, tagList, limitValue]);

  const queryLower = queryText.toLowerCase();
  const tagSet = new Set(tagList.map((tag) => tag.toLowerCase()));

  const results = result.rows.map((row) => {
    const content = row.original_text || '';
    const keywords = Array.isArray(row.extracted_keywords) ? row.extracted_keywords : [];
    const keywordsLower = keywords.map((kw) => kw.toLowerCase());

    let similarity = queryText ? 0.2 : 0.5;

    if (queryText && content.toLowerCase().includes(queryLower)) {
      similarity += 0.5;
    }

    if (queryText && keywordsLower.some((kw) => kw.includes(queryLower))) {
      similarity += 0.2;
    }

    if (tagSet.size > 0 && keywordsLower.some((kw) => tagSet.has(kw))) {
      similarity += 0.2;
    }

    similarity = Math.min(1, similarity);

    return {
      id: String(row.id),
      content,
      metadata: {
        source: row.source_type,
        timestamp: row.created_at,
        tags: keywords,
        ticker: row.ticker_code,
        ...(row.metadata || {}),
      },
      similarity,
    };
  }).filter((item) => item.similarity >= thresholdValue);

  addSystemLog(`Memory search executed (query="${queryText || 'latest'}", results=${results.length})`, 'info');

  res.json(ApiResponse.success({
    results,
    count: results.length,
    queryTime: Date.now() - startedAt,
  }));
}));

memoryRouter.get('/stats', asyncHandler(async (_req, res) => {
  const totalResult = await query('SELECT COUNT(*)::int AS total FROM intelligence_memory');
  const tagResult = await query(`
    SELECT COUNT(DISTINCT tag) AS total_tags
    FROM intelligence_memory, unnest(COALESCE(extracted_keywords, '{}')) AS tag
  `);
  const tradeResult = await query(`
    SELECT COUNT(*)::int AS trade_count
    FROM intelligence_memory
    WHERE source_type IN ('tdnet')
  `);

  const totalMemories = totalResult.rows[0]?.total ?? 0;
  const totalTags = tagResult.rows[0]?.total_tags ?? 0;
  const tradeHistoryCount = tradeResult.rows[0]?.trade_count ?? 0;
  const learningDataCount = Math.max(0, totalMemories - tradeHistoryCount);

  res.json(ApiResponse.success({
    totalMemories,
    totalTags,
    tradeHistoryCount,
    learningDataCount,
  }));
}));

memoryRouter.get('/tags', asyncHandler(async (req, res) => {
  const tagsParam = typeof req.query.tags === 'string' ? req.query.tags : '';
  const tags = tagsParam.split(',').map((tag) => tag.trim()).filter(Boolean);

  if (tags.length === 0) {
    throw new BadRequestError('tags query parameter is required');
  }

  const sql = `
    SELECT id, ticker_code, source_type, original_text, extracted_keywords, created_at, metadata
    FROM intelligence_memory
    WHERE COALESCE(extracted_keywords, '{}') && $1::text[]
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const result = await query(sql, [tags]);

  const results = result.rows.map((row) => ({
    id: String(row.id),
    content: row.original_text || '',
    metadata: {
      source: row.source_type,
      timestamp: row.created_at,
      tags: row.extracted_keywords || [],
      ticker: row.ticker_code,
      ...(row.metadata || {}),
    },
    similarity: 0.8,
  }));

  res.json(ApiResponse.success(results));
}));

memoryRouter.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query(
    `SELECT id, ticker_code, source_type, original_text, extracted_keywords, created_at, metadata
     FROM intelligence_memory
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Memory record not found');
  }

  const row = result.rows[0];
  res.json(ApiResponse.success({
    id: String(row.id),
    content: row.original_text || '',
    metadata: {
      source: row.source_type,
      timestamp: row.created_at,
      tags: row.extracted_keywords || [],
      ticker: row.ticker_code,
      ...(row.metadata || {}),
    },
    similarity: 1,
  }));
}));

memoryRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await query('DELETE FROM intelligence_memory WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Memory record not found');
  }

  res.json(ApiResponse.success({ success: true }, 'Memory record deleted'));
}));

memoryRouter.post('/:id/tags', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tags } = req.body || {};

  validateRequired(req.body, ['tags']);

  if (!Array.isArray(tags) || tags.length === 0) {
    throw new BadRequestError('tags must be a non-empty array');
  }

  const result = await query(
    `
    UPDATE intelligence_memory
    SET extracted_keywords = (
      SELECT ARRAY(
        SELECT DISTINCT tag
        FROM unnest(COALESCE(extracted_keywords, '{}') || $2::text[]) AS tag
        WHERE tag IS NOT NULL AND tag <> ''
      )
    ),
    updated_at = NOW()
    WHERE id = $1
    RETURNING id, extracted_keywords
    `,
    [id, tags]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Memory record not found');
  }

  res.json(ApiResponse.success({
    id: String(result.rows[0].id),
    tags: result.rows[0].extracted_keywords || [],
  }));
}));

memoryRouter.delete('/:id/tags', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tags } = req.body || {};

  validateRequired(req.body, ['tags']);

  if (!Array.isArray(tags) || tags.length === 0) {
    throw new BadRequestError('tags must be a non-empty array');
  }

  const result = await query(
    `
    UPDATE intelligence_memory
    SET extracted_keywords = (
      SELECT ARRAY(
        SELECT DISTINCT tag
        FROM unnest(COALESCE(extracted_keywords, '{}')) AS tag
        WHERE tag IS NOT NULL AND tag <> '' AND tag <> ALL($2::text[])
      )
    ),
    updated_at = NOW()
    WHERE id = $1
    RETURNING id, extracted_keywords
    `,
    [id, tags]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Memory record not found');
  }

  res.json(ApiResponse.success({
    id: String(result.rows[0].id),
    tags: result.rows[0].extracted_keywords || [],
  }));
}));
