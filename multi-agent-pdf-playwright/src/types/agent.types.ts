/**
 * Agent Types
 * Defines state and message structures shared across agents.
 */

import { Requirement, UiElement } from './requirement.types';
import { AuditResult } from './audit.types';

export type AgentRole = 'AgentA' | 'AgentB' | 'AgentC' | 'Orchestrator';

export interface AgentMessage {
  from: AgentRole;
  to: AgentRole;
  timestamp: string;
  type: 'info' | 'result' | 'feedback' | 'error';
  payload: string;
}

export interface GraphState {
  pdfPath: string;
  appUrl: string;
  requirements: Requirement[];
  generatedFiles: string[];
  uiElements: UiElement[];
  auditResult?: AuditResult;
  attempt: number;
  maxAttempts: number;
  agentHistory: AgentMessage[];
}

export interface PatchRequest {
  requirements: Requirement[];
  feedback: import('./audit.types').AuditIssue[];
  appUrl: string;
  uiElements: UiElement[];
}
