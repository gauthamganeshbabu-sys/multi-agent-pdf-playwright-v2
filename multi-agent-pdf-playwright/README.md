# Multi-Agent PDF → Playwright Automation System

A modular multi-agent AI framework that reads a **PDF requirements document**, extracts testable scenarios, generates **Playwright TypeScript test scripts**, audits them, patches only the failures, and produces a full analysis report.

---

## Architecture Overview

```
User Input (PDF + URL)
      │
      ▼
 [Agent A] Requirement Extraction
      │ requirements.json
      ▼
 [UI Scanner] Scan target URL → ui-elements.json
      │
      ▼
 [Agent B] Playwright Code Generation (Initial)
      │ tests/generated/*.spec.ts
      ▼
 [Agent C] Audit & Validation
      │
      ├── PASSED ──────────────────► Final Report
      │
      └── FAILED → feedback to Agent B
                   Agent B patches only failed specs
                   Retry up to 5 attempts
                   └──► Agent C → Final Report
```

---

## Project Structure

```
multi-agent-pdf-playwright/
├── run.ts                          # CLI entry point
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── .env.example
├── src/
│   ├── orchestrator.ts             # Controls agent loop
│   ├── agents/
│   │   ├── agentA.requirementExtractor.ts
│   │   ├── agentB.codeGenerator.ts
│   │   └── agentC.auditor.ts
│   ├── graph/
│   │   └── workflow.graph.ts       # LangGraph-style state machine
│   ├── services/
│   │   ├── pdfReader.ts            # PDF text extraction
│   │   ├── llmClient.ts            # OpenAI API wrapper
│   │   ├── uiScanner.ts            # Playwright-based UI element scanner
│   │   ├── codeWriter.ts           # File I/O for generated specs
│   │   └── reportWriter.ts         # Report generation
│   └── types/
│       ├── requirement.types.ts
│       ├── audit.types.ts
│       └── agent.types.ts
├── tests/generated/                # Auto-generated Playwright specs
├── pages/                          # Auto-generated Page Object Models
├── utils/                          # Shared test utilities
├── artifacts/                      # JSON artifacts (requirements, UI elements, history)
└── reports/                        # Audit and final reports
```

---

## 1. Installation

```bash
# Clone or extract the project
cd multi-agent-pdf-playwright

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

---

## 2. Add Your API Key

```bash
cp .env.example .env
```

Edit `.env`:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
APP_URL=https://your-app-url.com
MAX_ATTEMPTS=5
HEADLESS=true
```

> **Note:** If `OPENAI_API_KEY` is not set, the framework runs in **mock mode** — it generates structured placeholder test scripts without real LLM reasoning. This is useful for testing the pipeline locally.

---

## 3. Run with a PDF and URL

```bash
npx ts-node run.ts ./requirements.pdf https://your-app.com
```

**Example with demo site:**

```bash
npx ts-node run.ts ./sample.pdf https://demo.playwright.dev/todomvc
```

The framework will:
1. Read and extract requirements from the PDF
2. Scan the URL for UI elements
3. Generate Playwright spec files
4. Audit the generated specs
5. Patch only the failing ones (up to 5 times)
6. Save all reports

---

## 4. How the Agents Communicate

| Agent | Responsibility | Input | Output |
|-------|---------------|-------|--------|
| **Agent A** | Requirement extraction | PDF text | `artifacts/requirements.json` |
| **Agent B** | Playwright code generation | requirements.json + UI elements | `tests/generated/*.spec.ts` |
| **Agent C** | Audit and validation | Generated specs + requirements | `reports/audit-result.json` |

All messages are logged in `artifacts/agent-history.json`.

---

## 5. Retry and Patching

- After each audit, if Agent C finds **High severity issues**, it sends feedback to Agent B.
- Agent B **only regenerates spec files for failed requirement IDs** — passing tests are preserved.
- This loop repeats up to **`MAX_ATTEMPTS`** times (default: 5).
- If all issues are resolved before the limit, the loop exits early.

---

## 6. Locator Validation

The UI Scanner:
1. Launches a headless Chromium browser
2. Opens the target URL
3. Collects all interactive elements (buttons, inputs, links, labels, etc.)
4. Saves them to `artifacts/ui-elements.json`

Agent B uses this to generate **real locators**. Agent C cross-checks generated locators against the scanned elements to detect hallucinated selectors.

---

## 7. Run Generated Playwright Tests

```bash
# Run all generated tests (headless)
npm run test:generated

# Run with browser visible
npm run test:headed

# View HTML report after run
npm run report
```

---

## 8. Reading Audit Reports

| File | Description |
|------|-------------|
| `reports/audit-result.json` | Machine-readable audit output |
| `reports/audit-report.md` | Human-readable issue list |
| `reports/final-report.md` | Full pipeline summary |
| `reports/playwright-html/` | Playwright HTML test report |

---

## 9. Replacing the PDF and URL

Simply run with different arguments:

```bash
npx ts-node run.ts ./new-requirements.pdf https://new-app.com
```

All artifacts, specs, and reports are regenerated from scratch.

---

## 10. Known Limitations

- **Login-protected pages:** If the target URL requires authentication, the UI Scanner will only capture the login page elements. Agent C will note this in the audit report.
- **Single-page scan:** The UI Scanner only scans the landing page of the provided URL, not the full app.
- **Mock mode accuracy:** In mock mode (no API key), generated test steps are structural placeholders and will need manual locator updates before they pass.
- **LLM hallucination:** Even with a real API key, the LLM may generate imperfect locators. Always review `reports/audit-report.md` after generation.
- **PDF format:** Complex PDFs with tables, images, or multi-column layouts may produce noisy text. Plain-text or structured PDFs work best.

---

## NPM Scripts Reference

| Script | Command |
|--------|---------|
| `npm start` | `ts-node run.ts` (requires args) |
| `npm run test:generated` | Run all generated Playwright tests |
| `npm run test:headed` | Run with visible browser |
| `npm run report` | Open Playwright HTML report |
| `npm run lint` | TypeScript type-check |
