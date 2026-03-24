"use client"

import { GripVertical } from "lucide-react"
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { cn } from "../lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof Group>) => (
  <Group
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  handleClassName,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean,
  handleClassName?: string
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-zinc-800 hover:bg-zinc-700 after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:h-1 data-[orientation=vertical]:after:w-full data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:translate-x-0 [&[data-orientation=vertical]>div]:rotate-90",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className={cn("z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border", handleClassName)}>
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle, usePanelRef }
export type { PanelImperativeHandle }
