#!/usr/bin/env node
import { describePack, listPackDetails, listPacks, runPack, validatePack } from './wf-core.js';

function parseMaybeJson(value) {
  if (value == null) return value;
  const raw = String(value).trim();
  if (!raw) return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseInputKV(text) {
  const raw = String(text || '');
  const idx = raw.indexOf('=');
  if (idx <= 0) {
    return { key: raw.trim(), value: true };
  }

  const key = raw.slice(0, idx).trim();
  const value = parseMaybeJson(raw.slice(idx + 1));
  return { key, value };
}

function parseArgs(argv) {
  const out = {
    cmd: argv[0] || 'help',
    packId: null,
    runDir: null,
    resumeRunDir: null,
    maxSteps: null,
    dryRun: false,
    injectDeviation: null,
    details: false,
    inputs: {},
    inputsJson: null,
  };

  let start = 1;
  if ((out.cmd === 'run' || out.cmd === 'describe' || out.cmd === 'validate') && argv[1] && !String(argv[1]).startsWith('--')) {
    out.packId = argv[1];
    start = 2;
  }

  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--run-dir') out.runDir = argv[++i];
    else if (a === '--resume-run-dir') out.resumeRunDir = argv[++i];
    else if (a === '--max-steps') out.maxSteps = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--inject-deviation') out.injectDeviation = argv[++i];
    else if (a === '--details') out.details = true;
    else if (a === '--input') {
      const { key, value } = parseInputKV(argv[++i] || '');
      if (key) out.inputs[key] = value;
    } else if (a === '--inputs-json') {
      out.inputsJson = argv[++i];
    }
  }

  if (out.inputsJson) {
    const parsed = JSON.parse(out.inputsJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('inputs-json must be a JSON object');
    }
    out.inputs = { ...parsed, ...out.inputs };
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.cmd === 'help' || args.cmd === '--help' || args.cmd === '-h') {
    console.log(`Usage:\n  wf list [--details]\n  wf describe <pipeId>\n  wf validate <pipeId>\n  wf run <pipeId> [--dry-run] [--run-dir <dir>] [--resume-run-dir <dir>] [--max-steps <n>] [--inject-deviation <type>] [--input key=value] [--inputs-json '{"task_prompt":"..."}']`);
    return;
  }

  if (args.cmd === 'list') {
    if (args.details) {
      const packs = await listPackDetails();
      console.log(JSON.stringify({ ok: true, packs }, null, 2));
      return;
    }

    const packs = await listPacks();
    console.log(JSON.stringify({ ok: true, packs }, null, 2));
    return;
  }

  if (args.cmd === 'describe') {
    if (!args.packId) throw new Error('Missing pipeId. Usage: describe <pipeId>');
    const info = await describePack(args.packId);
    console.log(JSON.stringify({ ok: true, pack: info }, null, 2));
    return;
  }

  if (args.cmd === 'validate') {
    if (!args.packId) throw new Error('Missing pipeId. Usage: validate <pipeId>');
    const res = await validatePack(args.packId);
    console.log(JSON.stringify({ ok: res.ok, validation: res }, null, 2));
    if (!res.ok) process.exitCode = 2;
    return;
  }

  if (args.cmd === 'run') {
    if (!args.packId) throw new Error('Missing pipeId. Usage: run <pipeId>');
    const res = await runPack(args.packId, args);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${args.cmd}`);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
