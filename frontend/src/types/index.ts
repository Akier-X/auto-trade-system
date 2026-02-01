// Type definitions for the trading dashboard

export interface Signal {
  id: string;
  ticker: string;
  companyName: string;
  logo: string;
  exchange: string;
  type: 'BUY' | 'SELL' | 'WATCH';
  consensusScore: number;
  kellySize: number;
  kellyAmount: number;
  timestamp: Date;
  agents: AgentDecision[];
  reasoning?: string;
  factors?: string;
}

export interface AgentDecision {
  agent: 'GPT-4' | 'Gemini' | 'Claude';
  decision: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
}

export interface PortfolioMetrics {
  totalPnL: number;
  totalPnLPercentage: number;
  totalAssets: number;
  deployedPercentage: number;
}

export interface AgentStatus {
  name: string;
  status: 'active' | 'idle' | 'waiting';
  latency: number;
}

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  highlight?: boolean;
}

export interface MemoryTag {
  id: string;
  label: string;
  type: 'normal' | 'warning';
}

export interface ConsensusData {
  agents: Array<{
    name: string;
    score: number;
  }>;
}
