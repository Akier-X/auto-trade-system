import { Router } from 'express';

export const systemRouter = Router();

interface SystemLog {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  highlight?: boolean;
}

let systemLogs: SystemLog[] = [];
const MAX_LOGS = 100;

// Add a log entry
export function addSystemLog(message: string, type: SystemLog['type'], highlight?: boolean) {
  const log: SystemLog = {
    timestamp: new Date(),
    message,
    type,
    highlight,
  };

  systemLogs.push(log);

  // Keep only last MAX_LOGS entries
  if (systemLogs.length > MAX_LOGS) {
    systemLogs = systemLogs.slice(-MAX_LOGS);
  }

  return log;
}

// Get recent logs
systemRouter.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const recentLogs = systemLogs.slice(-limit);
  res.json({ logs: recentLogs });
});

// Clear logs
systemRouter.delete('/logs', (req, res) => {
  systemLogs = [];
  res.json({ success: true, message: 'Logs cleared' });
});

// System status
systemRouter.get('/status', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// Initialize system with startup logs
addSystemLog('バックエンドサーバー起動', 'success');
addSystemLog('APIエンドポイント初期化完了', 'info');
addSystemLog('システム監視開始', 'info', true);

// Periodic system check (every 5 minutes)
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

  if (memoryUsedMB > 500) {
    addSystemLog(`メモリ使用量: ${memoryUsedMB}MB (高負荷)`, 'warning');
  }
}, 5 * 60 * 1000);
