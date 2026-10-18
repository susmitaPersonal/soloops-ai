import type { ReactNode } from 'react';
import styles from './public.module.css';

/** S-01: single-column card layout for sign-in and registration. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className={styles.page}>
      <div className={styles.card}>
        <p className={styles.brand}>{process.env.NEXT_PUBLIC_APP_NAME ?? 'SoloOps AI'}</p>
        {children}
      </div>
    </main>
  );
}
