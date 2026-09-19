'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SystemStatusPill } from './system-status-pill';
import { useConnectors } from '@/hooks';

const navItems = [
  { href: '/', label: 'Ask' },
  { href: '/connectors', label: 'Connectors' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hasIssues } = useConnectors(30000);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b glass">
        <div className="container flex h-16 items-center px-4 md:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 mr-8 group">
            <div className="relative">
              <Brain className="h-7 w-7 text-indigo-600 transition-transform group-hover:scale-110" />
              <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-amber-500 float" />
            </div>
            <span className="text-lg font-bold gradient-text">Company Brain</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative px-4 py-2 text-sm font-medium rounded-lg transition-all hover-lift',
                  pathname === item.href
                    ? 'text-indigo-700 bg-indigo-50/80'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/50'
                )}
              >
                {item.label}
                {/* Issue badge for Connectors tab */}
                {item.href === '/connectors' && hasIssues && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 pulse-dot" />
                )}
              </Link>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* System Status */}
          <SystemStatusPill />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
