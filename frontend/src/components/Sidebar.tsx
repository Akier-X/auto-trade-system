import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../stores/useStore';
import { cn } from '../utils/cn';

interface NavItem {
  icon: string;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: 'dashboard', label: 'ダッシュボード', path: '/dashboard' },
  { icon: 'hub', label: '戦略', path: '/strategy' },
  { icon: 'memory', label: 'メモリバンク', path: '/memory' },
  { icon: 'settings', label: '設定', path: '/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const { portfolio, agentStatus } = useStore();

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111418] flex flex-col shrink-0 overflow-y-auto">
      <nav className="p-4 flex flex-col gap-2 border-b border-slate-800/50">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
              location.pathname === item.path
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:text-white hover:bg-surface-highlight'
            )}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 flex flex-col gap-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
          パフォーマンス
        </h3>

        <div className="p-4 rounded-lg bg-surface-dark border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs">通算損益</span>
            <span className="text-gain text-xs font-bold font-display">
              {portfolio.totalPnLPercentage > 0 ? '+' : ''}
              {portfolio.totalPnLPercentage}%
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight font-display">
            {portfolio.totalPnL > 0 ? '+' : ''}$
            {portfolio.totalPnL.toLocaleString()}
          </div>
          <div className="mt-2 w-full bg-slate-800 h-1 rounded-full overflow-hidden">
            <div
              className="bg-gain h-full"
              style={{ width: `${Math.min(portfolio.deployedPercentage, 100)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-surface-dark border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-xs">運用資産</span>
            <span className="text-primary text-xs font-bold font-display">
              {portfolio.deployedPercentage}%
            </span>
          </div>
          <div className="text-xl font-bold tracking-tight font-display">
            ${(portfolio.totalAssets / 1000000).toFixed(2)}M
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-slate-800">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
          エージェントステータス
        </h3>
        <div className="flex flex-col gap-3">
          {agentStatus.map((agent) => (
            <div key={agent.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-300">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    agent.status === 'active'
                      ? 'bg-gain shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                      : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                  )}
                />
                {agent.name}
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {agent.latency > 0 ? `${agent.latency}ms` : '待機中'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
