/**
 * Agent C: Audit and Validation Agent
 * Validates generated Playwright scripts against requirements and real UI elements.
 */

import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs-extra';
import { LLMClient } from '../services/llmClient';
import { CodeWriter } from '../services/codeWriter';
import { ReportWriter } from '../services/reportWriter';
import { Requirement, UiElement } from '../types/requirement.types';
import { AuditResult, AuditIssue, AuditCoverage, PlaywrightRunResult } from '../types/audit.types';
import { AgentMessage } from '../types/agent.types';
import { execSync } from 'child_process';

export class AgentC {
  private llm: LLMClient;
  private codeWriter: CodeWriter;
  private reportWriter: ReportWriter;

  constructor() {
    this.llm = new LLMClient();
    this.codeWriter = new CodeWriter();
    this.reportWriter = new ReportWriter();
  }

  /**
   * Audit all generated Playwright scripts against the requirements and UI elements.
   */
  async audit(
    requirements: Requirement[],
    appUrl: string,
    uiElements: UiElement[],
    attempt: number
  ): Promise<{ auditResult: AuditResult; message: AgentMessage }> {
    console.log(chalk.cyan(`\n[Agent C] Starting audit (attempt ${attempt})...`));

    const generatedFiles = await this.codeWriter.listGeneratedSpecs();
    const issues: AuditIssue[] = [];

    // --- Check 1: Missing scripts ---
    const generatedIds = generatedFiles.map((f) => path.basename(f, '.spec.ts'));
    const requiredIds = requirements.map((r) => r.id);
    const missingIds = requiredIds.filter((id) => !generatedIds.includes(id));

    missingIds.forEach((id) => {
      issues.push({
        requirementId: id,
        severity: 'High',
        type: 'Missing Script',
        description: `No Playwright spec file found for requirement ${id}.`,
        recommendedFix: `Generate a new spec file for ${id}.`,
      });
    });

    // --- Check 2: Per-file deep audit ---
    for (const filePath of generatedFiles) {
      const reqId = path.basename(filePath, '.spec.ts');
      const req = requirements.find((r) => r.id === reqId);
      const content = await fs.readFile(filePath, 'utf8');

      const fileIssues = await this.auditSpecFile(reqId, content, req, uiElements, appUrl);
      issues.push(...fileIssues);
    }

    // --- Check 3: Run Playwright tests ---
    // --- Check 3: Run Playwright tests ---
const playwrightRunResult = await this.runPlaywrightTests();

if (playwrightRunResult.failed > 0) {

  const failedIds = [
    ...new Set(
      playwrightRunResult.errors
        .join('\n')
        .match(/REQ-\d+/g) || []
    )
  ];

  failedIds.forEach((id) => {
    issues.push({
      requirementId: id,
      severity: 'High',
      type: 'Weak Coverage',
      description: `${id} failed during Playwright execution.`,
      recommendedFix: 'Regenerate or patch Playwright actions for this requirement.',
    });
  });
}

    // --- Build coverage ---
    const coveredIds = requiredIds.filter((id) => generatedIds.includes(id));
    const incorrectIds = [...new Set(issues.map((i) => i.requirementId))].filter(
      (id) => !missingIds.includes(id)
    );

    const coverage: AuditCoverage = {
      totalRequirements: requirements.length,
      coveredRequirements: coveredIds.length - incorrectIds.length,
      missingRequirements: missingIds,
      incorrectRequirements: incorrectIds,
    };

    const requiresFix = issues.filter((i) => i.severity === 'High').length > 0;
    const status = requiresFix ? 'FAILED' : 'PASSED';

    const auditResult: AuditResult = {
      status,
      attempt,
      summary: `${coverage.coveredRequirements} requirements passed, ${issues.length} issue(s) found.`,
      coverage,
      issues,
      requiresFix,
      playwrightRunResult,
      auditedAt: new Date().toISOString(),
    };

    await this.reportWriter.writeAuditResult(auditResult);
    await this.reportWriter.writeAuditReport(auditResult);

    const statusLabel = status === 'PASSED' ? chalk.green('PASSED') : chalk.red('FAILED');
    console.log(chalk.cyan(`[Agent C] Audit result: ${statusLabel} | Issues: ${issues.length}`));

    const message: AgentMessage = {
      from: 'AgentC',
      to: requiresFix ? 'AgentB' : 'Orchestrator',
      timestamp: new Date().toISOString(),
      type: requiresFix ? 'feedback' : 'result',
      payload: `Audit ${status} on attempt ${attempt}. ${issues.length} issue(s). ${
        requiresFix ? `Sending ${issues.length} fix request(s) to Agent B.` : 'All checks passed.'
      }`,
    };

    return { auditResult, message };
  }

