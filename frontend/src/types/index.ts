// Type definitions for the trading dashboard

export type SignalType = 'BUY' | 'SELL' | 'WATCH';
export type AgentName = 'GPT-4' | 'Gemini' | 'Claude';
export type Decision = 'BUY' | 'SELL' | 'NEUTRAL';
export type AgentStatusType = 'active' | 'idle' | 'waiting';
export type LogType = 'info' | 'success' | 'warning' | 'error';
export type TagType = 'normal' | 'warning';

export interface AgentDecision {
  agent: AgentName;
  decision: Decision;
  confidence: number;
}

export interface Signal {
  id: string;
  ticker: string;
  companyName: string;
  logo: string;
  exchange: string;
  type: SignalType;
  consensusScore: number;
  kellySize: number;
  kellyAmount: number;
  timestamp: Date;
  agents: AgentDecision[];
  reasoning?: string;
  factors?: string;
}

export interface PortfolioMetrics {
  totalPnL: number;
  totalPnLPercentage: number;
  totalAssets: number;
  deployedPercentage: number;
}

export interface AgentStatus {
  name: string;
  status: AgentStatusType;
  latency: number;
}

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: LogType;
  highlight?: boolean;
}

export interface MemoryTag {
  id: string;
  label: string;
  type: TagType;
}

export interface ConsensusData {
  agents: Array<{
    name: string;
    score: number;
  }>;
}
