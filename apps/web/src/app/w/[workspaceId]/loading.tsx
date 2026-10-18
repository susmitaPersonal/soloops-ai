import styles from './states.module.css';

/** Skeleton in the final layout shape, with aria-busy (screen specifications §3). */
export default function Loading() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-live="polite">
      <span className="so-visually-hidden">Loading…</span>
      <div className={styles.bar} />
      <div className={styles.block} />
    </div>
  );
}
