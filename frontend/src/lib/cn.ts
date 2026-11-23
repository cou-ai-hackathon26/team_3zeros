import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Custom twMerge configured with Medi Waypoint's type scale tokens.
 *
 * Without this extension, tailwind-merge mistakes custom font size classes
 * (like `text-body`, `text-heading`, etc.) for text colours and improperly
 * merges them away when paired with colour classes like `text-destructive`.
 */
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display",
        "text-title",
        "text-heading",
        "text-subheading",
        "text-body",
        "text-dense",
        "text-caption",
        "text-code",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return customTwMerge(clsx(inputs));
}

export default cn;
