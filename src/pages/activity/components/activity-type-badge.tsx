import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ActivityType, getActivityTypeName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ActivityTypeIcon } from "./activity-type-icon";

interface ActivityTypeBadgeProps {
  type: ActivityType;
  className?: string;
  showLabel?: boolean;
}

// Design update: Bigger icons, No borders, Friendly palette
function getActivityColorClass(type: ActivityType) {
  switch (type) {
    // Primary/Positive Actions -> Main Brand Green/Emerald
    case ActivityType.BUY:
    case ActivityType.DEPOSIT:
    case ActivityType.ADD_HOLDING:
      return "text-emerald-600 bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/10";

    // Income/Gains -> Lime/Teal (Vibrant but distinct from Buy)
    case ActivityType.DIVIDEND:
    case ActivityType.INTEREST:
    case ActivityType.TRANSFER_IN:
      return "text-teal-600 bg-teal-500/15 dark:text-teal-400 dark:bg-teal-500/10";

    // Selling/Spending -> Orange (Warm, not alarming red)
    case ActivityType.SELL:
    case ActivityType.WITHDRAWAL:
    case ActivityType.REMOVE_HOLDING:
      return "text-orange-600 bg-orange-500/15 dark:text-orange-400 dark:bg-orange-500/10";

    // Transfers/Movement -> Blue/Sky (Neutral flow)
    case ActivityType.TRANSFER:
    case ActivityType.TRANSFER_OUT:
      return "text-sky-600 bg-sky-500/15 dark:text-sky-400 dark:bg-sky-500/10";

    // Administrative/Fees -> Slate/Violet (Subtle)
    case ActivityType.FEE:
    case ActivityType.TAX:
      return "text-violet-600 bg-violet-500/15 dark:text-violet-400 dark:bg-violet-500/10";

    case ActivityType.SPLIT:
      return "text-indigo-600 bg-indigo-500/15 dark:text-indigo-400 dark:bg-indigo-500/10";

    default:
      return "text-slate-600 bg-slate-500/15 dark:text-slate-400 dark:bg-slate-500/10";
  }
}

export function ActivityTypeBadge({
  type,
  className,
  showLabel = false,
}: ActivityTypeBadgeProps) {
  const { t } = useTranslation("activity");
  const colorClass = getActivityColorClass(type);
  const label = getActivityTypeName(type, t);

  // Remove Badge wrapper styles that add borders (border-transparent to remove default badge border)
  const badgeObj = (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
        colorClass,
        className
      )}
    >
      <ActivityTypeIcon type={type} className={cn("size-5", showLabel && "mr-2")} />
      {showLabel && <span className="text-sm font-medium">{label}</span>}
    </div>
  );

  if (showLabel) {
    return badgeObj;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{badgeObj}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
