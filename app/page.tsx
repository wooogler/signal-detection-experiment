'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import useLocalStorageState from 'use-local-storage-state';
import LineSegment from '@/components/LineSegment';
import { TrialData, ExperimentResult, ExperimentState } from '@/types/experiment';

export default function Home() {
  const [experimentState, setExperimentState] = useState<ExperimentState>('setup');
  const [trials, setTrials] = useState<TrialData[]>([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [trialStartTime, setTrialStartTime] = useState<number>(0);
  const [isLinesVisible, setIsLinesVisible] = useState<boolean>(true);
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(false);
  const [practiceTrials, setPracticeTrials] = useState<TrialData[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [pixelsPerInch, setPixelsPerInch] = useLocalStorageState<number>('pixelsPerInch', {
    defaultValue: 96
  });
  const [cardWidthInPixels, setCardWidthInPixels] = useLocalStorageState<number>('cardWidthInPixels', {
    defaultValue: 550
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exposureDuration = 3000;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target?.result as string;
      const lines = csv.split('\n').filter(line => line.trim());
      const header = lines[0].toLowerCase();

      const isTiltMode = header.includes('tilt');
      const isSaturationMode = header.includes('saturation');

      const trialData: TrialData[] = lines.slice(1).map(line => {
        const values = line.split(',').map(Number);
        if (isTiltMode) {
          const [line1Length, line1Tilt, line2Length, line2Tilt] = values;
          return { line1Length, line1Tilt, line2Length, line2Tilt };
        } else if (isSaturationMode) {
          const [line1Length, line1Saturation, line2Length, line2Saturation] = values;
          return { line1Length, line1Saturation, line2Length, line2Saturation };
        }
        return { line1Length: values[0], line2Length: values[2] };
      });

      setTrials(trialData);
    };
    reader.readAsText(file);
  };

  const startPracticeAfterCalibration = () => {
    // Find same and different trials
    const sameTrials = trials.filter(t => t.line1Length === t.line2Length);
    const differentTrials = trials.filter(t => t.line1Length !== t.line2Length);

    // Randomly select 2 from each category without duplication
    const selectedSame: TrialData[] = [];
    if (sameTrials.length >= 2) {
      const shuffled = [...sameTrials].sort(() => Math.random() - 0.5);
      selectedSame.push(...shuffled.slice(0, 2));
    } else {
      selectedSame.push(...sameTrials.slice(0, 2));
    }

    const selectedDifferent: TrialData[] = [];
    if (differentTrials.length >= 2) {
      const shuffled = [...differentTrials].sort(() => Math.random() - 0.5);
      selectedDifferent.push(...shuffled.slice(0, 2));
    } else {
      selectedDifferent.push(...differentTrials.slice(0, 2));
    }

    const practice = [...selectedSame, ...selectedDifferent].sort(() => Math.random() - 0.5);

    setPracticeTrials(practice);
    setExperimentState('running');
    setCurrentTrialIndex(0);
    setResults([]);
    setIsLinesVisible(true);
    setTrialStartTime(Date.now());
  };

  const startExperimentAfterCalibration = () => {
    setExperimentState('running');
    setCurrentTrialIndex(0);
    setResults([]);
    setIsLinesVisible(true);
    setTrialStartTime(Date.now());
  };

  useEffect(() => {
    if (experimentState === 'running' && isLinesVisible) {
      const timer = setTimeout(() => {
        setIsLinesVisible(false);
      }, exposureDuration);
      return () => clearTimeout(timer);
    }
  }, [experimentState, currentTrialIndex, exposureDuration, isLinesVisible]);

  const handleResponse = (response: 'same' | 'different') => {
    const responseTime = Date.now() - trialStartTime;
    const currentTrials = isPracticeMode ? practiceTrials : trials;
    const currentTrial = currentTrials[currentTrialIndex];

    const result: ExperimentResult = {
      trialIndex: currentTrialIndex + 1,
      line1Length: currentTrial.line1Length,
      line1Tilt: currentTrial.line1Tilt,
      line1Saturation: currentTrial.line1Saturation,
      line2Length: currentTrial.line2Length,
      line2Tilt: currentTrial.line2Tilt,
      line2Saturation: currentTrial.line2Saturation,
      response,
      responseTime,
      timestamp: new Date().toISOString()
    };

    const newResults = [...results, result];
    setResults(newResults);

    if (currentTrialIndex < currentTrials.length - 1) {
      setCurrentTrialIndex(currentTrialIndex + 1);
      setIsLinesVisible(true);
      setTrialStartTime(Date.now());
    } else {
      if (isPracticeMode) {
        setExperimentState('practice-completed');
      } else {
        setExperimentState('completed');
      }
    }
  };

  const downloadResults = () => {
    const isTiltMode = results[0]?.line1Tilt !== undefined;
    const isSaturationMode = results[0]?.line1Saturation !== undefined;

    let header: string;
    let rows: string[];

    if (isTiltMode) {
      header = 'Trial,Line 1 Length,Line 1 Tilt,Line 2 Length,Line 2 Tilt,Ground Truth,Your Response,Result,Response Time,Timestamp';
      rows = results.map(r => {
        const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
        const isCorrect = r.response === groundTruth ? 'Correct' : 'Incorrect';
        return `${r.trialIndex},${r.line1Length},${r.line1Tilt},${r.line2Length},${r.line2Tilt},${groundTruth},${r.response},${isCorrect},${r.responseTime},${r.timestamp}`;
      });
    } else if (isSaturationMode) {
      header = 'Trial,Line 1 Length,Line 1 Saturation,Line 2 Length,Line 2 Saturation,Ground Truth,Your Response,Result,Response Time,Timestamp';
      rows = results.map(r => {
        const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
        const isCorrect = r.response === groundTruth ? 'Correct' : 'Incorrect';
        return `${r.trialIndex},${r.line1Length},${r.line1Saturation},${r.line2Length},${r.line2Saturation},${groundTruth},${r.response},${isCorrect},${r.responseTime},${r.timestamp}`;
      });
    } else {
      header = 'Trial,Line 1 Length,Line 2 Length,Ground Truth,Your Response,Result,Response Time,Timestamp';
      rows = results.map(r => {
        const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
        const isCorrect = r.response === groundTruth ? 'Correct' : 'Incorrect';
        return `${r.trialIndex},${r.line1Length},${r.line2Length},${groundTruth},${r.response},${isCorrect},${r.responseTime},${r.timestamp}`;
      });
    }

    const csvContent = [header, ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'experiment_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTrials = isPracticeMode ? practiceTrials : trials;
  const currentTrial = currentTrials[currentTrialIndex];

  const columnHelper = createColumnHelper<ExperimentResult>();

  const columns = useMemo(() => [
    columnHelper.accessor('trialIndex', {
      header: 'Trial',
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('line1Length', {
      header: 'Line 1 Length',
      cell: info => `${info.getValue()}"`,
    }),
    columnHelper.accessor('line2Length', {
      header: 'Line 2 Length',
      cell: info => `${info.getValue()}"`,
    }),
    columnHelper.accessor(row => row.line1Length === row.line2Length ? 'same' : 'different', {
      id: 'groundTruth',
      header: 'Ground Truth',
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('response', {
      header: 'Your Response',
      cell: info => info.getValue(),
    }),
    columnHelper.accessor(row => {
      const groundTruth = row.line1Length === row.line2Length ? 'same' : 'different';
      return row.response === groundTruth;
    }, {
      id: 'isCorrect',
      header: 'Result',
      cell: info => {
        const isCorrect = info.getValue();
        return (
          <span className={isCorrect ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
            {isCorrect ? '✓ Correct' : '✗ Incorrect'}
          </span>
        );
      },
    }),
    columnHelper.accessor('responseTime', {
      header: 'Response Time',
      cell: info => `${info.getValue()}ms`,
    }),
  ], [columnHelper]);

  const table = useReactTable({
    data: results,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">Signal Detection Experiment</h1>

        {experimentState === 'setup' && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-bold mb-4">Setup</h2>

            <div className="mb-6 bg-blue-50 border-2 border-blue-400 rounded p-4">
              <p className="text-lg font-bold text-blue-900 mb-3">
                📋 Experiment Information:
              </p>
              <ul className="list-disc list-inside text-base text-blue-900 space-y-2">
                <li><strong>Practice:</strong> 4 trials (2 same, 2 different)</li>
                <li><strong>Main Experiment:</strong> All trials from uploaded CSV</li>
                <li><strong>Display Time:</strong> Lines shown for 3 seconds, then hidden</li>
                <li>You can respond even after lines disappear</li>
              </ul>
            </div>

            <div className="mb-6">
              <label className="block text-base font-bold mb-2">
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
                <p className="text-green-600 font-bold text-lg">✓ Loaded {trials.length} trials</p>
              </div>
            )}

            {isMounted && (
              <div className="mb-6 border-t pt-6">
                <h3 className="text-xl font-bold mb-3">Screen Calibration</h3>
                <p className="text-base font-bold mb-4">
                  Adjust the slider, then place your credit card at the top-left corner of the box to match:
                </p>

                <div className="mb-6">
                  <label className="block text-base font-bold mb-2">
                    Adjust Size: {cardWidthInPixels} pixels (≈ {(cardWidthInPixels / pixelsPerInch).toFixed(2)} inches)
                  </label>
                <input
                  type="range"
                  min="200"
                  max="600"
                  value={cardWidthInPixels}
                  onChange={(e) => {
                    const width = Number(e.target.value);
                    setCardWidthInPixels(width);
                    // Real-time PPI update
                    const cardWidthInInches = 3.370;
                    setPixelsPerInch(width / cardWidthInInches);
                  }}
                  className="w-full h-3 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="mb-4">
                <div
                  className="bg-blue-100 border-4 border-blue-600 inline-block"
                  style={{
                    width: `${cardWidthInPixels}px`,
                    height: `${cardWidthInPixels * 0.6308}px`, // Credit card aspect ratio: 53.98/85.6 = 0.6308
                  }}
                >
                  <div className="p-2">
                    <p className="text-sm font-bold text-blue-800">Credit Card Size</p>
                    <p className="text-xs text-blue-700 mt-1">85.6mm × 53.98mm</p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-400 rounded p-4 mb-4">
                <p className="text-lg font-bold text-yellow-900">
                  📏 Instructions:
                </p>
                <ul className="list-disc list-inside text-base text-yellow-900 mt-3 space-y-2">
                  <li>Use the slider above to adjust the box size</li>
                  <li>Place your credit card at the top-left corner of the blue box</li>
                  <li>Adjust until both width and height match your card exactly</li>
                </ul>
              </div>
              </div>
            )}

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (trials.length === 0) {
                    alert('Please upload a CSV file first');
                    return;
                  }
                  setIsPracticeMode(true);
                  startPracticeAfterCalibration();
                }}
                disabled={trials.length === 0}
                className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold text-lg"
              >
                Start Practice
              </button>
              {trials.length === 0 && (
                <p className="text-red-600 font-bold text-base">
                  ⬆️ Please upload a CSV file first
                </p>
              )}
            </div>
          </div>
        )}

        {experimentState === 'running' && currentTrial && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4">
              <p className="text-2xl font-bold">
                {isPracticeMode ? 'Practice ' : ''}Trial {currentTrialIndex + 1} of {currentTrials.length}
              </p>
            </div>

            <div className="mb-6 w-full overflow-hidden">
              <svg width="100%" height="500" viewBox="0 0 1200 500" className="border" preserveAspectRatio="xMidYMid meet">
                {isLinesVisible && (
                  <>
                    <LineSegment
                      length={currentTrial.line1Length}
                      tilt={currentTrial.line1Tilt}
                      saturation={currentTrial.line1Saturation}
                      centerX={300}
                      centerY={250}
                      pixelsPerInch={pixelsPerInch}
                    />
                    <LineSegment
                      length={currentTrial.line2Length}
                      tilt={currentTrial.line2Tilt}
                      saturation={currentTrial.line2Saturation}
                      centerX={900}
                      centerY={250}
                      pixelsPerInch={pixelsPerInch}
                    />
                  </>
                )}
              </svg>
            </div>

            <div className="text-center">
              <p className="text-3xl font-bold mb-6">Are the two lines the same length?</p>
              <div className="space-x-4">
                <button
                  onClick={() => handleResponse('same')}
                  className="bg-green-600 text-white px-12 py-4 rounded-lg hover:bg-green-700 text-2xl font-bold"
                >
                  Same
                </button>
                <button
                  onClick={() => handleResponse('different')}
                  className="bg-red-600 text-white px-12 py-4 rounded-lg hover:bg-red-700 text-2xl font-bold"
                >
                  Different
                </button>
              </div>
            </div>
          </div>
        )}

        {experimentState === 'practice-completed' && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-3xl font-bold mb-4 text-center">Practice Completed!</h2>
            <p className="text-xl font-bold mb-6 text-center">You completed {results.length} practice trials.</p>

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-3">Results Summary</h3>
              <div className="overflow-auto max-h-96 border rounded">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <th
                            key={header.id}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {table.getRowModel().rows.map(row => {
                      const groundTruth = row.original.line1Length === row.original.line2Length ? 'same' : 'different';
                      const isCorrect = row.original.response === groundTruth;
                      return (
                        <tr key={row.id} className={isCorrect ? 'bg-green-50' : 'bg-red-50'}>
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded">
                <p className="text-2xl font-bold">
                  Accuracy: {Math.round((results.filter(r => r.response === (r.line1Length === r.line2Length ? 'same' : 'different')).length / results.length) * 100)}%
                </p>
                <p className="text-lg font-bold text-gray-700 mt-2">
                  Average Response Time: {Math.round(results.reduce((sum, r) => sum + r.responseTime, 0) / results.length)}ms
                </p>
              </div>
            </div>

            <div className="text-center space-x-4">
              <button
                onClick={() => {
                  if (trials.length === 0) {
                    alert('Please upload a CSV file first');
                    return;
                  }
                  setIsPracticeMode(false);
                  startExperimentAfterCalibration();
                }}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-xl font-bold"
              >
                Start Main Experiment
              </button>
              <button
                onClick={() => {
                  setExperimentState('setup');
                  setCurrentTrialIndex(0);
                  setResults([]);
                  setIsPracticeMode(false);
                }}
                className="bg-gray-600 text-white px-8 py-3 rounded-lg hover:bg-gray-700 text-xl font-bold"
              >
                Back to Setup
              </button>
            </div>
          </div>
        )}

        {experimentState === 'completed' && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-3xl font-bold mb-4 text-center">Experiment Completed!</h2>
            <p className="text-xl font-bold mb-6 text-center">You completed {results.length} trials.</p>

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-3">Results Summary</h3>
              <div className="overflow-auto max-h-96 border rounded">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <th
                            key={header.id}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {table.getRowModel().rows.map(row => {
                      const groundTruth = row.original.line1Length === row.original.line2Length ? 'same' : 'different';
                      const isCorrect = row.original.response === groundTruth;
                      return (
                        <tr key={row.id} className={isCorrect ? 'bg-green-50' : 'bg-red-50'}>
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded">
                <p className="text-2xl font-bold">
                  Accuracy: {Math.round((results.filter(r => r.response === (r.line1Length === r.line2Length ? 'same' : 'different')).length / results.length) * 100)}%
                </p>
                <p className="text-lg font-bold text-gray-700 mt-2">
                  Average Response Time: {Math.round(results.reduce((sum, r) => sum + r.responseTime, 0) / results.length)}ms
                </p>
              </div>
            </div>

            <div className="text-center space-x-4">
              <button
                onClick={downloadResults}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-xl font-bold"
              >
                Download Results (CSV)
              </button>
              <button
                onClick={() => {
                  setExperimentState('setup');
                  setCurrentTrialIndex(0);
                  setResults([]);
                }}
                className="bg-gray-600 text-white px-8 py-3 rounded-lg hover:bg-gray-700 text-xl font-bold"
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