  /**
   * Deep-audit a single spec file for issues using static analysis + optional LLM review.
   */
  private async auditSpecFile(
    reqId: string,
    content: string,
    req: Requirement | undefined,
    uiElements: UiElement[],
    appUrl: string
  ): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const filePath = `tests/generated/${reqId}.spec.ts`;

    // Check: Missing imports
    if (!content.includes("from '@playwright/test'")) {
      issues.push({
        requirementId: reqId,
        severity: 'High',
        type: 'Missing Import',
        description: `Missing Playwright test import in ${reqId}.spec.ts`,
        recommendedFix: `Add: import { test, expect } from '@playwright/test';`,
        affectedFile: filePath,
      });
    }

    // Check: Hardcoded waits
    if (content.includes('waitForTimeout')) {
      issues.push({
        requirementId: reqId,
        severity: 'Medium',
        type: 'Hardcoded Wait',
        description: `waitForTimeout detected in ${reqId}.spec.ts — use Playwright auto-waiting instead.`,
        recommendedFix: `Replace waitForTimeout with appropriate expect() assertion or waitForSelector.`,
        affectedFile: filePath,
      });
    }

    // Check: Missing assertions
    if (!content.includes('expect(')) {
      issues.push({
        requirementId: reqId,
        severity: 'High',
        type: 'Missing Assertion',
        description: `No assertions found in ${reqId}.spec.ts`,
        recommendedFix: `Add at least one expect() assertion to verify the expected result.`,
        affectedFile: filePath,
      });
    }

    // Check: Traceability (req ID appears in file)
    if (!content.includes(reqId)) {
      issues.push({
        requirementId: reqId,
        severity: 'Low',
        type: 'No Traceability',
        description: `Requirement ID ${reqId} not found in spec file content.`,
        recommendedFix: `Add ${reqId} to the test.describe name.`,
        affectedFile: filePath,
      });
    }

    // Check: APP_URL usage
    if (!content.includes('APP_URL') && !content.includes('process.env')) {
      issues.push({
        requirementId: reqId,
        severity: 'Medium',
        type: 'Hallucinated Flow',
        description: `${reqId}.spec.ts uses a hardcoded URL instead of process.env.APP_URL.`,
        recommendedFix: `Replace hardcoded URL with process.env.APP_URL.`,
        affectedFile: filePath,
      });
    }

    // Check: Locator validation against real UI elements
    if (uiElements.length > 0) {
      const locatorIssues = this.validateLocators(content, reqId, uiElements, filePath);
      issues.push(...locatorIssues);
    }

    // LLM-based audit (if API key is available)
    const llmIssues = await this.llmAudit(reqId, content, req, appUrl);
    issues.push(...llmIssues);

