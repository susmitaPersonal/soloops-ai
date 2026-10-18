/**
 * Opt-in scope-check evaluation against a REAL model endpoint (ai-architecture §7). Never run in
 * CI. It drives the real AI service (prompt, provider adapter, validation, repair, server-side
 * scope checks) with a throwaway in-memory MongoDB, then scores the runs against the fixed
 * thresholds in modules/ai/eval/score.ts.
 *
 *   AI_PROVIDER=openai-compatible AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL=qwen2.5:1.5b \
 *   AI_STRUCTURED_OUTPUT=json_schema npm run eval:ai -w @soloops/api
 *
 * Optional: EVAL_REPEATS (default 3), EVAL_OUT (JSON results path).
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { migrations } from '../migrations';
import {
  createAiService,
  createProvider,
  scoreRuns,
  THRESHOLDS,
  type EvalCase,
  type RunResult,
} from './modules/ai';
import dataset from './modules/ai/eval/scope-cases.json';
import { systemClock } from './platform/clock';
import { loadConfig } from './platform/config';
import { connectDatabase } from './platform/db';
import { runMigrations } from './platform/db/migrations';
import { AppError } from './platform/errors';
import { newId } from './platform/ids';
import { createLogger } from './platform/logging';

type Project = (typeof dataset.projects)[keyof typeof dataset.projects];

async function main() {
  if (process.env.AI_PROVIDER !== 'openai-compatible') {
    throw new Error(
      'Set AI_PROVIDER=openai-compatible (plus AI_BASE_URL and AI_MODEL) to evaluate a real model.',
    );
  }
  const repeats = Number(process.env.EVAL_REPEATS ?? 3);
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await rs.waitUntilRunning();
  try {
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'development',
      APP_ORIGIN: 'http://localhost:3000',
      MONGODB_URI: rs.getUri(),
      MONGODB_DB: 'soloops_eval',
      SESSION_SECRET: 'eval-only-secret-not-used-for-sessions-000000',
      RATE_LIMIT_AI_PER_HOUR: '100000',
    });
    const db = await connectDatabase(rs.getUri(), 'soloops_eval');
    await runMigrations(db, migrations);
    const provider = createProvider(config);
    const ai = createAiService({
      db,
      clock: systemClock,
      config,
      provider,
      logger: createLogger('silent'),
    });
    const health = await ai.health();
    if (health !== 'ok') throw new Error(`The model endpoint is ${health}.`);

    const cases = dataset.cases as EvalCase[];
    const workspaceId = newId();
    const runs: RunResult[] = [];
    let n = 0;
    for (const c of cases) {
      const project = dataset.projects[c.project as keyof typeof dataset.projects] as Project;
      const requirements = project.requirements.map((r) => ({ ...r, id: newId() }));
      const keys = new Set(requirements.map((r) => r.key));
      for (let i = 0; i < repeats; i++) {
        n += 1;
        const started = performance.now();
        try {
          const result = await ai.analyzeChangeRequest({
            workspaceId,
            userId: 'eval',
            changeRequestId: `eval-${c.id}`,
            versionNumber: i + 1,
            projectName: project.name,
            projectDescription: project.description,
            requirements,
            requestText: c.request,
          });
          const gen = await db
            .tenant<{
              _id: string;
              output: { scopeAssessment?: { evidence: { requirementKey: string }[] } } | null;
            }>('aiGenerations', workspaceId)
            .findOne({ _id: result.generationId });
          const cited = (gen?.output?.scopeAssessment?.evidence ?? []).map((e) => e.requirementKey);
          runs.push({
            caseId: c.id,
            status: 'ok',
            verdict: result.suggestion.scope.verdict,
            modelVerdict: result.suggestion.scope.modelVerdict,
            citedKeys: cited,
            inventedKeys: cited.filter((k) => !keys.has(k)).length,
            likelyMinutes: result.suggestion.effort?.likelyMinutes ?? null,
            latencyMs: Math.round(performance.now() - started),
          });
        } catch (err) {
          runs.push({
            caseId: c.id,
            status: err instanceof AppError ? err.code : 'ERROR',
            verdict: null,
            modelVerdict: null,
            citedKeys: [],
            inventedKeys: 0,
            likelyMinutes: null,
            latencyMs: Math.round(performance.now() - started),
          });
        }
        const last = runs[runs.length - 1];
        process.stdout.write(
          `[${n}/${cases.length * repeats}] ${c.id} ${last?.status} ${last?.verdict ?? '-'} (model ${last?.modelVerdict ?? '-'}) ${last?.latencyMs} ms\n`,
        );
      }
    }

    const score = scoreRuns(cases, runs);
    const report = {
      dataset: dataset.dataset,
      date: new Date().toISOString(),
      provider: provider.id,
      model: provider.model,
      structuredOutput: config.AI_STRUCTURED_OUTPUT,
      promptVersion: 'cr-analysis@2',
      schemaVersion: 'cr-analysis-output@2',
      repeats,
      thresholds: THRESHOLDS,
      ...score,
      runs,
    };
    const out = process.env.EVAL_OUT ?? 'eval-results.json';
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    console.log('\nChecks:');
    for (const c of score.checks) {
      console.log(
        `  ${c.pass ? 'PASS' : 'FAIL'} ${c.id} ${c.name}: ${c.value.toFixed(3)} (${c.threshold})`,
      );
    }
    console.log(
      `Accuracy by category: ${score.categories.map((x) => `${x.category} ${x.accuracy.toFixed(2)}`).join(' · ')}`,
    );
    console.log(
      `Latency p50 ${score.metrics.latencyP50Ms} ms, p95 ${score.metrics.latencyP95Ms} ms; effort spread (likely, max/min across runs) median ${score.metrics.effortSpreadMedian.toFixed(2)}, max ${score.metrics.effortSpreadMax?.toFixed(2) ?? '-'}`,
    );
    console.log(`Results written to ${out}. Overall: ${score.pass ? 'PASS' : 'FAIL'}`);
    await db.close();
    process.exitCode = score.pass ? 0 : 1;
  } finally {
    await rs.stop();
  }
}

main().catch((err: unknown) => {
  console.error('Evaluation failed:', err instanceof Error ? err.message : 'unknown error');
  process.exit(2);
});
