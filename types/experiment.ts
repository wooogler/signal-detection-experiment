export interface TrialData {
  line1Length: number;
  line1Tilt?: number;
  line1Saturation?: number;
  line2Length: number;
  line2Tilt?: number;
  line2Saturation?: number;
}

export interface ExperimentResult {
  trialIndex: number;
  line1Length: number;
  line1Tilt?: number;
  line1Saturation?: number;
  line2Length: number;
  line2Tilt?: number;
  line2Saturation?: number;
  response: 'same' | 'different';
  responseTime: number;
  timestamp: string;
}

export type ExperimentState = 'setup' | 'calibration' | 'running' | 'practice-completed' | 'series-completed' | 'completed';