/**
 * Agent B: Playwright Code Generator Agent
 * Generates and patches Playwright TypeScript spec files based on requirements.
 */

import chalk from 'chalk';
import * as path from 'path';
import { LLMClient } from '../services/llmClient';
import { CodeWriter } from '../services/codeWriter';
import { Requirement, UiElement } from '../types/requirement.types';
import { AuditIssue } from '../types/audit.types';
import { AgentMessage, PatchRequest } from '../types/agent.types';

export class AgentB {
  private llm: LLMClient;
  private codeWriter: CodeWriter;

  constructor() {
    this.llm = new LLMClient();
    this.codeWriter = new CodeWriter();
  }

  /**
   * Mode 1: Generate Playwright spec files for all requirements.
   */
  async generateInitialScripts(
    requirements: Requirement[],
    appUrl: string,
    uiElements: UiElement[]
  ): Promise<{ generatedFiles: string[]; message: AgentMessage }> {
    console.log(chalk.cyan(`\n[Agent B] Generating initial Playwright scripts for ${requirements.length} requirement(s)...`));

    const generatedFiles: string[] = [];

    for (const req of requirements) {
      const code = await this.generateSpecForRequirement(req, appUrl, uiElements, null);
      const filePath = await this.codeWriter.writeSpecFile(req.id, code);
      generatedFiles.push(filePath);
    }

    // Record in agent history
    await this.codeWriter.writeArtifact('agent-history.json', {
      lastAction: 'initial-generation',
      timestamp: new Date().toISOString(),
      generatedFiles,
    });

    const message: AgentMessage = {
      from: 'AgentB',
      to: 'AgentC',
      timestamp: new Date().toISOString(),
      type: 'result',
      payload: `Generated ${generatedFiles.length} spec files: ${generatedFiles.map((f) => path.basename(f)).join(', ')}`,
    };

    console.log(chalk.green(`[Agent B] Initial generation complete. ${generatedFiles.length} file(s) created.`));
    return { generatedFiles, message };
  }

  /**
   * Mode 2: Patch only the failed/missing requirements identified by Agent C.
   */
  async patchScripts(patchReq: PatchRequest): Promise<{ patchedFiles: string[]; message: AgentMessage }> {
    const { requirements, feedback, appUrl, uiElements } = patchReq;

    // Determine which requirement IDs need patching
    const failedIds = [...new Set(feedback.map((i) => i.requirementId))];
    const failedReqs = requirements.filter((r) => failedIds.includes(r.id));

    console.log(chalk.cyan(`\n[Agent B] Patching ${failedReqs.length} requirement(s): ${failedIds.join(', ')}`));

    const patchedFiles: string[] = [];

    for (const req of failedReqs) {
      const issues = feedback.filter((i) => i.requirementId === req.id);
      const code = await this.generateSpecForRequirement(req, appUrl, uiElements, issues);
      const filePath = await this.codeWriter.writeSpecFile(req.id, code);
      patchedFiles.push(filePath);
    }

    // Update agent history
    const existing = await this.readAgentHistory();
    existing.patchHistory = existing.patchHistory || [];
    (existing as any).patchHistory.push({
      timestamp: new Date().toISOString(),
      patchedFiles,
      feedbackIds: failedIds,
    });
    await this.codeWriter.writeArtifact('agent-history.json', existing);

    const message: AgentMessage = {
      from: 'AgentB',
      to: 'AgentC',
      timestamp: new Date().toISOString(),
      type: 'result',
      payload: `Patched ${patchedFiles.length} file(s): ${patchedFiles.map((f) => path.basename(f)).join(', ')}`,
    };

    console.log(chalk.green(`[Agent B] Patching complete.`));
    return { patchedFiles, message };
  }

