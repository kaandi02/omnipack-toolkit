import * as vscode from 'vscode';
import { typeMappings } from '../utils/typeMappings';
import { executeCliCommand } from '../utils/cli';
import { configureExtension } from '../commands/configure';
import * as path from 'path';
import * as fs from 'fs/promises';

interface DatapackRecord {
    id: string;
    name: string;
    type: string;
}

export class DatapackWebviewProvider {
    public static currentPanel: DatapackWebviewProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _datapackCache: Map<string, DatapackRecord[]> = new Map();

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DatapackWebviewProvider.currentPanel) {
            DatapackWebviewProvider.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'omnipackToolkit',
            'OmniPack Toolkit',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        DatapackWebviewProvider.currentPanel = new DatapackWebviewProvider(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.webview.html = this._getHtmlContent();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'fetchDatapacks':
                        await this._handleFetchDatapacks(message.type);
                        break;
                    case 'exportDatapacks':
                        await this._handleExport(message.keys, message.withDependencies);
                        break;
                    case 'configure':
                        await configureExtension();
                        break;
                    case 'clearCache':
                        this._datapackCache.clear();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleFetchDatapacks(type: string) {
        // Check config
        const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
        let sfdxUsername = config.get<string>('sfdxUsername');

        if (!sfdxUsername) {
            await configureExtension();
            sfdxUsername = config.get<string>('sfdxUsername');
            if (!sfdxUsername) {
                this._panel.webview.postMessage({
                    command: 'datapacksError',
                    type,
                    error: 'No SFDX org configured. Please configure first.'
                });
                return;
            }
        }

        // Return cache if available
        if (this._datapackCache.has(type)) {
            this._panel.webview.postMessage({
                command: 'datapacksLoaded',
                type,
                records: this._datapackCache.get(type)!
            });
            return;
        }

        this._panel.webview.postMessage({ command: 'datapacksLoading', type });

        try {
            const command = `vlocity packGetAllAvailableExports --nojob --sfdx.username ${sfdxUsername} --type ${type} --json`;
            const { stdout } = await executeCliCommand(command, { maxBuffer: 1024 * 1024 * 10 });
            const result = JSON.parse(stdout);

            let records: DatapackRecord[] = [];
            if (result.status === 'success' && result.records) {
                records = result.records.map((r: any) => ({
                    id: r.Id,
                    name: r.VlocityDataPackDisplayLabel,
                    type
                })).sort((a: DatapackRecord, b: DatapackRecord) => a.name.localeCompare(b.name));
            }

            this._datapackCache.set(type, records);
            this._panel.webview.postMessage({ command: 'datapacksLoaded', type, records });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'datapacksError',
                type,
                error: error.message
            });
        }
    }

    private async _handleExport(keys: { type: string; id: string; name: string }[], withDependencies: boolean) {
        const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
        const sfdxUsername = config.get<string>('sfdxUsername');
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            this._panel.webview.postMessage({ command: 'exportError', error: 'No workspace folder open.' });
            return;
        }

        if (!sfdxUsername) {
            this._panel.webview.postMessage({ command: 'exportError', error: 'No SFDX org configured.' });
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;

        const projectPath = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Vlocity Project Folder',
            defaultUri: vscode.Uri.file(`${workspacePath}/vlocity`)
        });

        if (!projectPath) {
            this._panel.webview.postMessage({ command: 'exportCancelled' });
            return;
        }

        const depth = withDependencies ? -1 : 0;
        const total = keys.length;
        let completed = 0;
        let failed = 0;
        const errors: string[] = [];

        this._panel.webview.postMessage({ command: 'exportStarted', total });

        const outputChannel = vscode.window.createOutputChannel('OmniPack Export');
        outputChannel.show();

        for (const item of keys) {
            const mapping = typeMappings[item.type];
            if (!mapping) {
                failed++;
                errors.push(`No mapping for type: ${item.type}`);
                continue;
            }

            const exportKey = mapping.exportKeyFormat.replace('{label}', item.id);
            const command = `vlocity --sfdx.username ${sfdxUsername} --projectPath ${projectPath[0].fsPath} packExport --key ${exportKey} --nojob --maxDepth ${depth} --json`;

            try {
                this._panel.webview.postMessage({ command: 'exportProgress', current: completed + 1, total, name: item.name });
                outputChannel.appendLine(`Exporting: ${item.name} (${item.type})`);

                const { stdout } = await executeCliCommand(command, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10 });
                const result = JSON.parse(stdout);

                if (result.status === 'success') {
                    completed++;
                    outputChannel.appendLine(`  ✓ Exported: ${item.name}`);
                } else {
                    failed++;
                    errors.push(`${item.name}: ${result.message}`);
                    outputChannel.appendLine(`  ✗ Failed: ${item.name} — ${result.message}`);
                }
            } catch (error: any) {
                failed++;
                errors.push(`${item.name}: ${error.message}`);
                outputChannel.appendLine(`  ✗ Error: ${item.name} — ${error.message}`);
            }
        }

        // Cleanup temp files
        for (const file of ['VlocityBuildLog.yaml', 'VlocityBuildErrors.log']) {
            try { await fs.unlink(path.join(workspacePath, file)); } catch { }
        }
        try { await fs.rm(path.join(workspacePath, 'vlocity-temp'), { recursive: true, force: true }); } catch { }

        outputChannel.appendLine(`\nDone: ${completed} exported, ${failed} failed.`);

        this._panel.webview.postMessage({
            command: 'exportComplete',
            completed,
            failed,
            errors
        });
    }

    public dispose() {
        DatapackWebviewProvider.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }

    private _getHtmlContent(): string {
        const typeKeys = Object.keys(typeMappings);

        // Group types into categories for the sidebar
        const categories: { [key: string]: string[] } = {
            'OmniStudio': ['OmniScript', 'IntegrationProcedure', 'DataRaptor', 'VlocityCard', 'VlocityUITemplate', 'VlocityUILayout', 'UIFacet', 'UISection'],
            'CPQ & Pricing': ['Product2', 'Pricebook2', 'PriceList', 'PricingPlan', 'PricingVariable', 'CalculationMatrix', 'CalculationProcedure', 'QueryBuilder', 'Promotion', 'Catalog'],
            'Rules & Context': ['Rule', 'ContextAction', 'ContextDimension', 'ContextScope', 'ObjectContextRule', 'AttributeAssignmentRule', 'AttributeCategory', 'CpqConfigurationSetup', 'EntityFilter'],
            'Orchestration': ['OrchestrationPlanDefinition', 'OrchestrationItemDefinition', 'OrchestrationDependencyDefinition', 'ManualQueue', 'TimePlan', 'TimePolicy'],
            'Objects & Contracts': ['ObjectClass', 'ObjectLayout', 'ContractType', 'InterfaceImplementation', 'ItemImplementation', 'OfferMigrationPlan'],
            'Other': ['System', 'VlocityAction', 'VlocityAttachment', 'VlocityFunction', 'VlocityPicklist', 'DocumentClause', 'DocumentTemplate', 'IntegrationRetryPolicy', 'VqMachine', 'VqResource']
        };

        const typeIcons: { [key: string]: string } = {
            'OmniScript': '📋', 'IntegrationProcedure': '⚙️', 'DataRaptor': '🦅',
            'VlocityCard': '🃏', 'VlocityUITemplate': '🎨', 'VlocityUILayout': '📐',
            'Product2': '📦', 'Pricebook2': '💰', 'PriceList': '🏷️',
            'CalculationMatrix': '🧮', 'CalculationProcedure': '🔢',
            'Rule': '📏', 'ContextAction': '⚡', 'Catalog': '📚',
            'ObjectClass': '🗂️', 'ContractType': '📄', 'System': '🖥️',
        };

        const categoriesJson = JSON.stringify(categories);
        const iconsJson = JSON.stringify(typeIcons);

        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OmniPack Toolkit</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f1117;
    --bg2: #161b27;
    --bg3: #1c2235;
    --bg4: #232a3e;
    --border: #2a3347;
    --border-glow: #3d5a9a;
    --text: #e2e8f4;
    --text2: #8b9ab8;
    --text3: #5a6882;
    --accent: #4f8ef7;
    --accent2: #7c3aed;
    --accent-glow: rgba(79,142,247,0.15);
    --green: #34d399;
    --red: #f87171;
    --yellow: #fbbf24;
    --radius: 8px;
    --mono: 'JetBrains Mono', monospace;
    --sans: 'Syne', sans-serif;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── TOP BAR ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .topbar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar-logo {
    width: 28px; height: 28px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .topbar-title {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.3px;
    color: var(--text);
  }
  .topbar-title span { color: var(--accent); }
  .topbar-actions { display: flex; gap: 8px; align-items: center; }

  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg3);
    color: var(--text2);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.3px;
  }
  .btn:hover { background: var(--bg4); color: var(--text); border-color: var(--border-glow); }
  .btn-accent {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .btn-accent:hover { background: #3a7de0; border-color: #3a7de0; color: #fff; }
  .btn-accent:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-ghost { background: transparent; border-color: transparent; }
  .btn-ghost:hover { background: var(--bg3); border-color: var(--border); }

  /* ── MAIN LAYOUT ── */
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── SIDEBAR ── */
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--bg2);
    border-right: 1px solid var(--border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar::-webkit-scrollbar { width: 4px; }
  .sidebar::-webkit-scrollbar-track { background: transparent; }
  .sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .sidebar-search {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0;
    background: var(--bg2);
    z-index: 2;
  }
  .search-input {
    width: 100%;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-input::placeholder { color: var(--text3); }
  .search-input:focus { border-color: var(--accent); }

  .category-group { padding: 4px 0; }
  .category-label {
    padding: 6px 14px 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text3);
  }

  .type-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--text2);
    transition: all 0.12s;
    border-left: 2px solid transparent;
    position: relative;
  }
  .type-item:hover { background: var(--bg3); color: var(--text); }
  .type-item.active {
    background: var(--accent-glow);
    color: var(--accent);
    border-left-color: var(--accent);
  }
  .type-item .type-icon { font-size: 13px; width: 18px; text-align: center; }
  .type-item .type-badge {
    margin-left: auto;
    font-size: 9px;
    font-family: var(--mono);
    background: var(--bg4);
    color: var(--text3);
    padding: 1px 5px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }
  .type-item.active .type-badge { background: var(--accent); color: #fff; }
  .type-item.has-selection .type-name::after {
    content: '•';
    color: var(--green);
    margin-left: 4px;
  }

  /* ── CONTENT PANEL ── */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-header {
    padding: 14px 20px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg);
    flex-shrink: 0;
  }
  .content-title-group {}
  .content-type-name {
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.5px;
  }
  .content-subtitle {
    font-size: 11px;
    color: var(--text3);
    font-family: var(--mono);
    margin-top: 2px;
  }

  .header-tools { display: flex; gap: 8px; align-items: center; }
  .select-counter {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text2);
    background: var(--bg3);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 20px;
  }
  .select-counter span { color: var(--accent); font-weight: 600; }

  /* ── DATAPACK GRID ── */
  .datapack-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }
  .datapack-list::-webkit-scrollbar { width: 4px; }
  .datapack-list::-webkit-scrollbar-track { background: transparent; }
  .datapack-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .list-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .filter-input {
    flex: 1;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    outline: none;
  }
  .filter-input::placeholder { color: var(--text3); }
  .filter-input:focus { border-color: var(--accent); }

  .record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 8px;
  }

  .record-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.12s;
    user-select: none;
  }
  .record-card:hover { border-color: var(--border-glow); background: var(--bg3); }
  .record-card.selected {
    background: var(--accent-glow);
    border-color: var(--accent);
  }

  .record-checkbox {
    width: 16px; height: 16px;
    border: 1.5px solid var(--border-glow);
    border-radius: 4px;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.12s;
  }
  .record-card.selected .record-checkbox {
    background: var(--accent);
    border-color: var(--accent);
  }
  .record-checkbox::after {
    content: '✓';
    font-size: 10px;
    color: #fff;
    opacity: 0;
    transition: opacity 0.1s;
  }
  .record-card.selected .record-checkbox::after { opacity: 1; }

  .record-info { flex: 1; min-width: 0; }
  .record-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .record-id {
    font-size: 10px;
    font-family: var(--mono);
    color: var(--text3);
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── EMPTY / LOADING / ERROR STATES ── */
  .state-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text3);
  }
  .state-icon { font-size: 40px; opacity: 0.5; }
  .state-title { font-size: 14px; font-weight: 700; color: var(--text2); }
  .state-sub { font-size: 12px; font-family: var(--mono); text-align: center; max-width: 300px; line-height: 1.6; }

  .spinner {
    width: 36px; height: 36px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── EXPORT BAR ── */
  .export-bar {
    padding: 12px 20px;
    background: var(--bg2);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    transition: all 0.2s;
  }
  .export-bar.hidden { display: none; }

  .export-summary {
    flex: 1;
    font-size: 12px;
    color: var(--text2);
  }
  .export-summary strong {
    color: var(--text);
    font-weight: 700;
  }
  .export-summary .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 5px;
  }
  .export-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 10px;
    font-family: var(--mono);
    color: var(--text2);
  }
  .export-tag .remove-tag {
    cursor: pointer;
    color: var(--text3);
    font-size: 11px;
    line-height: 1;
  }
  .export-tag .remove-tag:hover { color: var(--red); }

  .export-buttons { display: flex; gap: 8px; }
  .btn-export-dep {
    background: linear-gradient(135deg, #4f8ef7, #7c3aed);
    border: none;
    color: #fff;
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 700;
    padding: 8px 16px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: opacity 0.15s;
    letter-spacing: 0.3px;
  }
  .btn-export-dep:hover { opacity: 0.85; }
  .btn-export-nodep {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 700;
    padding: 8px 16px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.3px;
  }
  .btn-export-nodep:hover { background: var(--bg4); border-color: var(--border-glow); }

  /* ── PROGRESS OVERLAY ── */
  .progress-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15,17,23,0.85);
    backdrop-filter: blur(4px);
    z-index: 100;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }
  .progress-overlay.visible { display: flex; }
  .progress-box {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 36px;
    min-width: 360px;
    text-align: center;
  }
  .progress-title {
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 6px;
  }
  .progress-sub {
    font-size: 12px;
    font-family: var(--mono);
    color: var(--text2);
    margin-bottom: 16px;
    min-height: 18px;
  }
  .progress-bar-track {
    background: var(--bg4);
    border-radius: 4px;
    height: 6px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .progress-count {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text3);
  }

  /* ── RESULT OVERLAY ── */
  .result-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(15,17,23,0.85);
    backdrop-filter: blur(4px);
    z-index: 100;
    align-items: center;
    justify-content: center;
  }
  .result-overlay.visible { display: flex; }
  .result-box {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 36px;
    min-width: 360px;
    max-width: 500px;
    text-align: center;
  }
  .result-icon { font-size: 40px; margin-bottom: 10px; }
  .result-title { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
  .result-details {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--text2);
    line-height: 1.7;
    margin-bottom: 16px;
  }
  .error-list {
    text-align: left;
    background: var(--bg3);
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 14px;
    font-size: 10px;
    font-family: var(--mono);
    color: var(--red);
    max-height: 120px;
    overflow-y: auto;
    line-height: 1.8;
  }

  .welcome-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 10px;
    padding: 40px;
  }
  .welcome-art {
    font-size: 64px;
    margin-bottom: 8px;
    filter: drop-shadow(0 0 20px rgba(79,142,247,0.4));
  }
  .welcome-title {
    font-size: 22px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.5px;
  }
  .welcome-sub {
    font-size: 13px;
    color: var(--text2);
    text-align: center;
    max-width: 320px;
    line-height: 1.6;
    font-family: var(--mono);
  }
  .welcome-steps {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 340px;
  }
  .welcome-step {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    color: var(--text2);
  }
  .step-num {
    width: 22px; height: 22px;
    background: var(--accent);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
  }
