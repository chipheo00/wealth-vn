import { getGoalsAllocation } from "@/commands/goal";
import { getHistoricalValuations } from "@/commands/portfolio";
import { QueryKeys } from "@/lib/query-keys";
import type { AccountValuation, Goal, GoalAllocation } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
    addMonths,
    addWeeks,
    addYears,
    eachMonthOfInterval,
    eachWeekOfInterval,
    eachYearOfInterval,
    format,
    isAfter,
    isBefore,
    isEqual,
    parseISO,
    startOfDay,
    startOfYear,
    subMonths,
    subWeeks,
    subYears,
} from "date-fns";
import { useMemo } from "react";

export type TimePeriodOption = "weeks" | "months" | "years" | "all";

/**
 * Calculate display date range centered around today
 * For all: show from goal start to due date
 * For others: center around today with specific past/future counts
 */
function calculateDisplayDateRange(
  period: TimePeriodOption,
  goalStartDate: Date,
  goalDueDate: Date,
): { displayStart: Date; displayEnd: Date } {
  const today = startOfDay(new Date());

  if (period === "all") {
    // For all time, we just use the goal start and end date
    return {
      displayStart: goalStartDate,
      displayEnd: goalDueDate,
    };
  }

  // Default display counts (how many periods to show on each side of today)
  const displayCounts: Record<Exclude<TimePeriodOption, "all">, { past: number; future: number }> =
    {
      weeks: { past: 12, future: 12 },
      months: { past: 12, future: 12 },
      years: { past: 3, future: 5 },
    };

  const counts = displayCounts[period];
  let displayStart: Date;
  let displayEnd: Date;

  switch (period) {
    case "weeks": {
      displayStart = subWeeks(today, counts.past);
      displayEnd = addWeeks(today, counts.future);
      break;
    }
    case "months": {
      displayStart = subMonths(today, counts.past);
      displayEnd = addMonths(today, counts.future);
      break;
    }
    case "years": {
      displayStart = subYears(today, counts.past);
      displayEnd = addYears(today, counts.future);
      break;
    }
  }

  // Constrain start date: Don't show data before the goal started
  if (isBefore(displayStart, goalStartDate)) {
    displayStart = goalStartDate;
  }

  // Constrain end date: Don't show data beyond the goal due date
  if (isAfter(displayEnd, goalDueDate)) {
    displayEnd = goalDueDate;
  }

  // Ensure start is before end (in case constraints flipped them)
  if (isAfter(displayStart, displayEnd)) {
      displayEnd = displayStart;
  }

  return { displayStart, displayEnd };
}

interface GoalChartDataPoint {
  date: string;
  dateLabel: string;
  projected: number;
  actual: number | null;
}

