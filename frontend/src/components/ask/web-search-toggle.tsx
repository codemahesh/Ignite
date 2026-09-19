'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Globe, Info } from 'lucide-react';

interface WebSearchToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function WebSearchToggle({
  checked,
  onCheckedChange,
  disabled = false,
  disabledReason,
}: WebSearchToggleProps) {
  const toggle = (
    <div className="flex items-center gap-2">
      <Switch
        id="web-search"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <Label
        htmlFor="web-search"
        className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer"
      >
        <Globe className="h-4 w-4" />
        Include live web search (Tavily)
      </Label>
    </div>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="inline-flex items-center gap-1 opacity-50">
            {toggle}
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return toggle;
}