</style>
</head>
<body>

<!-- TOP BAR -->
<div class="topbar">
  <div class="topbar-brand">
    <div class="topbar-logo">📦</div>
    <div class="topbar-title">Omni<span>Pack</span> Toolkit</div>
  </div>
  <div class="topbar-actions">
    <button class="btn btn-ghost" onclick="clearCacheAndRefresh()" title="Clear cache & refresh">↺ Refresh</button>
    <button class="btn" onclick="vscode.postMessage({command:'configure'})">⚙ Configure Org</button>
  </div>
</div>

<!-- MAIN -->
<div class="main">

  <!-- SIDEBAR -->
  <div class="sidebar">
    <div class="sidebar-search">
      <input class="search-input" type="text" placeholder="Search types…" oninput="filterSidebar(this.value)" />
    </div>
    <div id="sidebar-list"></div>
  </div>

  <!-- CONTENT -->
  <div class="content">
    <div id="content-header" class="content-header" style="display:none">
      <div class="content-title-group">
        <div class="content-type-name" id="header-type-name"></div>
        <div class="content-subtitle" id="header-type-sub"></div>
      </div>
      <div class="header-tools">
        <div class="select-counter" id="select-counter"><span id="sel-count">0</span> selected</div>
        <button class="btn btn-ghost" onclick="selectAll()">Select All</button>
        <button class="btn btn-ghost" onclick="selectNone()">Clear</button>
      </div>
    </div>

    <div class="datapack-list" id="datapack-list">
      <!-- Welcome screen by default -->
      <div class="welcome-screen" id="welcome-screen">
        <div class="welcome-art">🦅</div>
        <div class="welcome-title">Vlocity Datapack Manager</div>
        <div class="welcome-sub">Select a datapack type from the sidebar to browse and export available records from your Salesforce org.</div>
        <div class="welcome-steps">
          <div class="welcome-step"><div class="step-num">1</div>Choose a type from the left panel</div>
          <div class="welcome-step"><div class="step-num">2</div>Check the datapacks you want to export</div>
          <div class="welcome-step"><div class="step-num">3</div>Click Export — with or without dependencies</div>
        </div>
      </div>
    </div>

    <!-- EXPORT BAR -->
    <div class="export-bar hidden" id="export-bar">
      <div class="export-summary">
        <strong id="export-count">0 datapacks</strong> selected for export
        <div class="tag-list" id="export-tags"></div>
      </div>
      <div class="export-buttons">
        <button class="btn-export-nodep" onclick="triggerExport(false)">Export ↗ No Deps</button>
        <button class="btn-export-dep" onclick="triggerExport(true)">⬡ Export with Dependencies</button>
      </div>
    </div>
  </div>
