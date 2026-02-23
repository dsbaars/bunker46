/** Read a CSS custom property value from :root. */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ChartTheme {
  primary: string;
  success: string;
  warning: string;
  destructive: string;
  border: string;
  mutedFg: string;
  card: string;
  foreground: string;
  palette: string[];
}

export function getChartTheme(): ChartTheme {
  const primary = cssVar('--color-primary');
  const success = cssVar('--color-success');
  const warning = cssVar('--color-warning');
  const destructive = cssVar('--color-destructive');

  return {
    primary,
    success,
    warning,
    destructive,
    border: cssVar('--color-border'),
    mutedFg: cssVar('--color-muted-foreground'),
    card: cssVar('--color-card'),
    foreground: cssVar('--color-foreground'),
    // Distinct, ordered palette cycling through the theme's accent colors
    palette: [
      primary,
      success,
      warning,
      destructive,
      'oklch(0.7 0.18 280)',
      'oklch(0.7 0.18 190)',
      'oklch(0.7 0.15 310)',
      'oklch(0.7 0.15 50)',
    ],
  };
}

/** Hex-compatible alpha variant for canvas fill areas. */
export function withAlpha(color: string, alpha: number): string {
  // Wrap in color-mix so modern canvas engines can resolve alpha on any CSS color
  return `color-mix(in oklch, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
