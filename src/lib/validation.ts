/**
 * Validation utilities for NITK student email and password security constraints.
 */

export interface PasswordValidationResult {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigit: boolean;
  hasSpecialChar: boolean;
  isValid: boolean;
  score: number; // 0 to 5
}

/**
 * Validates whether an email address is an official NITK email.
 * Allows emails ending with @nitk.edu.in or subdomains like @dept.nitk.edu.in.
 */
export function isValidNitkEmail(email: string): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!clean.includes('@')) return false;

  // Must end with @nitk.edu.in or .nitk.edu.in
  const nitkRegex = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)*nitk\.edu\.in$/;
  return nitkRegex.test(clean);
}

/**
 * Validates password constraints:
 * - Minimum 6 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 * - At least one special character (!@#$%^&*...)
 */
export function getPasswordValidation(password: string = ''): PasswordValidationResult {
  const hasMinLength = password.length >= 6;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password);

  const criteria = [hasMinLength, hasUppercase, hasLowercase, hasDigit, hasSpecialChar];
  const score = criteria.filter(Boolean).length;
  const isValid = score === 5;

  return {
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasDigit,
    hasSpecialChar,
    isValid,
    score,
  };
}

/**
 * Generates a helpful error message if password does not meet all criteria.
 */
export function getPasswordErrorMessage(validation: PasswordValidationResult): string | null {
  if (validation.isValid) return null;

  const missing: string[] = [];
  if (!validation.hasMinLength) missing.push('at least 6 characters');
  if (!validation.hasUppercase) missing.push('one capital letter (A-Z)');
  if (!validation.hasLowercase) missing.push('one small letter (a-z)');
  if (!validation.hasDigit) missing.push('one digit (0-9)');
  if (!validation.hasSpecialChar) missing.push('one special character (!@#$%^&*...)');

  return `Password must include: ${missing.join(', ')}.`;
}
