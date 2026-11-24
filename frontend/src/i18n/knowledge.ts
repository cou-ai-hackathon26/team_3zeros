import { registerMessages } from "./format";
import en from "./messages/knowledge.en.json";
import bn from "./messages/knowledge.bn.json";

// Registers the `knowledge.*` messages used only by the platform-admin knowledge page (D-29).
registerMessages("knowledge", { en, bn });
