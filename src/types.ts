import * as vscode from 'vscode';

export interface DatapackRecord {
    id: string;
    name: string;
    type: string;
}

export class DatapackItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: string,
        public readonly datapackId: string | undefined,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isLoadMore: boolean = false
    ) {
        super(label, collapsibleState);

        if (isLoadMore) {
            this.contextValue = 'loadMoreItem';
            this.command = {
                title: 'Load More',
                command: 'omnipack-toolkit.loadMoreDatapacks',
                arguments: [this]
            };
            this.iconPath = new vscode.ThemeIcon('refresh');
        } else if (datapackId) {
            this.tooltip = `${this.label}\nID: ${this.datapackId}`;
            this.contextValue = 'datapackItem';
            this.iconPath = new vscode.ThemeIcon('package');
        } else {
            this.tooltip = `${this.label}`;
            this.contextValue = 'datapackCategory';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}