import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
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
 * Run skills CLI command (spawn process with live output)
 */
export function runSkillsCli(args: string[]): Thenable<void> {
    const cmd = 'npx';
    const cmdArgs = ['skills', ...args];
    const fullCmd = `${cmd} ${cmdArgs.join(' ')}`;

    if (outputChannel) {
        outputChannel.appendLine(`\n> Running: ${fullCmd}`);
        outputChannel.show(true);
    }

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Executing: skills ${args.join(' ')}`,
            cancellable: true,
        },
        (_progress, token) => {
            return new Promise<void>((resolve, reject) => {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const cwd = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : os.homedir();

                const child = cp.spawn(cmd, cmdArgs, { cwd, shell: true });

                token.onCancellationRequested(() => {
                    child.kill();
                    reject(new Error('User cancelled operation'));
                });

                // Helper to strip ANSI codes
                const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

                child.stdout.on('data', (data) => {
                    outputChannel?.append(stripAnsi(data.toString()));
                });

                child.stderr.on('data', (data) => {
                    outputChannel?.append(stripAnsi(data.toString()));
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        outputChannel?.appendLine('Command finished successfully.');
                        resolve();
                    } else {
                        outputChannel?.appendLine(`Command failed with exit code ${code}`);
                        reject(new Error(`Command failed with exit code ${code}`));
                    }
                });

                child.on('error', (err) => {
                    outputChannel?.appendLine(`Spawn error: ${err.message}`);
                    reject(err);
                });
            });
        }
    );
}

/**
 * Run skills CLI command (alias for runSkillsCli for backward compatibility)
 */
export function runSkillsCliInteractive(args: string[]): Thenable<void> {
    return runSkillsCli(args);
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
// ... (existing code)

/**
 * Generate --agent arguments from preferred list, filtering out internal IDs
 */
export function getAgentArgs(preferredAgents: string[]): string[] {
    // 'skills-cli' is our internal ID for universal/default path, not a valid CLI agent ID
    const validAgents = preferredAgents.filter(id => id !== 'skills-cli');

    if (validAgents.length === 0) {
        // If no specific valid agents selected (or only skills-cli), default to --all
        return ['--all'];
    }

    return validAgents.flatMap(id => ['--agent', id]);
}

/**
 * Run skills CLI command and capture output (no UI)
 */
export function runSkillsCliCapture(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const cmd = 'npx';
        const cmdArgs = ['skills', ...args];

        // Use provided CWD or default to first workspace folder / home
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const effectiveCwd = cwd || (workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : os.homedir());

        const child = cp.spawn(cmd, cmdArgs, { cwd: effectiveCwd, shell: true });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code === 0) {
                // Strip ANSI codes from output
                // eslint-disable-next-line no-control-regex
                const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
                resolve(stripAnsi(stdout));
            } else {
                reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}
