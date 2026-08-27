import fs from 'node:fs';

const FORBIDDEN_MAPPING_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class YamlSyntaxError extends Error {
  constructor(message, source = '<yaml>', line = null) {
    super(`${source}${line ? `:${line}` : ''}: ${message}`);
    this.name = 'YamlSyntaxError';
    this.source = source;
    this.line = line;
  }
}

function stripComment(value) {
  let single = false;
  let double = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "'" && !double) single = !single;
    else if (char === '"' && !single && value[i - 1] !== '\\') double = !double;
    else if (char === '#' && !single && !double && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value.trimEnd();
}

function splitComma(value) {
  const parts = [];
  let current = '';
  let single = false;
  let double = false;
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "'" && !double) single = !single;
    else if (char === '"' && !single && value[i - 1] !== '\\') double = !double;
    else if (!single && !double && (char === '[' || char === '{')) depth += 1;
    else if (!single && !double && (char === ']' || char === '}')) depth -= 1;
    if (char === ',' && !single && !double && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim() || value.trim()) parts.push(current.trim());
  return parts;
}

function splitKeyValue(content, source, line) {
  let single = false;
  let double = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === "'" && !double) single = !single;
    else if (char === '"' && !single && content[i - 1] !== '\\') double = !double;
    else if (char === ':' && !single && !double) {
      const key = content.slice(0, i).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) {
        throw new YamlSyntaxError(`unsupported key ${JSON.stringify(key)}`, source, line);
      }
      if (FORBIDDEN_MAPPING_KEYS.has(key)) {
        throw new YamlSyntaxError(`forbidden mapping key ${JSON.stringify(key)}`, source, line);
      }
      return [key, content.slice(i + 1).trim()];
    }
  }
  throw new YamlSyntaxError('expected key: value', source, line);
}

export function parseScalar(raw, source = '<yaml>', line = null) {
  const value = raw.trim();
  if (value === '') return undefined;
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const body = value.slice(1, -1).trim();
    return body ? splitComma(body).map((item) => parseScalar(item, source, line)) : [];
  }
  if (value === '{}') return {};
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new YamlSyntaxError('invalid double-quoted scalar', source, line);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value === '|' || value === '>') {
    throw new YamlSyntaxError('block scalars are not supported in factory contracts', source, line);
  }
  return value;
}

