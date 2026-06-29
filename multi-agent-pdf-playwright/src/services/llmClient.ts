/**
 * LLM Client Service
 * Wraps OpenAI API calls used by all agents.
 * Falls back to structured mock responses if no API key is set.
 */

import chalk from 'chalk';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  text: string;
  usedMock: boolean;
}

export class LLMClient {
  private apiKey: string | undefined;
  private model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.LLM_MODEL || 'gpt-4o';

    if (!this.apiKey || this.apiKey === 'your_openai_api_key_here') {
      console.warn(chalk.yellow('[LLMClient] No valid OPENAI_API_KEY found. Mock responses will be used.'));
    } else {
      console.log(chalk.green(`[LLMClient] Initialized with model: ${this.model}`));
    }
  }

  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey !== 'your_openai_api_key_here';
  }

  /**
   * Send messages to the LLM and return the response text.
   * Uses real OpenAI API if key is available; otherwise returns mock.
   */
  async chat(messages: LLMMessage[], mockFallback: string): Promise<LLMResponse> {
    if (!this.apiKey || this.apiKey === 'your_openai_api_key_here') {
      return { text: mockFallback, usedMock: true };
    }

    try {
      // Dynamic import to avoid hard dependency when mocking
      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey: this.apiKey });

      const response = await client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.2,
        max_tokens: 4096,
      });

      const text = response.choices[0]?.message?.content || '';
      return { text, usedMock: false };
    } catch (err) {
      console.error(chalk.red(`[LLMClient] API call failed: ${(err as Error).message}. Using mock fallback.`));
      return { text: mockFallback, usedMock: true };
    }
  }
}
