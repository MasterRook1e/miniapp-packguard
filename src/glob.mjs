import { normalizeRelative } from "./util.mjs";

const REGEX_SPECIAL = /[\\^$+?.()|{}\[\]]/;

export function globToRegExp(pattern) {
  const input = normalizeRelative(pattern || "**/*");
  let source = "^";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "*") {
      if (input[index + 1] === "*") {
        index += 1;
        if (input[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "/") {
      source += "/";
    } else {
      source += REGEX_SPECIAL.test(char) ? `\\${char}` : char;
    }
  }
  source += "$";
  return new RegExp(source);
}

export function compileGlobs(patterns) {
  return (patterns || []).map((pattern) => ({ pattern, regex: globToRegExp(pattern) }));
}

export function matchesAny(relativePath, compiled) {
  return compiled.some(({ regex }) => regex.test(normalizeRelative(relativePath)));
}

export function matchesSelection(relativePath, include, exclude) {
  const normalized = normalizeRelative(relativePath);
  return (include.length === 0 || matchesAny(normalized, include)) && !matchesAny(normalized, exclude);
}
