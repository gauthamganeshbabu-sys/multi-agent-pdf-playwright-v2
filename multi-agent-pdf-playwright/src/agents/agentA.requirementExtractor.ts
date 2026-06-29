/**
 * Agent A: Requirement Extraction Agent
 * Reads a PDF, sends text to the LLM, and produces a structured requirements.json.
 */

import chalk from 'chalk';
import { PdfReader } from '../services/pdfReader';
import { LLMClient } from '../services/llmClient';
import { CodeWriter } from '../services/codeWriter';
import { Requirement, RequirementsDocument } from '../types/requirement.types';
import { AgentMessage } from '../types/agent.types';

export class AgentA {
  private pdfReader: PdfReader;
  private llm: LLMClient;
  private codeWriter: CodeWriter;

  constructor() {
    this.pdfReader = new PdfReader();
    this.llm = new LLMClient();
    this.codeWriter = new CodeWriter();
  }

  /**
   * Extract testable requirements from the given PDF.
   * Returns structured RequirementsDocument and an agent message for the history log.
   */
  async extractRequirements(
    pdfPath: string,
    appUrl: string
  ): Promise<{ doc: RequirementsDocument; message: AgentMessage }> {
    console.log(chalk.cyan('\n[Agent A] Starting requirement extraction...'));

    const pdfText = await this.pdfReader.extractText(pdfPath);
    let requirements: Requirement[] = this.parseRequirementsFromText(pdfText);

    if (requirements.length === 0 && this.llm.hasApiKey()) {
      const systemPrompt = `You are a requirements analyst. Extract only testable requirements from the given text.
For each requirement produce a JSON object with these fields:
- id: unique string like REQ-001
- title: short title
- description: full description
- preconditions: array of strings
- testSteps: array of action strings
- expectedResult: string
- priority: "High" | "Medium" | "Low"
- testType: "Positive" | "Negative" | "EdgeCase"

Return ONLY valid JSON. No markdown. No extra text. Format:
{ "requirements": [ ... ] }`;

      const userPrompt = `Extract all testable requirements from this document text:\n\n${pdfText}`;
      const response = await this.llm.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        JSON.stringify({ requirements: [] })
      );

      try {
        const cleaned = response.text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        requirements = Array.isArray(parsed) ? parsed : (parsed.requirements || []);
      } catch (parseErr) {
        console.error(chalk.red(`[Agent A] Failed to parse LLM response. Falling back to parsed PDF text or mock requirements.`));
      }
    }

    if (requirements.length === 0) {

      throw new Error(
        'No requirements extracted from PDF. Please check PDF format or extractor logic.'
      );

}

    const doc: RequirementsDocument = {
      sourcePdf: pdfPath,
      appUrl,
      extractedAt: new Date().toISOString(),
      requirements,
    };

    await this.codeWriter.writeArtifact('requirements.json', doc);
    console.log(chalk.green(`[Agent A] Extracted ${requirements.length} requirement(s).`));

    const message: AgentMessage = {
      from: 'AgentA',
      to: 'AgentB',
      timestamp: new Date().toISOString(),
      type: 'result',
      payload: `Extracted ${requirements.length} requirements from ${pdfPath}. IDs: ${requirements.map((r) => r.id).join(', ')}`,
    };

