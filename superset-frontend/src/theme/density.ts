export type DensityTier =
  | 'compact'
  | 'micro'
  | 'standard'
  | 'map-focused';

export const DEFAULT_DENSITY: DensityTier = 'compact';

export function densityCssVars(_density: DensityTier): string {
  return `
    --pro-density-body-font: 13px;
    --pro-density-label-font: 12px;
    --pro-density-caption-font: 11px;
    --pro-density-input-height: 32px;
    --pro-density-control-gap: 8px;
    --pro-density-card-padding: 16px;
    --pro-density-section-gap: 16px;
  `;
}
