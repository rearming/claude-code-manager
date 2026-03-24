import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../lib/utils"

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-colors focus:outline-none focus:ring-0 disabled:pointer-events-none disabled:opacity-65 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-black/80 text-zinc-200 shadow hover:bg-zinc-800 border-primary border-1",
        primary:
          "bg-primary text-primary-foreground shadow",
        destructive:
          "bg-destructive/50 text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-primary shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary/80 text-secondary-foreground shadow-sm hover:bg-secondary/40",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        bottom: "hover:bg-accent hover:text-accent-foreground border-b border-primary",
        top: "hover:bg-accent hover:text-accent-foreground border-t border-primary",
        link: "text-primary underline-offset-4 hover:underline",
        animated: "hover-scale active:scale-95 touch-action-manipulation transition-all duration-400",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 rounded-none px-2 text-xs",
        lg: "h-10 rounded-none px-8",
        icon: "h-9 w-9",
        full: "h-full px-3",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={type}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
