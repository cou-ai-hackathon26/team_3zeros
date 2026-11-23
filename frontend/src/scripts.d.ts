declare module "../../scripts/check-contrast.mjs" {
  export function contrastRatio(fgHex: string, bgHex: string): number;
  export function checkAllTokenContrasts(
    colorTokens: Record<string, string>
  ): {
    results: Array<{ name: string; fg: string; bg: string; min: number; ratio: number; pass: boolean }>;
    failures: Array<{ name: string; fg: string; bg: string; min: number; ratio: number; pass: boolean }>;
  };
}
