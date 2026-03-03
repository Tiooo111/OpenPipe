#!/usr/bin/env node
import readline from 'node:readline';
import { listPacks, runPack } from './wf-core.js';

function respond(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return respond({ id: null, error: 'invalid_json' });
  }

  const id = req.id ?? null;
  try {
    if (req.method === 'list_workflows') {
      const packs = await listPacks();
      return respond({ id, result: { packs } });
    }
    if (req.method === 'run_workflow') {
      const params = req.params || {};
      const packId = params.packId;
      const result = await runPack(packId, params);
      return respond({ id, result });
    }

    return respond({ id, error: 'unknown_method' });
  } catch (e) {
    return respond({ id, error: String(e?.message || e) });
  }
});
