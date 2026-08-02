import { exec, ExecOptions } from 'child_process';
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

export async function executeCliCommand( command: string, options?: { cwd?: string; maxBuffer?: number; signal?: AbortSignal }): Promise<{ stdout: string; stderr: string }> {
    try {
        const execOpts: ExecOptions = { ...options, killSignal: 'SIGKILL' };
        const { stdout, stderr } = await execAsync(command, execOpts);
        return { stdout: stdout.toString(), stderr: stderr.toString() };
    } catch (error: any) {
        if (error.name === 'AbortError' || error.killed || options?.signal?.aborted) {
            throw new Error('Operation cancelled by user.');
        }
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

export async function listOrgs(signal?: AbortSignal): Promise<OrgInfo[]> {
    const cli = await detectCli();
    if (!cli) { return []; }

    try {
        return await listOrgsViaSf(signal);
    } catch (err: any) {
        if (err.message === 'Operation cancelled by user.'){ throw err; }
        return [];
    }
}

async function listOrgsViaSf(signal?: AbortSignal): Promise<OrgInfo[]> {
    let stdout = '';
    try {
        const result = await execAsync('sf org list --json', { timeout: 15000, signal, killSignal: 'SIGKILL' } as ExecOptions);
        stdout = result.stdout.toString();
    } catch (err: any) {
        if (err.name === 'AbortError' || err.killed || signal?.aborted) {
            throw new Error('Operation cancelled by user.');
        }
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