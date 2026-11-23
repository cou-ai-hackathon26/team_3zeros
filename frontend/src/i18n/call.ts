import { registerMessages } from "./format";
import en from "./messages/call.en.json";
import bn from "./messages/call.bn.json";

// Registers the `call.*` messages used only by the lazy-loaded call screen.
registerMessages("call", { en, bn });
