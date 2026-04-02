import { useState, useCallback } from "react";

const ENTITIES = [
  "Account", "Activity", "Address", "Claim", "Company", "Contact", "Credential",
  "Group", "Job", "Note", "Person", "Policy", "PolicyPeriod", "Producer",
  "ProducerCode", "Renewal", "Submission", "User", "UserContact"
];

const RELOPS = ["Equals", "NotEquals", "LessThan", "LessThanOrEquals", "GreaterThan", "GreaterThanOrEquals"];
const DATE_FUNCS = ["None", "DateFromTimestamp", "DatePart", "DateDiff"];
const AGGREGATES = ["None", "Count", "Sum", "Max", "Min", "Avg"];

function generateGosuCode(config) {
  const lines = [];
  const imports = new Set(["gw.api.database.Query"]);

  if (config.orderBy || config.columns.length > 0) {
    imports.add("gw.api.database.QuerySelectColumns");
    imports.add("gw.api.path.Paths");
  }
  if (config.predicates.some(p => p.dateFunc !== "None") || config.columns.some(c => c.aggregate !== "None")) {
    imports.add("gw.api.database.DBFunction");
  }
  if (config.predicates.some(p => p.dateFunc !== "None")) {
    imports.add("gw.api.util.DateUtil");
  }
  if (config.subselect.enabled) {
    imports.add("gw.api.database.InOperation");
  }

  for (const imp of imports) {
    lines.push(`uses ${imp}`);
  }
  lines.push("");

  // Main query
  const entity = config.entity || "Contact";
  let queryVar = "query";
  lines.push(`var ${queryVar} = Query.make(${entity})${config.distinct ? ".withDistinct(true)" : ""}`);
  lines.push("");

  // Joins
  for (const join of config.joins) {
    if (join.entity && join.foreignKey) {
      const joinType = join.outer ? "outerJoin" : "join";
      const tableVar = `table${join.entity}`;
      lines.push(`// Join ${join.entity} via ${join.foreignKey}`);
      lines.push(`var ${tableVar} = ${queryVar}.${joinType}(${config.entity}#${join.foreignKey})`);
      if (join.castTo) {
        lines.push(`${tableVar} = ${tableVar}.cast(${join.castTo})`);
      }
      lines.push("");
    }
  }

  // Predicates
  if (config.predicates.length > 0) {
    lines.push("// Apply restrictions");
    const hasOr = config.predicateLogic === "OR";

    if (hasOr && config.predicates.length > 1) {
      lines.push(`${queryVar}.or(\\ or1 -> {`);
    }

    for (const pred of config.predicates) {
      if (!pred.field) continue;
      const target = hasOr && config.predicates.length > 1 ? "or1" : queryVar;
      const entityRef = pred.joinEntity ? `table${pred.joinEntity}` : target;
      const fieldRef = `${pred.onEntity || entity}#${pred.field}`;

      let predLine = "";
      if (pred.type === "compare") {
        if (pred.dateFunc === "DateFromTimestamp") {
          predLine = `${entityRef}.compare(DBFunction.DateFromTimestamp(${queryVar}.getColumnRef("${pred.field}")), ${pred.relop}, ${pred.value})`;
        } else if (pred.type === "compareIgnoreCase") {
          predLine = `${entityRef}.compareIgnoreCase(${fieldRef}, ${pred.relop}, ${pred.value})`;
        } else {
          predLine = `${entityRef}.compare(${fieldRef}, ${pred.relop}, ${pred.value})`;
        }
      } else if (pred.type === "between") {
        predLine = `${entityRef}.between(${fieldRef}, ${pred.value}, ${pred.value2})`;
      } else if (pred.type === "startsWith") {
        predLine = `${entityRef}.startsWith(${fieldRef}, ${pred.value}, ${pred.caseSensitive ? "false" : "true"})`;
      } else if (pred.type === "contains") {
        predLine = `${entityRef}.contains(${fieldRef}, ${pred.value}, ${pred.caseSensitive ? "false" : "true"})`;
      } else if (pred.type === "compareIn") {
        predLine = `${entityRef}.compareIn(${fieldRef}, ${pred.value})`;
      } else if (pred.type === "isNull") {
        predLine = `${entityRef}.compare(${fieldRef}, Equals, null)`;
      } else if (pred.type === "isNotNull") {
        predLine = `${entityRef}.compare(${fieldRef}, NotEquals, null)`;
      } else {
        predLine = `${entityRef}.compare(${fieldRef}, ${pred.relop}, ${pred.value})`;
      }

      lines.push(`  ${predLine}`);
    }

    if (hasOr && config.predicates.length > 1) {
      lines.push("})");
    }
    lines.push("");
  }

  // Subselect
  if (config.subselect.enabled && config.subselect.innerEntity) {
    lines.push("// Subselect");
    lines.push(`var innerQuery = Query.make(${config.subselect.innerEntity})`);
    if (config.subselect.innerPredField && config.subselect.innerPredValue) {
      lines.push(`innerQuery.compare(${config.subselect.innerEntity}#${config.subselect.innerPredField}, Equals, ${config.subselect.innerPredValue})`);
    }
    const op = config.subselect.notIn ? "InOperation.CompareNotIn" : "InOperation.CompareIn";
    lines.push(`${queryVar}.subselect(${entity}#${config.subselect.outerField}, ${op}, innerQuery, ${config.subselect.innerEntity}#${config.subselect.innerField})`);
    lines.push("");
  }

  // Select / Row query
  if (config.columns.length > 0) {
    lines.push("// Execute row query with column selection");
    const colSpecs = config.columns.map(c => {
      if (c.aggregate !== "None") {
        return `  QuerySelectColumns.dbFunctionWithAlias("${c.alias || c.field}", DBFunction.${c.aggregate}(Paths.make(${c.entity || entity}#${c.field})))`;
      }
      if (c.alias) {
        return `  QuerySelectColumns.pathWithAlias("${c.alias}", Paths.make(${c.entity || entity}#${c.field}))`;
      }
      return `  QuerySelectColumns.path(Paths.make(${c.entity || entity}#${c.field}))`;
    });
    lines.push(`var results = ${queryVar}.select({`);
    lines.push(colSpecs.join(",\n"));
    lines.push("})");
    lines.push("");

    if (config.orderBy) {
      lines.push(`results.orderBy(QuerySelectColumns.path(Paths.make(${entity}#${config.orderBy})))`);
      lines.push("");
    }

    lines.push("// Iterate row results");
    lines.push("for (row in results) {");
    const printParts = config.columns.map(c => `row.getColumn("${c.alias || c.field}")`);
    lines.push(`  print(${printParts.join(' + " | " + ')})`);
    lines.push("}");
  } else {
    lines.push("// Execute entity query");
    lines.push(`var results = ${queryVar}.select()`);

    if (config.orderBy) {
      lines.push(`results.orderBy(QuerySelectColumns.path(Paths.make(${entity}#${config.orderBy})))`);
    }
    lines.push("");

    if (config.resultAccess === "first") {
      lines.push(`var result = results.FirstResult`);
    } else if (config.resultAccess === "atMostOne") {
      lines.push(`var result = results.AtMostOneRow`);
    } else {
      lines.push(`for (item in results) {`);
      lines.push(`  print(item.DisplayName)`);
      lines.push("}");
    }
  }

  return lines.join("\n");
}

