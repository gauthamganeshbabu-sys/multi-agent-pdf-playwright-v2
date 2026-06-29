/**
 * Workflow Graph
 * Defines the LangGraph-style state machine controlling agent execution.
 * Node transitions: extract → generate → audit → patch (loop) → finalReport
 */

import chalk from 'chalk';
import { AgentA } from '../agents/agentA.requirementExtractor';
import { AgentB } from '../agents/agentB.codeGenerator';
import { AgentC } from '../agents/agentC.auditor';
import { UiScanner } from '../services/uiScanner';
import { CodeWriter } from '../services/codeWriter';
import { ReportWriter } from '../services/reportWriter';
import { GraphState } from '../types/agent.types';
import { RequirementsDocument } from '../types/requirement.types';

// ─── Node Implementations ────────────────────────────────────────────────────

async function extractRequirementsNode(state: GraphState): Promise<GraphState> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: extractRequirementsNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const agentA = new AgentA();
  const { doc, message } = await agentA.extractRequirements(state.pdfPath, state.appUrl);

  return {
    ...state,
    requirements: doc.requirements,
    agentHistory: [...state.agentHistory, message],
  };
}

async function scanUiNode(state: GraphState): Promise<GraphState> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: scanUiNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const scanner = new UiScanner();
  const uiElements = await scanner.scan(state.appUrl);

  const codeWriter = new CodeWriter();
  await codeWriter.writeArtifact('ui-elements.json', {
    scannedUrl: state.appUrl,
    scannedAt: new Date().toISOString(),
    elements: uiElements,
  });

  return { ...state, uiElements };
}

async function generateCodeNode(state: GraphState): Promise<GraphState> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: generateCodeNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const agentB = new AgentB();
  const { generatedFiles, message } = await agentB.generateInitialScripts(
    state.requirements,
    state.appUrl,
    state.uiElements
  );

  return {
    ...state,
    generatedFiles,
    agentHistory: [...state.agentHistory, message],
  };
}

async function auditCodeNode(state: GraphState): Promise<GraphState> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: auditCodeNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const agentC = new AgentC();
  const { auditResult, message } = await agentC.audit(
    state.requirements,
    state.appUrl,
    state.uiElements,
    state.attempt
  );

  return {
    ...state,
    auditResult,
    agentHistory: [...state.agentHistory, message],
  };
}

async function patchCodeNode(state: GraphState): Promise<GraphState> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: patchCodeNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const agentB = new AgentB();
  const { patchedFiles, message } = await agentB.patchScripts({
    requirements: state.requirements,
    feedback: state.auditResult?.issues || [],
    appUrl: state.appUrl,
    uiElements: state.uiElements,
  });

  return {
    ...state,
    generatedFiles: [...new Set([...state.generatedFiles, ...patchedFiles])],
    attempt: state.attempt + 1,
    agentHistory: [...state.agentHistory, message],
  };
}

async function finalReportNode(state: GraphState): Promise<GraphState> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: finalReportNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const reportWriter = new ReportWriter();
  const reqDoc: RequirementsDocument = {
    sourcePdf: state.pdfPath,
    appUrl: state.appUrl,
    extractedAt: new Date().toISOString(),
    requirements: state.requirements,
  };

  await reportWriter.writeFinalReport({
    reqDoc,
    auditResult: state.auditResult!,
    generatedFiles: state.generatedFiles,
    agentHistory: state.agentHistory,
    attempt: state.attempt,
  });

  return state;
}

// ─── Condition: should we patch or finalize? ─────────────────────────────────

function shouldPatch(state: GraphState): 'patch' | 'finalReport' {
  if (!state.auditResult) return 'finalReport';
  if (!state.auditResult.requiresFix) return 'finalReport';
  if (state.attempt >= state.maxAttempts) {
    console.log(chalk.yellow(`[Graph] Max attempts (${state.maxAttempts}) reached. Moving to final report.`));
    return 'finalReport';
  }
  return 'patch';
}

// ─── Graph Runner ─────────────────────────────────────────────────────────────

export async function runWorkflow(pdfPath: string, appUrl: string): Promise<GraphState> {
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || '5', 10);

  let state: GraphState = {
    pdfPath,
    appUrl,
    requirements: [],
    generatedFiles: [],
    uiElements: [],
    auditResult: undefined,
    attempt: 1,
    maxAttempts,
    agentHistory: [],
  };

  // ── Step 1: Extract requirements
  state = await extractRequirementsNode(state);

  // ── Step 2: Scan UI
  state = await scanUiNode(state);

  // ── Step 3: Generate initial scripts
  state = await generateCodeNode(state);

  // ── Step 4: Audit → Patch loop (max attempts)
  while (true) {
    state = await auditCodeNode(state);

    const decision = shouldPatch(state);

    if (decision === 'finalReport') {
      break;
    }

    state = await patchCodeNode(state);
  }

  // ── Step 5: Final report
  state = await finalReportNode(state);

  return state;
}
