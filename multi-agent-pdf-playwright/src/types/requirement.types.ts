/**
 * Requirement Types
 * Defines the data structures for extracted requirements from PDF documents.
 */

export interface Requirement {
  id: string;
  title: string;
  description: string;
  preconditions: string[];
  testSteps: string[];
  expectedResult: string;
  priority: 'High' | 'Medium' | 'Low';
  testType: 'Positive' | 'Negative' | 'EdgeCase';
}

export interface RequirementsDocument {
  sourcePdf: string;
  appUrl: string;
  extractedAt: string;
  requirements: Requirement[];
}

export interface UiElement {
  tag: string;
  role: string | null;
  text: string | null;
  label: string | null;
  placeholder: string | null;
  testId: string | null;
  cssSelector: string | null;
  suggestedLocator: string;
}

export interface UiElementsDocument {
  scannedUrl: string;
  scannedAt: string;
  elements: UiElement[];
}
