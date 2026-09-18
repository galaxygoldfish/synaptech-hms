import type { CSSProperties, ReactNode } from 'react'
import styles from './Skeleton.module.css'

type SkeletonShape = 'box' | 'circle' | 'pill'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  shape?: SkeletonShape
  radius?: number | string
  className?: string
  style?: CSSProperties
}

const shapeClass: Record<SkeletonShape, string> = {
  box: '',
  circle: styles.circle,
  pill: styles.pill,
}

function toCssSize(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

/**
 * A single shimmering placeholder box. Sizes are passed through as inline
 * styles so a skeleton can mirror whatever it stands in for without every
 * screen needing its own CSS module rule.
 */
export function Skeleton({ width, height, shape = 'box', radius, className, style }: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton} ${shapeClass[shape]} ${className ?? ''}`.trim()}
      style={{
        width: toCssSize(width),
        height: toCssSize(height),
        borderRadius: toCssSize(radius),
        ...style,
      }}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  /** Width of the final line — real paragraphs rarely end flush. */
  lastLineWidth?: number | string
  width?: number | string
  height?: number | string
  gap?: number | string
  className?: string
}

/** A stack of text-line placeholders. */
export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  width = '100%',
  height,
  gap = '0.35rem',
  className,
}: SkeletonTextProps) {
  return (
    <span
      className={`${styles.textGroup} ${className ?? ''}`.trim()}
      style={{ gap: toCssSize(gap), width: toCssSize(width) }}
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          shape="pill"
          height={height ?? '0.75em'}
          width={index === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </span>
  )
}

/**
 * The screen-reader announcement on its own, for places where
 * `SkeletonScreen`'s wrapper element isn't valid markup — inside a
 * `<tbody>`, say. Pair it with `aria-hidden` on the shimmering rows.
 */
export function SkeletonLabel({ label = 'Loading…' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className={styles.srOnly}>
      {label}
    </span>
  )
}

interface SkeletonScreenProps {
  /**
   * Announced to screen readers in place of the shimmer, which is hidden
   * from the accessibility tree. Keeps the information the old "Loading…"
   * text carried.
   */
  label?: string
  children: ReactNode
  className?: string
}

/**
 * Wrapper for a skeleton region. The placeholders themselves are decorative,
 * so they're hidden from assistive tech and replaced by one polite live
 * announcement.
 */
export function SkeletonScreen({ label = 'Loading…', children, className }: SkeletonScreenProps) {
  return (
    <>
      <span role="status" aria-live="polite" className={styles.srOnly}>
        {label}
      </span>
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    </>
  )
}
