import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (file) => readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "");

export const kitScript = () => strip("iso-kit.mjs");
export const glScript = () => strip("gl.mjs");
export const modelScript = () => readFileSync(join(HERE, "..", "model.mjs"), "utf8").replace(/^export /gm, "");
