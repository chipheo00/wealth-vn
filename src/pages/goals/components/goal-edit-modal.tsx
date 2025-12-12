import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Goal } from "@/lib/types";
import { GoalForm } from "./goal-form";

export interface GoalEditModalProps {
  goal?: Goal;
  open?: boolean;
  onClose?: () => void;
}

export function GoalEditModal({ goal, open, onClose }: GoalEditModalProps) {
  const defaultValues = {
    id: goal?.id || undefined,
    title: goal?.title || "",
    targetAmount: goal?.targetAmount || 0,
    deadline: goal?.deadline ? new Date(goal.deadline) : undefined,
    monthlyContribution: goal?.monthlyContribution || undefined,
    targetReturnRate: goal?.targetReturnRate || undefined,
    isAchieved: goal?.isAchieved || false,
  };

  return (
    <Dialog open={!!open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[625px]">
        <GoalForm defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
