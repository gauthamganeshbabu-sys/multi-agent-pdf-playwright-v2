/**
 * Workflow Graph
 * LangGraph-based state machine controlling agent execution.
 * Node transitions: extract → generate → audit → patch (loop) → finalReport
 */

import chalk from 'chalk';

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { GraphState, AgentMessage } from "../types/agent.types";

import { AgentA } from '../agents/agentA.requirementExtractor';
import { AgentB } from '../agents/agentB.codeGenerator';
import { AgentC } from '../agents/agentC.auditor';
import { UiScanner } from '../services/uiScanner';
import { CodeWriter } from '../services/codeWriter';
import { ReportWriter } from '../services/reportWriter';
import { Requirement, UiElement } from '../types/requirement.types';
import { RequirementsDocument } from '../types/requirement.types';
import { AuditResult } from '../types/audit.types';

const WorkflowStateAnnotation = Annotation.Root({
  pdfPath: Annotation<string>(),
  appUrl: Annotation<string>(),
  requirements: Annotation<Requirement[]>(),
  generatedFiles: Annotation<string[]>(),
  uiElements: Annotation<UiElement[]>(),
  auditResult: Annotation<AuditResult | undefined>(),
  attempt: Annotation<number>(),
  maxAttempts: Annotation<number>(),
  agentHistory: Annotation<AgentMessage[]>(),
  messages: Annotation<any[]>(),
  logs: Annotation<string[]>(),
  errors: Annotation<string[]>(),
});

type WorkflowState = typeof WorkflowStateAnnotation.State;

// ─── Node Implementations ────────────────────────────────────────────────────

async function extractRequirementsNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log(chalk.magenta('\n══════════════════════════════════════'));
  console.log(chalk.magenta(' NODE: extractRequirementsNode'));
  console.log(chalk.magenta('══════════════════════════════════════'));

  const agentA = new AgentA();
  const { doc, message } = await agentA.extractRequirements(state.pdfPath, state.appUrl);

  return {
    requirements: doc.requirements,
    agentHistory: [...state.agentHistory, message],
  };
}

async function scanUiNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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

  return { uiElements };
}

async function generateCodeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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
    generatedFiles,
    agentHistory: [...state.agentHistory, message],
  };
}

async function auditCodeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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
    auditResult,
    agentHistory: [...state.agentHistory, message],
  };
}

async function patchCodeNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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
    generatedFiles: [...new Set([...state.generatedFiles, ...patchedFiles])],
    attempt: state.attempt + 1,
    agentHistory: [...state.agentHistory, message],
  };
}

async function finalReportNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
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

  return {};
}

// ─── Condition: should we patch or finalize? ─────────────────────────────────

function shouldPatch(state: WorkflowState): "patch" | "finalize" {
  if (!state.auditResult) return "finalize";
  if (!state.auditResult.requiresFix) return "finalize";
  if (state.attempt >= state.maxAttempts) {
    console.log(chalk.yellow(`[Graph] Max attempts (${state.maxAttempts}) reached. Moving to final report.`));
    return "finalize";
  }
  return "patch";
}

// ─── Graph Build ─────────────────────────────────────────────────────────────

const workflow = new StateGraph(WorkflowStateAnnotation)
  .addNode("extractRequirements", extractRequirementsNode)
  .addNode("scanUi", scanUiNode)
  .addNode("generateCode", generateCodeNode)
  .addNode("auditCode", auditCodeNode)
  .addNode("patchCode", patchCodeNode)
  .addNode("finalReport", finalReportNode)
  .addEdge(START, "extractRequirements")
  .addEdge("extractRequirements", "scanUi")
  .addEdge("scanUi", "generateCode")
  .addEdge("generateCode", "auditCode")
  .addConditionalEdges("auditCode", shouldPatch, {
    "patch": "patchCode",
    "finalize": "finalReport",
  })
  .addEdge("patchCode", "auditCode")
  .addEdge("finalReport", END);

const graph = workflow.compile();

// ─── Graph Runner ─────────────────────────────────────────────────────────────

export async function runWorkflow(pdfPath: string, appUrl: string): Promise<GraphState> {
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || '5', 10);

  const initialState: WorkflowState = {
    pdfPath,
    appUrl,
    requirements: [],
    generatedFiles: [],
    uiElements: [],
    auditResult: undefined,
    attempt: 1,
    maxAttempts,
    agentHistory: [],
    messages: [],
    logs: [],
    errors: [],
  };

  const result = await graph.invoke(initialState);
  return result as GraphState;
}
