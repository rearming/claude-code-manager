# Image Cache Architecture

## Problem

Images in Claude Code sessions are stored inline as base64 within JSONL session files (`~/.claude/projects/{project}/sessions.jsonl`). The annotation engine needs to preserve original images separately so users can draw on a copy without losing the source.

## Storage Layout

```
~/.claude-code-manager/
  cache/
    images/
      {sha256-hash}.{ext}     # original image (png, jpg, gif, webp)
      {sha256-hash}.meta.json  # metadata (source session, message uuid, timestamp)
```

- **Hash-based dedup**: the SHA-256 of the raw image bytes is the filename, so identical images are stored once.
- **Meta file**: tracks provenance so orphaned files can be cleaned up later.

```json
{
  "sessionId": "abc-123",
  "messageUuid": "msg-456",
  "mediaType": "image/png",
  "createdAt": "2026-03-24T12:00:00Z",
  "originalSizeBytes": 204800
}
```

## Flow

1. **On preview open**: client sends the base64 image to `POST /api/images/cache`. Server decodes it, writes the file (if not already cached), returns the hash as an ID.
2. **Annotation**: client loads the original via `GET /api/images/{hash}` onto a canvas. All drawing happens on a canvas overlay — the original pixels are never modified.
3. **Save annotation**: client sends the annotated canvas as a new image to `POST /api/images/cache`. Both the original hash and annotated hash are preserved.
4. **Retrieval**: `GET /api/images/{hash}` serves the file with the correct `Content-Type` from the meta file.

## Why not MongoDB

- The app is a local dev tool with file-based storage throughout (`~/.claude/` JSONL files).
- Images are binary blobs — the filesystem is the natural storage layer.
- Zero operational overhead: no daemon, no connection string, no migrations.
- If structured queries are needed later, SQLite is a better stepping stone than MongoDB for a single-user local tool.

## Cleanup

A future `DELETE /api/images/cleanup` endpoint can scan meta files and remove images whose source sessions no longer exist in `~/.claude/`.
