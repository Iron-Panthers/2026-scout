import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/hooks/use-toast"

/** How long a notification stays on screen before closing on its own. */
const TOAST_DURATION_MS = 3000

export function Toaster() {
  const { toasts } = useToast()

  return (
    // Each notification stays up for 3 seconds (unless it sets its own duration)
    <ToastProvider duration={TOAST_DURATION_MS}>
      {toasts.map(function ({ id, title, description, action, priority: _priority, ...props }) {
        void _priority // queue ordering only; not a toast prop
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
