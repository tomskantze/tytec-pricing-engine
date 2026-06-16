import { getPricingExplanationLines } from '../../domain/pricingExplanation'
import type { PricedJob } from '../../domain/types'

export function PricingExplanationPanel({ job }: { job: PricedJob }) {
  const lines = getPricingExplanationLines(job)
  return (
    <section className="pricing-explanation-panel">
      <h3 className="section-title">Pricing Logic</h3>
      <ul className="pricing-explanation-list">
        {lines.map((line) => (
          <li key={line.text} className={line.emphasized ? 'pricing-explanation-emphasis' : undefined}>
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
