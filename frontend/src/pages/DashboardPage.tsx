import { useStore } from '../stores/useStore';
import { StockCard } from '../components/StockCard';

export function DashboardPage() {
  const signals = useStore((state) => state.signals);

  // Mock data for demo
  const mockSignals = signals.length > 0 ? signals : [
    {
      id: '1',
      ticker: 'NVDA',
      companyName: 'NVIDIA Corp',
      logo: 'https://logo.clearbit.com/nvidia.com',
      exchange: 'NASDAQ',
      type: 'BUY' as const,
      consensusScore: 92,
      kellySize: 5.5,
      kellyAmount: 68200,
      timestamp: new Date(Date.now() - 12000),
      agents: [
        { agent: 'GPT-4' as const, decision: 'BUY' as const, confidence: 0.9 },
        { agent: 'Gemini' as const, decision: 'BUY' as const, confidence: 0.92 },
        { agent: 'Claude' as const, decision: 'NEUTRAL' as const, confidence: 0.5 },
      ],
    },
    {
      id: '2',
      ticker: 'TSLA',
      companyName: 'Tesla Inc',
      logo: 'https://logo.clearbit.com/tesla.com',
      exchange: 'NASDAQ',
      type: 'SELL' as const,
      consensusScore: 78,
      kellySize: 2.1,
      kellyAmount: 26050,
      timestamp: new Date(Date.now() - 45000),
      agents: [
        { agent: 'GPT-4' as const, decision: 'SELL' as const, confidence: 0.8 },
        { agent: 'Gemini' as const, decision: 'SELL' as const, confidence: 0.78 },
        { agent: 'Claude' as const, decision: 'NEUTRAL' as const, confidence: 0.5 },
      ],
    },
  ];

  return (
    <main className="flex-1 min-w-[400px] border-r border-slate-200 dark:border-slate-800 bg-background-light dark:bg-[#0c1219] flex flex-col relative overflow-hidden">
      <div className="p-6 pb-2 sticky top-0 bg-background-light/95 dark:bg-[#0c1219]/95 backdrop-blur z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">ライブ市場フィード</h2>
            <p className="text-slate-400 text-sm mt-1">リアルタイム マルチLLMシグナル生成 & 執行</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs font-bold uppercase hover:bg-surface-highlight transition-colors">
              <span className="material-symbols-outlined text-base">tune</span>
              フィルター
            </button>
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-highlight text-white text-xs font-bold uppercase hover:bg-slate-700 transition-colors">
              <span className="material-symbols-outlined text-base">pause</span>
              一時停止
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
        {mockSignals.map((signal) => (
          <StockCard key={signal.id} signal={signal} />
        ))}
      </div>
    </main>
  );
}