interface UseGoalValuationHistoryResult {
  chartData: GoalChartDataPoint[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Calculate projected value using compound interest formula with regular contributions
 * FV = PV × (1 + r)^n + PMT × [((1 + r)^n - 1) / r]
 *
 * @param startValue - Initial value (PV)
 * @param monthlyInvestment - Monthly contribution (PMT)
 * @param annualReturnRate - Annual return rate as percentage (e.g., 7 for 7%)
 * @param monthsFromStart - Number of months from start date
 */
function calculateProjectedValue(
  startValue: number,
  monthlyInvestment: number,
  annualReturnRate: number,
  monthsFromStart: number,
): number {
  if (monthsFromStart <= 0) return startValue;

  const monthlyRate = annualReturnRate / 100 / 12;

  if (monthlyRate === 0) {
    // No return rate, just accumulate contributions
    return startValue + monthlyInvestment * monthsFromStart;
  }

  // FV = PV × (1 + r)^n + PMT × [((1 + r)^n - 1) / r]
  const compoundFactor = Math.pow(1 + monthlyRate, monthsFromStart);
  const futurePV = startValue * compoundFactor;
  const futureContributions = monthlyInvestment * ((compoundFactor - 1) / monthlyRate);

  return futurePV + futureContributions;
}

/**
 * Get the number of months between two dates
 */
function getMonthsDiff(startDate: Date, endDate: Date): number {
  const yearDiff = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * Generate date intervals based on the selected time period
 */
function generateDateIntervals(startDate: Date, endDate: Date, period: TimePeriodOption): Date[] {
  const today = startOfDay(new Date());
  // For 'all', we use the actual endDate, for others we might cap it or not depending on display logic
  // but simpler to just respect the passed start/end dates
  const effectiveEndDate = period === "all" ? endDate : (isAfter(endDate, today) ? endDate : today);

  switch (period) {
    case "weeks":
      return eachWeekOfInterval({ start: startDate, end: effectiveEndDate });
    case "months":
      return eachMonthOfInterval({ start: startDate, end: effectiveEndDate });
    case "years":
      return eachYearOfInterval({ start: startDate, end: effectiveEndDate });
    case "all":
      // "All time" view uses yearly intervals
      return eachYearOfInterval({ start: startDate, end: effectiveEndDate });
    default:
      return eachMonthOfInterval({ start: startDate, end: effectiveEndDate });
  }
}

/**
 * Format date label based on the time period
 */
function formatDateLabel(date: Date, period: TimePeriodOption): string {
  switch (period) {
    case "weeks":
      return format(date, "d MMM");
    case "months":
      return format(date, "MMM ''yy");
    case "years":
      return format(date, "yyyy");
    case "all":
      return format(date, "yyyy");
    default:
      return format(date, "MMM ''yy");
  }
}

/**
 * Aggregate valuation data by the specified period
 */
function aggregateValuationsByPeriod(
  valuations: Map<string, number>,
  dates: Date[],
  period: TimePeriodOption,
): Map<string, number> {
  const aggregated = new Map<string, number>();

  dates.forEach((date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    let value: number | null = null;

    if (period === "years" || period === "all") {
      // For yearly aggregation (and all time), get the last valuation in that year
      const year = date.getFullYear();
      let lastValueInYear: number | null = null;
      const sortedDates = Array.from(valuations.keys()).sort();

      for (const valDate of sortedDates) {
        const valDateObj = parseISO(valDate);
        if (
          valDateObj.getFullYear() === year &&
          (isBefore(valDateObj, new Date(year + "-12-31")) || isEqual(valDateObj, date))
        ) {
          lastValueInYear = valuations.get(valDate) ?? null;
        }
      }
      value = lastValueInYear;
    } else {
      // For weekly/monthly, find the closest valuation on or before this date
      let closestValue: number | null = null;
      const sortedDates = Array.from(valuations.keys()).sort();

      for (const valDate of sortedDates) {
        const valDateObj = parseISO(valDate);
        if (isBefore(valDateObj, date) || isEqual(valDateObj, date)) {
          closestValue = valuations.get(valDate) ?? null;
        } else {
          break;
        }
      }
      value = closestValue;
    }

    if (value !== null) {
      aggregated.set(dateStr, value);
    }
  });

  return aggregated;
}

/**
 * Hook to fetch and calculate goal valuation history for the chart
 */
export function useGoalValuationHistory(
  goal: Goal | undefined,
  period: TimePeriodOption = "months",
): UseGoalValuationHistoryResult {
  // Fetch allocations
  const {
    data: allocations,
    isLoading: isLoadingAllocations,
    error: allocationsError,
  } = useQuery<GoalAllocation[], Error>({
    queryKey: [QueryKeys.GOALS_ALLOCATIONS],
    queryFn: getGoalsAllocation,
  });

  // Get allocated account IDs for this goal
  const allocatedAccountIds = useMemo(() => {
    if (!allocations || !goal) return [];
    return allocations
      .filter((alloc) => alloc.goalId === goal.id && alloc.percentAllocation > 0)
      .map((alloc) => alloc.accountId);
  }, [allocations, goal]);

  // Determine date range (from goal start date to due date)
  const dateRange = useMemo(() => {
    if (!goal) return null;

    const today = new Date();

    // Use goal's configured start date, or default to 1 year ago for legacy goals
    let goalStartDate: Date;
    if (goal.startDate) {
      goalStartDate = parseISO(goal.startDate);
    } else {
      // Fallback: use 1 year ago for existing goals without startDate
      goalStartDate = new Date();
      goalStartDate.setFullYear(goalStartDate.getFullYear() - 1);
    }

    // For data fetching, if goal is in the future, we still need some data from today
    // But projection calculations will use the actual goal start date
    const dataStartDate = isAfter(goalStartDate, today) ? today : goalStartDate;

    const endDate = goal.dueDate ? parseISO(goal.dueDate) : new Date();
    endDate.setFullYear(endDate.getFullYear() + 1); // Add buffer for projection

    return {
      startDate: format(dataStartDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
      goalStartDate: format(goalStartDate, "yyyy-MM-dd"), // Actual goal start for projections
    };
  }, [goal]);

  // Fetch historical valuations for each allocated account
  const {
    data: historicalValuations,
    isLoading: isLoadingValuations,
    error: valuationsError,
  } = useQuery<Map<string, AccountValuation[]>, Error>({
    queryKey: [QueryKeys.GOAL_VALUATION_HISTORY, goal?.id, allocatedAccountIds, dateRange],
    queryFn: async () => {
      if (allocatedAccountIds.length === 0 || !dateRange) return new Map();

      const valuationsMap = new Map<string, AccountValuation[]>();

      // Fetch valuations for each account
      await Promise.all(
        allocatedAccountIds.map(async (accountId) => {
          const valuations = await getHistoricalValuations(
            accountId,
            dateRange.startDate,
            dateRange.endDate,
          );
          valuationsMap.set(accountId, valuations);
        }),
      );

      return valuationsMap;
    },
    enabled: allocatedAccountIds.length > 0 && !!dateRange,
  });

  // Build chart data
  const chartData = useMemo((): GoalChartDataPoint[] => {
    if (!goal || !dateRange) return [];

    const dataStartDate = parseISO(dateRange.startDate);
    const goalStartDate = parseISO(dateRange.goalStartDate);
    const endDate = parseISO(dateRange.endDate);
    const today = startOfDay(new Date());

    // Check if goal is scheduled for the future
    const isGoalInFuture = isAfter(goalStartDate, today);
    const goalDueDate = goal.dueDate ? parseISO(goal.dueDate) : endDate;

    // Calculate display date range
    const { displayStart, displayEnd } = calculateDisplayDateRange(
      period,
      isGoalInFuture ? goalStartDate : dataStartDate,
      goalDueDate,
    );

    // Generate date intervals from goal start date (for projection) to end date
    const dateIntervals = generateDateIntervals(displayStart, displayEnd, period);

    // Get allocation percentages for this goal
    const allocationMap = new Map<string, number>();
    allocations?.forEach((alloc) => {
      if (alloc.goalId === goal.id) {
        allocationMap.set(alloc.accountId, alloc.percentAllocation / 100);
      }
    });

    // Calculate actual values by date (weighted sum of account valuations)
    const actualValuesByDate = new Map<string, number>();
    let latestActualValue: number | null = null;

    if (historicalValuations) {
      // Combine all valuation dates
      const allDates = new Set<string>();
      historicalValuations.forEach((valuations) => {
        valuations.forEach((val) => allDates.add(val.valuationDate));
      });

      // For each date, calculate the weighted sum
      Array.from(allDates)
        .sort()
        .forEach((dateStr) => {
          let totalValue = 0;

          historicalValuations.forEach((valuations, accountId) => {
            const allocation = allocationMap.get(accountId) ?? 0;
            const valuation = valuations.find((v) => v.valuationDate === dateStr);
            if (valuation) {
              totalValue += valuation.totalValue * allocation;
            }
          });

          if (totalValue > 0) {
            actualValuesByDate.set(dateStr, totalValue);
            latestActualValue = totalValue;
          }
        });
    }

    // Aggregate actual values by period
    const aggregatedActuals = aggregateValuationsByPeriod(
      actualValuesByDate,
      dateIntervals,
      period,
    );

    // For current period in years/all view, use latest value if available
    if ((period === "years" || period === "all") && latestActualValue !== null) {
      const currentYearKey = format(startOfYear(today), "yyyy-MM-dd");
      // Find valid date key in aggregatedActuals that represents the current year
      // Since generateDateIntervals returns start of years, it should match
      const existingValue = aggregatedActuals.get(currentYearKey);
      if (!existingValue || latestActualValue > existingValue) {
        aggregatedActuals.set(currentYearKey, latestActualValue);
      }
    }

    // Get projection parameters
    const monthlyInvestment = goal.monthlyInvestment ?? 0;
    const annualReturnRate = goal.targetReturnRate ?? 0;

    // Find starting value for projection
    // For future goals: use 0 (goal hasn't started)
    // For past/current goals: use the first actual value at or after goal start date
    let startValue = 0;
    if (!isGoalInFuture) {
      const sortedActualDates = Array.from(actualValuesByDate.keys()).sort();
      const goalStartStr = format(goalStartDate, "yyyy-MM-dd");

      // Find the first valuation at or after the goal start date
      for (const dateStr of sortedActualDates) {
        if (dateStr >= goalStartStr) {
          startValue = actualValuesByDate.get(dateStr) ?? 0;
          break;
        }
      }
      // If no value found after goal start, use the first available value
      if (startValue === 0 && sortedActualDates.length > 0) {
        startValue = actualValuesByDate.get(sortedActualDates[0]) ?? 0;
      }
    }

    // Build chart data points
    return dateIntervals.map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const monthsFromStart = getMonthsDiff(goalStartDate, date);

      // Calculate projected value (from goal start date)
      const projected = calculateProjectedValue(
        startValue,
        monthlyInvestment,
        annualReturnRate,
        Math.max(0, monthsFromStart), // Don't project before goal start
      );

      // Get actual value (only for dates up to today and after goal start)
      const isInPast = isBefore(date, today) || isEqual(date, today);
      const isAfterGoalStart = !isBefore(date, goalStartDate);
      let actual =
        isInPast && isAfterGoalStart ? (aggregatedActuals.get(dateStr) ?? null) : null;

      // Special handling for current period to show latest known value
      if (actual === null && latestActualValue !== null && isInPast) {
          const isSamePeriod =
            (period === "weeks" && format(date, "yyyy-ww") === format(today, "yyyy-ww")) ||
            (period === "months" && format(date, "yyyy-MM") === format(today, "yyyy-MM")) ||
            (period === "years" && format(date, "yyyy") === format(today, "yyyy")) ||
            (period === "all" && format(date, "yyyy") === format(today, "yyyy"));

          if (isSamePeriod) {
            actual = latestActualValue;
          }
      }

      return {
        date: dateStr,
        dateLabel: formatDateLabel(date, period),
        projected: Math.round(projected * 100) / 100,
        actual: actual !== null ? Math.round(actual * 100) / 100 : null,
      };
    });
  }, [goal, dateRange, period, allocations, historicalValuations]);

  return {
    chartData,
    isLoading: isLoadingAllocations || isLoadingValuations,
    error: allocationsError || valuationsError,
  };
}
