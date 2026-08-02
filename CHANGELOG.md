# Change Log

All notable changes to the "omnipack-toolkit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.1.0] - 2026-04-18
### Added
- **Full-Screen Webview UI**: Migrated from a cramped sidebar view to a full editor panel for a much richer mass-export experience.
- **Pre-Flight Review Modal**: Added a confirmation overlay that groups selected datapacks by type so you can safely review your queue before exporting.
- **Aggressive Process Cancellation**: Introduced Node.js `AbortController` integration with `SIGKILL`. You can now instantly kill hanging Vlocity CLI background processes during Fetch or Export operations.
- **Pagination Engine**: Added 50-item client-side pagination in the Webview and a "Load More..." dummy node in the TreeView to prevent DOM lag when querying massive Salesforce orgs.
- **Inline Tree Actions**: Added a quick-access cloud download icon directly to the TreeView rows for one-click exports.
- **Dynamic State Syncing**: Org configuration changes now sync immediately to the Webview badge without requiring a manual UI reload.
- **Collapsible Sidebar Groups**: Webview category lists (OmniStudio, CPQ, etc.) are now neatly organized into collapsible `<details>` tags.
- **Vibe-Coding**: Partnered with Google Gemini to architect and polish the new interactive UI and process-management state. 

### Changed
- Moved the traditional TreeView out of the Explorer pane and into its own dedicated Activity Bar container for better workspace organization.
- Refactored internal caching mechanism to properly drop state when a manual refresh is triggered.

## [0.0.3] - 2025-10-08
- Fixed export path mismatch

## [0.0.2] - 2025-10-07
- Added `projectPath` prompt to update from the user every time they try to export a datapack.
- Removed `cliPath` and `projectPath` from extension configuration.

## [0.0.1] - 2025-10-06
- Initial Release