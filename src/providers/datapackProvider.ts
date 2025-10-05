import * as vscode from 'vscode';
import { DatapackItem, DatapackRecord } from '../types';
import { typeMappings } from '../utils/typeMappings';
import { executeCliCommand } from '../utils/cli';
import { configureExtension } from '../commands/configure';

export class DatapackTreeProvider implements vscode.TreeDataProvider<DatapackItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DatapackItem | undefined | null | void> = new vscode.EventEmitter<DatapackItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DatapackItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private datapackCache: Map<string, DatapackRecord[]> = new Map();

    async refresh(): Promise<void> {
        this.datapackCache.clear();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DatapackItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DatapackItem): Promise<DatapackItem[]> {
        if (!element) {
            return Object.keys(typeMappings).map(type =>
                new DatapackItem(type, type, undefined, vscode.TreeItemCollapsibleState.Collapsed)
            );
        } else {
            const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
            let sfdxUsername = config.get<string>('sfdxUsername');

            if (!sfdxUsername) {
                await configureExtension();
                sfdxUsername = config.get<string>('sfdxUsername');
                if (!sfdxUsername) {
                    return [new DatapackItem('Configuration cancelled. Please configure SFDX username.', element.type, undefined, vscode.TreeItemCollapsibleState.None)];
                }
            }

            if (this.datapackCache.has(element.type)) {
                const cached = this.datapackCache.get(element.type)!;
                return cached.map(record => new DatapackItem(record.name, record.type, record.id, vscode.TreeItemCollapsibleState.None));
            }

            try {
                const records = await this.queryDataPacksFromOrg(element.type, sfdxUsername);
                this.datapackCache.set(element.type ? element.type : '', records);
                if (records.length > 0) {
                    return records.map(record => new DatapackItem(record.name, record.type, record.id, vscode.TreeItemCollapsibleState.None));
                }
                return [new DatapackItem("No Datapacks available for export", element.type, undefined, vscode.TreeItemCollapsibleState.None)];
            } catch (error: any) {
                return [new DatapackItem(`Error: ${error.message}`, element.type, undefined, vscode.TreeItemCollapsibleState.None)];
            }
        }
    }

    private async queryDataPacksFromOrg(type: string, sfdxUsername: string): Promise<DatapackRecord[]> {
        const mapping = typeMappings[type];
        if (!mapping) {
            throw new Error(`No mapping for type: ${type}`);
        }

        const command = `vlocity packGetAllAvailableExports --nojob --sfdx.username ${sfdxUsername} --type ${type} --json`;
        const { stdout } = await executeCliCommand(command, { maxBuffer: 1024 * 1024 * 10 });
        const result = JSON.parse(stdout);

        if (result.status === 'success' && result.records) {
            return result.records.map((record: any) => ({
                id: record.Id,
                name: record.VlocityDataPackDisplayLabel,
                type: type
            })).sort((a: DatapackRecord, b: DatapackRecord) => a.name.localeCompare(b.name));
        }
        return [];
    }
}