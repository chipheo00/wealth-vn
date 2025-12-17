# Projected Value Business Logic

## Overview

Projected Value represents what a goal's allocated value should grow to by today's date based on:

- Monthly contributions specified in the goal
- Expected annual return rate
- Time elapsed from goal start date

**Current Implementation:** Projected value calculates growth from **monthly contributions only**. Initial contributions are tracked separately but NOT included in the projection calculation (see Critical Implementation Notes).

## Compounding Approaches

The system supports monthly compounding for projections:

| Aspect | Details |
|--------|---------|
| **Method** | Monthly Compounding |
| **When Used** | Goal progress calculations and chart projections |
| **Granularity** | Month-end dates |
| **Function** | `calculateProjectedValue()` in goal-utils.ts |
| **Time Calculation** | `getMonthsDiff()` with fractional months |

## Core Formula (Monthly Compounding)

```
FV = PMT × [((1 + r)^n - 1) / r]
```

Where:

- **FV** = Future Value (Projected Value)
- **PMT** = Monthly Investment Amount (monthly contribution)
- **r** = Monthly Return Rate (annual rate / 12)
- **n** = Number of months from goal start date

**Note:** Initial principal (`PV × (1 + r)^n`) is NOT currently included in the calculation, despite being mentioned in the documented formula.

### Why Monthly Compounding?

Monthly compounding is used for consistency with the goal form calculation. When a user creates a goal, the form calculates required monthly investment using monthly compounding, and the projected value uses the same method.

### Initial Contributions Handling

**Current Implementation:** Initial contributions are tracked as `startValue` in goal progress but are **NOT compounded** into the projected value calculation.

- Initial contributions are aggregated from allocations: `sum(allocation.initialContribution)`
- They are stored separately in `goalProgress.startValue`
- They are NOT multiplied by the compound factor in projection calculations
- The projected value only shows growth from monthly contributions

**Documented Formula vs Implementation:**
- Formula shows: `FV = PV × (1 + r)^n + PMT × [((1 + r)^n - 1) / r]`
- Actual calculation: `FV = PMT × [((1 + r)^n - 1) / r]` (first term omitted)

This is a known discrepancy that should be addressed in refactoring (see Critical Implementation Notes).

## Calculation Details (Current Implementation)

### 1. Parameter Conversion

**Annual to Monthly Return Rate:**

```typescript
const monthlyRate = annualReturnRate / 100 / 12;
```

Example: 7% annual = 0.583% monthly (7 / 100 / 12 = 0.00583)

### 2. Time Calculation

```typescript
const monthsFromStart = getMonthsDiff(goalStartDate, today);
```

Uses date-fns-based `getMonthsDiff()` which includes fractional months based on day differences.

### 3. Compound Factor

```typescript
const compoundFactor = Math.pow(1 + monthlyRate, monthsFromStart);
```

This represents: (1 + r)^n

### 4. Future Value Calculation

**If monthly rate is 0:**

```typescript
return monthlyInvestment * monthsFromStart;
```

Simple accumulation of contributions.

**If monthly rate > 0:**

```typescript
const compoundFactor = Math.pow(1 + monthlyRate, monthsFromStart);
return monthlyInvestment * ((compoundFactor - 1) / monthlyRate);
```

Compound interest formula for regular contributions.

## Implementation Locations

### 1. goal-utils.ts - calculateProjectedValue()

**Purpose:** Calculate projected value for a given number of months using monthly compounding.

**Current Status:** Function has unused `startValue` parameter (marked with eslint-disable). Only uses monthly contribution and time.

```typescript
export function calculateProjectedValue(
  // startValue is NOT USED - kept for backwards compatibility
  startValue: number,
  monthlyInvestment: number,
  annualReturnRate: number,
  monthsFromStart: number,
): number {
  if (monthsFromStart < 0) return 0;
  if (monthsFromStart === 0) return monthlyInvestment / 30; // ~first day

  const monthlyRate = annualReturnRate / 100 / 12;

  if (monthlyRate === 0) {
    return monthlyInvestment * monthsFromStart;
  }

  const compoundFactor = Math.pow(1 + monthlyRate, monthsFromStart);
  return monthlyInvestment * ((compoundFactor - 1) / monthlyRate);
}
```

