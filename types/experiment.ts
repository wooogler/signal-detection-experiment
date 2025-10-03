export interface TrialData {
  line1Length: number;
  line1Tilt: number;
  line2Length: number;
  line2Tilt: number;
}

export interface ExperimentResult {
  trialIndex: number;
  line1Length: number;
  line1Tilt: number;
  line2Length: number;
  line2Tilt: number;
  response: 'same' | 'different';
  responseTime: number;
  timestamp: string;
}

export type ExperimentState = 'setup' | 'running' | 'completed';