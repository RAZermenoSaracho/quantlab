import {
  STRATEGY_PARAMETERS,
  type StrategyParameterKey,
} from "@quantlab/contracts";

const PARAM_NAME_SET = new Set(Object.keys(STRATEGY_PARAMETERS));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatStrategyParameterNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number(value.toFixed(6)).toString();
}

export function formatPythonLiteral(value: string | number | boolean | null): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (value === null) {
    return "None";
  }
  return String(value);
}

export function extractRegisteredParamsFromCode(
  code: string
): Partial<Record<StrategyParameterKey, number>> {
  if (!code.trim()) {
    return {};
  }

  const paramsMatch = code.match(/["']params["']\s*:\s*\{([\s\S]*?)\n?\s*\}/m);
  if (!paramsMatch) {
    return {};
  }

  const params: Partial<Record<StrategyParameterKey, number>> = {};
  const matches = paramsMatch[1].matchAll(/["']([^"']+)["']\s*:\s*([^,\n}]+)/g);

  for (const match of matches) {
    const name = match[1]?.trim();
    const rawValue = match[2]?.trim().replace(/,+$/, "");

    if (!name || !rawValue || !PARAM_NAME_SET.has(name)) {
      continue;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    params[name as StrategyParameterKey] = parsed;
  }

  return params;
}

export function replaceExistingParamsInCode(
  sourceCode: string,
  params: Record<string, string | number | boolean | null>
): string {
  const paramsBlockMatch = sourceCode.match(
    /(["']params["']\s*:\s*\{)([\s\S]*?)(\n?\s*\})/m
  );
  if (!paramsBlockMatch) {
    return sourceCode;
  }

  let updatedParamsBlock = paramsBlockMatch[2];
  for (const [name, value] of Object.entries(params)) {
    const keyPattern = new RegExp(
      `((["'])${escapeRegExp(name)}\\2\\s*:\\s*)([^,\\n}]+)`,
      "g"
    );
    updatedParamsBlock = updatedParamsBlock.replace(
      keyPattern,
      `$1${formatPythonLiteral(value)}`
    );
  }

  return sourceCode.replace(
    paramsBlockMatch[0],
    `${paramsBlockMatch[1]}${updatedParamsBlock}${paramsBlockMatch[3]}`
  );
}

function buildParamsBlock(params: Partial<Record<StrategyParameterKey, number>>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return `"params": {}`;
  }

  const lines = entries.map(
    ([name, value]) => `        "${name}": ${formatPythonLiteral(value)}`
  );

  return ['"params": {', ...lines.map((line, index) => {
    const suffix = index === lines.length - 1 ? "" : ",";
    return `${line}${suffix}`;
  }), "    }"].join("\n");
}

export function upsertParamsBlockInCode(
  sourceCode: string,
  params: Partial<Record<StrategyParameterKey, number>>
): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return sourceCode;
  }

  const paramsBlock = buildParamsBlock(params);
  const paramsMatch = sourceCode.match(/(["']params["']\s*:\s*\{)([\s\S]*?)(\n?\s*\})/m);
  if (paramsMatch) {
    return sourceCode.replace(paramsMatch[0], paramsBlock);
  }

  const configMatch = sourceCode.match(/CONFIG\s*=\s*\{/);
  if (configMatch) {
    return sourceCode.replace(
      configMatch[0],
      `${configMatch[0]}\n    ${paramsBlock},`
    );
  }

  return `CONFIG = {\n    ${paramsBlock}\n}\n\n${sourceCode}`;
}
