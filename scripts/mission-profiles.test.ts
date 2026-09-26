import assert from "node:assert/strict";
import {
  buildProfilePrompt,
  isMissionProfile,
  normalizeHandoff,
} from "../src/lib/mission-profiles";

assert.equal(isMissionProfile("iris"), true);
assert.equal(isMissionProfile("unknown"), false);
assert.deepEqual(normalizeHandoff({ objective: "  mapear processo  ", evidence: ["ata"] }), {
  objective: "mapear processo",
  evidence: ["ata"],
});
assert.deepEqual(normalizeHandoff(null), {});
assert.match(
  buildProfilePrompt("lia", "Extrair requisitos", { objective: "mapear atendimento" }),
  /Profile alvo: lia/,
);
assert.match(
  buildProfilePrompt("lia", "Extrair requisitos", { objective: "mapear atendimento" }),
  /mapear atendimento/,
);
console.log("mission profiles contract: ok");
