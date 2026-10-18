#!/usr/bin/env node
// Documentation checks for SoloOps AI. No dependencies; run with `node scripts/check-docs.mjs`.
// Checks: relative links and heading anchors, Markdown table pipes inside code spans,
// Mermaid block types, unique requirement/rule IDs, and Claude Code skill/agent frontmatter.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const errors = [];
const warnings = [];
const rel = (p) => relative(root, p).replaceAll('\\', '/');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Split into lines, flagging those inside fenced code blocks.
function lines(text) {
  let fence = null;
  return text.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*(```+|~~~+)(.*)$/);
    if (m) {
      if (!fence) { fence = m[1]; return { line, code: true, open: m[2].trim() }; }
      if (line.trim().startsWith(fence)) { fence = null; return { line, code: true }; }
    }
    return { line, code: fence !== null };
  });
}

// GitHub-style heading slugs.
const slugCache = new Map();
function slugs(file) {
  if (slugCache.has(file)) return slugCache.get(file);
  const seen = new Map();
  const set = new Set();
  for (const { line, code } of lines(readFileSync(file, 'utf8'))) {
    if (code) continue;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    let s = m[1]
      .replace(/`/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    set.add(n ? `${s}-${n}` : s);
  }
  slugCache.set(file, set);
  return set;
}

const mermaidTypes = /^(flowchart|graph|sequenceDiagram|stateDiagram(-v2)?|erDiagram|classDiagram|gantt|journey|pie|mindmap|timeline)\b/;
const files = walk(root);

for (const file of files) {
  const ls = lines(readFileSync(file, 'utf8'));
  ls.forEach(({ line, code, open }, i) => {
    const where = `${rel(file)}:${i + 1}`;
    if (open === 'mermaid') {
      const next = ls[i + 1]?.line.trim() ?? '';
      if (!mermaidTypes.test(next)) errors.push(`${where} unknown Mermaid diagram type: "${next}"`);
    }
    if (code) return;
    if (/^\s*\|/.test(line) && [...line.replace(/\\\|/g, '').matchAll(/`[^`]*`/g)].some((s) => s[0].includes('|'))) {
      warnings.push(`${where} unescaped "|" inside a code span in a table row`);
    }
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [pathPart, anchor] = target.split('#');
      const dest = pathPart ? resolve(dirname(file), decodeURIComponent(pathPart)) : file;
      if (!existsSync(dest)) { errors.push(`${where} broken link: ${target}`); continue; }
      if (anchor && dest.endsWith('.md') && !slugs(dest).has(anchor.toLowerCase())) {
        errors.push(`${where} missing anchor: ${target}`);
      }
    }
  });
}

// Stable IDs must be defined once.
function uniqueIds(file, pattern) {
  const p = join(root, file);
  if (!existsSync(p)) return errors.push(`missing ${file}`);
  const seen = new Set();
  for (const { line, code } of lines(readFileSync(p, 'utf8'))) {
    if (code) continue;
    const m = line.match(pattern);
    if (!m) continue;
    if (seen.has(m[1])) errors.push(`${file} duplicate ID ${m[1]}`);
    seen.add(m[1]);
  }
}
uniqueIds('docs/product/requirements.md', /^\|\s*((?:FR|NFR|SEC|PRV|A11Y|ERR)-\d+)\s*\|/);
uniqueIds('docs/product/business-rules.md', /^\|\s*(BR-\d+)\s*\|/);
uniqueIds('docs/product/acceptance-criteria.md', /^- \*\*(AC-\d+\.\d+)\*\*/);
uniqueIds('docs/quality/test-plan.md', /^\|\s*(TC-[\w.-]+)\s*\|/);

// Claude Code frontmatter.
function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = {};
  for (const l of text.slice(3, end).split(/\r?\n/)) {
    const m = l.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { fm, lineCount: text.split(/\r?\n/).length };
}

const skillsDir = join(root, '.claude', 'skills');
if (existsSync(skillsDir)) {
  for (const dir of readdirSync(skillsDir)) {
    const f = join(skillsDir, dir, 'SKILL.md');
    if (!existsSync(f)) { errors.push(`.claude/skills/${dir} has no SKILL.md`); continue; }
    const r = frontmatter(f);
    if (!r) { errors.push(`${rel(f)} missing frontmatter`); continue; }
    if (r.fm.name !== dir) errors.push(`${rel(f)} name "${r.fm.name}" != directory "${dir}"`);
    if (!r.fm.description) errors.push(`${rel(f)} missing description`);
    else if (r.fm.description.length > 1536) errors.push(`${rel(f)} description > 1536 chars`);
    if (r.lineCount > 500) warnings.push(`${rel(f)} exceeds 500 lines`);
  }
}

const agentsDir = join(root, '.claude', 'agents');
const knownTools = new Set(['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'NotebookEdit', 'PowerShell']);
const skillNames = existsSync(skillsDir) ? new Set(readdirSync(skillsDir)) : new Set();
if (existsSync(agentsDir)) {
  for (const name of readdirSync(agentsDir).filter((n) => n.endsWith('.md'))) {
    const f = join(agentsDir, name);
    const r = frontmatter(f);
    if (!r) { errors.push(`${rel(f)} missing frontmatter`); continue; }
    if (!r.fm.name) errors.push(`${rel(f)} missing name`);
    else if (r.fm.name !== basename(name, '.md')) warnings.push(`${rel(f)} name differs from filename`);
    if (!r.fm.description) errors.push(`${rel(f)} missing description`);
    for (const t of (r.fm.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!knownTools.has(t) && !t.startsWith('mcp__')) warnings.push(`${rel(f)} unrecognised tool "${t}"`);
    }
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/^\s+-\s+(soloops-[\w-]+)\s*$/gm)) {
      if (!skillNames.has(m[1])) errors.push(`${rel(f)} references unknown skill ${m[1]}`);
    }
  }
}

console.log(`Checked ${files.length} Markdown files.`);
for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
