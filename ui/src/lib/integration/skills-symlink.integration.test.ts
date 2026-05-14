/**
 * Agent-skill symlink regression guard.
 *
 * Source of truth: .agents/skills/career-ops/SKILL.md
 * CLI mirrors:     .claude/skills/career-ops/SKILL.md → symlink
 *
 * The .agents/ layout follows the open agent-skill standard
 * (agentskills.io). Every supported CLI (Claude Code, Codex, Gemini,
 * OpenCode, Qwen, Copilot, Kimi) reads its skill manifest from a
 * CLI-specific dot-dir. Rather than copy the manifest into each, we
 * keep ONE canonical file and symlink it into each CLI's dir.
 *
 * If anyone replaces the symlink with a copy (e.g. accidentally
 * `cp` instead of `ln -s` after a rebase), this test fails.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SOURCE = path.join(REPO_ROOT, '.agents/skills/career-ops/SKILL.md');
const CLAUDE_MIRROR = path.join(REPO_ROOT, '.claude/skills/career-ops/SKILL.md');

describe('Skill source of truth', () => {
  it('.agents/skills/career-ops/SKILL.md exists', () => {
    expect(fs.existsSync(SOURCE)).toBe(true);
  });

  it('.agents/skills/career-ops/SKILL.md is a regular file (not itself a symlink)', () => {
    const stat = fs.lstatSync(SOURCE);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFile()).toBe(true);
  });

  it('.agents/skills/career-ops/SKILL.md has frontmatter + non-trivial content', () => {
    const body = fs.readFileSync(SOURCE, 'utf8');
    expect(body.length).toBeGreaterThan(500);
    expect(body).toMatch(/^---/);
    expect(body).toMatch(/^name:\s*career-ops/m);
  });
});

describe('CLI mirror — .claude/', () => {
  it('.claude/skills/career-ops/SKILL.md is a symlink (NOT a copy)', () => {
    expect(fs.existsSync(CLAUDE_MIRROR)).toBe(true);
    const stat = fs.lstatSync(CLAUDE_MIRROR);
    expect(
      stat.isSymbolicLink(),
      '.claude/skills/career-ops/SKILL.md must be a symlink to .agents/skills/career-ops/SKILL.md (got regular file)',
    ).toBe(true);
  });

  it('symlink target resolves to the .agents/ source', () => {
    const target = fs.readlinkSync(CLAUDE_MIRROR);
    const resolved = path.resolve(path.dirname(CLAUDE_MIRROR), target);
    expect(resolved).toBe(SOURCE);
  });

  it('symlink content matches the source byte-for-byte (defends against stale symlinks)', () => {
    const claudeContent = fs.readFileSync(CLAUDE_MIRROR, 'utf8');
    const sourceContent = fs.readFileSync(SOURCE, 'utf8');
    expect(claudeContent).toBe(sourceContent);
  });
});
