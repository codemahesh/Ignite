'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';

interface AskBoxProps {
  onSubmit: (question: string) => void;
  isLoading: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export function AskBox({ onSubmit, isLoading, placeholder, defaultValue = '' }: AskBoxProps) {
  const [question, setQuestion] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [question]);

  const handleSubmit = () => {
    const trimmed = question.trim();
    if (trimmed && !isLoading) {
      onSubmit(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Update question when defaultValue changes (for rehearsed questions)
  useEffect(() => {
    if (defaultValue) {
      setQuestion(defaultValue);
    }
  }, [defaultValue]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'e.g. "Why did the platform deploy fail last week?"'}
        disabled={isLoading}
        className="pr-12 min-h-[52px] resize-none"
        rows={1}
      />
      <Button
        onClick={handleSubmit}
        disabled={!question.trim() || isLoading}
        size="sm"
        className="absolute right-2 bottom-2"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
