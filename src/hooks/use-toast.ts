import * as React from "react"

import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

/** How many notifications show at once: one at a time; any more wait their turn. */
const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  /** Jumps ahead of other waiting notifications (e.g. achievements), behind any earlier priority ones. */
  priority?: boolean
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        // Closed ones linger (for their exit animation) but never take a slot from an open one
        toasts: [action.toast, ...state.toasts.filter((t) => t.open !== false)].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

// Notifications play one at a time (TOAST_LIMIT). Any that arrive while one is showing wait
// here and play in order as each closes, instead of replacing it (which used to drop, e.g.,
// an achievement that popped up while "submitted successfully" was showing).
let pendingToasts: ToasterToast[] = []
// Gap between one closing and a waiting one taking its place, so the close animation can finish
const NEXT_TOAST_DELAY = 350
let nextToastTimer: ReturnType<typeof setTimeout> | undefined

const stackFull = () => memoryState.toasts.filter((t) => t.open !== false).length >= TOAST_LIMIT

function publish(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

function showNextToastWhenFree() {
  if (nextToastTimer || pendingToasts.length === 0 || stackFull()) return
  nextToastTimer = setTimeout(() => {
    nextToastTimer = undefined
    const next = pendingToasts.shift()
    // Its turn: shown directly, not sent back through dispatch() — that would see the
    // others still waiting and put it back in line, and nothing would ever show again
    if (next) publish({ type: "ADD_TOAST", toast: next })
    showNextToastWhenFree()
  }, NEXT_TOAST_DELAY)
}

function dispatch(action: Action) {
  switch (action.type) {
    case "ADD_TOAST":
      // The stack is full (or a waiting one is about to join it): wait in line
      if (stackFull() || nextToastTimer || pendingToasts.length > 0) {
        if (action.toast.priority) {
          const firstNormal = pendingToasts.findIndex((t) => !t.priority)
          pendingToasts.splice(firstNormal === -1 ? pendingToasts.length : firstNormal, 0, action.toast)
        } else {
          pendingToasts.push(action.toast)
        }
        return
      }
      break
    case "UPDATE_TOAST":
      pendingToasts = pendingToasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t))
      break
    case "DISMISS_TOAST":
      // Dismissing everything also clears the line; dismissing one still waiting just drops it
      if (action.toastId === undefined) {
        pendingToasts = []
      } else if (pendingToasts.some((t) => t.id === action.toastId)) {
        pendingToasts = pendingToasts.filter((t) => t.id !== action.toastId)
        return
      }
      break
  }

  publish(action)
  showNextToastWhenFree()
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
