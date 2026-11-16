// Ruby prints nil as nothing, where JavaScript would print "undefined"
export function str(value) {
  return value === undefined || value === null ? "" : String(value);
}

// Ruby's IO#puts: adds a newline unless the text already ends with one
export function withNewline(text) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

// The same for text given to core.info, which always adds a newline
export function withoutFinalNewline(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}
