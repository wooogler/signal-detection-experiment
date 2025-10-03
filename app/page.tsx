'use client';

import { useState, useRef } from 'react';
import LineSegment from '@/components/LineSegment';
import { TrialData, ExperimentResult, ExperimentState } from '@/types/experiment';

export default function Home() {
  const [experimentState, setExperimentState] = useState<ExperimentState>('setup');
  const [trials, setTrials] = useState<TrialData[]>([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [trialStartTime, setTrialStartTime] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      const lines = csv.split('\n').filter(line => line.trim());
      const header = lines[0];

      const trialData: TrialData[] = lines.slice(1).map(line => {
        const [line1Length, line1Tilt, line2Length, line2Tilt] = line.split(',').map(Number);
        return { line1Length, line1Tilt, line2Length, line2Tilt };
      });

      setTrials(trialData);
    };
    reader.readAsText(file);
  };

  const startExperiment = () => {
    if (trials.length === 0) {
      alert('Please upload a CSV file first');
      return;
    }
    setExperimentState('running');
    setCurrentTrialIndex(0);
    setResults([]);
    setTrialStartTime(Date.now());
  };

  const handleResponse = (response: 'same' | 'different') => {
    const responseTime = Date.now() - trialStartTime;
    const currentTrial = trials[currentTrialIndex];

    const result: ExperimentResult = {
      trialIndex: currentTrialIndex + 1,
      line1Length: currentTrial.line1Length,
      line1Tilt: currentTrial.line1Tilt,
      line2Length: currentTrial.line2Length,
      line2Tilt: currentTrial.line2Tilt,
      response,
      responseTime,
      timestamp: new Date().toISOString()
    };

    const newResults = [...results, result];
    setResults(newResults);

    if (currentTrialIndex < trials.length - 1) {
      setCurrentTrialIndex(currentTrialIndex + 1);
      setTrialStartTime(Date.now());
    } else {
      setExperimentState('completed');
    }
  };

  const downloadResults = () => {
    const csvContent = [
      'trialIndex,line1Length,line1Tilt,line2Length,line2Tilt,response,responseTime,timestamp,groundTruth',
      ...results.map(r => {
        const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
        return `${r.trialIndex},${r.line1Length},${r.line1Tilt},${r.line2Length},${r.line2Tilt},${r.response},${r.responseTime},${r.timestamp},${groundTruth}`;
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'experiment_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTrial = trials[currentTrialIndex];

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Signal Detection Experiment</h1>

        {experimentState === 'setup' && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Setup</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Upload CSV file with trial data:
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            {trials.length > 0 && (
              <div className="mb-4">
                <p className="text-green-600">✓ Loaded {trials.length} trials</p>
              </div>
            )}
            <button
              onClick={startExperiment}
              disabled={trials.length === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Start Experiment
            </button>
          </div>
        )}

        {experimentState === 'running' && currentTrial && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4">
              <p className="text-lg">Trial {currentTrialIndex + 1} of {trials.length}</p>
            </div>

            <div className="mb-6">
              <svg width="800" height="400" className="mx-auto border">
                <LineSegment
                  length={currentTrial.line1Length}
                  tilt={currentTrial.line1Tilt}
                  centerX={200}
                  centerY={200}
                  color="black"
                />
                <LineSegment
                  length={currentTrial.line2Length}
                  tilt={currentTrial.line2Tilt}
                  centerX={600}
                  centerY={200}
                  color="black"
                />
              </svg>
            </div>

            <div className="text-center">
              <p className="text-lg mb-4">Are the two lines the same length?</p>
              <div className="space-x-4">
                <button
                  onClick={() => handleResponse('same')}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 text-lg"
                >
                  Same
                </button>
                <button
                  onClick={() => handleResponse('different')}
                  className="bg-red-600 text-white px-8 py-3 rounded-lg hover:bg-red-700 text-lg"
                >
                  Different
                </button>
              </div>
            </div>
          </div>
        )}

        {experimentState === 'completed' && (
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <h2 className="text-2xl font-semibold mb-4">Experiment Completed!</h2>
            <p className="text-lg mb-6">You completed {results.length} trials.</p>
            <button
              onClick={downloadResults}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 text-lg"
            >
              Download Results (CSV)
            </button>
            <div className="mt-4">
              <button
                onClick={() => {
                  setExperimentState('setup');
                  setCurrentTrialIndex(0);
                  setResults([]);
                }}
                className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700"
              >
                Start New Experiment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