    return issues;
  }

  /**
   * Compare locators in the spec against scanned UI elements.
   */
  private validateLocators(
    content: string,
    reqId: string,
    uiElements: UiElement[],
    filePath: string
  ): AuditIssue[] {
    const issues: AuditIssue[] = [];

    // Extract all getByText/getByRole calls from content
    const getByTextMatches = content.match(/getByText\(['"]([^'"]+)['"]\)/g) || [];
    const getByRoleMatches = content.match(/getByRole\(['"]([^'"]+)['"][^)]*name:\s*['"]([^'"]+)['"]/g) || [];

    const availableTexts = uiElements
      .map((el) => el.text?.toLowerCase())
      .filter(Boolean) as string[];

    for (const match of getByTextMatches) {
      const textMatch = match.match(/getByText\(['"]([^'"]+)['"]\)/);
      if (textMatch) {
        const text = textMatch[1].toLowerCase();
        if (!availableTexts.some((t) => t.includes(text))) {
          issues.push({
            requirementId: reqId,
            severity: 'High',
            type: 'Locator Mismatch',
            description: `Locator getByText('${textMatch[1]}') was not found on the scanned page.`,
            recommendedFix: `Check ui-elements.json for available text and update the locator.`,
            affectedFile: filePath,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Optional LLM-based audit of a spec file.
   */
  private async llmAudit(
    reqId: string,
    content: string,
    req: Requirement | undefined,
    _appUrl: string
  ): Promise<AuditIssue[]> {
    if (!req) return [];

    const systemPrompt = `You are a Playwright test code reviewer.
Audit the given spec file and return a JSON array of issues.
Each issue: { "type": string, "severity": "High"|"Medium"|"Low", "description": string, "recommendedFix": string }
Return ONLY valid JSON array. No markdown. Return [] if no issues.`;

    const userPrompt = `Requirement: ${req.title} — ${req.description}
Expected Result: ${req.expectedResult}

Spec File:
${content}`;

    const mockResponse = '[]';
    const response = await this.llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      mockResponse
    );

    try {
      const cleaned = response.text.replace(/```json|```/g, '').trim();
      const parsed: Array<{ type: string; severity: string; description: string; recommendedFix: string }> = JSON.parse(cleaned);
      return parsed.map((item) => ({
        requirementId: reqId,
        severity: (item.severity as AuditIssue['severity']) || 'Medium',
        type: (item.type as AuditIssue['type']) || 'Missing Assertion',
        description: item.description,
        recommendedFix: item.recommendedFix,
        affectedFile: `tests/generated/${reqId}.spec.ts`,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Run the generated Playwright tests and capture results.
   */
 private async runPlaywrightTests(): Promise<PlaywrightRunResult> {
  console.log(chalk.blue('[Agent C] Running Playwright tests...'));

  try {
    const output = execSync('npx playwright test tests/generated --reporter=json 2>&1', {
      encoding: 'utf8',
      timeout: 60000,
      stdio: 'pipe',
    });

    const jsonMatch = output.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);

      const failedReqIds = new Set<string>();

      for (const suite of result.suites || []) {
        const json = JSON.stringify(suite);

        if (json.includes('"status":"unexpected"')) {
          const matches = json.match(/REQ-\d+/g) || [];
          matches.forEach((id) => failedReqIds.add(id));
        }
      }

      return {
        passed: result.stats?.expected || 0,
        failed: result.stats?.unexpected || 0,
        skipped: result.stats?.skipped || 0,
        errors: [...failedReqIds],
      };
    }

    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: ['Unable to parse Playwright JSON output.'],
    };

  } catch (err) {

    const error = err as { stdout?: string; stderr?: string; message: string };
    const output = (error.stdout || error.stderr || error.message || '').toString();

    const jsonMatch = output.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);

        const failedReqIds = new Set<string>();

        for (const suite of result.suites || []) {
          const json = JSON.stringify(suite);

          if (json.includes('"status":"unexpected"')) {
            const matches = json.match(/REQ-\d+/g) || [];
            matches.forEach((id) => failedReqIds.add(id));
          }
        }

        return {
          passed: result.stats?.expected || 0,
          failed: result.stats?.unexpected || 0,
          skipped: result.stats?.skipped || 0,
          errors: [...failedReqIds],
        };

      } catch {
        // ignore JSON parsing failure
      }
    }

    console.warn(chalk.yellow(`[Agent C] Playwright run warning: ${error.message}`));

    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [output.slice(0, 200)],
    };
  }
}
}