export function parseYaml(input, { source = '<yaml>' } = {}) {
  const normalized = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const tokens = [];
  for (const [index, rawLine] of normalized.split('\n').entries()) {
    if (/\t/.test(rawLine.match(/^\s*/)?.[0] || '')) {
      throw new YamlSyntaxError('tabs are not allowed for indentation', source, index + 1);
    }
    const uncommented = stripComment(rawLine);
    if (!uncommented.trim() || uncommented.trim() === '---') continue;
    const indent = uncommented.match(/^ */)[0].length;
    if (indent % 2 !== 0) throw new YamlSyntaxError('indentation must use multiples of two spaces', source, index + 1);
    tokens.push({ indent, content: uncommented.slice(indent), line: index + 1 });
  }
  if (tokens.length === 0) return {};

  function parseBlock(start, indent) {
    if (tokens[start].indent !== indent) {
      throw new YamlSyntaxError(`unexpected indentation; expected ${indent} spaces`, source, tokens[start].line);
    }
    return tokens[start].content.startsWith('- ')
      ? parseSequence(start, indent)
      : parseMapping(start, indent);
  }

  function parseMapping(start, indent) {
    const out = Object.create(null);
    let cursor = start;
    while (cursor < tokens.length && tokens[cursor].indent === indent && !tokens[cursor].content.startsWith('- ')) {
      const token = tokens[cursor];
      const [key, raw] = splitKeyValue(token.content, source, token.line);
      if (Object.hasOwn(out, key)) throw new YamlSyntaxError(`duplicate key ${key}`, source, token.line);
      cursor += 1;
      if (raw !== '') out[key] = parseScalar(raw, source, token.line);
      else if (cursor < tokens.length && tokens[cursor].indent > indent) {
        const parsed = parseBlock(cursor, tokens[cursor].indent);
        out[key] = parsed.value;
        cursor = parsed.next;
      } else out[key] = null;
    }
    return { value: out, next: cursor };
  }

  function parseSequence(start, indent) {
    const out = [];
    let cursor = start;
    while (cursor < tokens.length && tokens[cursor].indent === indent && tokens[cursor].content.startsWith('- ')) {
      const token = tokens[cursor];
      const rawItem = token.content.slice(2).trim();
      cursor += 1;
      if (rawItem === '') {
        if (cursor >= tokens.length || tokens[cursor].indent <= indent) {
          throw new YamlSyntaxError('empty sequence item', source, token.line);
        }
        const parsed = parseBlock(cursor, tokens[cursor].indent);
        out.push(parsed.value);
        cursor = parsed.next;
        continue;
      }
      if (rawItem.includes(':')) {
        const [key, raw] = splitKeyValue(rawItem, source, token.line);
        const item = Object.create(null);
        if (raw !== '') item[key] = parseScalar(raw, source, token.line);
        else if (cursor < tokens.length && tokens[cursor].indent > indent + 2) {
          const parsed = parseBlock(cursor, tokens[cursor].indent);
          item[key] = parsed.value;
          cursor = parsed.next;
        } else item[key] = null;
        if (cursor < tokens.length && tokens[cursor].indent === indent + 2 && !tokens[cursor].content.startsWith('- ')) {
          const parsed = parseMapping(cursor, indent + 2);
          for (const [nestedKey, nestedValue] of Object.entries(parsed.value)) {
            if (Object.hasOwn(item, nestedKey)) {
              throw new YamlSyntaxError(`duplicate key ${nestedKey}`, source, tokens[cursor].line);
            }
            item[nestedKey] = nestedValue;
          }
          cursor = parsed.next;
        }
        out.push(item);
      } else out.push(parseScalar(rawItem, source, token.line));
    }
    return { value: out, next: cursor };
  }

  const parsed = parseBlock(0, tokens[0].indent);
  if (parsed.next !== tokens.length) {
    throw new YamlSyntaxError('content could not be associated with its parent block', source, tokens[parsed.next].line);
  }
  return parsed.value;
}

function scalarToYaml(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  if (/^[A-Za-z0-9_./<>@+-]+$/.test(text) && !['null', 'true', 'false'].includes(text)) return text;
  return JSON.stringify(text);
}

function emptyCollection(value) {
  if (Array.isArray(value) && value.length === 0) return '[]';
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return '{}';
  return null;
}

export function stringifyYaml(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item);
        if (entries.length === 0) return `${prefix}- {}`;
        const [[firstKey, firstValue], ...rest] = entries;
        const firstEmpty = emptyCollection(firstValue);
        const first = firstEmpty
          ? `${prefix}- ${firstKey}: ${firstEmpty}`
          : firstValue && typeof firstValue === 'object'
          ? `${prefix}- ${firstKey}:\n${stringifyYaml(firstValue, indent + 4)}`
          : `${prefix}- ${firstKey}: ${scalarToYaml(firstValue)}`;
        const tail = rest.map(([key, nested]) => {
          const inline = emptyCollection(nested);
          if (inline) return `${' '.repeat(indent + 2)}${key}: ${inline}`;
          return nested && typeof nested === 'object'
            ? `${' '.repeat(indent + 2)}${key}:\n${stringifyYaml(nested, indent + 4)}`
            : `${' '.repeat(indent + 2)}${key}: ${scalarToYaml(nested)}`;
        });
        return [first, ...tail].join('\n');
      }
      return `${prefix}- ${scalarToYaml(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${prefix}{}`;
    return entries.map(([key, nested]) => {
      const inline = emptyCollection(nested);
      if (inline) return `${prefix}${key}: ${inline}`;
      return nested && typeof nested === 'object'
        ? `${prefix}${key}:\n${stringifyYaml(nested, indent + 2)}`
        : `${prefix}${key}: ${scalarToYaml(nested)}`;
    }).join('\n');
  }
  return `${prefix}${scalarToYaml(value)}`;
}

export function readYaml(file) {
  return parseYaml(fs.readFileSync(file, 'utf8'), { source: file });
}

export function writeYaml(file, value) {
  fs.writeFileSync(file, `${stringifyYaml(value)}\n`, 'utf8');
}
