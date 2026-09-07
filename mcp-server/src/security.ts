import { parse } from "pgsql-parser";

type AstObject = Record<string, unknown>;

export const ALLOWED_TABLES = ["products", "customers", "orders", "order_items"] as const;

const allowedTables = new Set<string>(ALLOWED_TABLES);
const allowedFunctions = new Set([
  "abs",
  "avg",
  "bool_and",
  "bool_or",
  "ceil",
  "ceiling",
  "concat",
  "count",
  "date_part",
  "date_trunc",
  "floor",
  "greatest",
  "json_agg",
  "json_build_array",
  "json_build_object",
  "jsonb_agg",
  "jsonb_build_array",
  "jsonb_build_object",
  "least",
  "length",
  "lower",
  "max",
  "min",
  "now",
  "round",
  "string_agg",
  "sum",
  "to_char",
  "upper",
]);
const allowedTypes = new Set([
  "bool",
  "boolean",
  "bpchar",
  "date",
  "decimal",
  "float4",
  "float8",
  "int",
  "int2",
  "int4",
  "int8",
  "integer",
  "interval",
  "json",
  "jsonb",
  "numeric",
  "real",
  "text",
  "time",
  "timestamp",
  "timestamptz",
  "varchar",
]);
const allowedOperators = new Set([
  "=", "<>", "!=", "<", ">", "<=", ">=",
  "+", "-", "*", "/", "%", "^", "||",
  "~~", "!~~", "~~*", "!~~*",
  "between",
]);
const allowedExpressionKinds = new Set([
  "AEXPR_OP",
  "AEXPR_OP_ANY",
  "AEXPR_OP_ALL",
  "AEXPR_DISTINCT",
  "AEXPR_NOT_DISTINCT",
  "AEXPR_NULLIF",
  "AEXPR_IN",
  "AEXPR_LIKE",
  "AEXPR_ILIKE",
  "AEXPR_SIMILAR",
  "AEXPR_BETWEEN",
  "AEXPR_NOT_BETWEEN",
  "AEXPR_BETWEEN_SYM",
  "AEXPR_NOT_BETWEEN_SYM",
]);
const allowedSqlValueFunctions = new Set([
  "SVFOP_CURRENT_DATE",
  "SVFOP_CURRENT_TIME",
  "SVFOP_CURRENT_TIME_N",
  "SVFOP_CURRENT_TIMESTAMP",
  "SVFOP_CURRENT_TIMESTAMP_N",
  "SVFOP_LOCALTIME",
  "SVFOP_LOCALTIME_N",
  "SVFOP_LOCALTIMESTAMP",
  "SVFOP_LOCALTIMESTAMP_N",
]);

// PostgreSQL ayrıştırıcısının ham SELECT AST'sinde kabul ettiğimiz düğümler.
// Listede olmayan yeni/öngörülmeyen bir düğüm güvenli varsayılmaz; sorgu reddedilir.
const allowedNodeTypes = new Set([
  "A_Const",
  "A_Expr",
  "A_Star",
  "ArrayExpr",
  "BitString",
  "Boolean",
  "BooleanTest",
  "BoolExpr",
  "CaseExpr",
  "CaseWhen",
  "CoalesceExpr",
  "ColumnRef",
  "CommonTableExpr",
  "Float",
  "FuncCall",
  "GroupingFunc",
  "GroupingSet",
  "Integer",
  "JoinExpr",
  "List",
  "MinMaxExpr",
  "NamedArgExpr",
  "NullTest",
  "RangeSubselect",
  "RangeVar",
  "ResTarget",
  "RowExpr",
  "SelectStmt",
  "SortBy",
  "SQLValueFunction",
  "String",
  "SubLink",
  "TypeCast",
  "WindowDef",
]);

function objectValue(value: unknown): AstObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AstObject;
}

function taggedNode(value: unknown): { tag: string; node: AstObject } | null {
  const object = objectValue(value);
  if (!object) return null;
  const keys = Object.keys(object);
  if (keys.length !== 1) return null;
  const tag = keys[0];
  if (!/^(?:[A-Z][A-Za-z0-9_]*|A_[A-Za-z0-9_]+)$/.test(tag)) return null;
  const node = objectValue(object[tag]);
  return node ? { tag, node } : null;
}

function stringParts(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("AST içindeki ad yapısı geçersiz.");
  return value.map((part) => {
    const tagged = taggedNode(part);
    const name = tagged?.tag === "String" ? tagged.node.sval : undefined;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("AST içindeki ad yapısı geçersiz.");
    }
    return name.toLocaleLowerCase("en-US");
  });
}

function collectCteNames(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectCteNames(item, names));
    return;
  }
  const object = objectValue(value);
  if (!object) return;
  const tagged = taggedNode(object);
  if (tagged?.tag === "CommonTableExpr") {
    const name = tagged.node.ctename;
    if (typeof name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new Error("CTE adı izin verilen biçimde değil.");
    }
    if (names.has(name)) throw new Error("Aynı CTE adı birden fazla kez kullanılamaz.");
    names.add(name);
  }
  Object.values(object).forEach((item) => collectCteNames(item, names));
}

