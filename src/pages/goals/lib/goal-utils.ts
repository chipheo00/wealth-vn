import type { Goal } from "@/lib/types";

/**
 * Determines if a goal is on track by comparing actual vs projected value
 * On track: currentValue >= projectedValue (at current time)
 * Off track: currentValue < projectedValue (at current time)
 */
export function isGoalOnTrack(currentValue: number, projectedValue: number): boolean {
  return currentValue >= projectedValue;
}

/**
 * Gets the display status for a goal (for UI rendering)
 */
export function getGoalStatus(goal: Goal, isOnTrack: boolean) {
  if (goal.isAchieved) {
    return {
      text: "Done",
      colorClass: "text-success", // Will use CSS variable
      statusText: "Completed",
      statusClass: "text-success bg-success/10",
    };
  }

  if (isOnTrack) {
    return {
      text: "On track",
      colorClass: "text-chart-actual-on-track", // Will use CSS variable
      statusText: "Ongoing",
      statusClass: "text-primary bg-primary/10",
    };
  }

  return {
    text: "Off track",
    colorClass: "text-chart-actual-off-track", // Will use CSS variable
    statusText: "Ongoing",
    statusClass: "text-primary bg-primary/10",
  };
}
