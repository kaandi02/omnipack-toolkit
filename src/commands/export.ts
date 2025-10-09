import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DatapackItem } from '../types';
import { typeMappings } from '../utils/typeMappings';
import { executeCliCommand } from '../utils/cli';

export async function exportDatapack(item: DatapackItem) {
    const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
    const cliPath = 'vlocity';
    const sfdxUsername = config.get<string>('sfdxUsername');
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }
    const workspacePath = workspaceFolders[0].uri.fsPath;

    let projectPath = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Vlocity Project Folder',
        defaultUri: vscode.Uri.file(`${workspacePath}/vlocity`)
    });

    if (!projectPath || !sfdxUsername) {
        vscode.window.showErrorMessage('Please configure project path and SFDX username first!');
        return;
    }

    if (!item.datapackId) {
        vscode.window.showWarningMessage('Please select a specific datapack to export, not a category.');
        return;
    }

    const dependencyOption = await vscode.window.showQuickPick(['No Dependencies', 'All Dependencies'], {
        placeHolder: 'Export with either dependencies or no dependencies'
    });

    if (!dependencyOption) {
        return;
    }

    const depth = (dependencyOption === 'All Dependencies') ? -1 : 0;

    const mapping = typeMappings[item.type];
    if (!mapping) {
        vscode.window.showErrorMessage(`No mapping for type: ${item.type}`);
        return;
    }

    try {
        const exportKey = mapping.exportKeyFormat.replace('{label}', item.datapackId);
        const command = `${cliPath} --sfdx.username ${sfdxUsername} --projectPath ${projectPath[0].fsPath} packExport --key ${exportKey} --nojob --maxDepth ${depth} --json`;


        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Exporting ${item.label} with ${dependencyOption.toLowerCase()}`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0 });
            const { stdout, stderr } = await executeCliCommand(command, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10 });

            const result = JSON.parse(stdout);
            if (result.status === 'success') {
                vscode.window.showInformationMessage(`Successfully exported ${item.label}!`);

                const outputChannel = vscode.window.createOutputChannel('Vlocity Export');
                outputChannel.appendLine(`Successfully exported ${result.records[0].VlocityDataPackKey}`);
                outputChannel.show();

                try {
                    await fs.unlink(path.join(workspacePath, 'VlocityBuildLog.yaml'));
                } catch { }
                try {
                    await fs.unlink(path.join(workspacePath, 'VlocityBuildErrors.log'));
                } catch { }
                try {
                    await fs.rm(path.join(workspacePath, 'vlocity-temp'), { recursive: true, force: true });
                } catch { }

            } else {
                vscode.window.showErrorMessage(`Export error: ${result.message}`);
            }
        });
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to export: ${error.message}`);
    }
}