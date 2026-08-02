import * as vscode from 'vscode';
import { DatapackWebviewProvider } from './providers/datapackWebviewProvider';
import { DatapackTreeProvider } from './providers/datapackProvider';
import { configureExtension, initStatusBar } from './commands/configure';
import { exportDatapack } from './commands/export';
import { refreshDatapacks } from './commands/refresh';
import { checkVlocityInstalled } from './utils/cli';
import { DatapackItem } from './types';

let hasPromptedForVlocity = false;

export async function activate(context: vscode.ExtensionContext) {

	if (!hasPromptedForVlocity) {
		const isInstalled = await checkVlocityInstalled();
		if (!isInstalled) {
			hasPromptedForVlocity = true;
			const choice = await vscode.window.showErrorMessage(
				'Vlocity CLI not found. This extension requires it. Install via npm (Node.js 18+ needed).',
				'Install Now',
				'View Instructions',
				'Cancel'
			);
			if (choice === 'Install Now') {
				const terminal = vscode.window.createTerminal('Install Vlocity CLI');
				terminal.show();
				terminal.sendText('npm install -g vlocity');
				vscode.window.showInformationMessage('Installing in terminal. Reload VS Code post installation.');
			} else if (choice === 'View Instructions') {
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/vlocityinc/vlocity_build#installation'));
			}
		}
	}

	const datapackProvider = new DatapackTreeProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('vlocityDataPackExplorer', datapackProvider),		
		vscode.commands.registerCommand('omnipack-toolkit.configure', configureExtension),
		vscode.commands.registerCommand('omnipack-toolkit.refreshDatapacks', () => refreshDatapacks(datapackProvider)),
		vscode.commands.registerCommand('omnipack-toolkit.exportDataPack', exportDatapack),
		vscode.commands.registerCommand('omnipack-toolkit.openUI', () => {
			DatapackWebviewProvider.createOrShow(context.extensionUri);
		}),
		vscode.commands.registerCommand('omnipack-toolkit.loadMoreDatapacks', (item: DatapackItem) => {
			datapackProvider.loadMore(item);
		}),
	);

	initStatusBar(context);

	vscode.window.showInformationMessage('OmniPack Toolkit loaded! Configure with "Vlocity: Configure Settings".');
}

export function deactivate() { }