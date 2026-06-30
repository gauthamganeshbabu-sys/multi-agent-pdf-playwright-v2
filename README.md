---------------------------------------------------------------
Multi-Agent AI Framework for PDF-to-Playwright Test Automation
---------------------------------------------------------------

Overview
********
This project is an AI-powered automation framework that converts software requirement documents (PDF) into executable Playwright test scripts using a multi-agent architecture.
--------------------------------------------------------------------------------------------------------------
Workflow
********
Requirement PDF
    ↓
Agent A (Requirement Extraction)
    ↓
requirements.json
    ↓
UI Scanner
    ↓
ui-elements.json
    ↓
Agent B (Playwright Generator)
    ↓
Generated Playwright Tests
    ↓
Playwright Execution
    ↓
Agent C (Audit)
    ↓
PASS -> End
FAIL -> Patch -> Retry
--------------------------------------------------------------------------------------------------------------
Technology Stack
****************
# TypeScript
# Node.js
# Playwright
# OpenAI API
# LangChain
# LangGraph (Foundation)
# PDF Parser
--------------------------------------------------------------------------------------------------------------
Agents
******
--Agent A
*********
   # Reads PDF
   # Extracts requirements
   # Builds requirements.json
--UI Scanner
************
   # Scans application
   # Discovers UI elements
   # Builds ui-elements.json
--Agent B
*********
   # Generates Playwright tests
   # Uses requirements + UI elements
   # Supports patch generation
--Agent C
*********
   # Executes Playwright
   # Audits failures
   # Produces reports
   # Requests regeneration
--------------------------------------------------------------------------------------------------------------
LangGraph
*********
Current implementation is sequential but designed for LangGraph migration.
Future graph:
START:
-> Extract
-> Scan UI
-> Generate
-> Audit
-> PASS -> END
-> FAIL -> Patch -> Audit
--------------------------------------------------------------------------------------------------------------
Shared Workflow State
*********************
# PDF Path
# Application URL
# Requirements
# UI Elements
# Generated Files
# Audit Results
# Retry Count
# Agent History
--------------------------------------------------------------------------------------------------------------
Folder Structure
****************
src/
-agents/
-graph/
-services/
-types/
artifacts/
reports/
tests/generated/
--------------------------------------------------------------------------------------------------------------
Installation
************
```bash
npm install
npx playwright install
```
Create .env
OPENAI_API_KEY=your_api_key
LLM_MODEL=gpt-4o
--------------------------------------------------------------------------------------------------------------
Execute
*******
```bash
npx ts-node run.ts ./artifacts/ecommerce.pdf https://www.saucedemo.com
```
--------------------------------------------------------------------------------------------------------------
Outputs
*******
# Artifacts:
# requirements.json
# ui-elements.json
# agent-history.json
# Reports:
# audit-report.md
# audit-result.json
# final-report.md
--------------------------------------------------------------------------------------------------------------
Future Improvements
*******************
# Complete LangGraph StateGraph
# Parallel agents
# Better self-healing
# Dynamic planning
# Multi-application support
--------------------------------------------------------------------------------------------------------------
Author
******
Umamaheswari
--------------------------------------------------------------------------------------------------------------