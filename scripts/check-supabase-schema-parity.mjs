import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const TYPES_PATH = "src/integrations/supabase/types.ts";
const PUBLIC_SECTIONS = ["Tables", "Views", "Functions", "Enums", "CompositeTypes"];

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  return node.getText();
}

function isEmptyRecord(node) {
  return (
    ts.isTypeReferenceNode(node) &&
    node.typeName.getText() === "Record" &&
    node.typeArguments?.length === 2 &&
    node.typeArguments[0].getText() === "PropertyKey" &&
    node.typeArguments[1].kind === ts.SyntaxKind.NeverKeyword
  );
}

function canonicalType(node, context = "") {
  if (
    context === "Args" &&
    (node.kind === ts.SyntaxKind.NeverKeyword ||
      isEmptyRecord(node) ||
      (ts.isTypeLiteralNode(node) && node.members.length === 0))
  ) {
    return { kind: "empty" };
  }

  if (ts.isTypeLiteralNode(node)) {
    const members = node.members.map((member) => canonicalMember(member));
    members.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { kind: "object", members };
  }
  if (ts.isTupleTypeNode(node)) {
    const elements = node.elements.map((element) => canonicalType(element));
    if (context === "Relationships") {
      elements.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return { kind: "tuple", elements };
  }
  if (ts.isArrayTypeNode(node)) {
    return { kind: "array", element: canonicalType(node.elementType) };
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    const types = node.types.map((type) => canonicalType(type));
    types.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {
      kind: ts.isUnionTypeNode(node) ? "union" : "intersection",
      types,
    };
  }
  if (ts.isTypeReferenceNode(node)) {
    return {
      kind: "reference",
      name: node.typeName.getText(),
      arguments: (node.typeArguments ?? []).map((argument) => canonicalType(argument)),
    };
  }
  if (ts.isLiteralTypeNode(node)) {
    return { kind: "literal", value: node.literal.getText() };
  }
  if (ts.isParenthesizedTypeNode(node)) return canonicalType(node.type, context);

  return { kind: ts.SyntaxKind[node.kind], text: node.getText() };
}

function canonicalMember(member) {
  if (ts.isPropertySignature(member)) {
    const name = propertyName(member.name);
    return {
      kind: "property",
      name,
      optional: Boolean(member.questionToken),
      readonly:
        member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ??
        false,
      type: member.type ? canonicalType(member.type, name) : null,
    };
  }

  // Generated database contracts normally contain property signatures only.
  // Retaining an AST-normalized fallback ensures an unexpected construct causes
  // parity to fail rather than being silently discarded.
  return { kind: ts.SyntaxKind[member.kind], text: member.getText() };
}

function findProperty(type, name) {
  if (!ts.isTypeLiteralNode(type)) return undefined;
  return type.members.find(
    (member) => ts.isPropertySignature(member) && propertyName(member.name) === name,
  );
}

export function extractPublicSchema(sourceText, fileName = "types.ts") {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const parseErrors = source.parseDiagnostics;
  if (parseErrors.length > 0) {
    throw new Error(
      `Types inválidos em ${fileName}: ${ts.flattenDiagnosticMessageText(parseErrors[0].messageText, "\n")}`,
    );
  }

  const database = source.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === "Database",
  );
  if (!database || !ts.isTypeLiteralNode(database.type)) {
    throw new Error(`Database não encontrado em ${fileName}`);
  }
  const publicProperty = findProperty(database.type, "public");
  if (!publicProperty?.type || !ts.isTypeLiteralNode(publicProperty.type)) {
    throw new Error(`Database[\"public\"] não encontrado em ${fileName}`);
  }

  return Object.fromEntries(
    PUBLIC_SECTIONS.map((section) => {
      const property = findProperty(publicProperty.type, section);
      if (!property?.type) {
        throw new Error(`Database[\"public\"].${section} não encontrado em ${fileName}`);
      }
      return [section, canonicalType(property.type, section)];
    }),
  );
}

export function schemasAreEqual(left, right) {
  return JSON.stringify(extractPublicSchema(left)) === JSON.stringify(extractPublicSchema(right));
}

export function checkSchemaParity() {
  const generatedTypes = execFileSync(
    "supabase",
    ["gen", "types", "typescript", "--local", "--schema", "public"],
    { encoding: "utf8" },
  );
  const committedTypes = readFileSync(TYPES_PATH, "utf8");
  const generatedSchema = extractPublicSchema(generatedTypes, "types gerados");
  const committedSchema = extractPublicSchema(committedTypes, TYPES_PATH);

  if (JSON.stringify(generatedSchema) !== JSON.stringify(committedSchema)) {
    console.error("Schema parity falhou: o contrato de Database.public divergiu.");
    console.error(
      JSON.stringify({ committed: committedSchema, generated: generatedSchema }, null, 2),
    );
    process.exitCode = 1;
    return false;
  }

  console.log("Schema parity passou: 0 divergências de schema.");
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) checkSchemaParity();
