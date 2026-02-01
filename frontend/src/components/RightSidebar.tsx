import { useStore } from '../stores/useStore';

export function RightSidebar() {
  const { memoryTags, logs, isConnected } = useStore();

  return (
    <aside className="w-[380px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111418] flex flex-col shrink-0 overflow-y-auto">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white tracking-wide">コンセンサス強度</h3>
        </div>
        <div className="relative h-48 w-full bg-surface-dark rounded-xl border border-slate-800 flex items-end justify-between px-6 pb-4 pt-8 overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          <div className="relative w-12 flex flex-col items-center gap-2 group cursor-pointer">
            <div className="text-[10px] text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity mb-1 absolute -top-6">88%</div>
            <div className="w-full bg-gradient-to-t from-primary/20 to-primary rounded-t-md h-32 transition-all hover:brightness-110" />
            <span className="text-[10px] font-bold text-slate-400">GPT-4</span>
          </div>
          <div className="relative w-12 flex flex-col items-center gap-2 group cursor-pointer">
            <div className="text-[10px] text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity mb-1 absolute -top-6">92%</div>
            <div className="w-full bg-gradient-to-t from-primary/20 to-primary rounded-t-md h-36 transition-all hover:brightness-110" />
            <span className="text-[10px] font-bold text-slate-400">Gemini</span>
          </div>
          <div className="relative w-12 flex flex-col items-center gap-2 group cursor-pointer">
            <div className="text-[10px] text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity mb-1 absolute -top-6">64%</div>
            <div className="w-full bg-gradient-to-t from-slate-700 to-slate-500 rounded-t-md h-20 transition-all hover:brightness-110" />
            <span className="text-[10px] font-bold text-slate-400">Claude</span>
          </div>
        </div>
      </div>

      <div className="p-6 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-lg">psychology</span>
          アクティブ・メモリ
        </h3>
        <div className="flex flex-wrap gap-2">
          {memoryTags.map((tag) => (
            <span
              key={tag.id}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-default ${
                tag.type === 'warning'
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                  : 'bg-surface-highlight border border-slate-700 text-slate-300 hover:text-white hover:border-primary/50 transition-colors'
              }`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 bg-black min-h-[200px] flex flex-col font-mono text-xs overflow-hidden">
        <h3 className="text-slate-500 font-bold mb-3 uppercase tracking-wider text-[10px]">システムログ出力</h3>
        <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2 text-slate-400">
          <p className="flex gap-2"><span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span><span>システム起動完了...</span></p>
          <p className="flex gap-2"><span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span><span><span className="text-primary">GPT-4</span> 接続確立</span></p>
          <p className="flex gap-2"><span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span><span><span className="text-primary">Gemini</span> 接続確立</span></p>
          <p className="flex gap-2 border-l-2 border-primary pl-2 my-1"><span className="text-primary">準備完了:</span> マーケットフィード待機中</p>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-900 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-slate-500">{isConnected ? 'ライブ接続確立済み' : '接続切断'}</span>
        </div>
      </div>
    </aside>
  );
}
