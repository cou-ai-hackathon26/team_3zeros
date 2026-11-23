type Review = { status?: string; clinicalReviewer?: string | null; clinicalSections?: string[] };
export function landingKeyDiff(en: { landing: object }, bn: { landing: object }): { missingInBn: string[]; missingInEn: string[] };
export function launchProblems(review: { bn?: Review; en?: Review }): string[];
