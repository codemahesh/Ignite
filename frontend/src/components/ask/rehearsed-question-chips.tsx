'use client';

import { Button } from '@/components/ui/button';
import { Lightbulb, ArrowRight } from 'lucide-react';

// Pre-loaded demo questions (from architecture: rehearsed questions for cache)
const REHEARSED_QUESTIONS = [
  'Why did PLAT-412 happen?',
  "What's our leave policy?",
  'Who owns onboarding docs?',
];

interface RehearsedQuestionChipsProps {
  onSelect: (question: string) => void;
  disabled?: boolean;
}

export function RehearsedQuestionChips({ onSelect, disabled }: RehearsedQuestionChipsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span>Try a rehearsed question:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {REHEARSED_QUESTIONS.map((question) => (
          <Button
            key={question}
            variant="outline"
            size="sm"
            onClick={() => onSelect(question)}
            disabled={disabled}
            className="group bg-white/50 hover:bg-white hover:border-indigo-200 hover:text-indigo-700 transition-all"
          >
            <span>{question}</span>
            <ArrowRight className="h-3 w-3 ml-1.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Button>
        ))}
      </div>
    </div>
  );
}
