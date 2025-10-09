import * as vscode from 'vscode';
import { getAliases } from '../utils/cli';

let statusBarItem: vscode.StatusBarItem;

export async function configureExtension() {
    const config = vscode.workspace.getConfiguration('vlocityDatapackManager');

    let aliases = await getAliases();
    let sfdxUsername: string | undefined;
    if (aliases.length > 0) {
        sfdxUsername = await vscode.window.showQuickPick(aliases, { placeHolder: 'Select SFDX Org Alias' });
    } else {
        return;
    }

    if (sfdxUsername) { await config.update('sfdxUsername', sfdxUsername, vscode.ConfigurationTarget.Global); }

    vscode.window.showInformationMessage('Vlocity configuration saved!');
    updateStatusBar();
}

export function initStatusBar(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -200);
    statusBarItem.command = 'omnipack-toolkit.configure';
    statusBarItem.tooltip = 'Selected SFDX Org (Click to change)';
    context.subscriptions.push(statusBarItem);

    const configListener = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vlocityDatapackManager')) {
            updateStatusBar();
        }
    });
    context.subscriptions.push(configListener);

    updateStatusBar();
}

function updateStatusBar() {
    const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
    const selectedAlias = config.get<string>('sfdxUsername');
    if (selectedAlias) {
        statusBarItem.text = `$(link) ${selectedAlias}`;
    } else {
        statusBarItem.text = `$(link) Select an Org`;
    }
    statusBarItem.show();
}