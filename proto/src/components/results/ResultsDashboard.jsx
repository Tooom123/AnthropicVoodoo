import VerdictHeader from './VerdictHeader.jsx'
import DimensionsChart from './DimensionsChart.jsx'
import BenchmarkChart from './BenchmarkChart.jsx'
import StrengthsRisks from './StrengthsRisks.jsx'
import Recommendations from './Recommendations.jsx'
import VisualAnalysis from './VisualAnalysis.jsx'

export default function ResultsDashboard({ proto, result }) {
  const hasVisualAnalysis = !!result.visual_analysis
  const hasKpiData = proto.hasKpiData && proto.genre !== 'auto'

  return (
    <div className="space-y-4">
      <VerdictHeader proto={proto} result={result} />

      {hasVisualAnalysis && (
        <VisualAnalysis
          analysis={result.visual_analysis}
          screenshots={proto.screenshots}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DimensionsChart dimensions={result.dimensions} />
        {hasKpiData ? (
          <BenchmarkChart proto={proto} />
        ) : (
          <div
            className="bg-white border border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-2"
          >
            <p className="text-sm text-gray-400 font-sans">No A/B test data</p>
            <p className="text-xs text-gray-300 font-mono">
              Add KPIs after running a test to compare against genre benchmarks
            </p>
          </div>
        )}
      </div>

      <StrengthsRisks strengths={result.strengths} risks={result.risks} />
      <Recommendations
        recommendations={result.recommendations}
        comparableHits={result.comparable_hits}
      />
    </div>
  )
}