**Called from:**

- **use-goal-progress.ts:** Calculate projected value at today's date
  ```typescript
  const monthsFromStart = getMonthsDiff(goalStartDate, today);
  const projectedValue = calculateProjectedValue(
    startValue,  // NOT USED
    monthlyInvestment,
    annualReturnRate,
    Math.max(0, monthsFromStart),
  );
  isOnTrack = currentValue >= projectedValue;
  ```

- **use-goal-valuation-history.ts:** Calculate projected values for chart data points
  ```typescript
  const monthsFromStart = getMonthsDiff(goalStartDate, dateInterval);
  const projected = calculateProjectedValue(
    startValue,  // NOT USED
    monthlyInvestment,
    annualReturnRate,
    Math.max(0, monthsFromStart),
  );
  ```

### 2. use-goal-progress.ts

**Purpose:** Main hook for calculating goal progress and on-track status.

**Key Logic:**
- Sums all allocations' actual values: `initialContribution + (accountGrowth × percent)`
- Gets `totalInitialContribution` as sum of all `allocation.initialContribution`
- Calculates `projectedValue` using `calculateProjectedValue()` (which ignores initial contributions)
- Determines on-track status: `currentValue >= projectedValue`

```typescript
// Calculate progress for each goal
goals.forEach((goal) => {
  let currentValue = 0;
  let totalInitialContribution = 0;

  // Sum up allocations
  goalAllocations.forEach((alloc) => {
    const accountGrowth = currentValue - startAccountValue;
    const allocatedGrowth = accountGrowth * percentage;
    const allocatedValue = initialContribution + allocatedGrowth;
    currentValue += allocatedValue;
    totalInitialContribution += initialContribution;
  });

  // Calculate projected (excludes initial contributions)
  const projectedValue = calculateProjectedValue(
    totalInitialContribution,  // NOT USED in calculation
    monthlyInvestment,
    annualReturnRate,
    Math.max(0, monthsFromStart),
  );

  // Store progress
  progressMap.set(goal.id, {
    currentValue,
    projectedValue,
    startValue: totalInitialContribution,
    isOnTrack: currentValue >= projectedValue,
  });
});
```

### 3. use-goal-valuation-history.ts

**Purpose:** Generate chart data with actual values and projected values for each date interval.

**Key Logic:**
- Fetches historical valuations for allocated accounts
- Calculates actual value per allocation: `initialContribution + (accountGrowth × percent)`
- Aggregates by period (weeks/months/years)
- Calculates projected values for each date interval
- Returns chart data points with both actual and projected values

```typescript
// For each date interval in chart
dateIntervals.forEach((date) => {
  const monthsFromStart = getMonthsDiff(goalStartDate, date);
  
  const projected = calculateProjectedValue(
    startValue,  // NOT USED
    monthlyInvestment,
    annualReturnRate,
    Math.max(0, monthsFromStart),
  );

  const actual = /* aggregated from historical valuations */;

  chartData.push({
    date: format(date, 'yyyy-MM-dd'),
    dateLabel: formatDateLabel(date, period),
    projected: projected,
    actual: actual,
  });
});
```

## On-Track Determination

**Logic:**

```typescript
isOnTrack = currentValue >= projectedValue;
```

**Where:**

- **currentValue** = sum of all allocations' actual values
  - Per allocation: `initialContribution + (accountGrowth × allocatedPercent)`
  - `accountGrowth` = current account value - account value at allocation start date
- **projectedValue** = calculated using `calculateProjectedValue()` 
  - Monthly compounding from goal start date to today
  - Only includes monthly contribution growth (initial principal NOT included)

**Single Source of Truth:** The `goalProgress.isOnTrack` from `use-goal-progress.ts` hook is used by both Goal Card and Goal Details page to ensure consistency.

### Example: On Track

- Goal start: Jan 1, 2025
- Today: Feb 1, 2025 (1 month)
- Initial allocation: 34,000,000
- Monthly investment: 1,000,000
- Annual return: 7%
- Actual account value: 34,500,000
- Account value at start: 34,000,000

**Calculation:**