// --- Compact form components ---

function Field({ label, children, inline }) {
  return (
    <div style={{ marginBottom: 8, display: inline ? "flex" : "block", alignItems: "center", gap: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", minWidth: inline ? 90 : "auto", display: "block", marginBottom: inline ? 0 : 3 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#e2e8f0",
  padding: "6px 10px",
  fontSize: 13,
  width: "100%",
  outline: "none",
  fontFamily: "inherit",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

const btnStyle = {
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnDanger = { ...btnStyle, background: "#ef4444", padding: "4px 10px", fontSize: 11 };
const btnSmall = { ...btnStyle, background: "#475569", padding: "5px 12px", fontSize: 11 };

function PredicateRow({ pred, index, onChange, onRemove, entity }) {
  const update = (key, val) => onChange(index, { ...pred, [key]: val });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
      <input style={{ ...inputStyle, width: 100 }} placeholder="Field" value={pred.field} onChange={e => update("field", e.target.value)} />
      <select style={{ ...selectStyle, width: 100 }} value={pred.type} onChange={e => update("type", e.target.value)}>
        <option value="compare">compare</option>
        <option value="compareIgnoreCase">ignoreCase</option>
        <option value="between">between</option>
        <option value="startsWith">startsWith</option>
        <option value="contains">contains</option>
        <option value="compareIn">compareIn</option>
        <option value="isNull">isNull</option>
        <option value="isNotNull">isNotNull</option>
      </select>
      {(pred.type === "compare" || pred.type === "compareIgnoreCase") && (
        <select style={{ ...selectStyle, width: 95 }} value={pred.relop} onChange={e => update("relop", e.target.value)}>
          {RELOPS.map(r => <option key={r}>{r}</option>)}
        </select>
      )}
      {!["isNull", "isNotNull"].includes(pred.type) && (
        <input style={{ ...inputStyle, width: 120 }} placeholder="Value" value={pred.value} onChange={e => update("value", e.target.value)} />
      )}
      {pred.type === "between" && (
        <input style={{ ...inputStyle, width: 100 }} placeholder="Value 2" value={pred.value2 || ""} onChange={e => update("value2", e.target.value)} />
      )}
      <select style={{ ...selectStyle, width: 90 }} value={pred.dateFunc} onChange={e => update("dateFunc", e.target.value)}>
        {DATE_FUNCS.map(d => <option key={d}>{d}</option>)}
      </select>
      <button style={btnDanger} onClick={() => onRemove(index)}>×</button>
    </div>
  );
}

function JoinRow({ join, index, onChange, onRemove }) {
  const update = (key, val) => onChange(index, { ...join, [key]: val });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
      <select style={{ ...selectStyle, width: 100 }} value={join.entity} onChange={e => update("entity", e.target.value)}>
        <option value="">Entity...</option>
        {ENTITIES.map(e => <option key={e}>{e}</option>)}
      </select>
      <input style={{ ...inputStyle, width: 120 }} placeholder="ForeignKey" value={join.foreignKey} onChange={e => update("foreignKey", e.target.value)} />
      <label style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}>
        <input type="checkbox" checked={join.outer} onChange={e => update("outer", e.target.checked)} /> Outer
      </label>
      <input style={{ ...inputStyle, width: 80 }} placeholder="Cast to..." value={join.castTo || ""} onChange={e => update("castTo", e.target.value)} />
      <button style={btnDanger} onClick={() => onRemove(index)}>×</button>
    </div>
  );
}

function ColumnRow({ col, index, onChange, onRemove, entity }) {
  const update = (key, val) => onChange(index, { ...col, [key]: val });
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
      <input style={{ ...inputStyle, width: 100 }} placeholder="Field" value={col.field} onChange={e => update("field", e.target.value)} />
      <input style={{ ...inputStyle, width: 80 }} placeholder="Alias" value={col.alias || ""} onChange={e => update("alias", e.target.value)} />
      <select style={{ ...selectStyle, width: 80 }} value={col.aggregate} onChange={e => update("aggregate", e.target.value)}>
        {AGGREGATES.map(a => <option key={a}>{a}</option>)}
      </select>
      <button style={btnDanger} onClick={() => onRemove(index)}>×</button>
    </div>
  );
}

// --- AI Prompt Parser ---
function parsePrompt(prompt) {
  const lower = prompt.toLowerCase();
  const config = {
    entity: "Contact",
    distinct: false,
    predicates: [],
    joins: [],
    columns: [],
    orderBy: "",
    predicateLogic: "AND",
    resultAccess: "iterate",
    subselect: { enabled: false, innerEntity: "", outerField: "", innerField: "", innerPredField: "", innerPredValue: "", notIn: false },
  };

  // Detect entity
  for (const e of ENTITIES) {
    if (lower.includes(e.toLowerCase())) {
      config.entity = e;
      break;
    }
  }

  // Detect "all policies" type patterns
  if (lower.includes("polic")) config.entity = "Policy";
  if (lower.includes("activit")) config.entity = "Activity";
  if (lower.includes("account")) config.entity = "Account";
  if (lower.includes("person") || lower.includes("people")) config.entity = "Person";
  if (lower.includes("user")) config.entity = "User";
  if (lower.includes("policyperiod") || lower.includes("policy period")) config.entity = "PolicyPeriod";
  if (lower.includes("address")) config.entity = "Address";
  if (lower.includes("company") || lower.includes("companies")) config.entity = "Company";
  if (lower.includes("submission")) config.entity = "Submission";
  if (lower.includes("claim")) config.entity = "Claim";
  if (lower.includes("note")) config.entity = "Note";

  // Detect predicates from common patterns
  const whereMatch = prompt.match(/where\s+(\w+)\s*(=|equals|is|!=|like|contains|starts?\s*with)\s*["']?([^"'\n,]+)["']?/i);
  if (whereMatch) {
    const field = whereMatch[1];
    const op = whereMatch[2].toLowerCase();
    let value = `"${whereMatch[3].trim()}"`;
    let type = "compare";
    let relop = "Equals";

    if (op === "!=" || op === "not equals") relop = "NotEquals";
    if (op === "contains" || op === "like") type = "contains";
    if (op.includes("start")) type = "startsWith";

    config.predicates.push({ field, type, relop, value, dateFunc: "None", caseSensitive: false, value2: "" });
  }

  // Detect city filter
  const cityMatch = prompt.match(/(?:in|city)\s+["']?(\w[\w\s]*)["']?/i);
  if (cityMatch && lower.includes("city")) {
    config.predicates.push({ field: "City", type: "compare", relop: "Equals", value: `"${cityMatch[1].trim()}"`, dateFunc: "None", caseSensitive: false, value2: "" });
  }

  // Detect state filter
  const stateMatch = prompt.match(/(?:state|jurisdiction)\s*(?:=|is|of)?\s*["']?(\w{2})["']?/i);
  if (stateMatch) {
    config.predicates.push({ field: "BaseState", type: "compare", relop: "Equals", value: `Jurisdiction.TC_${stateMatch[1].toUpperCase()}`, dateFunc: "None", caseSensitive: false, value2: "" });
  }

  // Detect order by
  const orderMatch = prompt.match(/order\s*(?:by|on)\s+(\w+)/i);
  if (orderMatch) config.orderBy = orderMatch[1];

  // Detect sort/sorted
  const sortMatch = prompt.match(/sort(?:ed)?\s+by\s+(\w+)/i);
  if (sortMatch) config.orderBy = sortMatch[1];

  // Detect distinct
  if (lower.includes("distinct") || lower.includes("unique")) config.distinct = true;

  // Detect first / single
  if (lower.includes("first") || lower.includes("single") || lower.includes("one result")) config.resultAccess = "first";
  if (lower.includes("at most one") || lower.includes("exactly one")) config.resultAccess = "atMostOne";

  return config;
}

// --- Main App ---
export default function GuidewireQueryAccelerator() {
  const [config, setConfig] = useState({
    entity: "Contact",
    distinct: false,
    predicates: [],
    joins: [],
    columns: [],
    orderBy: "",
    predicateLogic: "AND",
    resultAccess: "iterate",
    subselect: { enabled: false, innerEntity: "", outerField: "", innerField: "", innerPredField: "", innerPredValue: "", notIn: false },
  });
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("prompt");

  const generate = useCallback(() => {
    setCode(generateGosuCode(config));
  }, [config]);

  const handlePrompt = () => {
    if (!prompt.trim()) return;
    const parsed = parsePrompt(prompt);
    setConfig(parsed);
    setCode(generateGosuCode(parsed));
    setActiveTab("builder");
  };

  const updatePredicate = (i, val) => {
    const preds = [...config.predicates];
    preds[i] = val;
    setConfig({ ...config, predicates: preds });
  };
  const removePredicate = (i) => {
    const preds = config.predicates.filter((_, idx) => idx !== i);
    setConfig({ ...config, predicates: preds });
  };
  const addPredicate = () => {
    setConfig({ ...config, predicates: [...config.predicates, { field: "", type: "compare", relop: "Equals", value: "", dateFunc: "None", caseSensitive: false, value2: "", onEntity: "", joinEntity: "" }] });
  };

  const updateJoin = (i, val) => {
    const joins = [...config.joins];
    joins[i] = val;
    setConfig({ ...config, joins: joins });
  };
  const removeJoin = (i) => setConfig({ ...config, joins: config.joins.filter((_, idx) => idx !== i) });
  const addJoin = () => setConfig({ ...config, joins: [...config.joins, { entity: "", foreignKey: "", outer: false, castTo: "" }] });

  const updateColumn = (i, val) => {
    const cols = [...config.columns];
    cols[i] = val;
    setConfig({ ...config, columns: cols });
  };
  const removeColumn = (i) => setConfig({ ...config, columns: config.columns.filter((_, idx) => idx !== i) });
  const addColumn = () => setConfig({ ...config, columns: [...config.columns, { field: "", alias: "", aggregate: "None", entity: "" }] });

  const copyCode = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: "prompt", label: "Prompt" },
    { id: "builder", label: "Builder" },
  ];

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh", padding: 0 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)", borderBottom: "1px solid #1e40af", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #3b82f6, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>GW</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Guidewire PolicyCenter</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Query Accelerator — Gosu Query Builder</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#0f172a" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 20px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
            background: activeTab === t.id ? "#1e293b" : "transparent",
            color: activeTab === t.id ? "#3b82f6" : "#64748b",
            borderBottom: activeTab === t.id ? "2px solid #3b82f6" : "2px solid transparent",
            fontFamily: "inherit",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Prompt Tab */}
        {activeTab === "prompt" && (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
              Describe your query in plain English. Examples: "Find all policies in state CA sorted by PolicyNumber", "Get activities where Subject contains Review", "All companies in city Chicago"
            </div>
            <textarea
              style={{ ...inputStyle, height: 80, resize: "vertical", marginBottom: 10, width: "calc(100% - 22px)" }}
              placeholder='e.g. "Find all policies where BaseState = CA ordered by PolicyNumber"'
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePrompt(); } }}
            />
            <button style={btnStyle} onClick={handlePrompt}>Generate Query</button>
          </div>
        )}

        {/* Builder Tab */}
        {activeTab === "builder" && (
          <div style={{ padding: 16, maxHeight: "50vh", overflowY: "auto" }}>
            {/* Entity & Options */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <Field label="Primary Entity" inline>
                <select style={{ ...selectStyle, width: 140 }} value={config.entity} onChange={e => setConfig({ ...config, entity: e.target.value })}>
                  {ENTITIES.map(e => <option key={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Order By" inline>
                <input style={{ ...inputStyle, width: 120 }} placeholder="Field name" value={config.orderBy} onChange={e => setConfig({ ...config, orderBy: e.target.value })} />
              </Field>
              <Field label="Result" inline>
                <select style={{ ...selectStyle, width: 110 }} value={config.resultAccess} onChange={e => setConfig({ ...config, resultAccess: e.target.value })}>
                  <option value="iterate">Iterate all</option>
                  <option value="first">First only</option>
                  <option value="atMostOne">At most one</option>
                </select>
              </Field>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                <input type="checkbox" checked={config.distinct} onChange={e => setConfig({ ...config, distinct: e.target.checked })} /> Distinct
              </label>
            </div>

            {/* Joins */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#06b6d4", textTransform: "uppercase" }}>Joins</span>
                <button style={btnSmall} onClick={addJoin}>+ Join</button>
              </div>
              {config.joins.map((j, i) => <JoinRow key={i} join={j} index={i} onChange={updateJoin} onRemove={removeJoin} />)}
            </div>

            {/* Predicates */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase" }}>Predicates</span>
                  <select style={{ ...selectStyle, width: 60, padding: "2px 6px", fontSize: 10 }} value={config.predicateLogic} onChange={e => setConfig({ ...config, predicateLogic: e.target.value })}>
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </div>
                <button style={btnSmall} onClick={addPredicate}>+ Filter</button>
              </div>
              {config.predicates.map((p, i) => <PredicateRow key={i} pred={p} index={i} onChange={updatePredicate} onRemove={removePredicate} entity={config.entity} />)}
            </div>

            {/* Columns (Row Query) */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase" }}>Columns (Row Query)</span>
                <button style={btnSmall} onClick={addColumn}>+ Column</button>
              </div>
              {config.columns.map((c, i) => <ColumnRow key={i} col={c} index={i} onChange={updateColumn} onRemove={removeColumn} entity={config.entity} />)}
              {config.columns.length === 0 && <div style={{ fontSize: 11, color: "#475569" }}>No columns = entity query (returns full objects). Add columns for a row query.</div>}
            </div>

            <button style={{ ...btnStyle, width: "100%" }} onClick={generate}>Generate Code</button>
          </div>
        )}

        {/* Code Output */}
        {code && (
          <div style={{ borderTop: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", background: "#1a1a2e" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase" }}>Generated Gosu Code</span>
              <button style={{ ...btnSmall, background: copied ? "#22c55e" : "#475569" }} onClick={copyCode}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre style={{
              background: "#0c0c1d",
              color: "#a5f3fc",
              padding: 16,
              margin: 0,
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
            }}>{code}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
