/**
 * DHIS2 period formatting utility.
 * Converts raw DHIS2 period codes (e.g. "202503", "2025Q1") into
 * human-readable labels (e.g. "March 2025", "Q1 2025").
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Return a numeric sort key for DHIS2 period strings.
 * Returns null when the value is not a recognized DHIS2 period format.
 */
export function getDhis2PeriodSortKey(value: string): number | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();

  // Daily: 20250315
  const dailyMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dailyMatch) {
    const year = Number(dailyMatch[1]);
    const month = Number(dailyMatch[2]);
    const day = Number(dailyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return year * 10000 + month * 100 + day;
    }
  }

  // Weekly: 2025W12
  const weeklyMatch = trimmed.match(/^(\d{4})W(\d{1,2})$/);
  if (weeklyMatch) {
    return Number(weeklyMatch[1]) * 10000 + Number(weeklyMatch[2]) * 7;
  }

  // Weekly variants: 2025WedW12, 2025ThuW12, etc.
  const weeklyVariantMatch = trimmed.match(
    /^(\d{4})(Wed|Thu|Sat|Sun)W(\d{1,2})$/,
  );
  if (weeklyVariantMatch) {
    return (
      Number(weeklyVariantMatch[1]) * 10000 + Number(weeklyVariantMatch[3]) * 7
    );
  }

  // Bi-weekly: 2025BiW6
  const biWeeklyMatch = trimmed.match(/^(\d{4})BiW(\d{1,2})$/);
  if (biWeeklyMatch) {
    return Number(biWeeklyMatch[1]) * 10000 + Number(biWeeklyMatch[2]) * 14;
  }

  // Monthly: 202503
  const monthlyMatch = trimmed.match(/^(\d{4})(\d{2})$/);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    if (month >= 1 && month <= 12) {
      return year * 10000 + month * 100;
    }
  }

  // Quarterly: 2025Q1
  const quarterlyMatch = trimmed.match(/^(\d{4})Q([1-4])$/i);
  if (quarterlyMatch) {
    return Number(quarterlyMatch[1]) * 10000 + Number(quarterlyMatch[2]) * 300;
  }

  // Bi-monthly: 202503B
  const biMonthlyMatch = trimmed.match(/^(\d{4})(0[1-9]|1[0-2])B$/);
  if (biMonthlyMatch) {
    return Number(biMonthlyMatch[1]) * 10000 + Number(biMonthlyMatch[2]) * 100;
  }

  // Six-monthly: 2025S1
  const sixMonthlyMatch = trimmed.match(/^(\d{4})S([1-2])$/i);
  if (sixMonthlyMatch) {
    return (
      Number(sixMonthlyMatch[1]) * 10000 + Number(sixMonthlyMatch[2]) * 600
    );
  }

  // Six-monthly April: 2025AprilS1
  const sixMonthlyAprilMatch = trimmed.match(/^(\d{4})AprilS([1-2])$/i);
  if (sixMonthlyAprilMatch) {
    const year = Number(sixMonthlyAprilMatch[1]);
    const half = Number(sixMonthlyAprilMatch[2]);
    return year * 10000 + (half === 1 ? 400 : 1000);
  }

  // Financial year starts.
  const financialAprilMatch = trimmed.match(/^(\d{4})April$/);
  if (financialAprilMatch) {
    return Number(financialAprilMatch[1]) * 10000 + 400;
  }
  const financialJulyMatch = trimmed.match(/^(\d{4})July$/);
  if (financialJulyMatch) {
    return Number(financialJulyMatch[1]) * 10000 + 700;
  }
  const financialOctMatch = trimmed.match(/^(\d{4})Oct$/);
  if (financialOctMatch) {
    return Number(financialOctMatch[1]) * 10000 + 1000;
  }

  // Yearly: 2025
  const yearlyMatch = trimmed.match(/^(\d{4})$/);
  if (yearlyMatch) {
    return Number(yearlyMatch[1]) * 10000;
  }

  return null;
}

/**
 * Format a DHIS2 period string into a human-readable label.
 * Returns the original string if not a recognized DHIS2 period format.
 */
