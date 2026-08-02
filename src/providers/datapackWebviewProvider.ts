import * as vscode from 'vscode';
import { typeMappings } from '../utils/typeMappings';
import { executeCliCommand } from '../utils/cli';
import { configureExtension } from '../commands/configure';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DatapackRecord } from '../types';

export class DatapackWebviewProvider {
    public static currentPanel: DatapackWebviewProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _datapackCache: Map<string, DatapackRecord[]> = new Map();
    private _currentAbortController?: AbortController;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (DatapackWebviewProvider.currentPanel) {
            DatapackWebviewProvider.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel('omnipackToolkit', 'OmniPack Toolkit', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        DatapackWebviewProvider.currentPanel = new DatapackWebviewProvider(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._setHtmlContent(extensionUri).catch(error => {
            vscode.window.showErrorMessage('Unable to load OmniPack UI.');
            console.error(error);
        });

        const configListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('vlocityDatapackManager')) this.sendOrgState();
        });
        this._disposables.push(configListener);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'ready':
                        this.sendOrgState();
                        break;
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
                    case 'cancelOperation':
                        if (this._currentAbortController) {
                            this._currentAbortController.abort();
                            this._currentAbortController = undefined;
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private sendOrgState() {
        const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
        const username = config.get<string>('sfdxUsername');
        this._panel.webview.postMessage({ command: 'orgUpdated', username: username || '' });
    }

    private async _handleFetchDatapacks(type: string) {
        const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
        let sfdxUsername = config.get<string>('sfdxUsername');

        if (!sfdxUsername) {
            await configureExtension();
            sfdxUsername = config.get<string>('sfdxUsername');
            if (!sfdxUsername) {
                this._panel.webview.postMessage({ command: 'datapacksError', type, error: 'No SFDX org configured.' });
                return;
            }
        }

        if (this._datapackCache.has(type)) {
            this._panel.webview.postMessage({ command: 'datapacksLoaded', type, records: this._datapackCache.get(type)! });
            return;
        }

        this._panel.webview.postMessage({ command: 'datapacksLoading', type });

        this._currentAbortController = new AbortController();
        const signal = this._currentAbortController.signal;

        try {
            const command = `vlocity packGetAllAvailableExports --nojob --sfdx.username ${sfdxUsername} --type ${type} --json`;
            const { stdout } = await executeCliCommand(command, { maxBuffer: 1024 * 1024 * 10, signal });

            const result = JSON.parse(stdout);
            let records: DatapackRecord[] = [];

            if (result.status === 'success' && result.records) {
                records = result.records.map((r: any) => ({
                    id: r.Id, name: r.VlocityDataPackDisplayLabel, type
                })).sort((a: DatapackRecord, b: DatapackRecord) => a.name.localeCompare(b.name));
            }

            this._datapackCache.set(type, records);
            this._panel.webview.postMessage({ command: 'datapacksLoaded', type, records });

        } catch (error: any) {
            if (error.message.includes('cancelled')) {
                this._panel.webview.postMessage({ command: 'operationCancelled', type });
            } else {
                this._panel.webview.postMessage({ command: 'datapacksError', type, error: error.message });
            }
        } finally {
            this._currentAbortController = undefined;
        }
    }

    private async _handleExport(keys: { type: string; id: string; name: string }[], withDependencies: boolean) {
        const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
        const sfdxUsername = config.get<string>('sfdxUsername');
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || !sfdxUsername) {
            this._panel.webview.postMessage({ command: 'exportError', error: 'Missing workspace or org configuration.' });
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const projectPath = await vscode.window.showOpenDialog({
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
            openLabel: 'Select Vlocity Project Folder', defaultUri: vscode.Uri.file(`${workspacePath}/vlocity`)
        });

        if (!projectPath) {
            this._panel.webview.postMessage({ command: 'exportCancelled' });
            return;
        }

        const depth = withDependencies ? -1 : 0;
        const total = keys.length;
        let completed = 0, failed = 0;
        const errors: string[] = [];
        let wasCancelled = false;

        this._panel.webview.postMessage({ command: 'exportStarted', total });
        const outputChannel = vscode.window.createOutputChannel('OmniPack Export');
        outputChannel.show();

        this._currentAbortController = new AbortController();
        const signal = this._currentAbortController.signal;

        for (const item of keys) {
            if (signal.aborted) {
                wasCancelled = true;
                break;
            }

            const mapping = typeMappings[item.type];
            if (!mapping) {
                failed++;
                errors.push(`No mapping for type: ${item.type}`);
                continue;
            }

            const exportKey = mapping.exportKeyFormat.replace('{label}', item.id);
            const command = `vlocity --sfdx.username ${sfdxUsername} --projectPath ${projectPath[0].fsPath} packExport --key ${exportKey} --nojob --maxDepth ${depth} --json`;

            try {
                this._panel.webview.postMessage({ command: 'exportProgress', current: completed + failed + 1, total, name: item.name });
                outputChannel.appendLine(`Exporting: ${item.name} (${item.type})`);

                const { stdout } = await executeCliCommand(command, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10, signal });
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
                if (error.message.includes('cancelled')) {
                    outputChannel.appendLine(`  ⚠ Cancelled: ${item.name}`);
                    wasCancelled = true;
                    break;
                } else {
                    failed++;
                    errors.push(`${item.name}: ${error.message}`);
                    outputChannel.appendLine(`  ✗ Error: ${item.name} — ${error.message}`);
                }
            }
        }

        for (const file of ['VlocityBuildLog.yaml', 'VlocityBuildErrors.log']) { try { await fs.unlink(path.join(workspacePath, file)); } catch { } }
        try { await fs.rm(path.join(workspacePath, 'vlocity-temp'), { recursive: true, force: true }); } catch { }

        this._currentAbortController = undefined;
        outputChannel.appendLine(`\nDone: ${completed} exported, ${failed} failed${wasCancelled ? ' (Queue Stopped)' : ''}.`);

        if (wasCancelled) {
            this._panel.webview.postMessage({
                command: 'operationCancelled',
                message: `Export queue stopped. ${completed} completed, ${failed} failed.`,
                isExport: true
            });
        } else {
            this._panel.webview.postMessage({ command: 'exportComplete', completed, failed, errors });
        }
    }

