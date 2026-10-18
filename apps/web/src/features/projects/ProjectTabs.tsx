'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '@/features/core-ops/core-ops.module.css';

/**
 * Design system §7.3 project tabs, implemented as links because each tab is a route. Only
 * implemented tabs are shown.
 */
export function ProjectTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/requirements`, label: 'Requirements', exact: false },
    { href: `${base}/change-requests`, label: 'Change requests', exact: false },
    { href: `${base}/tasks`, label: 'Tasks', exact: false },
    { href: `${base}/billing`, label: 'Billing', exact: false },
  ];
  return (
    <nav aria-label="Project">
      <ul className={styles.tabs}>
        {tabs.map((t) => {
          const current = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={[styles.tab, current ? styles.tabCurrent : ''].join(' ')}
                aria-current={current ? 'page' : undefined}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
