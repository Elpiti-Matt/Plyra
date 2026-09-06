/** Plyra navigation semantics. Native notation adapters must keep their own internal line grammar. */
export const LINE_STYLE = {
  local: { color: "#778293", width: 1, dash: undefined },
  external: { color: "#7b7893", width: 1.35, dash: "6 5" },
  identity: { color: "#9a6129", light: "#f1c779", glow: "#dba454", width: 2.2 },
} as const;