    public dispose() {
        if (this._currentAbortController) this._currentAbortController.abort();
        DatapackWebviewProvider.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) { d.dispose(); }
        }
    }

    private async _setHtmlContent(extensionUri: vscode.Uri) {
        this._panel.webview.html = await this._getHtmlContent(extensionUri);
    }

    private async _getHtmlContent(extensionUri: vscode.Uri): Promise<string> {
        const categories: { [key: string]: string[] } = {
            'OmniStudio': ['OmniScript', 'Integration Procedure', 'DataRaptor', 'Vlocity Card', 'Vlocity UI Template', 'Vlocity UI Layout', 'UI Facet', 'UI Section'],
            'CPQ & Pricing': ['Product2', 'Pricebook2', 'Price List', 'Pricing Plan', 'Pricing Variable', 'Calculation Matrix', 'Calculation Procedure', 'Query Builder', 'Promotion', 'Catalog'],
            'Rules & Context': ['Rule', 'Context Action', 'Context Dimension', 'Context Scope', 'Object Context Rule', 'Attribute Assignment Rule', 'Attribute Category', 'CPQ Configuration Setup', 'Entity Filter'],
            'Orchestration': ['Orchestration Plan Definition', 'Orchestration Item Definition', 'Orchestration Dependency Definition', 'Manual Queue', 'Time Plan', 'Time Policy'],
            'Objects & Contracts': ['Object Class', 'Object Layout', 'Contract Type', 'Interface Implementation', 'Item Implementation', 'Offer Migration Plan'],
            'Other': ['System', 'Vlocity Action', 'Vlocity Attachment', 'Vlocity Function', 'Vlocity Picklist', 'Document Clause', 'Document Template', 'Integration Retry Policy']
        };

        const typeIcons: { [key: string]: string } = {
            'OmniScript': 'description', 'IntegrationProcedure': 'settings', 'DataRaptor': 'query_stats',
            'VlocityCard': 'cards', 'VlocityUITemplate': 'palette', 'VlocityUILayout': 'grid_view',
            'Product2': 'category', 'Pricebook2': 'book_ribbon', 'PriceList': 'library_books',
            'CalculationMatrix': 'tactic', 'CalculationProcedure': 'functions',
            'Rule': 'gavel', 'ContextAction': 'flash_on', 'Catalog': 'menu_book',
            'ObjectClass': 'box', 'ContractType': 'receipt_long', 'System': 'computer',
            'DocumentTemplate': 'article'
        };

        const uiPath = path.join(extensionUri.fsPath, 'src', 'providers', 'UI');
        const htmlPath = path.join(uiPath, 'index.html');
        const html = await fs.readFile(htmlPath, 'utf8');

        const styleUri = this._panel.webview.asWebviewUri(vscode.Uri.file(path.join(uiPath, 'styles.css')));
        const scriptUri = this._panel.webview.asWebviewUri(vscode.Uri.file(path.join(uiPath, 'script.js')));
        const initData = JSON.stringify({ categories, typeIcons });

        return html
            .replace('__STYLE_URI__', styleUri.toString())
            .replace('__SCRIPT_URI__', scriptUri.toString())
            .replace('__INIT_DATA__', initData);
    }
}
