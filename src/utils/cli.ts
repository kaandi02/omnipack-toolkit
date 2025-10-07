import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export async function executeCliCommand(command: string, options?: { cwd?: string; maxBuffer?: number }): Promise<{ stdout: string; stderr: string }> {
    try {
        const { stdout, stderr } = await execAsync(command, options);
        return { stdout: stdout.toString(), stderr: stderr.toString() };
    } catch (error: any) {
        throw new Error(`CLI error: ${error.message}`);
    }
}

export async function checkVlocityInstalled(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('vlocityDatapackManager');
    let cliPath = 'vlocity';
    try {
        if (!await checkNodeVersion()) {
            vscode.window.showErrorMessage('Node.js 18+ required for Vlocity CLI. Download from https://nodejs.org/');
            return true;
        }
        const { stdout } = await executeCliCommand(`${cliPath} --version`);
        console.log(`Vlocity CLI version: ${stdout.trim()}`);
        return true;
    } catch {
        return false;
    }
}

async function checkNodeVersion(): Promise<boolean> {
    try {
        const { stdout } = await execAsync('node -v');
        const version = stdout.trim().slice(1);
        const major = parseInt(version.split('.')[0], 10);
        return major >= 18;
    } catch (error) {
        return false;
    }
}

export async function getAliases(): Promise<string[]> {
    try {
        const aliasPath = path.join(os.homedir(), '.sfdx', 'alias.json');
        const aliasContent = await fs.readFile(aliasPath, 'utf-8');
        const aliasJson = JSON.parse(aliasContent);
        return Object.keys(aliasJson.orgs || {});
    } catch {
        return [];
    }
}