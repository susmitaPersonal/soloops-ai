'use client';

import { ClipboardCheck, FolderKanban, House, Receipt, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './WorkspaceShell.module.css';

export function WorkspaceNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const base = `/w/${workspaceId}`;
  const items = [
    { href: base, label: 'Home', icon: House, exact: true },
    { href: `${base}/approvals`, label: 'Approvals', icon: ClipboardCheck, exact: false },
    { href: `${base}/clients`, label: 'Clients', icon: Users, exact: false },
    { href: `${base}/projects`, label: 'Projects', icon: FolderKanban, exact: false },
    { href: `${base}/billing`, label: 'Billing', icon: Receipt, exact: false },
    { href: `${base}/settings`, label: 'Settings', icon: Settings, exact: false },
  ];
  return (
    <nav aria-label="Workspace">
      <ul className={styles.nav}>
        {items.map(({ href, label, icon: Icon, exact }) => {
          const current = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={[styles.navLink, current ? styles.navLinkCurrent : ''].join(' ')}
                aria-current={current ? 'page' : undefined}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