export function formatDhis2Period(value: string): string {
  if (!value || typeof value !== 'string') return value;
  const trimmed = value.trim();

  // Daily: 20250315
  const dailyMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dailyMatch) {
    const year = Number(dailyMatch[1]);
    const month = Number(dailyMatch[2]);
    const day = Number(dailyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${MONTH_SHORT[month - 1]} ${day}, ${year}`;
    }
  }

  // Weekly: 2025W12
  const weeklyMatch = trimmed.match(/^(\d{4})W(\d{1,2})$/);
  if (weeklyMatch) {
    return `Week ${Number(weeklyMatch[2])} ${weeklyMatch[1]}`;
  }

  // Weekly variants: 2025WedW12, 2025ThuW12, etc.
  const weeklyVariantMatch = trimmed.match(
    /^(\d{4})(Wed|Thu|Sat|Sun)W(\d{1,2})$/,
  );
  if (weeklyVariantMatch) {
    return `Week ${Number(weeklyVariantMatch[3])} ${weeklyVariantMatch[1]}`;
  }

  // Bi-weekly: 2025BiW6
  const biWeeklyMatch = trimmed.match(/^(\d{4})BiW(\d{1,2})$/);
  if (biWeeklyMatch) {
    return `Bi-week ${Number(biWeeklyMatch[2])} ${biWeeklyMatch[1]}`;
  }

  // Monthly: 202503 → March 2025
  const monthlyMatch = trimmed.match(/^(\d{4})(\d{2})$/);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    if (month >= 1 && month <= 12) {
      return `${MONTH_NAMES[month - 1]} ${year}`;
    }
  }

  // Quarterly: 2025Q1
  const quarterlyMatch = trimmed.match(/^(\d{4})Q([1-4])$/i);
  if (quarterlyMatch) {
    return `Q${quarterlyMatch[2]} ${quarterlyMatch[1]}`;
  }

  // Bi-monthly: 202503B → Mar-Apr 2025
  const biMonthlyMatch = trimmed.match(/^(\d{4})(0[1-9]|1[0-2])B$/);
  if (biMonthlyMatch) {
    const year = Number(biMonthlyMatch[1]);
    const startMonth = Number(biMonthlyMatch[2]);
    const endMonth = Math.min(startMonth + 1, 12);
    return `${MONTH_SHORT[startMonth - 1]}-${MONTH_SHORT[endMonth - 1]} ${year}`;
  }

  // Six-monthly: 2025S1 → Jan-Jun 2025
  const sixMonthlyMatch = trimmed.match(/^(\d{4})S([1-2])$/i);
  if (sixMonthlyMatch) {
    const year = Number(sixMonthlyMatch[1]);
    const half = Number(sixMonthlyMatch[2]);
    return half === 1 ? `Jan-Jun ${year}` : `Jul-Dec ${year}`;
  }

  // Six-monthly April: 2025AprilS1
  const sixMonthlyAprilMatch = trimmed.match(/^(\d{4})AprilS([1-2])$/i);
  if (sixMonthlyAprilMatch) {
    const year = Number(sixMonthlyAprilMatch[1]);
    const half = Number(sixMonthlyAprilMatch[2]);
    return half === 1 ? `Apr-Sep ${year}` : `Oct ${year}-Mar ${year + 1}`;
  }

  // Financial year April: 2025April
  const financialAprilMatch = trimmed.match(/^(\d{4})April$/);
  if (financialAprilMatch) {
    const year = Number(financialAprilMatch[1]);
    return `Apr ${year}-Mar ${year + 1}`;
  }

  // Financial year July: 2025July
  const financialJulyMatch = trimmed.match(/^(\d{4})July$/);
  if (financialJulyMatch) {
    const year = Number(financialJulyMatch[1]);
    return `Jul ${year}-Jun ${year + 1}`;
  }

  // Financial year Oct: 2025Oct
  const financialOctMatch = trimmed.match(/^(\d{4})Oct$/);
  if (financialOctMatch) {
    const year = Number(financialOctMatch[1]);
    return `Oct ${year}-Sep ${year + 1}`;
  }

  // Yearly: 2025 (return as-is)
  // Not a recognized period — return original
  return trimmed;
}