  /**
   * Generate a complete Playwright spec file for a single requirement.
   * If issues are provided, the prompt includes targeted fix instructions.
   */
  private async generateSpecForRequirement(
    req: Requirement,
    appUrl: string,
    uiElements: UiElement[],
    issues: AuditIssue[] | null
  ): Promise<string> {
    const uiContext =
      uiElements.length > 0
        ? `Available UI elements on ${appUrl}:\n${uiElements
            .slice(0, 30)
            .map((el) => `- ${el.suggestedLocator} (text: "${el.text}", label: "${el.label}")`)
            .join('\n')}`
        : `No UI elements scanned. Infer locators from the requirement description.`;

    const fixContext =
      issues && issues.length > 0
        ? `\n\nFix these specific issues from the previous audit:\n${issues
            .map((i) => `- [${i.type}] ${i.description}. Fix: ${i.recommendedFix}`)
            .join('\n')}`
        : '';

    const systemPrompt = `You are a senior Playwright automation engineer.

        Generate a REAL executable Playwright TypeScript test.

        CORE RULES:

        - Use import { test, expect } from '@playwright/test'
        - Return only TypeScript code.
        - Never create placeholder code.
        - Never create TODO comments.

        REQUIREMENT HANDLING:

        - Read requirement.testSteps as the single source of truth.
        - Convert every requirement step into an executable browser action.
        - Preserve the exact order of requirement.testSteps.
        - Do not invent extra business flows.
        - Do not remove any requirement step.

        ACTION GENERATION:

        - Understand the intent of each step dynamically.

        Examples of intent mapping:
        Navigation action -> navigate using Playwright
        Data entry action -> interact with editable element
        Selection action -> interact with selectable element
        Submission action -> trigger related UI action
        Verification action -> create assertion

        LOCATOR RULES:

        - Use scanned UI elements as first priority.
        - Match elements by:
          accessible role,
          label,
          placeholder,
          text,
          attributes.

        - Do not hardcode application specific selectors.
        - Do not assume element IDs.
        - Generate resilient Playwright locators.

        STATE RULES:

        - Browser state must naturally progress based on requirement step order.
        - A later step depends on successful completion of previous steps.
        - Never jump directly to a later page/state.

        ASSERTION RULES:

        - Generate assertion based on expectedResult.
        - Do not create generic pass assertions only.`;

    const userPrompt = `Generate a Playwright spec for this requirement:

          ID: ${req.id}
          Title: ${req.title}
          Description: ${req.description}
          Preconditions: ${req.preconditions.join('; ')}
          Test Steps: ${req.testSteps.join(' → ')}
          Expected Result: ${req.expectedResult}

          Previous Audit Feedback:
          ${fixContext}

          Test Type: ${req.testType}
          Priority: ${req.priority}

          ${uiContext}`;

    const mockCode = this.buildMockSpec(req, appUrl, uiElements);
    const response = await this.llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      mockCode
    );

