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
      <DialogContent className="sm:max-w-md max-h-[85vh] p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          {options.map((option, index) => (
            <Button
              key={index}
              onClick={() => handleOptionClick(option)}
              className="w-full h-12 text-base"
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
