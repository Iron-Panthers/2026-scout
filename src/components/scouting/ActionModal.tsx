import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ModalOption } from "@/types/actionButtons";

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: ModalOption[];
  onOptionSelect: (option: ModalOption) => void;
}

export default function ActionModal({
  isOpen,
  onClose,
  title,
  options,
  onOptionSelect,
}: ActionModalProps) {
  const handleOptionClick = (option: ModalOption) => {
    onOptionSelect(option);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {options.map((option, index) => (
            <Button
              key={index}
              onClick={() => handleOptionClick(option)}
              className="w-full h-14 text-lg"
              style={{
                backgroundColor: option.color || undefined,
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
