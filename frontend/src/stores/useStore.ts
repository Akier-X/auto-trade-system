import { create } from 'zustand';
import {Signal, PortfolioMetrics, AgentStatus, LogEntry, MemoryTag} from '../types';

interface AppState {
  // UI State
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Signals
  signals: Signal[];
  addSignal: (signal: Signal) => void;
  setSignals: (signals: Signal[]) => void;

  // Portfolio
  portfolio: PortfolioMetrics;
  setPortfolio: (metrics: PortfolioMetrics) => void;

  // Agents
  agentStatus: AgentStatus[];
  setAgentStatus: (status: AgentStatus[]) => void;

  // Logs
  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;

  // Memory Tags
  memoryTags: MemoryTag[];
  setMemoryTags: (tags: MemoryTag[]) => void;

  // Connection
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  // UI State
  isDarkMode: true,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),

  // Signals
  signals: [],
  addSignal: (signal) => set((state) => ({ signals: [signal, ...state.signals] })),
  setSignals: (signals) => set({ signals }),

  // Portfolio
  portfolio: {
    totalPnL: 12450,
    totalPnLPercentage: 1.2,
    totalAssets: 1240000,
    deployedPercentage: 82,
  },
  setPortfolio: (portfolio) => set({ portfolio }),

  // Agents
  agentStatus: [
    { name: 'GPT-4 Turbo', status: 'active', latency: 24 },
    { name: 'Gemini Pro', status: 'active', latency: 42 },
    { name: 'Claude 3 Opus', status: 'waiting', latency: 0 },
  ],
  setAgentStatus: (agentStatus) => set({ agentStatus }),

  // Logs
  logs: [],
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  clearLogs: () => set({ logs: [] }),

  // Memory Tags
  memoryTags: [
    { id: '1', label: '#高ボラティリティ', type: 'normal' },
    { id: '2', label: '#テック決算シーズン', type: 'normal' },
    { id: '3', label: '#利下げ期待', type: 'normal' },
    { id: '4', label: '#半導体ラリー', type: 'normal' },
    { id: '5', label: '#リスクオフ', type: 'warning' },
  ],
  setMemoryTags: (memoryTags) => set({ memoryTags }),

  // Connection
  isConnected: true,
  setConnected: (isConnected) => set({ isConnected }),
}));
