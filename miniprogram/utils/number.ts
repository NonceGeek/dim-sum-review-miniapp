/**
 * 千分位
 * 12345 → 12,345
 */
export const formatNumber = (num: number) => {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return Number(num).toLocaleString();
};

/**
 * 百分比
 * 0.1234 → 12.34
 */
export const formatPercent = (num: number, fixed = 2) => {
  if (num === null || num === undefined || isNaN(num)) return "0.00";
  return (num * 100).toFixed(fixed);
};
