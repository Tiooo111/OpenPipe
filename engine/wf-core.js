import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import YAML from 'yaml';

const execFileP = promisify(execFile);
const WORKFLOW_DIRS = ['pipes', 'packs'];
const KNOWN_INPUT_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array']);

export function isSafePackId(packId) {
  return /^[a-zA-Z0-9._-]+$/.test(packId || '');
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readText(file) {
  return fs.readFile(file, 'utf-8');
}

async function readYamlFile(file, fallback = {}) {
  if (!(await fileExists(file))) return fallback;
  const text = await readText(file);
  return YAML.parse(text) ?? fallback;
}

async function loadPackDocs(packId) {
  if (!isSafePackId(packId)) {
    throw new Error(`invalid_pack_id:${packId}`);
  }

  const workflowPath = await resolveWorkflowPath(packId);
  if (!workflowPath) {
    throw new Error(`workflow_not_found:${packId}`);
  }

  const packRoot = path.dirname(workflowPath);
  const wf = await readYamlFile(workflowPath, {});
  const roles = await readYamlFile(path.join(packRoot, 'roles.yaml'), { roles: {} });
  const contracts = await readYamlFile(path.join(packRoot, 'contracts', 'contract-rules.yaml'), { rules: [] });

  return { packId, packRoot, workflowPath, wf, roles, contracts };
}

function summarizeWorkflow(packId, workflowPath, wf) {
  const nodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
  const roles = [...new Set(nodes.map((n) => n?.role).filter(Boolean))].sort();
  const inputDefs = Array.isArray(wf?.inputs) ? wf.inputs : [];
  const requiredInputs = inputDefs.filter((i) => i?.required).map((i) => i?.name).filter(Boolean);

  return {
    packId,
    workflowPath,
    id: wf?.id || packId,
    name: wf?.name || wf?.id || packId,
    version: wf?.version || null,
    mode: wf?.mode || null,
    entryNode: wf?.entryNode || null,
    nodeCount: nodes.length,
    roles,
    requiredInputs,
    inputs: inputDefs,
    artifacts: wf?.artifacts || null,
  };
}

function parseRunnerOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    return JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : '{}');
  }
}

function isNodeTransitionNode(node) {
  return !!node?.gate || !!node?.router;
}

export async function resolveWorkflowPath(packId) {
  if (!isSafePackId(packId)) return null;

  for (const baseDir of WORKFLOW_DIRS) {
    const p = path.resolve(baseDir, packId, 'workflow.yaml');
    if (await fileExists(p)) return p;
  }
  return null;
}

export async function listPacks() {
  const names = new Set();

  for (const baseDir of WORKFLOW_DIRS) {
    const base = path.resolve(baseDir);
    let dirs = [];
    try {
      dirs = await fs.readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const wf = path.join(base, d.name, 'workflow.yaml');
      if (await fileExists(wf)) names.add(d.name);
    }
  }

  return [...names].sort();
}

export async function describePack(packId) {
  const { workflowPath, wf } = await loadPackDocs(packId);
  return summarizeWorkflow(packId, workflowPath, wf);
}

export async function listPackDetails() {
  const packIds = await listPacks();
  const details = [];
  for (const packId of packIds) {
    try {
      details.push(await describePack(packId));
    } catch {
      // skip malformed workflows from summary mode
    }
  }
  return details;
}

