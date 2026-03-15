import {
  STRATEGY_PARAMETERS,
  type StrategyParameterKey,
} from "@quantlab/contracts";

const PARAMETER_NAMES = Object.keys(
  STRATEGY_PARAMETERS
) as StrategyParameterKey[];

export default function StrategyParametersDocs() {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
        <thead className="bg-slate-950/70 text-slate-300">
          <tr>
            <th className="px-4 py-3 font-medium">Parameter</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Min</th>
            <th className="px-4 py-3 font-medium">Max</th>
            <th className="px-4 py-3 font-medium">Step</th>
            <th className="px-4 py-3 font-medium">Default</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900/70 text-slate-200">
          {PARAMETER_NAMES.map((name) => {
            const definition = STRATEGY_PARAMETERS[name];

            return (
              <tr key={name}>
                <td className="px-4 py-3 font-mono text-sky-300">{name}</td>
                <td className="px-4 py-3">{definition.description}</td>
                <td className="px-4 py-3">{definition.min}</td>
                <td className="px-4 py-3">{definition.max}</td>
                <td className="px-4 py-3">{definition.step}</td>
                <td className="px-4 py-3">{definition.default}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
