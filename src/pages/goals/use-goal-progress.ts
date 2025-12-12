import { getGoalsAllocation } from "@/commands/goal";
import { useAccounts } from "@/hooks/use-accounts";
import { useLatestValuations } from "@/hooks/use-latest-valuations";
import { QueryKeys } from "@/lib/query-keys";
import type { AccountValuation, Goal, GoalAllocation } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface GoalProgress {
  goalId: string;
  currentValue: number;
  targetAmount: number;
  progress: number; // percentage (actual)
  expectedProgress: number; // percentage (based on timeline)
  isOnTrack: boolean;
}

// Deadline is no longer tracked, so expected progress is always 0

/**
 * Hook to calculate goal progress based on account allocations and their values.
 *
 * For each goal, we:
 * 1. Find all allocations for that goal
 * 2. For each allocation, get the account's current value
 * 3. Multiply account value by allocation percentage
 * 4. Sum up all the allocated values to get the goal's current value
 * 5. Compare actual progress to expected progress (based on timeline) to determine if on track
 */
export function useGoalProgress(goals: Goal[] | undefined) {
  const { accounts } = useAccounts();
  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const { latestValuations, isLoading: isLoadingValuations } = useLatestValuations(accountIds);

  const { data: allocations, isLoading: isLoadingAllocations } = useQuery<GoalAllocation[], Error>({
    queryKey: [QueryKeys.GOALS_ALLOCATIONS],
    queryFn: getGoalsAllocation,
  });

  const goalProgressMap = useMemo(() => {
    const progressMap = new Map<string, GoalProgress>();

    if (!goals || !allocations || !latestValuations) {
      return progressMap;
    }

    // Create a map of account ID to valuation for quick lookup
    const valuationMap = new Map<string, AccountValuation>();
    latestValuations.forEach((val) => valuationMap.set(val.accountId, val));

    // Calculate progress for each goal
    goals.forEach((goal) => {
      let currentValue = 0;

      // Find all allocations for this goal
      const goalAllocations = allocations.filter((alloc) => alloc.goalId === goal.id);

      // Sum up the allocated values from each account
      goalAllocations.forEach((alloc) => {
        const accountValuation = valuationMap.get(alloc.accountId);
        if (accountValuation) {
          // Account value * allocation percentage (allocation is stored as 0-100)
          const allocatedValue = accountValuation.totalValue * (alloc.percentAllocation / 100);
          currentValue += allocatedValue;
        }
      });

      const progress = goal.targetAmount > 0
        ? Math.min((currentValue / goal.targetAmount) * 100, 100)
        : 0;

      progressMap.set(goal.id, {
        goalId: goal.id,
        currentValue,
        targetAmount: goal.targetAmount,
        progress,
        expectedProgress: 0,
        isOnTrack: true,
      });
    });

    return progressMap;
  }, [goals, allocations, latestValuations]);

  const isLoading = isLoadingValuations || isLoadingAllocations;

  return {
    goalProgressMap,
    isLoading,
    getGoalProgress: (goalId: string) => goalProgressMap.get(goalId),
  };
}