```
currentValue = 34,000,000 + (500,000 × 100%) = 34,500,000

monthsFromStart = 1
monthlyRate = 7 / 100 / 12 = 0.00583
compoundFactor = (1.00583)^1 = 1.00583
projectedValue = 1,000,000 × ((1.00583 - 1) / 0.00583)
               = 1,000,000 × 1.00
               = ~1,000,000
```

**Determination:**

```
34,500,000 >= 1,000,000 → ON TRACK ✓
```

(Note: Initial allocation of 34M keeps goal on track even though projected contributions are only 1M)

### Example: Off Track (Future Goal with No Allocation)

- Goal start: Mar 15, 2025 (future)
- Today: Feb 14, 2025 (before start)
- Initial allocation: 0
- Monthly investment: 1,000,000

**Calculation:**

```
monthsFromStart = negative (before goal start)
projectedValue = 0
currentValue = 0
```

**Determination:**

```
0 >= 0 → ON TRACK ✓
```

(Future goal with zero values appears on track, but `getGoalStatus()` checks `isGoalScheduled()` first)

## Chart Rendering

### Date Intervals

Based on time period selected:

- **Weeks:** End of each week from goal start to due date
- **Months:** End of each month from goal start to due date
- **Years:** End of each year from goal start to due date
- **All:** Yearly intervals from goal start to due date

### Chart Data Points

For each date interval:

```typescript
{
  date: "2025-02-01",
  dateLabel: "Feb '25",
  projected: 1020321,  // Calculated using calculateProjectedValue()
  actual: 34500000     // Historical account value (if available)
}
```

### Handling Incomplete Periods

