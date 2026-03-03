#!/usr/bin/env node
import readline from 'node:readline';
import { describePack, listPackDetails, listPacks, runPack, validatePack } from './wf-core.js';

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
      const params = req.params || {};
      if (params.details) {
        const packs = await listPackDetails();
        return respond({ id, result: { packs } });
      }
      const packs = await listPacks();
      return respond({ id, result: { packs } });
    }

    if (req.method === 'describe_workflow') {
      const params = req.params || {};
      const packId = params.packId;
      const pack = await describePack(packId);
      return respond({ id, result: { pack } });
    }

    if (req.method === 'validate_workflow') {
      const params = req.params || {};
      const packId = params.packId;
      const validation = await validatePack(packId);
      return respond({ id, result: { ok: validation.ok, validation } });
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
