import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

export interface OrgInfo {
    alias: string;
    username: string;
    orgId: string;
    instanceUrl: string;
    connectedStatus: string;
    isDefault?: boolean;
}

export async function executeCliCommand( command: string, options?: { cwd?: string; maxBuffer?: number }): Promise<{ stdout: string; stderr: string }> {
    try {
        const { stdout, stderr } = await execAsync(command, options);
        return { stdout: stdout.toString(), stderr: stderr.toString() };
    } catch (error: any) {
        throw new Error(`CLI error: ${error.message}`);
    }
}


export async function detectCli(): Promise<'sf' | null> {
    try {
        await execAsync('sf --version');
        return 'sf';
    } catch {
        return null;
    }
}


export async function listOrgs(): Promise<OrgInfo[]> {
    const cli = await detectCli();
    if (!cli) { return []; }

    try {
        return await listOrgsViaSf();
    } catch {
        return [];
    }
}

async function listOrgsViaSf(): Promise<OrgInfo[]> {

    let stdout = '';
    try {
        const result = await execAsync('sf org list --json', { timeout: 15000 });
        stdout = result.stdout;
    } catch (err: any) {
        stdout = err.stdout || '';
    }

    if (!stdout.trim()) { return []; }

    const json = JSON.parse(stdout);
    const nonScratch: any[] = json?.result?.nonScratchOrgs ?? [];
    const scratch: any[] = json?.result?.scratchOrgs ?? [];
    const allOrgs = [...nonScratch, ...scratch];

    return allOrgs.map((org: any): OrgInfo => ({
        alias: org.alias || '',
        username: org.username || '',
        orgId: org.orgId || '',
        instanceUrl: org.instanceUrl || '',
        connectedStatus: org.connectedStatus || 'Unknown',
        isDefault: !!org.isDefaultusername || !!org.isDefaultDevHubusername,
    })).filter(org => !!org.username);
}

export async function checkVlocityInstalled(): Promise<boolean> {
    try {
        if (!await checkNodeVersion()) {
            vscode.window.showErrorMessage('Node.js is required for Vlocity CLI. Download from https://nodejs.org/');
            return true;
        }
        const { stdout } = await executeCliCommand('vlocity --version');
        console.log(`Installed Vlocity CLI: ${stdout.trim()}`);
        return true;
    } catch {
        return false;
    }
}

async function checkNodeVersion(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('node -v');
        const major = parseInt(stdout.trim().slice(1).split('.')[0], 10);
        if(major <= 22){
            vscode.window.showWarningMessage('Node.js version 22 or lower are out of security support. Please upgrade to Node.js 24 or later from https://nodejs.org/');
        }
        return major >= 22;
    } catch {
        return false;
    }
}