import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './stores/useStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { DashboardPage } from './pages/DashboardPage';
import { StrategyPage } from './pages/StrategyPage';
import { MemoryPage } from './pages/MemoryPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  const isDarkMode = useStore((state) => state.isDarkMode);

  return (
    <BrowserRouter>
      <div className={isDarkMode ? 'dark' : ''}>
        <div className="h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-white font-body">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/strategy" element={<StrategyPage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
            <RightSidebar />
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