function validateSelectNode(node: AstObject): void {
  if (node.intoClause) throw new Error("SELECT INTO veri oluşturabildiği için yasaktır.");
  if (Array.isArray(node.lockingClause) && node.lockingClause.length > 0) {
    throw new Error("Satır kilitleyen SELECT sorguları yasaktır.");
  }
  if (node.valuesLists) throw new Error("VALUES tabanlı statement desteklenmez.");
  const withClause = objectValue(node.withClause);
  if (withClause?.recursive === true) throw new Error("Recursive CTE sorguları yasaktır.");
  const operation = node.op;
  if (typeof operation === "string" && !new Set(["SETOP_NONE", "SETOP_UNION", "SETOP_INTERSECT", "SETOP_EXCEPT"]).has(operation)) {
    throw new Error("Desteklenmeyen SELECT birleşim işlemi.");
  }
}

function validateTableNode(node: AstObject, cteNames: Set<string>): void {
  const relation = node.relname;
  const schema = node.schemaname;
  const catalog = node.catalogname;
  if (typeof relation !== "string") throw new Error("Tablo adı bulunamadı.");
  if (catalog !== undefined) throw new Error("Başka bir veritabanı kataloğuna erişilemez.");
  if (schema !== undefined && schema !== "public") throw new Error("Yalnızca public şemasına erişilebilir.");
  if (schema === undefined && cteNames.has(relation)) return;
  if (!allowedTables.has(relation)) throw new Error(`Tablo izin listesinde değil: ${relation}`);
}

function validateFunctionNode(node: AstObject): void {
  const parts = stringParts(node.funcname);
  const fullName = parts.join(".");
  // PostgreSQL parser, EXTRACT sözdizimini pg_catalog.extract olarak normalleştirir.
  if (fullName === "pg_catalog.extract") return;
  if (parts.length !== 1 || !allowedFunctions.has(parts[0])) {
    throw new Error(`Fonksiyon izin listesinde değil: ${fullName}`);
  }
}

function validateTypeCastNode(node: AstObject): void {
  const typeName = objectValue(node.typeName);
  if (!typeName) throw new Error("Veri tipi bulunamadı.");
  const parts = stringParts(typeName.names);
  if (parts.length > 2 || (parts.length === 2 && parts[0] !== "pg_catalog")) {
    throw new Error("Yalnızca yerleşik PostgreSQL veri tipleri kullanılabilir.");
  }
  const type = parts.at(-1);
  if (!type || !allowedTypes.has(type)) throw new Error(`Veri tipi izin listesinde değil: ${type ?? "bilinmiyor"}`);
  if (Array.isArray(typeName.arrayBounds) && typeName.arrayBounds.length > 0) {
    throw new Error("Dizi tipine dönüştürme desteklenmez.");
  }
}

function validateExpressionNode(node: AstObject): void {
  if (typeof node.kind !== "string" || !allowedExpressionKinds.has(node.kind)) {
    throw new Error(`İfade türü izin listesinde değil: ${String(node.kind)}`);
  }
  if (node.name === undefined) return;
  const parts = stringParts(node.name);
  if (parts.length !== 1 || !allowedOperators.has(parts[0])) {
    throw new Error(`Operatör izin listesinde değil: ${parts.join(".")}`);
  }
}

function validateSqlValueFunction(node: AstObject): void {
  if (typeof node.op !== "string" || !allowedSqlValueFunctions.has(node.op)) {
    throw new Error(`SQL değer fonksiyonu izin listesinde değil: ${String(node.op)}`);
  }
}

function validateAst(value: unknown, cteNames: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => validateAst(item, cteNames));
    return;
  }
  const object = objectValue(value);
  if (!object) return;
  const tagged = taggedNode(object);
  if (!tagged) {
    Object.values(object).forEach((item) => validateAst(item, cteNames));
    return;
  }
  if (!allowedNodeTypes.has(tagged.tag)) {
    throw new Error(`AST düğümü izin listesinde değil: ${tagged.tag}`);
  }
  if (tagged.tag === "SelectStmt") validateSelectNode(tagged.node);
  if (tagged.tag === "RangeVar") validateTableNode(tagged.node, cteNames);
  if (tagged.tag === "FuncCall") validateFunctionNode(tagged.node);
  if (tagged.tag === "TypeCast") validateTypeCastNode(tagged.node);
  if (tagged.tag === "A_Expr") validateExpressionNode(tagged.node);
  if (tagged.tag === "SQLValueFunction") validateSqlValueFunction(tagged.node);
  validateAst(tagged.node, cteNames);
}

export async function validateReadOnlySql(sql: string): Promise<string> {
  const raw = sql.trim();
  if (raw.length < 6 || raw.length > 4000) throw new Error("Sorgu uzunluğu geçersiz.");
  if (!/^(select|with)\b/i.test(raw)) throw new Error("Sorgu SELECT veya WITH ile başlamalıdır.");
  if (/--|\/\*/.test(raw)) throw new Error("SQL yorumları güvenlik nedeniyle yasaktır.");

  let tree: unknown;
  try {
    tree = await parse(raw);
  } catch {
    throw new Error("SQL, PostgreSQL AST olarak ayrıştırılamadı.");
  }

  const root = objectValue(tree);
  const statements = root?.stmts;
  if (!Array.isArray(statements) || statements.length !== 1) {
    throw new Error("Yalnızca tek SQL statement kabul edilir.");
  }
  const statementContainer = objectValue(statements[0]);
  const statement = statementContainer?.stmt;
  const rootNode = taggedNode(statement);
  if (rootNode?.tag !== "SelectStmt") throw new Error("Yalnızca SELECT statement kabul edilir.");

  const cteNames = new Set<string>();
  collectCteNames(statement, cteNames);
  validateAst(statement, cteNames);

  return raw.replace(/;\s*$/, "");
}
