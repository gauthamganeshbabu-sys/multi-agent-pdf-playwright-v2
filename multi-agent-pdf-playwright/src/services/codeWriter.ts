/**
 * Code Writer Service
 * Handles writing generated Playwright test files and page objects to disk.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

export class CodeWriter {
  private readonly generatedDir = path.resolve('tests/generated');
  private readonly pagesDir = path.resolve('pages');
  private readonly utilsDir = path.resolve('utils');
  private readonly artifactsDir = path.resolve('artifacts');

  constructor() {
    fs.ensureDirSync(this.generatedDir);
    fs.ensureDirSync(this.pagesDir);
    fs.ensureDirSync(this.utilsDir);
    fs.ensureDirSync(this.artifactsDir);
  }

  /**
   * Write a Playwright spec file to tests/generated/<reqId>.spec.ts
   */
  async writeSpecFile(reqId: string, content: string): Promise<string> {
    const filePath = path.join(this.generatedDir, `${reqId}.spec.ts`);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(chalk.green(`[CodeWriter] Wrote spec: ${filePath}`));
    return filePath;
  }

  /**
   * Write a page object to pages/<name>.ts
   */
  async writePageObject(name: string, content: string): Promise<string> {
    const filePath = path.join(this.pagesDir, `${name}.ts`);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(chalk.green(`[CodeWriter] Wrote page object: ${filePath}`));
    return filePath;
  }

  /**
   * Write a utility file to utils/<name>.ts
   */
  async writeUtil(name: string, content: string): Promise<string> {
    const filePath = path.join(this.utilsDir, `${name}.ts`);
    await fs.writeFile(filePath, content, 'utf8');
    console.log(chalk.green(`[CodeWriter] Wrote util: ${filePath}`));
    return filePath;
  }

  /**
   * Write a JSON artifact file.
   */
  async writeArtifact(filename: string, data: unknown): Promise<string> {
    const filePath = path.join(this.artifactsDir, filename);
    await fs.writeJson(filePath, data, { spaces: 2 });
    console.log(chalk.blue(`[CodeWriter] Wrote artifact: ${filePath}`));
    return filePath;
  }

  /**
   * Read an existing spec file content (for patch mode).
   */
  async readSpecFile(reqId: string): Promise<string | null> {
    const filePath = path.join(this.generatedDir, `${reqId}.spec.ts`);
    if (await fs.pathExists(filePath)) {
      return fs.readFile(filePath, 'utf8');
    }
    return null;
  }

  /**
   * List all generated spec file paths.
   */
  async listGeneratedSpecs(): Promise<string[]> {
    const files = await fs.readdir(this.generatedDir);
    return files
      .filter((f) => f.endsWith('.spec.ts'))
      .map((f) => path.join(this.generatedDir, f));
  }
}
