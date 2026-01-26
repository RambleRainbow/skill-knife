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
 * Run openskills CLI command
 */
export function runOpenSkills(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const cmd = 'npx openskills';
        const fullCmd = `${cmd} ${args.join(' ')}`;

        // Log the command
        if (outputChannel) {
            outputChannel.appendLine(`\n> Running: ${fullCmd}`);
            outputChannel.show(true);
        }

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Running: openskills ${args.join(' ')}`,
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
                        vscode.window.showErrorMessage(`OpenSkills failed: ${error.message}\n${stderr}`);
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
 * Extract install source (owner/repo/subpath) from skill metadata or market skill
 */
export function getInstallSource(skill: Skill | MarketSkill): string {
    // Case 1: MarketSkill (from Marketplace)
    if ('repoPath' in skill && 'subpath' in skill) {
        const mkSkill = skill as MarketSkill;
        const cleanSubpath = mkSkill.subpath.replace(/^\//, '');

        // 如果 repoPath 是 url，提取 owner/repo
        // 但通常 MarketSkill.repoPath 已经是 owner/repo 格式
        let ownerRepo = mkSkill.repoPath;
        if (ownerRepo.startsWith('https://github.com/')) {
            ownerRepo = ownerRepo.replace('https://github.com/', '');
        }
        if (ownerRepo.endsWith('.git')) {
            ownerRepo = ownerRepo.slice(0, -4);
        }

        return cleanSubpath ? `${ownerRepo}/${cleanSubpath}` : ownerRepo;
    }

    // Case 2: Installed Skill (Skill type)
    const installedSkill = skill as Skill;
    if (!installedSkill.metadata || !installedSkill.metadata.repoUrl) {
        return installedSkill.name; // Fallback
    }

    try {
        // Extract owner/repo from repoUrl
        // Matches github.com/owner/repo or just owner/repo
        const repoMatch = installedSkill.metadata.repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/) ||
            installedSkill.metadata.repoUrl.match(/^([^\/]+\/[^\/]+)$/);

        if (repoMatch) {
            let ownerRepo = repoMatch[1];
            if (ownerRepo.endsWith('.git')) {
                ownerRepo = ownerRepo.slice(0, -4);
            }

            const subpath = installedSkill.metadata.subpath || '';
            // Construct: owner/repo/subpath
            const cleanSubpath = subpath.replace(/^\//, ''); // Remove leading slash

            return cleanSubpath ? `${ownerRepo}/${cleanSubpath}` : ownerRepo;
        }

        return installedSkill.metadata.repoUrl; // Fallback to full URL
    } catch (e) {
        return installedSkill.name;
    }
}
