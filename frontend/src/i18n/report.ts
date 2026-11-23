import { registerMessages } from "./format";
import en from "./messages/report.en.json";
import bn from "./messages/report.bn.json";

// Registers the `report.*` messages used only by the consultation report panel.
registerMessages("report", { en, bn });
