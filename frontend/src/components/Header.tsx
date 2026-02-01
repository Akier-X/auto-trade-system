import { useStore } from '../stores/useStore';

export function Header() {
  const isConnected = useStore((state) => state.isConnected);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111418] flex items-center justify-between px-6 shrink-0 z-20">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold font-display">
          SI
        </div>
        <h1 className="text-lg font-bold tracking-tight">
          銘柄インテリジェンス{' '}
          <span className="text-slate-400 font-normal mx-2">//</span>{' '}
          マルチエージェント・コンセンサス
        </h1>
      </div>

      <div className="flex items-center gap-4 text-sm font-medium text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 font-display">
          <span className="material-symbols-outlined text-base">schedule</span>
          <span>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>市場オープン</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>接続切断</span>
          </div>
        )}

        <button className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
          <span className="material-symbols-outlined text-xl">notifications</span>
        </button>

        <div
          className="w-8 h-8 rounded-full bg-center bg-cover border border-slate-700"
          style={{
            backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuC6ROy3dLFgmiky36cEkDBzQWNdYhItdEAOOQW3jNK5Fd7rYk9etuqSPRWEKphEvHOqFQxEkrKIeeqQs7ib3Fe1o8Kdn3s74NBFyOIrd2HVg6h6kgULFSkzgcEdF3WiontrICPW8WZyu96DkxoefDl9lceYDGwkUyJPVJ7LehfHeUAjfg8VgB_Uykty7YEUZL1O9hAwdCnEchJea3ah2e6sPz_rDXWn9W9nqxOM7FNqlpwVRMhbHb5j1XD99ogMWPAv-xicqPBS4Uo')`,
          }}
        />
      </div>
    </header>
  );
}
