import { registerMessages } from "./format";
import en from "./messages/auth.en.json";
import bn from "./messages/auth.bn.json";

// Registers the `auth.*` messages. Import this for its side effect from the modules that use them.
registerMessages("auth", { en, bn });