</div>

<!-- PROGRESS OVERLAY -->
<div class="progress-overlay" id="progress-overlay">
  <div class="progress-box">
    <div class="spinner" style="margin: 0 auto 16px"></div>
    <div class="progress-title">Exporting Datapacks</div>
    <div class="progress-sub" id="progress-sub">Preparing…</div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" id="progress-fill" style="width:0%"></div>
    </div>
    <div class="progress-count" id="progress-count"></div>
  </div>
</div>

<!-- RESULT OVERLAY -->
<div class="result-overlay" id="result-overlay">
  <div class="result-box">
    <div class="result-icon" id="result-icon"></div>
    <div class="result-title" id="result-title"></div>
    <div class="result-details" id="result-details"></div>
    <div class="error-list" id="error-list" style="display:none"></div>
    <button class="btn btn-accent" onclick="closeResult()" style="width:100%">Done</button>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  const categories = ${categoriesJson};
  const typeIcons = ${iconsJson};

  // State
  let activeType = null;
  let loadedRecords = {}; // type -> records[]
  let selectedItems = {}; // type -> Set of ids
  let allSelectedItems = []; // [{type, id, name}]
  let filterText = '';
  let sidebarFilter = '';

  // Build sidebar
  function buildSidebar() {
    const container = document.getElementById('sidebar-list');
    container.innerHTML = '';

    for (const [cat, types] of Object.entries(categories)) {
      const filtered = types.filter(t => t.toLowerCase().includes(sidebarFilter.toLowerCase()));
      if (filtered.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'category-group';

      const label = document.createElement('div');
      label.className = 'category-label';
      label.textContent = cat;
      group.appendChild(label);

      for (const type of filtered) {
        const item = document.createElement('div');
        item.className = 'type-item' + (type === activeType ? ' active' : '');
        if (selectedItems[type] && selectedItems[type].size > 0) item.classList.add('has-selection');

        const selCount = selectedItems[type] ? selectedItems[type].size : 0;
        const cachedCount = loadedRecords[type] ? loadedRecords[type].length : null;
        const badge = selCount > 0 ? selCount : (cachedCount !== null ? cachedCount : '');

        item.innerHTML = \`
          <span class="type-icon">\${typeIcons[type] || '🔹'}</span>
          <span class="type-name">\${type}</span>
          \${badge !== '' ? \`<span class="type-badge">\${badge}</span>\` : ''}
        \`;
        item.dataset.type = type;
        item.onclick = () => selectType(type);
        group.appendChild(item);
      }
      container.appendChild(group);
    }
  }

  function filterSidebar(val) {
    sidebarFilter = val;
    buildSidebar();
  }

  function selectType(type) {
    activeType = type;
    filterText = '';
    buildSidebar();
    showTypeHeader(type);

    if (loadedRecords[type]) {
      renderRecords(type, loadedRecords[type]);
    } else {
      vscode.postMessage({ command: 'fetchDatapacks', type });
    }
  }

  function showTypeHeader(type) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('content-header').style.display = 'flex';
    document.getElementById('header-type-name').textContent = type;
    document.getElementById('header-type-sub').textContent = \`Select datapacks to queue for export\`;
    document.getElementById('datapack-list').innerHTML = '<div id="list-toolbar-placeholder"></div><div class="record-grid" id="record-grid"></div>';
  }

  function renderRecords(type, records) {
    const list = document.getElementById('datapack-list');
    if (!records || records.length === 0) {
      list.innerHTML = \`<div class="state-center">
        <div class="state-icon">📭</div>
        <div class="state-title">No records found</div>
        <div class="state-sub">No \${type} datapacks are available in this org.</div>
      </div>\`;
      return;
    }

    list.innerHTML = \`
      <div class="list-toolbar">
        <input class="filter-input" type="text" placeholder="Filter \${records.length} records…" oninput="filterRecords(this.value)" />
      </div>
      <div class="record-grid" id="record-grid"></div>
    \`;

    renderGrid(type, records, '');
    updateSelCounter();
  }

  function renderGrid(type, records, filter) {
    const grid = document.getElementById('record-grid');
    if (!grid) return;
    const sel = selectedItems[type] || new Set();
    const lower = filter.toLowerCase();
    const visible = filter ? records.filter(r => r.name.toLowerCase().includes(lower)) : records;

    grid.innerHTML = '';
    for (const r of visible) {
      const isSelected = sel.has(r.id);
      const card = document.createElement('div');
      card.className = 'record-card' + (isSelected ? ' selected' : '');
      card.dataset.id = r.id;
      card.innerHTML = \`
        <div class="record-checkbox"></div>
        <div class="record-info">
          <div class="record-name">\${escHtml(r.name)}</div>
          <div class="record-id">\${escHtml(r.id)}</div>
        </div>
      \`;
      card.onclick = () => toggleRecord(type, r.id, r.name);
      grid.appendChild(card);
    }

    if (visible.length === 0 && filter) {
      grid.innerHTML = \`<div style="grid-column:1/-1;color:var(--text3);font-family:var(--mono);font-size:12px;padding:20px 0">No matches for "\${escHtml(filter)}"</div>\`;
    }
  }

  function filterRecords(val) {
    filterText = val;
    if (activeType && loadedRecords[activeType]) {
      renderGrid(activeType, loadedRecords[activeType], val);
    }
  }

  function toggleRecord(type, id, name) {
    if (!selectedItems[type]) selectedItems[type] = new Set();
    const sel = selectedItems[type];
    if (sel.has(id)) {
      sel.delete(id);
    } else {
      sel.add(id);
    }
    // Update card visually
    const card = document.querySelector(\`.record-card[data-id="\${CSS.escape(id)}"]\`);
    if (card) card.classList.toggle('selected', sel.has(id));

    rebuildAllSelected();
    updateSelCounter();
    updateExportBar();
    buildSidebar();
  }

  function selectAll() {
    if (!activeType || !loadedRecords[activeType]) return;
    if (!selectedItems[activeType]) selectedItems[activeType] = new Set();
    for (const r of loadedRecords[activeType]) {
      selectedItems[activeType].add(r.id);
    }
    renderGrid(activeType, loadedRecords[activeType], filterText);
    rebuildAllSelected();
    updateSelCounter();
    updateExportBar();
    buildSidebar();
  }

  function selectNone() {
    if (!activeType) return;
    selectedItems[activeType] = new Set();
    renderGrid(activeType, loadedRecords[activeType] || [], filterText);
    rebuildAllSelected();
    updateSelCounter();
    updateExportBar();
    buildSidebar();
  }

  function rebuildAllSelected() {
    allSelectedItems = [];
    for (const [type, ids] of Object.entries(selectedItems)) {
      if (!ids.size) continue;
      const records = loadedRecords[type] || [];
      for (const id of ids) {
        const rec = records.find(r => r.id === id);
        if (rec) allSelectedItems.push({ type, id, name: rec.name });
      }
    }
  }

  function updateSelCounter() {
    const sel = selectedItems[activeType] ? selectedItems[activeType].size : 0;
    document.getElementById('sel-count').textContent = sel;
  }

  function updateExportBar() {
    const bar = document.getElementById('export-bar');
    const total = allSelectedItems.length;
    if (total === 0) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    document.getElementById('export-count').textContent = \`\${total} datapack\${total !== 1 ? 's' : ''}\`;

    // Build tags grouped by type
    const byType = {};
    for (const item of allSelectedItems) {
      if (!byType[item.type]) byType[item.type] = 0;
      byType[item.type]++;
    }
    const tagList = document.getElementById('export-tags');
    tagList.innerHTML = '';
    for (const [type, count] of Object.entries(byType)) {
      const tag = document.createElement('div');
      tag.className = 'export-tag';
      tag.innerHTML = \`\${typeIcons[type] || '🔹'} \${type} <strong style="color:var(--accent)">\${count}</strong>\`;
      tagList.appendChild(tag);
    }
  }

  function triggerExport(withDependencies) {
    vscode.postMessage({
      command: 'exportDatapacks',
      keys: allSelectedItems,
      withDependencies
    });
  }

  function clearCacheAndRefresh() {
    loadedRecords = {};
    vscode.postMessage({ command: 'clearCache' });
    if (activeType) {
      showTypeHeader(activeType);
      vscode.postMessage({ command: 'fetchDatapacks', type: activeType });
    }
  }

  function closeResult() {
    document.getElementById('result-overlay').classList.remove('visible');
    // Clear selection after successful export
    selectedItems = {};
    allSelectedItems = [];
    updateExportBar();
    buildSidebar();
    if (activeType && loadedRecords[activeType]) {
      renderGrid(activeType, loadedRecords[activeType], filterText);
    }
    updateSelCounter();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Messages from extension
  window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.command) {
      case 'datapacksLoading': {
        if (msg.type !== activeType) break;
        const list = document.getElementById('datapack-list');
        list.innerHTML = \`<div class="state-center">
          <div class="spinner"></div>
          <div class="state-title">Loading \${msg.type}</div>
          <div class="state-sub" style="font-family:var(--mono);font-size:11px">Querying Salesforce org…</div>
        </div>\`;
        break;
      }
      case 'datapacksLoaded': {
        loadedRecords[msg.type] = msg.records;
        buildSidebar();
        if (msg.type === activeType) {
          renderRecords(msg.type, msg.records);
          // Re-apply existing selections visually
          if (selectedItems[msg.type]) {
            for (const id of selectedItems[msg.type]) {
              const card = document.querySelector(\`.record-card[data-id="\${CSS.escape(id)}"]\`);
              if (card) card.classList.add('selected');
            }
          }
        }
        break;
      }
      case 'datapacksError': {
        if (msg.type !== activeType) break;
        const list = document.getElementById('datapack-list');
        list.innerHTML = \`<div class="state-center">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Failed to load</div>
          <div class="state-sub">\${escHtml(msg.error)}</div>
        </div>\`;
        break;
      }
      case 'exportStarted': {
        const ov = document.getElementById('progress-overlay');
        ov.classList.add('visible');
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('progress-sub').textContent = 'Starting…';
        document.getElementById('progress-count').textContent = \`0 / \${msg.total}\`;
        break;
      }
      case 'exportProgress': {
        const pct = Math.round((msg.current / msg.total) * 100);
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('progress-sub').textContent = escHtml(msg.name);
        document.getElementById('progress-count').textContent = \`\${msg.current} / \${msg.total}\`;
        break;
      }
      case 'exportComplete': {
        document.getElementById('progress-overlay').classList.remove('visible');
        const ro = document.getElementById('result-overlay');
        ro.classList.add('visible');
        const success = msg.failed === 0;
        document.getElementById('result-icon').textContent = success ? '✅' : (msg.completed > 0 ? '⚠️' : '❌');
        document.getElementById('result-title').textContent = success
          ? 'Export Complete!'
          : \`Exported \${msg.completed}, \${msg.failed} failed\`;
        document.getElementById('result-details').textContent =
          \`\${msg.completed} datapack\${msg.completed !== 1 ? 's' : ''} exported successfully.\`;
        const errList = document.getElementById('error-list');
        if (msg.errors && msg.errors.length > 0) {
          errList.style.display = 'block';
          errList.innerHTML = msg.errors.map(e => escHtml(e)).join('<br>');
        } else {
          errList.style.display = 'none';
        }
        break;
      }
      case 'exportError': {
        document.getElementById('progress-overlay').classList.remove('visible');
        const ro = document.getElementById('result-overlay');
        ro.classList.add('visible');
        document.getElementById('result-icon').textContent = '❌';
        document.getElementById('result-title').textContent = 'Export Failed';
        document.getElementById('result-details').textContent = msg.error;
        document.getElementById('error-list').style.display = 'none';
        break;
      }
      case 'exportCancelled': {
        document.getElementById('progress-overlay').classList.remove('visible');
        break;
      }
    }
  });

  // Init
  buildSidebar();
</script>
</body>
</html>`;
    }
}