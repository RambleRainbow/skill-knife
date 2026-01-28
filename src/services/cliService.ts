import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Skill } from '../types';
import { MarketSkill } from './marketService';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Initialize CLI service
 */
export function initCliService(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Skill Knife CLI');
    context.subscriptions.push(outputChannel);
}

/**
 * Log message to output channel
 */
export function log(message: string) {
    if (outputChannel) {
        outputChannel.appendLine(message);
    }
}

/**
 * Run skills CLI command (non-interactive)
 */
export function runSkillsCli(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const cmd = 'npx skills';
        const fullCmd = `${cmd} ${args.join(' ')}`;

        // Log the command
        if (outputChannel) {
            outputChannel.appendLine(`\n> Running: ${fullCmd}`);
            outputChannel.show(true);
        }

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Running: skills ${args.join(' ')}`,
                cancellable: false,
            },
            async (_) => {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const cwd = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;

                cp.exec(fullCmd, { cwd }, (error, stdout, stderr) => {
                    if (outputChannel) {
                        if (stdout) {
                            outputChannel.appendLine(stdout);
                        }
                        if (stderr) {
                            outputChannel.appendLine(`[STDERR]: ${stderr}`);
                        }
                    }

                    if (error) {
                        if (outputChannel) {
                            outputChannel.appendLine(`[ERROR]: ${error.message}`);
                        }
                        vscode.window.showErrorMessage(`Skills CLI failed: ${error.message}\n${stderr}`);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            }
        );
    });
}

/**
 * Run skills CLI command in interactive terminal
 */
let activeTerminal: vscode.Terminal | undefined;

export function runSkillsCliInteractive(args: string[]): void {
    const cmd = `npx skills ${args.join(' ')}`;

    // Reuse existing terminal if it exists and hasn't been disposed
    if (!activeTerminal || activeTerminal.exitStatus !== undefined) {
        // Check if there is already a terminal named "Skill Knife Interactive" in vscode.window.terminals
        // (This handles case where user manually closed it or reload happened)
        const existing = vscode.window.terminals.find(t => t.name === 'Skill Knife Interactive');
        if (existing) {
            activeTerminal = existing;
        } else {
            activeTerminal = vscode.window.createTerminal('Skill Knife Interactive');
        }
    }

    activeTerminal.show();
    activeTerminal.sendText(cmd);
}

/**
 * Construct install arguments for skills CLI
 * Returns: [repoUrl, '--skill', skillName]
 */
export function getInstallArgs(skill: Skill | MarketSkill): string[] {
    let repoUrl = '';
    let skillName = '';

    if ('repoPath' in skill) { // MarketSkill
        repoUrl = skill.repoPath;
        if (!repoUrl.startsWith('http') && !repoUrl.startsWith('git@')) {
            repoUrl = `https://github.com/${repoUrl}`;
        }
        if (repoUrl.endsWith('.git')) {
            repoUrl = repoUrl.slice(0, -4);
        }

        // subpath usually contains the skill name
        if (skill.subpath) {
            skillName = skill.subpath.split('/').pop() || '';
        }
    } else { // Skill
        if (skill.metadata?.repoUrl) {
            repoUrl = skill.metadata.repoUrl;
        } else if (skill.metadata?.sourceUrl) {
            repoUrl = skill.metadata.sourceUrl;
        } else {
            repoUrl = skill.name; // Fallback
        }

        // Clean up repoUrl if it's a deep link (legacy)
        const deepMatch = repoUrl.match(/(.*)\/tree\/.*$/);
        if (deepMatch) {
            repoUrl = deepMatch[1];
        }

        skillName = skill.name;
    }

    const args = [repoUrl];
    if (skillName) {
        args.push('--skill', skillName);
    }

    return args;
}

/**
 * Extract install source (compatibility)
 */
export function getInstallSource(skill: Skill | MarketSkill): string {
    const args = getInstallArgs(skill);
    // Return just the repo URL as "source" for display/profile
    return args[0];
}
