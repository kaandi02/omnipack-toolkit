import * as vscode from 'vscode';
import { DatapackTreeProvider } from '../providers/datapackProvider';

export async function refreshDatapacks(provider: DatapackTreeProvider) {
    vscode.window.showInformationMessage('Refreshing Vlocity Datapacks...');
    await provider.refresh();
}