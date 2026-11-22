"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used inside <Tabs>.");
  }
  return context;
}

const Tabs = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }
>(
  (
    { className, defaultValue = "", value: controlledValue, onValueChange, children, ...props },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : internalValue;

    const setValue = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternalValue(next);
        onValueChange?.(next);
      },
      [isControlled, onValueChange]
    );

    return (
      <TabsContext.Provider value={{ value, setValue }}>
        <div ref={ref} className={cn("flex flex-col", className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    value: string;
  }
>(({ className, value, children, onClick, ...props }, ref) => {
  const { value: activeValue, setValue } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={isActive}
      data-state={isActive ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm",
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        setValue(value);
      }}
      {...props}
    >
      {children}
    </button>
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value: string;
    forceMount?: boolean;
  }
>(({ className, value, forceMount = false, children, ...props }, ref) => {
  const { value: activeValue } = useTabsContext();
  const isActive = activeValue === value;

  if (!forceMount && !isActive) return null;

  return (
    <div
      ref={ref}
      role="tabpanel"
      hidden={!isActive}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
