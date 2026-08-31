import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COSTED_CREATE_ACTIONS } from "./budgeted-prisma.extension";
import { RELATION_TARGET_MODELS } from "./relation-target-models";

const SCHEMA_PATH = join(__dirname, "..", "..", "prisma", "schema.prisma");

interface ModelBlock {
  name: string;
  body: string;
}

function readModelBlocks(schema: string): ModelBlock[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(
    ([, name, body]) => ({ name, body }),
  );
}

function costedModelNames(): Set<string> {
  return new Set(
    Object.keys(COSTED_CREATE_ACTIONS).map(
      (model) => model.charAt(0).toUpperCase() + model.slice(1),
    ),
  );
}

function relationFieldsCreatingCostedModels(): Map<string, string> {
  const blocks = readModelBlocks(readFileSync(SCHEMA_PATH, "utf8"));
  const declaredModels = new Set(blocks.map((block) => block.name));
  const costed = costedModelNames();
  const relationFields = new Map<string, string>();

  for (const block of blocks) {
    for (const line of block.body.split("\n")) {
      const field = /^\s*(\w+)\s+(\w+)/.exec(line);

      if (!field) continue;

      const [, fieldName, fieldType] = field;

      if (!declaredModels.has(fieldType) || !costed.has(fieldType)) continue;

      relationFields.set(`${block.name}.${fieldName}`, fieldType);
    }
  }

  return relationFields;
}

describe("relation target models", () => {
  it("finds relation fields to check against, so an empty parse cannot pass", () => {
    expect(relationFieldsCreatingCostedModels().size).toBeGreaterThan(10);
  });

  it("names every schema relation field that can create a costed model", () => {
    for (const [
      relationField,
      targetModel,
    ] of relationFieldsCreatingCostedModels()) {
      expect(RELATION_TARGET_MODELS[relationField]).toBe(targetModel);
    }
  });

  it("names no relation field the schema no longer has", () => {
    const inSchema = relationFieldsCreatingCostedModels();

    for (const relationField of Object.keys(RELATION_TARGET_MODELS)) {
      expect(inSchema.has(relationField)).toBe(true);
    }
  });
});
