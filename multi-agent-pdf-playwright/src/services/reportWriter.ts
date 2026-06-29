/**
 * Report Writer Service
 * Generates human-readable Markdown reports and structured JSON audit files.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { AuditResult } from '../types/audit.types';
import { RequirementsDocument } from '../types/requirement.types';
import { AgentMessage } from '../types/agent.types';

export class ReportWriter {
  private readonly reportsDir = path.resolve('reports');

  constructor() {
    fs.ensureDirSync(this.reportsDir);
  }

  /**
   * Write the latest audit result as JSON.
   */
  async writeAuditResult(auditResult: AuditResult): Promise<void> {
    const filePath = path.join(this.reportsDir, 'audit-result.json');
    await fs.writeJson(filePath, auditResult, { spaces: 2 });
    console.log(chalk.blue(`[ReportWriter] Audit result saved: ${filePath}`));
  }

  /**
   * Write a Markdown audit report.
   */
  async writeAuditReport(auditResult: AuditResult): Promise<void> {
    const filePath = path.join(this.reportsDir, 'audit-report.md');
    const lines: string[] = [
      '# Audit Report',
      '',
      `**Status:** ${auditResult.status}`,
      `**Attempt:** ${auditResult.attempt}`,
      `**Audited At:** ${auditResult.auditedAt}`,
      `**Summary:** ${auditResult.summary}`,
      '',
      '## Coverage',
      '',
      `- Total Requirements: ${auditResult.coverage.totalRequirements}`,
      `- Covered: ${auditResult.coverage.coveredRequirements}`,
      `- Missing: ${auditResult.coverage.missingRequirements.join(', ') || 'None'}`,
      `- Incorrect: ${auditResult.coverage.incorrectRequirements.join(', ') || 'None'}`,
      '',
      '## Issues',
      '',
    ];

    if (auditResult.issues.length === 0) {
      lines.push('_No issues found._');
    } else {
      auditResult.issues.forEach((issue, i) => {
        lines.push(`### Issue ${i + 1}: [${issue.severity}] ${issue.type} — ${issue.requirementId}`);
        lines.push(`- **Description:** ${issue.description}`);
        lines.push(`- **Recommended Fix:** ${issue.recommendedFix}`);
        if (issue.affectedFile) lines.push(`- **Affected File:** \`${issue.affectedFile}\``);
        lines.push('');
      });
    }

    if (auditResult.playwrightRunResult) {
      const run = auditResult.playwrightRunResult;
      lines.push('## Playwright Run Result');
      lines.push('');
      lines.push(`- Passed: ${run.passed}`);
      lines.push(`- Failed: ${run.failed}`);
      lines.push(`- Skipped: ${run.skipped}`);
      if (run.errors.length > 0) {
        lines.push('- Errors:');
        run.errors.forEach((e) => lines.push(`  - ${e}`));
      }
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');
    console.log(chalk.blue(`[ReportWriter] Audit report saved: ${filePath}`));
  }

  /**
   * Write the final summary report.
   */
  async writeFinalReport(params: {
    reqDoc: RequirementsDocument;
    auditResult: AuditResult;
    generatedFiles: string[];
    agentHistory: AgentMessage[];
    attempt: number;
  }): Promise<void> {
    const { reqDoc, auditResult, generatedFiles, agentHistory, attempt } = params;

    const filePath = path.join(this.reportsDir, 'final-report.md');
    const finalStatus =
      auditResult.status === 'PASSED'
        ? 'PASSED ✅'
        : attempt >= (Number(process.env.MAX_ATTEMPTS) || 5)
        ? 'FAILED ❌'
        : 'PARTIALLY PASSED ⚠️';

    const lines: string[] = [
      '# Final Automation Report',
      '',
      `**PDF Source:** ${reqDoc.sourcePdf}`,
      `**Application URL:** ${reqDoc.appUrl}`,
      `**Generated At:** ${new Date().toISOString()}`,
      `**Final Status:** ${finalStatus}`,
      `**Total Attempts:** ${attempt}`,
      '',
      '## Requirements Summary',
      '',
      `- Total Requirements Extracted: ${reqDoc.requirements.length}`,
      `- Total Tests Generated: ${generatedFiles.length}`,
      `- Requirements Covered: ${auditResult.coverage.coveredRequirements}`,
      `- Requirements Missing: ${auditResult.coverage.missingRequirements.join(', ') || 'None'}`,
      `- Requirements With Issues: ${auditResult.coverage.incorrectRequirements.join(', ') || 'None'}`,
      '',
      '## Generated Playwright Test Files',
      '',
      ...generatedFiles.map((f) => `- \`${f}\``),
      '',
      '## Remaining Issues',
      '',
    ];

    if (auditResult.issues.length === 0) {
      lines.push('_No remaining issues._');
    } else {
      auditResult.issues.forEach((issue) => {
        lines.push(`- **[${issue.severity}] ${issue.requirementId}** — ${issue.type}: ${issue.description}`);
      });
    }

    lines.push('');
    lines.push('## Agent Communication Summary');
    lines.push('');

    agentHistory.forEach((msg) => {
      lines.push(`- **[${msg.timestamp}]** ${msg.from} → ${msg.to} (${msg.type}): ${msg.payload.slice(0, 120)}...`);
    });

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');
    console.log(chalk.green(`[ReportWriter] Final report saved: ${filePath}`));
  }
}
