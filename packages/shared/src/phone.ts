/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts "98765 43210", "+91-9876543210", "09876543210" and "919876543210".
 * Returns null when the input is not a valid Indian mobile number.
 */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let local: string;
  if (digits.length === 10) local = digits;
  else if (digits.length === 11 && digits.startsWith('0')) local = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) local = digits.slice(2);
  else return null;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}
