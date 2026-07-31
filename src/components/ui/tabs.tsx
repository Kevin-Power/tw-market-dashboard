import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-surface-2/80 p-1.5 scrollbar-thin backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex min-h-11 shrink-0 flex-1 items-center justify-center whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium text-muted",
        "transition-[color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        "data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-[0_1px_0_color-mix(in_oklab,#fff_6%,transparent)_inset,0_4px_16px_-8px_rgb(0_0_0/0.5)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-5 focus-visible:outline-none",
        "data-[state=active]:animate-[fade-rise_280ms_cubic-bezier(0.22,1,0.36,1)_both]",
        className,
      )}
      {...props}
    />
  );
}
