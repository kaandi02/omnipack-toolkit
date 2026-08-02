import * as vscode from 'vscode';
import { listOrgs, OrgInfo } from '../utils/cli';

let statusBarItem: vscode.StatusBarItem;

export async function configureExtension() {
    const config = vscode.workspace.getConfiguration('vlocityDatapackManager');

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Loading Salesforce orgs…', cancellable: true },
        async (progress, token) => {
            
            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());

            let orgs: OrgInfo[] = [];
            try {
                orgs = await listOrgs(abortController.signal);
                console.log(`Found ${orgs.length} authenticated org(s).`);
            } catch (err: any) {
                if (err.message.includes('cancelled')) {
                    vscode.window.showInformationMessage('Org loading cancelled.');
                    return;
                }
                vscode.window.showErrorMessage('Failed to load orgs. Make sure Salesforce CLI is installed and authenticated.');
                return;
            }

            type OrgPickItem = vscode.QuickPickItem & { orgUsername?: string };

            const orgItems: OrgPickItem[] = orgs.map(org => {
                const connected  = org.connectedStatus?.toLowerCase().includes('connect');
                const label      = org.alias ? `${org.alias}` : `${org.username}`;
                const detail     = org.alias ? `${org.username}  •  ${org.instanceUrl}` : org.instanceUrl;

                return {
                    label,
                    description: connected ? 'Connected' : org.connectedStatus,
                    detail,
                    orgUsername: org.username,
                    alwaysShow: true,
                };
            });

            const currentUsername = config.get<string>('sfdxUsername');
            for (const item of orgItems) {
                if (item.orgUsername === currentUsername) {
                    item.description = (item.description ? item.description + '  ' : '') + '$(check) active';
                }
            }

            const picked = await vscode.window.showQuickPick(orgItems, {
                placeHolder: orgs.length
                    ? 'Select an org to continue'
                    : 'No authenticated orgs found. Please authenticate with Salesforce CLI.',
                matchOnDescription: true,
                matchOnDetail: true,
                ignoreFocusOut: true,
            });

            if (!picked) { return; }

            if (picked.orgUsername) {
                await config.update('sfdxUsername', picked.orgUsername, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Selected org: ${picked.orgUsername}`);
                updateStatusBar();
            }
        }
    );
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
    if (!statusBarItem) { return; }
    const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
    const selectedAlias = config.get<string>('sfdxUsername');
    statusBarItem.text = selectedAlias ? `$(link) ${selectedAlias}` : `$(link) Select an Org`;
    statusBarItem.show();
}