export async function validatePack(packId) {
  const { packRoot, workflowPath, wf, roles, contracts } = await loadPackDocs(packId);
  const errors = [];
  const warnings = [];

  const nodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
  const roleMap = (roles && typeof roles.roles === 'object' && roles.roles) ? roles.roles : {};

  if (!wf?.id) warnings.push({ code: 'workflow_id_missing', message: 'workflow.id is missing' });
  if (!wf?.entryNode) errors.push({ code: 'entry_node_missing', message: 'workflow.entryNode is required' });
  if (!Array.isArray(wf?.nodes) || nodes.length === 0) {
    errors.push({ code: 'nodes_missing', message: 'workflow.nodes must be a non-empty array' });
  }

  const nodeIdSet = new Set();
  const outputOwners = new Map();

  for (const [idx, node] of nodes.entries()) {
    const nidx = idx + 1;
    const nodeId = node?.id;

    if (!nodeId || typeof nodeId !== 'string') {
      errors.push({ code: 'node_id_missing', message: `node #${nidx} missing id` });
      continue;
    }

    if (nodeIdSet.has(nodeId)) {
      errors.push({ code: 'node_id_duplicate', nodeId, message: `duplicate node id: ${nodeId}` });
    } else {
      nodeIdSet.add(nodeId);
    }

    if (!node?.role || typeof node.role !== 'string') {
      errors.push({ code: 'role_missing', nodeId, message: `${nodeId} missing role` });
    } else if (!roleMap[node.role]) {
      errors.push({ code: 'role_not_defined', nodeId, role: node.role, message: `${nodeId} references undefined role ${node.role}` });
    }

    const outputs = Array.isArray(node?.outputs) ? node.outputs : [];
    for (const o of outputs) {
      if (typeof o !== 'string' || !o.trim()) {
        errors.push({ code: 'output_invalid', nodeId, message: `${nodeId} has invalid output entry` });
        continue;
      }
      outputOwners.set(String(o), nodeId);
    }

    if (node?.gate) {
      if (!node.gate.onPass) errors.push({ code: 'gate_onpass_missing', nodeId, message: `${nodeId} gate.onPass missing` });
      if (!node.gate.onFail) errors.push({ code: 'gate_onfail_missing', nodeId, message: `${nodeId} gate.onFail missing` });
    } else if (node?.router) {
      if (!node.router.onNoDeviation) {
        errors.push({ code: 'router_on_no_deviation_missing', nodeId, message: `${nodeId} router.onNoDeviation missing` });
      }
      if (!node.router.onDeviation || typeof node.router.onDeviation !== 'object') {
        errors.push({ code: 'router_matrix_missing', nodeId, message: `${nodeId} router.onDeviation missing` });
      }
    } else {
      if (!node?.next && !node?.onError) {
        warnings.push({ code: 'task_transition_missing', nodeId, message: `${nodeId} has no next/onError transition` });
      }
    }
  }

  if (wf?.entryNode && !nodeIdSet.has(wf.entryNode)) {
    errors.push({ code: 'entry_node_not_found', entryNode: wf.entryNode, message: `entryNode ${wf.entryNode} not found in nodes` });
  }

  const isValidTarget = (target) => target === 'end' || nodeIdSet.has(target);
  for (const node of nodes) {
    if (!node?.id) continue;

    const pushTargetError = (target, field) => {
      if (!target) return;
      if (!isValidTarget(target)) {
        errors.push({
          code: 'transition_target_not_found',
          nodeId: node.id,
          field,
          target,
          message: `${node.id}.${field} points to missing node ${target}`,
        });
      }
    };

    if (node?.gate) {
      pushTargetError(node.gate.onPass, 'gate.onPass');
      pushTargetError(node.gate.onFail, 'gate.onFail');
    } else if (node?.router) {
      pushTargetError(node.router.onNoDeviation, 'router.onNoDeviation');
      const matrix = node.router.onDeviation || {};
      for (const [devType, target] of Object.entries(matrix)) {
        pushTargetError(target, `router.onDeviation.${devType}`);
      }
    } else {
      pushTargetError(node.next, 'next');
      pushTargetError(node.onError, 'onError');
    }
  }

  const inputDefs = Array.isArray(wf?.inputs) ? wf.inputs : [];
  const inputNames = new Set();
  for (const def of inputDefs) {
    const name = def?.name;
    if (!name || typeof name !== 'string') {
      errors.push({ code: 'input_name_missing', message: 'workflow input missing name' });
      continue;
    }

    if (inputNames.has(name)) {
      errors.push({ code: 'input_duplicate', field: name, message: `duplicate input definition: ${name}` });
    } else {
      inputNames.add(name);
    }

    const type = String(def?.type || 'string').toLowerCase();
    if (!KNOWN_INPUT_TYPES.has(type)) {
      warnings.push({ code: 'input_type_unknown', field: name, type, message: `unknown input type ${type}` });
    }
  }

  if (Array.isArray(contracts?.rules)) {
    for (const rule of contracts.rules) {
      const file = String(rule?.file || '');
      if (!file) {
        errors.push({ code: 'contract_rule_file_missing', message: 'contract rule missing file' });
        continue;
      }

      if (!outputOwners.has(file)) {
        warnings.push({
          code: 'contract_file_not_declared_output',
          file,
          message: `contract rule target ${file} is not declared in node outputs`,
        });
      }

      if (rule?.type === 'json_schema') {
        const schemaRel = String(rule?.schema || '');
        if (!schemaRel) {
          errors.push({ code: 'contract_schema_missing', file, message: `json_schema rule for ${file} missing schema` });
        } else {
          const schemaPath = path.join(packRoot, schemaRel);
          if (!(await fileExists(schemaPath))) {
            errors.push({
              code: 'contract_schema_not_found',
              file,
              schema: schemaRel,
              message: `schema not found: ${schemaRel}`,
            });
          }
        }
      }
    }
  }

  for (const node of nodes) {
    if (!node?.id || isNodeTransitionNode(node)) continue;
    const outputs = Array.isArray(node.outputs) ? node.outputs : [];
    for (const out of outputs) {
      if (!String(out).endsWith('.md')) continue;
      const base = path.basename(String(out));
      const templatePath = path.join(packRoot, 'templates', base);
      if (!(await fileExists(templatePath))) {
        warnings.push({
          code: 'template_missing',
          nodeId: node.id,
          output: out,
          message: `template missing for markdown output ${out}`,
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    packId,
    workflowPath,
    errors,
    warnings,
    summary: {
      nodeCount: nodes.length,
      roleCount: Object.keys(roleMap).length,
      inputCount: inputDefs.length,
      contractRuleCount: Array.isArray(contracts?.rules) ? contracts.rules.length : 0,
    },
  };
}

export async function runPack(packId, opts = {}) {
  if (!isSafePackId(packId)) {
    throw new Error(`invalid_pack_id:${packId}`);
  }

  const workflow = await resolveWorkflowPath(packId);
  if (!workflow) {
    throw new Error(`workflow_not_found:${packId}`);
  }

  if (opts.validate !== false) {
    const validation = await validatePack(packId);
    if (!validation.ok) {
      throw new Error(`workflow_validation_error:${JSON.stringify(validation.errors)}`);
    }
  }

  const args = ['engine/wf-runner.js', '--workflow', workflow];

  if (opts.runDir) args.push('--run-dir', String(opts.runDir));
  if (opts.resumeRunDir) args.push('--resume-run-dir', String(opts.resumeRunDir));
  if (Number.isFinite(opts.maxSteps)) args.push('--max-steps', String(opts.maxSteps));
  if (opts.dryRun) args.push('--dry-run');
  if (opts.injectDeviation) args.push('--inject-deviation', String(opts.injectDeviation));

  const hasInputs = opts.inputs && typeof opts.inputs === 'object' && !Array.isArray(opts.inputs);
  if (hasInputs) args.push('--inputs-json', JSON.stringify(opts.inputs));

  try {
    const { stdout, stderr } = await execFileP('node', args, {
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000,
    });

    return {
      ...parseRunnerOutput(stdout),
      stderr: String(stderr || ''),
    };
  } catch (e) {
    const stderr = String(e?.stderr || '');
    const stdout = String(e?.stdout || '');
    const combined = `${stdout}\n${stderr}`;

    const inputErr = combined.match(/input_validation_error:[^\n]+/);
    if (inputErr) throw new Error(inputErr[0]);

    throw e;
  }
}