    return { doc, message };
  }

  private parseRequirementsFromText(pdfText: string): Requirement[] {
    const normalized = pdfText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00A0/g, ' ')
      .trim();
    if (!normalized) return [];

    const sections = this.splitIntoRequirementSections(normalized);
    return sections
      .map((section, index) => this.parseRequirementSection(section, index + 1))
      .filter((item): item is Requirement => item !== null);
  }

  private splitIntoRequirementSections(text: string): string[] {

    const sectionHeaders = [
      ...text.matchAll(/^(REQ[-\s]?\d+|Requirement\s+\d+)\b.*$/gim)
    ];

    if (!sectionHeaders.length) {
      return [text];
    }

    const sections: string[] = [];

    for (let i = 0; i < sectionHeaders.length; i++) {
      const start = sectionHeaders[i].index || 0;
      const end = sectionHeaders[i + 1]?.index ?? text.length;
      sections.push(text.slice(start, end).trim());
    }

    return sections;
}

  private parseRequirementSection(section: string, fallbackIndex: number): Requirement | null {
    const lines = section
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return null;

    const headerMatch = lines[0].match(/^(REQ[-\s]?\d+|Requirement\s+\d+)\s*[:\-]?\s*(.*)$/i);
    const id = `REQ-${String(fallbackIndex).padStart(3,'0')}`;
    const title = headerMatch?.[2]?.trim() || '';
    const bodyLines = headerMatch ? lines.slice(1) : lines.slice(0);

    const typeLine = this.findLine(bodyLines, /^Type\s*[:\-]/i);
    const priorityLine = this.findLine(bodyLines, /^Priority\s*[:\-]/i);
    const preconditions = this.extractSectionContent(bodyLines, /^Preconditions?\s*[:\-]/i, /^(Steps?|Test Steps?)\s*[:\-]/i);
    const testSteps = this.extractSectionContent(bodyLines, /^(Steps?|Test Steps?)\s*[:\-]/i, /^(Expected Result|Expected|Result)\s*[:\-]/i);
    const expectedLines = this.extractSectionContent(bodyLines, /^(Expected Result|Expected|Result)\s*[:\-]/i);

    const parsedPreconditions = this.parseItemLines(preconditions);
    const parsedSteps = this.parseItemLines(testSteps);
    const expectedResult = expectedLines.join(' ').trim();
    const descriptionLines = bodyLines.filter((line) => {
      if (typeLine && line === typeLine) return false;
      if (priorityLine && line === priorityLine) return false;
      if (this.isSectionHeader(line)) return false;
      return !preconditions.includes(line) && !testSteps.includes(line) && !expectedLines.includes(line);
    });

    const description = descriptionLines.join(' ').trim() || title || `Requirement ${fallbackIndex}`;

    const requirement: Requirement = {
      id,
      title: title || description,
      description,
      preconditions: parsedPreconditions,
      testSteps: parsedSteps,
      expectedResult,
      priority: this.parsePriority(typeLine, priorityLine, section),
      testType: this.parseTestType(typeLine, section),
    };

    if (
      !requirement.preconditions.length &&
      !requirement.testSteps.length &&
      !requirement.expectedResult
    ) {
      requirement.testSteps = [description];
      requirement.expectedResult = description;
      }

    return requirement;
}

  private findLine(lines: string[], pattern: RegExp): string | null {
    const match = lines.find((line) => pattern.test(line));
    return match ? match.trim() : null;
  }

  private extractSectionContent(lines: string[], startPattern: RegExp, stopPattern?: RegExp): string[] {
    const startIndex = lines.findIndex((line) => startPattern.test(line));
    if (startIndex === -1) return [];

    const results: string[] = [];
    const headerLine = lines[startIndex].replace(startPattern, '').trim();
    if (headerLine) results.push(headerLine);

    for (let i = startIndex + 1; i < lines.length; i += 1) {
      if (stopPattern && stopPattern.test(lines[i])) break;
      if (this.isSectionHeader(lines[i])) break;
      results.push(lines[i]);
    }

    return results.filter(Boolean);
  }

  private isSectionHeader(line: string): boolean {
    return /^(Type|Priority|Preconditions?|Steps?|Test Steps?|Expected Result|Expected|Result)\s*[:\-]/i.test(line);
  }

  private parseItemLines(lines: string[]): string[] {
    return lines
      .flatMap((line) => line.split(/;|\t/))
      .map((item) => item.replace(/^(?:step\s*\d+|\d+\.?|\-|\*)\s*/i, '').trim())
      .filter((item) => item.length > 0 && !/^[\d]+$/.test(item));
  }

  private parseTestType(typeLine: string | null, section: string): Requirement['testType'] {
    if (typeLine) {
      if (/negative/i.test(typeLine)) return 'Negative';
      if (/edge/i.test(typeLine)) return 'EdgeCase';
      return 'Positive';
    }

    if (/(invalid|error|fails|unauthorized|unauthenticated|incorrect|negative|not allow|not should)/i.test(section)) {
      return 'Negative';
    }
    if (/(edge case|edge-case|edgecase|unauthenticated|redirected from|directly to|invalid input)/i.test(section)) {
      return 'EdgeCase';
    }
    return 'Positive';
  }

  private parsePriority(typeLine: string | null, priorityLine: string | null, section: string): Requirement['priority'] {
    const source = [priorityLine, typeLine, section].find(Boolean) ?? '';
    if (/high/i.test(source)) return 'High';
    if (/medium/i.test(source)) return 'Medium';
    return 'Low';
  }

  private extractPreconditions(lines: string[]): string[] {
    const candidates = lines.filter((line) => /^(Preconditions?|Given|When|Assuming?)\b/i.test(line));
    if (candidates.length) {
      return candidates.map((line) => line.replace(/^(Preconditions?|Given|When|Assuming?)[:,]?\s*/i, '').trim()).filter(Boolean);
    }

    return lines
      .filter((line) => /(user is on|user has|user is logged in|user is not logged in|authenticated users|logged-in user)/i.test(line))
      .slice(0, 2)
      .map((line) => line.replace(/\b(user is on|user has|user is logged in|user is not logged in|authenticated users|logged-in user)\b/i, '').trim())
      .filter(Boolean);
  }

  private extractTestSteps(lines: string[]): string[] {
    const stepLines = lines.filter((line) => /^(?:\d+\.|-|\*)\s*/.test(line) || /^(Navigate|Click|Enter|Select|Open|Fill|Verify|Check|Submit|Go to|Logout|Login|Tap|Choose)\b/i.test(line));
    if (stepLines.length) {
      return stepLines.map((line) => line.replace(/^(?:\d+\.|-|\*)\s*/,'').trim());
    }

    return lines
      .filter((line) => /(navigate|click|enter|select|open|fill|verify|check|submit|login|logout|go to|tap|choose)/i.test(line))
      .map((line) => line.replace(/^(?:\d+\.|-|\*)\s*/,'').trim());
  }

  private extractExpectedResult(lines: string[]): string {
    const expectedLine = lines.find((line) => /^(Expected Result|Expected|Result)\b/i.test(line));
    if (expectedLine) {
      return expectedLine.replace(/^(Expected Result|Expected|Result)[:,]?\s*/i, '').trim();
    }

    const match = lines.find((line) => /(should|must|is redirected|is displayed|is visible|is invalidated|is sent|is shown|redirected to|displayed|error message)/i.test(line));
    return match?.trim() || '';
  }

  private extractDescription(
    lines: string[],
    preconditions: string[],
    steps: string[],
    expectedResult: string,
    title: string
  ): string {
    const ignore = new Set<string>([
      ...preconditions.map((item) => item.toLowerCase()),
      ...steps.map((item) => item.toLowerCase()),
      expectedResult.toLowerCase(),
    ]);

    const descriptionLines = lines.filter((line) => {
      const normalized = line.toLowerCase();
      if (ignore.has(normalized)) return false;
      if (/^(Preconditions?|Given|When|Assuming?|Expected Result|Expected|Result|Test Steps?|Steps)\b/i.test(line)) return false;
      return true;
    });

    const description = descriptionLines.join(' ').trim();
    return description || title || 'Requirement extracted from PDF text.';
  }

  private detectTestType(text: string): Requirement['testType'] {
    if (/(invalid|error|fails|unauthorized|unauthenticated|incorrect|negative|not allow|not should)/i.test(text)) {
      return 'Negative';
    }
    if (/(edge case|edge-case|edgecase|unauthenticated|redirected from|directly to|invalid input)/i.test(text)) {
      return 'EdgeCase';
    }
    return 'Positive';
  }

  private detectPriority(text: string): Requirement['priority'] {
    if (/(critical|must|shall|high priority|high)/i.test(text)) {
      return 'High';
    }
    if (/(should|medium|important)/i.test(text)) {
      return 'Medium';
    }
    return 'Low';
  }
}
