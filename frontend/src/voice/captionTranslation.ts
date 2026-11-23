import type { CaptionTranslation } from "../api/queries/types";
import type { TriageCaptionEvent, VoiceClient } from "./types";

type Post = <T>(path: string, body?: unknown) => Promise<T>;

/**
 * Call captions (D-22): each final line is appended at once; its machine translation is fetched and
 * attached when it arrives. If translation fails, the line simply stays single-language.
 */
export function bindCallCaptions(
  client: VoiceClient,
  getSessionId: () => string | null,
  post: Post,
  setTurns: (update: (prev: TriageCaptionEvent[]) => TriageCaptionEvent[]) => void,
): () => void {
  return client.on("caption", (c) => {
    setTurns((prev) => [...prev, c]);
    const id = getSessionId();
    if (!id) return;
    post<CaptionTranslation>(`/triage/sessions/${id}/translate`, { text: c.text, source: c.lang })
      .then((tr) => {
        if (!tr.text) return;
        const translation = { text: tr.text, lang: tr.lang, machine: true as const };
        setTurns((prev) => prev.map((x) => (x.at === c.at ? { ...x, translation } : x)));
      })
      .catch(() => undefined);
  });
}
