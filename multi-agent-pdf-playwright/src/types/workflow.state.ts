import { BaseMessage } from "@langchain/core/messages";

export interface WorkflowState {

    // Input
    pdfPath: string;
    websiteUrl: string;

    // PDF Processing
    extractedText: string;

    // Requirements
    requirements: any[];

    // Website Analysis
    uiElements: any[];

    // Generated Test Files
    generatedFiles: string[];

    // Playwright Execution
    executionResult: any;

    // Audit
    auditReport: any;

    // Conversation Memory (LangGraph)
    messages: BaseMessage[];

    // Logs
    logs: string[];

    // Error Handling
    errors: string[];

}