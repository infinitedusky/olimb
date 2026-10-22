export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent'

/** A small label. Domain states map to a tone outside this component. */
export function Badge({ tone = 'neutral', dot = false, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`badge ${tone === 'neutral' ? '' : tone}`} data-component="Badge">
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}
