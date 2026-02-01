import { Signal } from '../types';
import { cn } from '../utils/cn';

interface StockCardProps {
  signal: Signal;
}

export function StockCard({ signal }: StockCardProps) {
  const typeColors = {
    BUY: { bg: 'bg-gain', border: 'border-gain', text: 'text-gain' },
    SELL: { bg: 'bg-loss', border: 'border-loss', text: 'text-loss' },
    WATCH: { bg: 'bg-slate-700', border: 'border-slate-600', text: 'text-slate-300' },
  };

  const colors = typeColors[signal.type];

  return (
    <div
      className={cn(
        'group relative bg-surface-dark border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-all duration-300 shadow-sm',
        signal.type === 'BUY' && 'hover:border-gain/50 hover:shadow-lg hover:shadow-gain/5',
        signal.type === 'SELL' && 'hover:border-loss/50 hover:shadow-lg hover:shadow-loss/5'
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-white p-1 flex items-center justify-center overflow-hidden">
            <img src={signal.logo} alt={signal.ticker} className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white font-display">{signal.ticker}</h3>
              <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide', `${colors.bg}/10 ${colors.text} ${colors.border}/20 border`)}>
                {signal.type === 'BUY' ? '強い買い' : signal.type === 'SELL' ? '売りシグナル' : 'ウォッチリスト'}
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5 font-mono">{signal.companyName} • {signal.exchange}</p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-1 rounded-full flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">timer</span>
          {Math.floor((Date.now() - signal.timestamp.getTime()) / 1000)}秒前
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-surface-highlight/50 rounded-lg p-3">
          <p className="text-xs text-slate-400 mb-1">コンセンサス・スコア</p>
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold text-white font-display">{signal.consensusScore}%</div>
            <div className="h-1.5 flex-1 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={cn('h-full', signal.type === 'BUY' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-red-600 to-red-400')}
                style={{ width: `${signal.consensusScore}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
            {signal.agents.map((agent) => (
              <span key={agent.agent} className={cn(agent.decision === 'BUY' ? 'text-gain' : agent.decision === 'SELL' ? 'text-loss' : 'text-slate-400')}>
                {agent.agent}: {agent.decision === 'BUY' ? '買い' : agent.decision === 'SELL' ? '売り' : '中立'}
              </span>
            ))}
          </div>
        </div>

        <div className={cn('rounded-lg p-3 border', `bg-surface-highlight/50 ${colors.border}/20 ${colors.bg}/5`)}>
          <p className={cn('text-xs mb-1 font-bold flex items-center gap-1', `${colors.text}/80`)}>
            <span className="material-symbols-outlined text-[14px]">calculate</span>
            ケリー基準
          </p>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-white font-display">{signal.kellySize}%</div>
            <div className="text-xs text-slate-400 font-mono">(${signal.kellyAmount.toLocaleString()})</div>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">信頼度加重サイズ</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {signal.type !== 'WATCH' && (
          <button className={cn('flex-1 font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm', signal.type === 'BUY' ? 'bg-gain hover:bg-emerald-400 text-black' : 'bg-loss hover:bg-red-400 text-white')}>
            <span>{signal.type === 'BUY' ? '買い注文を実行' : '売り注文を実行'}</span>
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </button>
        )}
        {signal.type === 'WATCH' && (
          <button className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 rounded-lg transition-colors text-sm">
            注目リストに追加
          </button>
        )}
      </div>
    </div>
  );
}
