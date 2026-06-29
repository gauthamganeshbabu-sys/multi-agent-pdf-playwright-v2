/**
 * Orchestrator
 * Controls the full multi-agent execution loop.
 * Accepts PDF path and app URL, delegates to the workflow graph,
 * and prints the final summary to the console.
 */

import chalk from 'chalk';
import * as path from 'path';
import { runWorkflow } from './graph/workflow.graph'; 

export async function runOrchestrator(pdfPath: string, appUrl: string): Promise<void> {
  console.log(chalk.bold.blue('\n╔══════════════════════════════════════════════════╗'));
  console.log(chalk.bold.blue('║  Multi-Agent PDF → Playwright Automation System  ║'));
  console.log(chalk.bold.blue('╚══════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`PDF:  ${path.resolve(pdfPath)}`));
  console.log(chalk.gray(`URL:  ${appUrl}`));
  console.log(chalk.gray(`Time: ${new Date().toISOString()}\n`));

  const startTime = Date.now();

  try {
    const finalState = await runWorkflow(pdfPath, appUrl);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const auditStatus = finalState.auditResult?.status;

    console.log(chalk.bold('\n══════════════════════════════════════'));
    console.log(chalk.bold(' ORCHESTRATOR SUMMARY'));
    console.log(chalk.bold('══════════════════════════════════════'));
    console.log(`Requirements extracted : ${finalState.requirements.length}`);
    console.log(`Spec files generated   : ${finalState.generatedFiles.length}`);
    console.log(`Audit attempts         : ${finalState.attempt}`);
    console.log(`Final audit status     : ${
      auditStatus === 'PASSED'
        ? chalk.green('PASSED ✅')
        : chalk.red('FAILED ❌')
    }`);
    console.log(`Time elapsed           : ${elapsed}s`);
    console.log('');
    console.log(chalk.bold('Output Files:'));
    console.log(`  📄 artifacts/requirements.json`);
    console.log(`  📄 artifacts/ui-elements.json`);
    console.log(`  📄 artifacts/agent-history.json`);
    console.log(`  📄 reports/audit-result.json`);
    console.log(`  📄 reports/audit-report.md`);
    console.log(`  📄 reports/final-report.md`);
    console.log(`  📁 tests/generated/ (${finalState.generatedFiles.length} spec files)`);
    console.log('');
    console.log(chalk.cyan('Run generated tests: npx playwright test tests/generated'));
    console.log(chalk.cyan('View HTML report:    npx playwright show-report reports/playwright-html'));

    if (auditStatus !== 'PASSED') {
      console.log(chalk.yellow('\n⚠️  Some requirements still have issues. Check reports/audit-report.md for details.'));
    }
  } catch (err) {
    console.error(chalk.red(`\n[Orchestrator] Fatal error: ${(err as Error).message}`));
    console.error((err as Error).stack);
    process.exit(1);
  }
}