For the **current period** (which hasn't ended yet):

**Current Logic:**
- If actual data available on or before the period end date: Use it
- If NOT available AND it's the current period: Use latest known value
- If future period: Show null (no actual data)

**Example (December, current date is Dec 15):**
- Period end date: Dec 31 (future)
- Latest actual value: Dec 15 (today)
- Chart displays: Dec 15 value marked as "Dec" data point

**Code:**
```typescript
if (actual === null && latestActualValue !== null) {
  const isSamePeriod =
    (period === "weeks" && format(date, "yyyy-ww") === format(today, "yyyy-ww")) ||
    (period === "months" && format(date, "yyyy-MM") === format(today, "yyyy-MM")) ||
    (period === "years" && format(date, "yyyy") === format(today, "yyyy")) ||
    (period === "all" && format(date, "yyyy") === format(today, "yyyy"));

  if (isSamePeriod) {
    actual = latestActualValue;
  }
}
```

## Special Cases

### Case 1: Goal Not Started Yet

**Setup:**

- Goal start date: 2026-01-01
- Today: 2025-12-16
- Months from start: negative

**Handling:**

```typescript
if (monthsFromStart <= 0) return 0;
```

Projected value = 0 (goal hasn't started)

---

### Case 2: No Monthly Investment

**Setup:**

- Monthly investment: 0
- Any return rate
- Any months

**Calculation:**

```
projectedValue = 0
```

Projected value = 0 (no contributions to project)

---

### Case 3: Negative Return Rate

**Not supported by business logic.** Return rates are typically 0-20%. Negative returns should be handled as 0 or require separate loss calculation.

## Critical Implementation Notes

### 1. calculateProjectedValue() - Unused startValue Parameter

The `calculateProjectedValue()` function has a `startValue` parameter that is **NOT USED** in the current implementation. The function is marked with `@eslint-disable-next-line @typescript-eslint/no-unused-vars` and only uses:

- `monthlyInvestment`
- `annualReturnRate`
- `monthsFromStart`

**Impact:** Initial principal (initial contributions) is NOT included in the projected value calculation.

**Current Workaround:**
- Initial contributions are tracked separately in `goalProgress.startValue`
- They are displayed for informational purposes
- But they are not compounded into the projection

**Recommendation for Refactoring:**
The function should be updated to either:
1. Actually use `startValue` and compound it: `PV × (1 + r)^n + PMT × [...]`
2. OR remove the parameter and clarify that projections exclude initial principal

This discrepancy can lead to confusion about what "projected value" represents.

### 2. Date Difference Calculation

- `getMonthsDiff()` in date-utils.ts returns fractional months (includes day difference)
- Projection calculations use exact month counts from this function
- For very short periods (< 1 month), `monthsFromStart` can be fractional

### 3. Goal Form vs Projected Value Consistency

The goal form uses `calculateMonthlyInvestment()` which back-calculates the required monthly contribution to reach a target amount. This uses the same monthly compounding formula. However, since projected value doesn't include initial principal in the calculation, there may be mismatches if the goal form assumes initial principal will be compounded.

## Data Dependencies

### use-goal-progress.ts

**Requires:**

- `goal.monthlyInvestment` — Monthly contribution amount
- `goal.targetReturnRate` — Annual return percentage (0-100)
- `goal.startDate` — Goal start date (ISO string)
- Allocations with `initialContribution` values

**Provides:**

- `goalProgress.projectedValue` — Projected value at today's date (monthly compounding, excludes initial contributions)
- `goalProgress.isOnTrack` — Boolean: currentValue >= projectedValue
- `goalProgress.startValue` — Sum of initial contributions (for reference)

### use-goal-valuation-history.ts

**Requires:**

- `goal.monthlyInvestment` — Monthly contribution amount
- `goal.targetReturnRate` — Annual return percentage (0-100)
- `goal.startDate` — Goal start date (ISO string)
- `goal.dueDate` — Goal due date (ISO string)
- Allocations with `initialContribution` values
- Historical valuations for allocated accounts

**Provides:**

- `chartData[].projected` — Projected value for each date interval (monthly compounding, excludes initial contributions)
- `chartData[].actual` — Historical actual value (aggregated from account valuations)
- Used in chart rendering and visual comparison with actual values

## Validation Rules

### 1. Monthly Investment Range

```
0 <= monthlyInvestment <= account_balance
```

Can be 0 (no contributions expected).

### 2. Annual Return Rate Range

```
0 <= annualReturnRate <= 100
```

Typically 0-20% for realistic scenarios. Negative returns not supported.

### 3. Start Date Before Due Date

```
goal.startDate < goal.dueDate
```

Ensure goal timeline makes sense.

### 4. Projected Value Constraints

```
projectedValue >= 0
```

Always non-negative (only calculates from positive contributions and rates).

## Testing Scenarios

1. ✓ Goal with zero monthly investment → projected = 0
2. ✓ Goal with zero return rate → projected = sum of contributions
3. ✓ Goal with contributions + return → compound interest applied
4. ✓ Goal not started yet → projected = 0
5. ✓ Goal active for 1 year → verify against manual calculation
6. ✓ On-track determination → currentValue >= projectedValue
7. ✓ Chart data points → verify intervals match selected period
8. ⚠️ Initial contributions effect → Currently NOT compounded into projected value

## References

- `src/lib/date-utils.ts` — Date calculation utilities
  - `getMonthsDiff()` — Calculate months between dates (with fractional component)
  - `formatTimeRemaining()` — Format time to due date
  - `formatTimeElapsed()` — Format time since start date

- `src/pages/goals/lib/goal-utils.ts` — Goal calculation utilities
  - `calculateProjectedValue()` — Monthly compounding projection (excludes initial principal)
  - `calculateProjectedValueByDate()` — Daily compounding (not used in current flow)
  - `calculateDailyInvestment()` — Back-calculate daily investment for target (not used in current flow)
  - `getDaysDiff()` — Calculate days between dates
  - `isGoalOnTrack()` — Compare current vs projected value
  - `isGoalOnTrackByDate()` — Daily precision on-track check (not used in current flow)
  - `isGoalScheduled()` — Check if goal is future-scheduled
  - `getGoalStatus()` — Get UI status display

- `src/pages/goals/use-goal-progress.ts` — Main hook for goal progress calculation and on-track determination

- `src/pages/goals/use-goal-valuation-history.ts` — Chart data generation with projected and actual values

- `src/pages/goals/goal-details-page.tsx` — Goal details page (uses `goalProgress.isOnTrack`)

- `src/pages/goals/components/goal-form.tsx` — Goal form (may use different calculation for monthly investment)
