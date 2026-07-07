Refresh the phone-readable Google Drive mirror of the org map.

Node can't reach MCP, so this is an agent action (not a `make` target):

1. Run `make org-render` so `ORG.md` is current, then `make org-verify`.
2. Read `registry/drive.json` for the mirror's `org_doc_url` / `folder_id`.
3. Using the Google Drive MCP, upload the current `ORG.md` content into the
   "Apex Factory — Org Map" folder (`folder_id`) as a Google Doc.
4. If a new doc id results, update `registry/drive.json` (`org_doc_url`),
   re-run `make org-render`, and commit `drive.json` + `ORG.md`.

The repo stays the source of truth; Drive is only a human/phone mirror.
