'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import type { NavItem } from '@/lib/rbac';
import Icon from './Icon';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavItem[];
  onSignOut: () => void;
}

/** ⌘K command palette: jump to pages + quick actions. */
export default function CommandPalette({ open, onOpenChange, nav, onSignOut }: CommandPaletteProps) {
  const router = useRouter();

  const run = (fn: () => void) => {
    onOpenChange(false);
    // Let the dialog close before navigating for a smoother feel.
    requestAnimationFrame(() => fn());
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed left-1/2 top-[18vh] z-[80] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
        <Icon name="search" size={20} className="text-[var(--ink-muted)]" />
        <Command.Input
          placeholder="Search pages and actions…"
          className="h-12 w-full bg-transparent text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-[var(--border)] bg-[var(--surface-alt)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink-muted)] sm:block">
          ESC
        </kbd>
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-[var(--ink-muted)]">
          No results found.
        </Command.Empty>
        <Command.Group
          heading="Pages"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
        >
          {nav.map((item) => (
            <Command.Item
              key={item.href}
              value={`${item.label} ${item.href}`}
              onSelect={() => run(() => router.push(item.href))}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-[var(--ink)] aria-selected:bg-[var(--wine-tint)] aria-selected:text-[var(--wine)] data-[selected=true]:bg-[var(--wine-tint)]"
            >
              <Icon name={item.icon} size={20} className="text-[var(--ink-muted)]" />
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group
          heading="Actions"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
        >
          <Command.Item
            value="new sale sell point of sale"
            onSelect={() => run(() => router.push('/sell'))}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-[var(--ink)] data-[selected=true]:bg-[var(--wine-tint)]"
          >
            <Icon name="add_shopping_cart" size={20} className="text-[var(--ink-muted)]" />
            New sale
          </Command.Item>
          <Command.Item
            value="sign out log out"
            onSelect={() => run(onSignOut)}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-[var(--danger)] data-[selected=true]:bg-[var(--danger-bg)]"
          >
            <Icon name="logout" size={20} />
            Sign out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
