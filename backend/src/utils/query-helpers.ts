/**
 * Query parameter helper utilities
 */

/**
 * Convert query parameter to string
 * Express query params can be string | string[] | undefined
 */
export function toQueryString(value: string | string[] | undefined, defaultValue = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return defaultValue;
}

/**
 * Convert query parameter to number
 */
export function toQueryNumber(value: string | string[] | undefined, defaultValue = 0): number {
  const str = toQueryString(value);
  const num = Number(str);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Convert query parameter to boolean
 */
export function toQueryBoolean(value: string | string[] | undefined, defaultValue = false): boolean {
  const str = toQueryString(value).toLowerCase();
  if (str === 'true' || str === '1' || str === 'yes') {
    return true;
  }
  if (str === 'false' || str === '0' || str === 'no') {
    return false;
  }
  return defaultValue;
}
