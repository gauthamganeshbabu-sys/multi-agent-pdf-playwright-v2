/**
 * PDF Reader Service
 * Reads and extracts raw text from PDF files using pdf-parse.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

export class PdfReader {
  /**
   * Extract plain text from a PDF file.
   * Falls back to a mock if pdf-parse is unavailable or the file doesn't exist.
   */
  async extractText(pdfPath: string): Promise<string> {
    const absolutePath = path.resolve(pdfPath);

    if (!await fs.pathExists(absolutePath)) {
      console.warn(chalk.yellow(`[PdfReader] File not found: ${absolutePath}. Using mock PDF text.`));
      return this.getMockPdfText();
    }

    try {
      // Dynamically require pdf-parse to allow graceful fallback
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fs.readFile(absolutePath);
      const data = await pdfParse(dataBuffer);
      console.log(chalk.green(`[PdfReader] Extracted ${data.numpages} page(s) from ${path.basename(pdfPath)}`));
      return data.text;
    } catch (err) {
      console.warn(chalk.yellow(`[PdfReader] pdf-parse failed (${(err as Error).message}). Using mock PDF text.`));
      return this.getMockPdfText();
    }
  }

  /**
   * Returns a sample requirements text used when no real PDF is available.
   * This enables the framework to be tested without an actual PDF file.
   */
  private getMockPdfText(): string {
    return `
      Application Requirements Specification

      REQ-001: User Login
      The system shall allow registered users to log in using a valid username and password.
      On successful login, the user should be redirected to the Dashboard page.
      On invalid credentials, an error message "Invalid username or password" should be displayed.

      REQ-002: User Logout
      The system shall allow logged-in users to log out by clicking the Logout button.
      After logout, the user should be redirected to the Login page.
      The session should be invalidated after logout.

      REQ-003: Password Reset
      The system shall allow users to reset their password via a "Forgot Password" link.
      The user must enter their registered email address.
      A password reset link should be sent to the provided email.
      If the email is not registered, an error message should be displayed.

      REQ-004: User Registration
      New users should be able to register by providing name, email, and password.
      Email must be unique; duplicate emails should show an error.
      Password must be at least 8 characters.
      On successful registration, the user is redirected to the Login page.

      REQ-005: Dashboard Access Control
      Only authenticated users should access the Dashboard.
      Unauthenticated users who navigate to /dashboard should be redirected to Login.
    `;
  }
}