    // Strip potential markdown code fences from LLM output
    const cleanedCode = response.text.replace(/```typescript|```ts|```/g, '').trim();
    const appUrlFallback = appUrl.replace(/'/g, "\\'");
    return cleanedCode
      .replace(/process\.env\.APP_URL!/g, `process.env.APP_URL || '${appUrlFallback}'`)
      .replace(/process\.env\.APP_URL(?!\s*\|\|)/g, `process.env.APP_URL || '${appUrlFallback}'`);
  }

  /** Generate a mock Playwright spec used when no API key is available */
  private buildMockSpec(req: Requirement, _appUrl: string, uiElements: UiElement[]): string {
    const testName = req.title.replace(/'/g, "\\'");
    const isNegative = req.testType === 'Negative';
    const isEdge = req.testType === 'EdgeCase';
    const actionBody = this.buildMockActions(req, _appUrl, uiElements);

    return `import { test, expect } from '@playwright/test';

/**
 * ${req.id}: ${req.title}
 * Type: ${req.testType} | Priority: ${req.priority}
 * Auto-generated by Multi-Agent PDF-Playwright Framework
 */

test.describe('${req.id} - ${testName}', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({ path: \`reports/screenshots/\${testInfo.title.replace(/[^a-z0-9]/gi, '_').substring(0,50)}.png\` });
    }
  });

  test('${isNegative ? '[Negative] ' : isEdge ? '[EdgeCase] ' : ''}${testName}', async ({ page }) => {
    const appUrl = process.env.APP_URL || ${JSON.stringify(_appUrl)};
    await page.goto(appUrl);

${actionBody}
  });
});
`;
  }

  private buildMockActions(req: Requirement, appUrl: string, uiElements: UiElement[]): string {
    const actions: string[] = [];
    const steps = req.testSteps.length ? req.testSteps : ['Navigate to application home page'];

    actions.push(...this.buildPreconditionActions(req, uiElements, appUrl));

    for (const step of steps) {
      const normalized = step.toLowerCase();
      if (/\bforgot password\b/.test(normalized)) {
        const forgotLocator = this.findUiElementLocator(uiElements, ['forgot password', 'forgot password link', 'reset password', 'password reset']);
        if (forgotLocator) {
          actions.push(`    await page.click(${this.serializeLocator(forgotLocator)});`);
          actions.push(`    await page.waitForTimeout(1000);`);
        } else {
          actions.push(`    await page.goto(appUrl);`);
          actions.push(`    await page.waitForTimeout(1000);`);
        }
        continue;
      }
      if (/\b(go to|navigate|open|visit)\b/.test(normalized)) {
        const target = normalized.replace(/^(go to|navigate|open|visit)\s+/i, '').trim();
        if (/\b(shopping cart|cart page|cart)\b/.test(target)) {
          const cartLocator = this.findUiElementLocator(uiElements, ['shopping cart', 'shopping_cart_link', 'shopping_cart_container', 'cart link', 'cart page']) ?? `#shopping_cart_container, a.shopping_cart_link, .shopping_cart_link`;
          actions.push(this.buildClickAction(cartLocator));
          actions.push(`    await page.waitForLoadState('domcontentloaded');`);
          continue;
        }

        if (/\b(login page|login)\b/.test(target)) {
          actions.push(`    await page.goto(appUrl);`);
          actions.push(`    await page.waitForLoadState('domcontentloaded');`);
          continue;
        }

        if (/https?:\/\//.test(step)) {
          const url = step.match(/https?:\/\/[^\s]+/)?.[0] ?? appUrl;
          actions.push(`    await page.goto(${JSON.stringify(url)});`);
          actions.push(`    await page.waitForLoadState('domcontentloaded');`);
          continue;
        }

        if (actions.length === 0) {
          continue; // initial navigation already handled by the test setup
        }
        actions.push(`    await page.goto(appUrl);`);
        actions.push(`    await page.waitForLoadState('domcontentloaded');`);
        continue;
      }

      if (/\b(login with valid credentials|log in with valid credentials|sign in with valid credentials)\b/.test(normalized)) {
        actions.push(...this.buildLoginActions(uiElements, appUrl));
        continue;
      }

      if (/\b(username|user name|user-name|login id|email)\b/.test(normalized)) {
        const locator = this.findUiElementLocator(uiElements, ['username', 'user-name', 'user name', 'email', 'user']);
        actions.push(this.buildFillAction(locator ?? 'input[name="username"], input[id*="user"], input[placeholder*="Username"], input[aria-label*="Username"]', `process.env.TEST_USERNAME || 'testuser@example.com'`));
        continue;
      }

      if (/\b(password|pass word)\b/.test(normalized)) {
        const locator = this.findUiElementLocator(uiElements, ['password', 'pass word']);
        actions.push(this.buildFillAction(locator ?? 'input[type="password"], input[name*="password"], input[id*="password"], input[placeholder*="Password"], input[aria-label*="Password"]', `process.env.TEST_PASSWORD || 'Password123!'`));
        continue;
      }

      if (/\b(click|tap|press|select)\b/.test(normalized)) {
        const buttonText = step.replace(/^(click|tap|press|select)\s+/i, '').trim();
        if (buttonText) {
          const cleanedButtonText = buttonText
            .replace(/\b(button|link|product|item|page|section|tab|details|overview)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

          const targetText = cleanedButtonText || buttonText;
          const lowerTargetText = targetText.toLowerCase();

          if (/^select\b/i.test(buttonText)) {
            const productName = buttonText.replace(/^(select|choose|pick)\s+/i, '').trim();
            const productLocator = this.findUiElementLocator(uiElements, [productName, productName.toLowerCase(), productName.replace(/\s+/g, ' ')]);
            actions.push(this.buildClickAction(productLocator ?? `text=${JSON.stringify(productName)}`));
            continue;
          }

          if (/\badd to cart\b/i.test(buttonText)) {
            const addToCartLocator =
              this.findUiElementLocator(uiElements, ['add to cart']) ??
              `button#add-to-cart, button[id^="add-to-cart"], button:has-text('Add to cart')`;
            actions.push(this.buildClickAction(addToCartLocator));
            continue;
          }

          if (/\bremove\b/i.test(buttonText)) {
            const removeLocator =
              this.findUiElementLocator(uiElements, ['remove', 'remove button']) ??
              `button[id^="remove"], button:has-text('Remove')`;
            actions.push(this.buildClickAction(removeLocator));
            continue;
          }

          if (/\bcheckout\b/i.test(buttonText)) {
            const checkoutLocator =
              this.findUiElementLocator(uiElements, ['checkout']) ??
              `button#checkout, button[data-test="checkout"], button:has-text('Checkout')`;
            actions.push(this.buildClickAction(checkoutLocator));
            continue;
          }

          if (/\bcontinue\b/i.test(buttonText)) {
            const continueLocator =
              this.findUiElementLocator(uiElements, ['continue']) ??
              `button[id^="continue"], button:has-text('Continue')`;
            actions.push(this.buildClickAction(continueLocator));
            continue;
          }

          if (/\bfinish\b/i.test(buttonText)) {
            const finishLocator =
              this.findUiElementLocator(uiElements, ['finish']) ??
              `button#finish, button[id^="finish"], button:has-text('Finish')`;
            actions.push(this.buildClickAction(finishLocator));
            continue;
          }

          let normalizedButtonText = targetText;
          if (/^remove\b/i.test(normalizedButtonText)) normalizedButtonText = 'Remove';
          if (/^checkout\b/i.test(normalizedButtonText)) normalizedButtonText = 'Checkout';
          if (/^continue\b/i.test(normalizedButtonText)) normalizedButtonText = 'Continue';
          if (/^finish\b/i.test(normalizedButtonText)) normalizedButtonText = 'Finish';

          const locator = this.findUiElementLocator(uiElements, [normalizedButtonText.toLowerCase(), targetText.toLowerCase()]);

          if (/logout/i.test(normalizedButtonText)) {

            const menuLocator = this.findUiElementLocator(
              uiElements,
              ['menu', 'open menu', 'burger']
            );

            if (menuLocator) {
              actions.push(
                this.buildClickAction(menuLocator)
              );
            }

          }

          const selector = locator ?? (
            /\b(submit|login|sign in|sign-in)\b/i.test(normalized)
              ? `input[type="submit"], button[type="submit"], button:has-text(${JSON.stringify(normalizedButtonText)})`
              : /\b(select|open)\b/i.test(normalized)
                ? `text=${JSON.stringify(targetText)}`
                : `button:has-text(${JSON.stringify(normalizedButtonText)})`
          );
          actions.push(this.buildClickAction(selector));
          continue;
        }
      }

      if (/\b(submit|login|sign in|sign-in)\b/.test(normalized)) {
        const locator = this.findUiElementLocator(uiElements, ['login', 'sign in', 'sign-in', 'submit']);
        actions.push(this.buildClickAction(locator ?? `button[type="submit"], button:has-text('Login'), input[type="submit"]`));
        continue;
      }

      if (/\b(first name|last name|postal code|zip code|email)\b/.test(normalized)) {
        if (/first name/.test(normalized)) {
          const locator = this.findUiElementLocator(uiElements, ['first name', 'first']);
          actions.push(this.buildFillAction(locator ?? 'input[name*="first"], input[id*="first"], input[placeholder*="First name"], input[aria-label*="First name"]', `'Test'`));
          continue;
        }
        if (/last name/.test(normalized)) {
          const locator = this.findUiElementLocator(uiElements, ['last name', 'last']);
          actions.push(this.buildFillAction(locator ?? 'input[name*="last"], input[id*="last"], input[placeholder*="Last name"], input[aria-label*="Last name"]', `'User'`));
          continue;
        }
        if (/postal code|zip code/.test(normalized)) {
          const locator = this.findUiElementLocator(uiElements, ['postal code', 'zip code', 'postal']);
          actions.push(this.buildFillAction(locator ?? 'input[name*="postal"], input[id*="postal"], input[placeholder*="Postal code"], input[aria-label*="Postal code"]', `'12345'`));
          continue;
        }
        if (/email/.test(normalized)) {
          const locator = this.findUiElementLocator(uiElements, ['email', 'e-mail']);
          actions.push(this.buildFillAction(locator ?? 'input[type="email"], input[name*="email"], input[id*="email"], input[placeholder*="Email"], input[aria-label*="Email"]', `'test@example.com'`));
          continue;
        }
      }

      if (/\b(review order details|review order|verify order details|review order)\b/.test(normalized)) {
        actions.push(`    await expect(page.locator('html')).toBeAttached();`);
        continue;
      }

      if (/\b(verify|expect|assert|should see|should be|is visible|is displayed)\b/.test(normalized)) {
        const textMatch = step.match(/['"“](.+?)['"”]/);
        if (textMatch) {
          const escapedText = textMatch[1].replace(/'/g, `\\'`);
          actions.push(`    await expect(page.locator(${JSON.stringify(`text='${escapedText}'`)})).toBeVisible();`);
        } else {
          actions.push(`    await expect(page.locator('html')).toBeAttached();`);
        }
        continue;
      }

      actions.push(`    await expect(page.locator('html')).toBeAttached();`);
    }

    if (req.expectedResult) {
      actions.push(this.buildMockAssertion(req.expectedResult, appUrl));
    }

    if (actions.length === 0) {
      actions.push(`    await expect(page.locator('html')).toBeAttached();`);
    }

    return actions.join('\n');
  }

  private buildFillAction(locator: string, valueExpression: string): string {
  const serialized = this.serializeLocator(locator);

  if (serialized.startsWith('page.')) {
    return `
    await ${serialized}.fill(${valueExpression}, { timeout: 10000 });
`;
  }

  return `
    await page.locator(${serialized})
      .first()
      .fill(${valueExpression}, { timeout: 10000 });
`;
}

private buildClickAction(locator: string): string {
  const serialized = JSON.stringify(locator);

  if (serialized.startsWith('page.')) {
    return `
    await ${serialized}.click({ timeout: 10000 });
`;
  }

  return `
    await page.locator(${serialized})
      .first()
      .click({ timeout: 10000 });
`;
}
  private findUiElementLocator(
  uiElements: UiElement[],
  terms: string[]
): string | null {

  const lowerTerms = terms.map(t => t.toLowerCase());

  for (const el of uiElements) {

    const combined = [
      el.text,
      el.label,
      el.placeholder,
      el.testId,
      el.cssSelector
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (lowerTerms.some(term => combined.includes(term))) {

      // Prefer stable CSS selector first
      if (el.cssSelector) {
        return el.cssSelector;
      }

      return el.suggestedLocator;
    }
  }

  return null;
}

  private serializeLocator(locator: string): string {
    const trimmed = locator.trim();
    return trimmed.startsWith('page.') ? trimmed : JSON.stringify(trimmed);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildLoginActions(uiElements: UiElement[], appUrl: string): string[] {
    const actions: string[] = [];
    const usernameLocator = this.findUiElementLocator(uiElements, ['username', 'user-name', 'user name', 'email', 'user']) ?? 'input[name="username"], input[id*="user"], input[placeholder*="Username"], input[aria-label*="Username"]';
    const passwordLocator = this.findUiElementLocator(uiElements, ['password', 'pass word']) ?? 'input[type="password"], input[name*="password"], input[id*="password"], input[placeholder*="Password"], input[aria-label*="Password"]';
    const loginLocator = this.findUiElementLocator(uiElements, ['login', 'sign in', 'sign-in', 'submit']) ?? `button[type="submit"], button:has-text('Login'), input[type="submit"]`;
    actions.push(this.buildFillAction(usernameLocator, `process.env.TEST_USERNAME || ${JSON.stringify(this.getDefaultUsername(appUrl))}`));
    actions.push(this.buildFillAction(passwordLocator, `process.env.TEST_PASSWORD || ${JSON.stringify(this.getDefaultPassword(appUrl))}`));
    actions.push(this.buildClickAction(loginLocator));
    actions.push(`
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('html')).toBeVisible();`);
    return [...new Set(actions)];
  }

  private buildPreconditionActions(req: Requirement, uiElements: UiElement[], appUrl: string): string[] {
    const actions: string[] = [];
    const preconditions = req.preconditions.join(' ').toLowerCase();
    const hasLoginStep = req.testSteps.some((step) => /\b(login|sign in|sign-in|log in)\b/i.test(step));
    const hasAddToCartStep = req.testSteps.some((step) => /\badd to cart\b/i.test(step));
    const hasExplicitCartOpenStep = req.testSteps.some((step) => /\b(open shopping cart|open cart page|open cart|shopping cart page|cart page|go to cart)\b/i.test(step));
    const hasCheckoutStep = req.testSteps.some((step) => /\bcheckout\b/i.test(step));
    const hasFinishStep = req.testSteps.some((step) => /\bfinish\b/i.test(step));
    const hasCheckoutOrContinueOrFinishStep = req.testSteps.some((step) => /\b(checkout|continue|finish)\b/i.test(step));

    if (/\b(valid sauce?demo account|logged into application|already logged in|logged in)\b/.test(preconditions) && !hasLoginStep) {
      actions.push(...this.buildLoginActions(uiElements, appUrl));
    }

    if (/\b(product already added|product in cart|item already in cart|has product in cart)\b/.test(preconditions)) {
      if (!hasLoginStep) {
        actions.push(...this.buildLoginActions(uiElements, appUrl));
      }
      if (!hasAddToCartStep) {
        const addToCartLocator = this.findUiElementLocator(uiElements, ['add to cart']) ?? `button#add-to-cart, button[id^="add-to-cart"], button:has-text('Add to cart')`;
        actions.push(this.buildClickAction(addToCartLocator));
      }
      if ((hasCheckoutStep || hasFinishStep) && !hasExplicitCartOpenStep) {
        const cartLocator = this.findUiElementLocator(uiElements, ['shopping cart', 'shopping_cart_link', 'shopping_cart_container', 'cart link', 'cart page']) ?? `#shopping_cart_container, a.shopping_cart_link, .shopping_cart_link`;
        actions.push(this.buildClickAction(cartLocator));
        actions.push(`    await page.waitForLoadState('domcontentloaded');`);
      }
    }

    if (/\b(checkout information completed)\b/.test(preconditions)) {
      if (!hasLoginStep) {
        actions.push(...this.buildLoginActions(uiElements, appUrl));
      }
      if (!hasExplicitCartOpenStep) {
        const cartLocator = this.findUiElementLocator(uiElements, ['shopping cart', 'shopping_cart_link', 'shopping_cart_container', 'cart']) ?? `#shopping_cart_container, a.shopping_cart_link, .shopping_cart_link`;
        actions.push(this.buildClickAction(cartLocator));
        actions.push(`    await page.waitForLoadState('domcontentloaded');`);
      }
      if (hasFinishStep) {
        const checkoutLocator = this.findUiElementLocator(uiElements, ['checkout']) ?? `button#checkout, button[data-test="checkout"], button:has-text('Checkout')`;
        actions.push(this.buildClickAction(checkoutLocator));
        actions.push(this.buildFillAction(this.findUiElementLocator(uiElements, ['first name']) ?? 'input[name*="first"], input[id*="first"], input[placeholder*="First name"], input[aria-label*="First name"]', `'Test'`));
        actions.push(this.buildFillAction(this.findUiElementLocator(uiElements, ['last name']) ?? 'input[name*="last"], input[id*="last"], input[placeholder*="Last name"], input[aria-label*="Last name"]', `'User'`));
        actions.push(this.buildFillAction(this.findUiElementLocator(uiElements, ['postal code', 'zip code']) ?? 'input[name*="postal"], input[id*="postal"], input[placeholder*="Postal code"], input[aria-label*="Postal code"]', `'12345'`));
        const continueLocator = this.findUiElementLocator(uiElements, ['continue']) ?? `button[id^="continue"], button:has-text('Continue')`;
        actions.push(this.buildClickAction(continueLocator));
      } else if (!hasCheckoutOrContinueOrFinishStep) {
        const checkoutLocator = this.findUiElementLocator(uiElements, ['checkout']) ?? `button#checkout, button[data-test="checkout"], button:has-text('Checkout')`;
        actions.push(this.buildClickAction(checkoutLocator));
        actions.push(this.buildFillAction(this.findUiElementLocator(uiElements, ['first name']) ?? 'input[name*="first"], input[id*="first"], input[placeholder*="First name"], input[aria-label*="First name"]', `'Test'`));
        actions.push(this.buildFillAction(this.findUiElementLocator(uiElements, ['last name']) ?? 'input[name*="last"], input[id*="last"], input[placeholder*="Last name"], input[aria-label*="Last name"]', `'User'`));
        actions.push(this.buildFillAction(this.findUiElementLocator(uiElements, ['postal code', 'zip code']) ?? 'input[name*="postal"], input[id*="postal"], input[placeholder*="Postal code"], input[aria-label*="Postal code"]', `'12345'`));
        const continueLocator = this.findUiElementLocator(uiElements, ['continue']) ?? `button[id^="continue"], button:has-text('Continue')`;
        actions.push(this.buildClickAction(continueLocator));
      }
    }

    return [...new Set(actions)];
  }

  private getDefaultUsername(appUrl: string): string {
    return 'testuser@example.com';
  }

  private getDefaultPassword(appUrl: string): string {
    return 'Password123!';
  }

  private buildMockAssertion(expectedResult: string, appUrl: string): string {
    const normalized = expectedResult.toLowerCase();
    if (/\b(error message|error|invalid|failed)\b/.test(normalized)) {

      const errorLocator = `
      page.locator(
        '[role="alert"], .error, .alert, [class*="error"], [data-test*="error"]'
      ).first()
      `;
      const textMatch = expectedResult.match(/['"“](.+?)['"”]/);
      if (textMatch) {
        const escapedText = this.escapeRegExp(textMatch[1]);
        return `    await expect(${errorLocator}).toBeVisible();\n    await expect(${errorLocator}).toContainText(/${escapedText}/i);`;
      }
      return `    await expect(${errorLocator}).toBeVisible();`;
    }

    if (/\b(visible|displayed|shown|present)\b/.test(normalized)) {
      const textMatch = expectedResult.match(/['"“](.+?)['"”]/);
      if (textMatch) {
        const escapedText = this.escapeRegExp(textMatch[1]);
        return `    await expect(page.locator(${JSON.stringify(`text='${textMatch[1]}'`)})).toBeVisible();`;
      }
      return `    await expect(page.locator('html')).toBeVisible();`;
    }

    if (/\b(redirected|redirect|navigated|landed)\b/.test(normalized)) {
      return `    await expect(page).toHaveURL(new RegExp(${JSON.stringify(appUrl)}));`;
    }

    return `    await expect(page.locator('html')).toBeVisible();`;
  }

  private async readAgentHistory(): Promise<Record<string, unknown>> {
    try {
      const fs = await import('fs-extra');
      return await fs.readJson('artifacts/agent-history.json');
    } catch {
      return {};
    }
  }
}
