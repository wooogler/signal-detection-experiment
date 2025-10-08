'use client';

import { useState, useEffect, useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import useLocalStorageState from 'use-local-storage-state';
import JSZip from 'jszip';
import LineSegment from '@/components/LineSegment';
import { TrialData, ExperimentResult, ExperimentState } from '@/types/experiment';

type SeriesData = {
  name: string;
  trials: TrialData[];
};

type CounterbalanceGroup = 'A' | 'B' | 'C' | 'D';

export default function Home() {
  const [experimentState, setExperimentState] = useState<ExperimentState>('setup');
  const [allSeries, setAllSeries] = useState<SeriesData[]>([]);
  const [currentSeriesIndex, setCurrentSeriesIndex] = useState(0);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [allSeriesResults, setAllSeriesResults] = useState<{ [seriesName: string]: ExperimentResult[] }>({});
  const [trialStartTime, setTrialStartTime] = useState<number>(0);
  const [isLinesVisible, setIsLinesVisible] = useState<boolean>(true);
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(false);
  const [practiceTrials, setPracticeTrials] = useState<TrialData[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [showSeriesTransition, setShowSeriesTransition] = useState(false);
  const [counterbalanceGroup, setCounterbalanceGroup] = useState<CounterbalanceGroup | null>(null);
  const [pixelsPerInch, setPixelsPerInch] = useLocalStorageState<number>('pixelsPerInch', {
    defaultValue: 96
  });
  const [cardWidthInPixels, setCardWidthInPixels] = useLocalStorageState<number>('cardWidthInPixels', {
    defaultValue: 550
  });
  const exposureDuration = 3000;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get series order based on counterbalance group
  const getSeriesOrder = (group: CounterbalanceGroup): string[] => {
    const orders = {
      'A': ['Series-1a', 'Series-1b', 'Series-2a', 'Series-2b'],
      'B': ['Series-1a', 'Series-1b', 'Series-2b', 'Series-2a'],
      'C': ['Series-1b', 'Series-1a', 'Series-2a', 'Series-2b'],
      'D': ['Series-1b', 'Series-1a', 'Series-2b', 'Series-2a'],
    };
    return orders[group];
  };

  // Load all series data from CSV files
  useEffect(() => {
    if (!counterbalanceGroup) return;

    const loadAllSeries = async () => {
      const seriesFiles = getSeriesOrder(counterbalanceGroup);
      const loadedSeries: SeriesData[] = [];

      for (const fileName of seriesFiles) {
        try {
          const response = await fetch(`/data/${fileName}.csv`);
          const csvText = await response.text();
          const lines = csvText.split('\n').filter(line => line.trim());
          const header = lines[0].toLowerCase();

          const isTiltMode = header.includes('tilt');
          const isSaturationMode = header.includes('saturation');

          const trials: TrialData[] = lines.slice(1).map(line => {
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

          loadedSeries.push({ name: fileName, trials });
        } catch (error) {
          console.error(`Failed to load ${fileName}:`, error);
        }
      }

      setAllSeries(loadedSeries);
    };

    loadAllSeries();
  }, [counterbalanceGroup]);

  const [shouldStartNextSeries, setShouldStartNextSeries] = useState(false);

  useEffect(() => {
    if (shouldStartNextSeries && currentSeriesIndex < allSeries.length) {
      setShouldStartNextSeries(false);

      // Do practice for Series-1a (index 0) and Series-2a (index 2)
      // Series-1b (index 1) and Series-2b (index 3) skip practice
      if (currentSeriesIndex === 0 || currentSeriesIndex === 2) {
        const currentSeries = allSeries[currentSeriesIndex];
        const trials = currentSeries.trials;

        // Find same and different trials
        const sameTrials = trials.filter((t: TrialData) => t.line1Length === t.line2Length);
        const differentTrials = trials.filter((t: TrialData) => t.line1Length !== t.line2Length);

        // Randomly select 2 from each category
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
        setIsPracticeMode(true);
        setExperimentState('running');
        setCurrentTrialIndex(0);
        setResults([]);
        setIsLinesVisible(true);
        setTrialStartTime(Date.now());
      } else {
        // For Series-1b and Series-2b, skip practice and start directly
        setIsPracticeMode(false);
        setExperimentState('running');
        setCurrentTrialIndex(0);
        setResults([]);
        setIsLinesVisible(true);
        setTrialStartTime(Date.now());
      }
    }
  }, [currentSeriesIndex, shouldStartNextSeries, allSeries]);

  const startPracticeForCurrentSeries = () => {
    if (allSeries.length === 0 || currentSeriesIndex >= allSeries.length) return;

    const currentSeries = allSeries[currentSeriesIndex];
    const trials = currentSeries.trials;

    // Find same and different trials
    const sameTrials = trials.filter(t => t.line1Length === t.line2Length);
    const differentTrials = trials.filter(t => t.line1Length !== t.line2Length);

    // Randomly select 2 from each category
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
    setIsPracticeMode(true);
    setExperimentState('running');
    setCurrentTrialIndex(0);
    setResults([]);
    setIsLinesVisible(true);
    setTrialStartTime(Date.now());
  };

  const startExperimentForCurrentSeries = () => {
    if (allSeries.length === 0 || currentSeriesIndex >= allSeries.length) return;

    setIsPracticeMode(false);
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
    const currentSeries = allSeries[currentSeriesIndex];
    const currentTrials = isPracticeMode ? practiceTrials : (currentSeries?.trials || []);
    const currentTrial = currentTrials[currentTrialIndex];

    if (!currentTrial) return;

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
        // Save results for this series
        setAllSeriesResults(prev => ({
          ...prev,
          [currentSeries.name]: newResults
        }));

        // Check if there are more series
        if (currentSeriesIndex < allSeries.length - 1) {
          // Show transition screen before moving to next series
          setShowSeriesTransition(true);
          setExperimentState('series-completed');
        } else {
          setExperimentState('completed');
        }
      }
    }
  };

  const downloadAllResults = async () => {
    const zip = new JSZip();

    // Add all series results to the zip file
    Object.entries(allSeriesResults).forEach(([seriesName, seriesResults]) => {
      const isTiltMode = seriesResults[0]?.line1Tilt !== undefined;
      const isSaturationMode = seriesResults[0]?.line1Saturation !== undefined;

      let header: string;
      let rows: string[];

      if (isTiltMode) {
        header = 'Trial,Line 1 Length,Line 1 Tilt,Line 2 Length,Line 2 Tilt,Ground Truth,Your Response,Result,Response Time,Timestamp';
        rows = seriesResults.map(r => {
          const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
          const isCorrect = r.response === groundTruth ? 'Correct' : 'Incorrect';
          return `${r.trialIndex},${r.line1Length},${r.line1Tilt},${r.line2Length},${r.line2Tilt},${groundTruth},${r.response},${isCorrect},${r.responseTime},${r.timestamp}`;
        });
      } else if (isSaturationMode) {
        header = 'Trial,Line 1 Length,Line 1 Saturation,Line 2 Length,Line 2 Saturation,Ground Truth,Your Response,Result,Response Time,Timestamp';
        rows = seriesResults.map(r => {
          const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
          const isCorrect = r.response === groundTruth ? 'Correct' : 'Incorrect';
          return `${r.trialIndex},${r.line1Length},${r.line1Saturation},${r.line2Length},${r.line2Saturation},${groundTruth},${r.response},${isCorrect},${r.responseTime},${r.timestamp}`;
        });
      } else {
        header = 'Trial,Line 1 Length,Line 2 Length,Ground Truth,Your Response,Result,Response Time,Timestamp';
        rows = seriesResults.map(r => {
          const groundTruth = r.line1Length === r.line2Length ? 'same' : 'different';
          const isCorrect = r.response === groundTruth ? 'Correct' : 'Incorrect';
          return `${r.trialIndex},${r.line1Length},${r.line2Length},${groundTruth},${r.response},${isCorrect},${r.responseTime},${r.timestamp}`;
        });
      }

      const csvContent = [header, ...rows].join('\n');
      zip.file(`${seriesName}_results.csv`, csvContent);
    });

    // Generate the zip file and download it
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'experiment_results.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentSeries = allSeries[currentSeriesIndex];
  const currentTrials = isPracticeMode ? practiceTrials : (currentSeries?.trials || []);
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
                <li><strong>4 Series:</strong> Series-1a, 1b (tilt), Series-2a, 2b (saturation)</li>
                <li><strong>Practice:</strong> 4 trials before Series 1 and Series 2 (2 same, 2 different each)</li>
                <li><strong>Display Time:</strong> Lines shown for 3 seconds, then hidden</li>
                <li>You can respond even after lines disappear</li>
                <li>Calibration is done once at the beginning</li>
              </ul>
            </div>

            {!counterbalanceGroup && (
              <div className="mb-6 border-2 border-purple-400 bg-purple-50 rounded p-4">
                <h3 className="text-xl font-bold mb-3 text-purple-900">Select Counterbalance Group</h3>
                <p className="text-base text-purple-900 mb-4">
                  Choose your assigned group (A, B, C, or D):
                </p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {(['A', 'B', 'C', 'D'] as CounterbalanceGroup[]).map((group) => {
                    const order = getSeriesOrder(group);
                    return (
                      <button
                        key={group}
                        onClick={() => setCounterbalanceGroup(group)}
                        className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-bold text-lg"
                      >
                        Group {group}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 bg-white rounded border border-purple-300">
                  <p className="text-sm font-bold text-purple-900 mb-2">Group Orders:</p>
                  <ul className="text-xs text-purple-800 space-y-1">
                    <li><strong>Group A:</strong> 1a → 1b → 2a → 2b</li>
                    <li><strong>Group B:</strong> 1a → 1b → 2b → 2a</li>
                    <li><strong>Group C:</strong> 1b → 1a → 2a → 2b</li>
                    <li><strong>Group D:</strong> 1b → 1a → 2b → 2a</li>
                  </ul>
                </div>
              </div>
            )}

            {counterbalanceGroup && allSeries.length > 0 && (
              <div className="mb-4">
                <p className="text-green-600 font-bold text-lg">
                  ✓ Group {counterbalanceGroup} selected
                </p>
                <p className="text-green-600 font-bold text-lg">
                  ✓ Loaded {allSeries.length} series ({allSeries.reduce((sum, s) => sum + s.trials.length, 0)} total trials)
                </p>
                <p className="text-gray-600 text-sm mt-1">
                  Order: {allSeries.map(s => s.name).join(' → ')}
                </p>
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

            <div className="mb-4 bg-green-50 border-2 border-green-400 rounded p-4">
              <p className="text-lg font-bold text-green-900 mb-2">
                ✅ Ready to Start
              </p>
              <p className="text-base text-green-900">
                Click the button below to start with a <strong>practice session (4 trials)</strong> to familiarize yourself with the experiment. You will see <strong>black lines with different tilts</strong>.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  if (!counterbalanceGroup) {
                    alert('Please select a counterbalance group first.');
                    return;
                  }
                  if (allSeries.length === 0) {
                    alert('Loading series data...');
                    return;
                  }
                  setCurrentSeriesIndex(0);
                  startPracticeForCurrentSeries();
                }}
                disabled={!counterbalanceGroup || allSeries.length === 0}
                className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-bold text-lg"
              >
                Start Practice Session
              </button>
              {!counterbalanceGroup && (
                <p className="text-orange-600 font-bold text-base">
                  ⏳ Select a counterbalance group first
                </p>
              )}
              {counterbalanceGroup && allSeries.length === 0 && (
                <p className="text-orange-600 font-bold text-base">
                  ⏳ Loading series data...
                </p>
              )}
            </div>
          </div>
        )}

        {experimentState === 'running' && currentTrial && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4">
              <p className="text-2xl font-bold">
                {currentSeries && !isPracticeMode && `${currentSeries.name} - `}
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

            <div className="mb-6 bg-blue-50 border-2 border-blue-400 rounded p-4">
              <p className="text-lg font-bold text-blue-900 mb-2">
                📝 What&apos;s Next
              </p>
              <p className="text-base text-blue-900">
                You will now start <strong>{currentSeries?.name}</strong>.
                {currentSeriesIndex === 0 ? ' You will continue seeing black lines with different tilts.' : ' You will now see red lines with different saturations.'}
                <br/>
                The experiment works the same way as practice, but your responses will be recorded.
              </p>
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-3">Practice Results Summary</h3>
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
                  startExperimentForCurrentSeries();
                }}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-xl font-bold"
              >
                Continue to {currentSeries?.name}
              </button>
            </div>
          </div>
        )}

        {experimentState === 'series-completed' && showSeriesTransition && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-3xl font-bold mb-4 text-center">{currentSeries?.name} Completed! ✅</h2>
            <p className="text-xl font-bold mb-6 text-center">
              Great work! You completed {results.length} trials.
            </p>

            {currentSeriesIndex === 0 && (
              <div className="mb-6 bg-green-50 border-2 border-green-400 rounded p-4">
                <p className="text-lg font-bold text-green-900 mb-2">
                  📝 Next: {allSeries[currentSeriesIndex + 1]?.name}
                </p>
                <p className="text-base text-green-900">
                  You will continue with more trials using <strong>black lines with different tilts</strong>.
                  The format is exactly the same.
                </p>
              </div>
            )}

            {currentSeriesIndex === 1 && (
              <div className="mb-6 bg-purple-50 border-2 border-purple-400 rounded p-4">
                <p className="text-lg font-bold text-purple-900 mb-2">
                  🎨 Important: New Type of Experiment!
                </p>
                <p className="text-base text-purple-900 mb-3">
                  You have completed the tilt-based experiments. Now you&apos;ll start a <strong>different type of experiment</strong>.
                </p>
                <p className="text-base text-purple-900 mb-2">
                  <strong>What&apos;s changing:</strong>
                </p>
                <ul className="list-disc list-inside text-base text-purple-900 space-y-1 ml-4">
                  <li>Lines will be <strong>horizontal (no tilt)</strong></li>
                  <li>Lines will be <strong>red with varying saturations</strong></li>
                  <li>You&apos;ll still compare line lengths the same way</li>
                </ul>
                <p className="text-base text-purple-900 mt-3">
                  You will start with a <strong>practice session (4 trials)</strong> to get familiar with this new format.
                </p>
              </div>
            )}

            {currentSeriesIndex === 2 && (
              <div className="mb-6 bg-green-50 border-2 border-green-400 rounded p-4">
                <p className="text-lg font-bold text-green-900 mb-2">
                  📝 Next: {allSeries[currentSeriesIndex + 1]?.name} (Final Series)
                </p>
                <p className="text-base text-green-900">
                  You will continue with more trials using <strong>red lines with different saturations</strong>.
                  This is the final series!
                </p>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => {
                  setShowSeriesTransition(false);
                  setCurrentSeriesIndex(prev => prev + 1);
                  setShouldStartNextSeries(true);
                }}
                className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 text-xl font-bold"
              >
                {currentSeriesIndex === 1 ? 'Start Practice (Saturation)' : `Continue to ${allSeries[currentSeriesIndex + 1]?.name}`}
              </button>
            </div>
          </div>
        )}

        {experimentState === 'completed' && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-3xl font-bold mb-4 text-center">All Experiments Completed!</h2>
            <p className="text-xl font-bold mb-6 text-center">
              You completed all {Object.keys(allSeriesResults).length} series with {Object.values(allSeriesResults).reduce((sum, r) => sum + r.length, 0)} total trials.
            </p>

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-3">Summary by Series</h3>
              <div className="space-y-4">
                {Object.entries(allSeriesResults).map(([seriesName, seriesResults]) => {
                  const correctCount = seriesResults.filter(r => r.response === (r.line1Length === r.line2Length ? 'same' : 'different')).length;
                  const accuracy = Math.round((correctCount / seriesResults.length) * 100);
                  const avgResponseTime = Math.round(seriesResults.reduce((sum, r) => sum + r.responseTime, 0) / seriesResults.length);

                  return (
                    <div key={seriesName} className="p-4 bg-gray-50 rounded border-l-4 border-blue-500">
                      <h4 className="text-xl font-bold mb-2">{seriesName}</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Trials</p>
                          <p className="text-lg font-bold">{seriesResults.length}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Accuracy</p>
                          <p className="text-lg font-bold">{accuracy}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Avg Response Time</p>
                          <p className="text-lg font-bold">{avgResponseTime}ms</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-green-50 rounded border-2 border-green-500">
                <h4 className="text-xl font-bold mb-2">Overall Statistics</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Trials</p>
                    <p className="text-2xl font-bold">
                      {Object.values(allSeriesResults).reduce((sum, r) => sum + r.length, 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Overall Accuracy</p>
                    <p className="text-2xl font-bold">
                      {Math.round(
                        (Object.values(allSeriesResults).flat().filter(r => r.response === (r.line1Length === r.line2Length ? 'same' : 'different')).length /
                         Object.values(allSeriesResults).flat().length) * 100
                      )}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Overall Avg Response Time</p>
                    <p className="text-2xl font-bold">
                      {Math.round(
                        Object.values(allSeriesResults).flat().reduce((sum, r) => sum + r.responseTime, 0) /
                        Object.values(allSeriesResults).flat().length
                      )}ms
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center space-x-4">
              <button
                onClick={downloadAllResults}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-xl font-bold"
              >
                Download Results (ZIP)
              </button>
              <button
                onClick={() => {
                  setExperimentState('setup');
                  setCurrentSeriesIndex(0);
                  setCurrentTrialIndex(0);
                  setResults([]);
                  setAllSeriesResults({});
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
