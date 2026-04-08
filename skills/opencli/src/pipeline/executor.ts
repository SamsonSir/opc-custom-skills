/**
 * Pipeline executor: runs YAML pipeline steps sequentially.
 */

import chalk from 'chalk';
import type { IPage } from '../types.js';
import { stepNavigate, stepClick, stepType, stepWait, stepPress, stepSnapshot, stepEvaluate } from './steps/browser.js';
import { stepFetch } from './steps/fetch.js';
import { stepSelect, stepMap, stepFilter, stepSort, stepLimit } from './steps/transform.js';
import { stepIntercept } from './steps/intercept.js';
import { stepTap } from './steps/tap.js';

export interface PipelineContext {
  args?: Record<string, any>;
  debug?: boolean;
}

/** Step handler: all steps conform to (page, params, data, args) => Promise<any> */
type StepHandler = (page: IPage | null, params: any, data: any, args: Record<string, any>) => Promise<any>;

/** Registry of all available step handlers */
const STEP_HANDLERS: Record<string, StepHandler> = {
  navigate: stepNavigate,
  fetch: stepFetch,
  select: stepSelect,
  evaluate: stepEvaluate,
  snapshot: stepSnapshot,
  click: stepClick,
  type: stepType,
  wait: stepWait,
  press: stepPress,
  map: stepMap,
  filter: stepFilter,
  sort: stepSort,
  limit: stepLimit,
  intercept: stepIntercept,
  tap: stepTap,
};

export async function executePipeline(
  page: IPage | null,
  pipeline: any[],
  ctx: PipelineContext = {},
): Promise<any> {
  const args = ctx.args ?? {};
  const debug = ctx.debug ?? false;
  let data: any = null;
  const total = pipeline.length;

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    if (!step || typeof step !== 'object') continue;
    for (const [op, params] of Object.entries(step)) {
      if (debug) debugStepStart(i + 1, total, op, params);

      const handler = STEP_HANDLERS[op];
      if (handler) {
        data = await handler(page, params, data, args);
      } else {
        if (debug) process.stderr.write(`  ${chalk.yellow('⚠')}  Unknown step: ${op}\n`);
      }

      if (debug) debugStepResult(op, data);
    }
  }
  return data;
}

function debugStepStart(stepNum: number, total: number, op: string, params: any): void {
  let preview = '';
  if (typeof params === 'string') {
    preview = params.length <= 80 ? ` → ${params}` : ` → ${params.slice(0, 77)}...`;
  } else if (params && typeof params === 'object' && !Array.isArray(params)) {
    preview = ` (${Object.keys(params).join(', ')})`;
  }
  process.stderr.write(`  ${chalk.dim(`[${stepNum}/${total}]`)} ${chalk.bold.cyan(op)}${preview}\n`);
}

function debugStepResult(op: string, data: any): void {
  if (data === null || data === undefined) {
    process.stderr.write(`       ${chalk.dim('→ (no data)')}\n`);
  } else if (Array.isArray(data)) {
    process.stderr.write(`       ${chalk.dim(`→ ${data.length} items`)}\n`);
  } else if (typeof data === 'object') {
    const keys = Object.keys(data).slice(0, 5);
    process.stderr.write(`       ${chalk.dim(`→ dict (${keys.join(', ')}${Object.keys(data).length > 5 ? '...' : ''})`)}\n`);
  } else if (typeof data === 'string') {
    const p = data.slice(0, 60).replace(/\n/g, '\\n');
    process.stderr.write(`       ${chalk.dim(`→ "${p}${data.length > 60 ? '...' : ''}"`)}\n`);
  } else {
    process.stderr.write(`       ${chalk.dim(`→ ${typeof data}`)}\n`);
  }
}
