import Link from 'next/link';
import styles from './status-page.module.css';

/** SEC-004: the same page for "missing" and "not in your workspace". */
export default function NotFound() {
  return (
    <main id="main" className={styles.page}>
      <h1 className={styles.title}>Page not found</h1>
      <p>This item doesn&apos;t exist or isn&apos;t in this workspace.</p>
      <Link href="/">Go to your workspace</Link>
    </main>
  );
}
