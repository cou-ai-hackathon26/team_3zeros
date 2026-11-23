import { registerMessages } from "./format";
import en from "./messages/landing.en.json";
import bn from "./messages/landing.bn.json";

// Registers the `landing.*` messages. Import this for its side effect from the modules that use them.
registerMessages("landing", { en, bn });
