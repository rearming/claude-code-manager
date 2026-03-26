import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const router = Router();

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', '.next', '.nuxt',
  '.output', '__pycache__', '.cache', '.turbo', 'coverage', '.venv', 'venv',
  'vendor', '.idea', '.vscode', 'target', '.gradle', '.DS_Store',
]);

const IGNORE_EXTENSIONS = new Set([
  '.lock', '.map', '.min.js', '.min.css', '.woff', '.woff2', '.ttf', '.eot',
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp4', '.mp3',
  '.pdf', '.zip', '.tar', '.gz', '.dmg', '.exe', '.dll', '.so', '.dylib',
]);

interface FileEntry {
  /** Path relative to project root */
  relative: string;
  /** Just the filename */
  name: string;
}

/** Cache: projectPath -> { files, timestamp } */
const indexCache = new Map<string, { files: FileEntry[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30s

async function walkDir(dir: string, root: string, files: FileEntry[], limit: number): Promise<void> {
  if (files.length >= limit) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return; // permission denied, etc.
  }

  for (const entry of entries) {
    if (files.length >= limit) return;

    if (entry.name.startsWith('.') && entry.isDirectory()) continue;

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      await walkDir(path.join(dir, entry.name), root, files, limit);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORE_EXTENSIONS.has(ext)) continue;
      const relative = path.relative(root, path.join(dir, entry.name));
      files.push({ relative, name: entry.name });
    }
  }
}

async function getFileIndex(projectPath: string, limit = 10000): Promise<FileEntry[]> {
  const cached = indexCache.get(projectPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.files;
  }

  const files: FileEntry[] = [];
  await walkDir(projectPath, projectPath, files, limit);
  indexCache.set(projectPath, { files, timestamp: Date.now() });
  return files;
}

/** Simple fuzzy match: all query chars must appear in order in the target */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact substring match gets highest score
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    // Prefer matches at path segment boundaries
    const atBoundary = subIdx === 0 || t[subIdx - 1] === '/' || t[subIdx - 1] === '\\';
    return 1000 + (atBoundary ? 500 : 0) + (1000 - target.length);
  }

  // Fuzzy: chars must appear in order
  let qi = 0;
  let score = 0;
  let prevMatch = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive chars score higher
      score += (prevMatch === ti - 1) ? 10 : 1;
      // Boundary bonus
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === '\\' || t[ti - 1] === '.' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 5;
      }
      prevMatch = ti;
      qi++;
    }
  }

  // All query chars must be matched
  if (qi < q.length) return -1;

  return score;
}

/**
 * GET /api/files?project=<path>&q=<query>
 * Returns files in the project directory, optionally filtered by fuzzy query.
 */
router.get('/', async (req, res) => {
  const projectPath = typeof req.query.project === 'string' ? req.query.project : '';
  const query = typeof req.query.q === 'string' ? req.query.q : '';

  if (!projectPath) {
    res.status(400).json({ error: 'project parameter required' });
    return;
  }

  try {
    const resolved = path.resolve(projectPath);
    const stat = await fs.promises.stat(resolved);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: 'Not a directory' });
      return;
    }

    const allFiles = await getFileIndex(resolved);

    if (!query) {
      // No query: return first 50 files sorted by path
      const results = allFiles.slice(0, 50).map(f => f.relative);
      res.json({ files: results });
      return;
    }

    // Fuzzy search
    const scored: { relative: string; score: number }[] = [];
    for (const f of allFiles) {
      const score = fuzzyScore(query, f.relative);
      if (score >= 0) {
        scored.push({ relative: f.relative, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, 30).map(s => s.relative);
    res.json({ files: results });
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * POST /api/files/invalidate
 * Clear cache for a project (e.g., after file operations).
 */
router.post('/invalidate', (req, res) => {
  const projectPath = typeof req.body?.project === 'string' ? req.body.project : '';
  if (projectPath) {
    indexCache.delete(path.resolve(projectPath));
  }
  res.json({ ok: true });
});

export default router;
