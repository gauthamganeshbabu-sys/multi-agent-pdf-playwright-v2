/**
 * Audit Types
 * Defines the data structures for Agent C audit results and reports.
 */

export type IssueType =
  | 'Missing Script'
  | 'Locator Mismatch'
  | 'Hallucinated Flow'
  | 'Missing Assertion'
  | 'Weak Coverage'
  | 'Hardcoded Wait'
  | 'Missing Import'
  | 'Duplicate Test'
  | 'No Traceability'
  | 'Syntax Error'
  | 'Missing Edge Case'
  | 'Missing Negative Scenario';

export type IssueSeverity = 'High' | 'Medium' | 'Low';

export interface AuditIssue {
  requirementId: string;
  severity: IssueSeverity;
  type: IssueType;
  description: string;
  recommendedFix: string;
  affectedFile?: string;
}

export interface AuditCoverage {
  totalRequirements: number;
  coveredRequirements: number;
  missingRequirements: string[];
  incorrectRequirements: string[];
}

export interface AuditResult {
  status: 'PASSED' | 'FAILED';
  attempt: number;
  summary: string;
  coverage: AuditCoverage;
  issues: AuditIssue[];
  requiresFix: boolean;
  playwrightRunResult?: PlaywrightRunResult;
  auditedAt: string;
}

export interface PlaywrightRunResult {
  passed: number;
  failed: number;
  skipped: number;
  errors: string[];
}
