import type { Locale } from "../i18n/config";
import { bindCallCaptions } from "./captionTranslation";
import { startRingtone } from "./ringtone";
import type { TriageCaptionEvent, VoiceClient } from "./types";
import { VapiVoiceClient } from "./vapiClient";

// The call screen ships in the same lazy chunk as the call code, so a call costs one extra download, not two.
export { CallScreen } from "../components/VoiceCall/CallScreen";

/** Everything a Vapi phone call needs, in one lazily loaded module (D-22). */
export function createVapiCall(opts: {
  language: Locale;
  bindBase: (client: VoiceClient) => () => void;
  getSessionId: () => string | null;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  setTurns: (update: (prev: TriageCaptionEvent[]) => TriageCaptionEvent[]) => void;
}) {
  const client = new VapiVoiceClient(opts.language);
  const offBase = opts.bindBase(client);
  const offCaptions = bindCallCaptions(client, opts.getSessionId, opts.post, opts.setTurns);
  // The ringtone plays until the call leaves "ringing" (or is torn down).
  const stopRing = startRingtone();
  const offRing = client.on("state", (s) => s !== "ringing" && stopRing());
  return {
    client,
    unbind: () => {
      offBase();
      offCaptions();
      offRing();
      stopRing();
    },
  };
}
