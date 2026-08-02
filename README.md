# OmniPack Toolkit: Extension for Vlocity Datapack Management

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support%20Development-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/im83.75)

Hey there! If you're knee-deep in Salesforce development with Vlocity (OmniStudio), you know how fiddly managing datapacks can be. Exporting, deploying, and keeping everything organized? It's a hassle without the right tools. That's why I built **OmniPack Toolkit** – a straightforward VS Code extension that streamlines exporting right from your editor. No more jumping between terminals and UIs; just smooth, integrated workflows.

It is not a complete package, but there should be a starting point always and this is it (^_~).

I created this because I got tired of the manual grind during my own projects. It's designed to feel intuitive, to browse datapacks, and to trigger quick exports (with or without dependencies). Let's dive in!

🤝 **Vibe-Coded with Google Gemini**: This extension's UI and state management were co-architected and vibe-coded alongside Google Gemini.

## What Makes It Awesome?

- **Native CLI**: Uses native **[Vlocity-CLI](https://github.com/vlocityinc/vlocity_build)** to export and fetch the datapacks securely in the background.

- **Full-Screen Webview UI**: Don't want to work in a tiny sidebar? Open the full OmniPack Webview to search, filter, and mass-select datapacks across categories. 

- **Pre-Flight Review Modal**: When bulk-exporting, a clean review modal groups your selections by type so you know exactly what's going to your local machine before firing the CLI.

- **Safe Cancellations**: Stuck on a massive export or a hanging org query? Hit "Cancel" to aggressively kill the underlying OS process and stop the queue instantly.

- **Datapack Explorer Tree View**: Browse categories in a custom Activity Bar. Expand to see available datapacks, use inline quick-actions, and click "Load More" to paginate through massive orgs without lag.

- **Smart Configuration & Real-time State**: Set up your SFDX username once. The extension auto-detects aliases and instantly updates your status bar and Webview UI without requiring reloads.

- **CLI Checks Built-In**: On activation, it verifies if Vlocity CLI is installed and prompts you if not. No surprises!

## Getting Started

### Installation

1. Open VS Code.

2. Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X on Mac).

3. Search for "OmniPack Toolkit".

4. Click Install – done!

### Requirements

- **Node.js**: Version 18 or higher (Version 24+ recommended; the Vlocity CLI needs it).

- **Vlocity CLI**: Install globally with `npm install -g vlocity`. If it's not there, the extension will nudge you with install options.

- **Salesforce CLI (SFDX)**: For org authentication and aliases.

- **A Vlocity-enabled Salesforce Org**: Obviously!


*Pro tip: Make sure your project folder is open in VS Code – that's where the magic happens.*

## How to Use It

Once installed, click the **OmniPack Toolkit** icon (the cloud download icon) in your Activity Bar.

### Step 1: Configure Your Settings
- Run the command "Vlocity: Configure Settings" (Ctrl+Shift+P) or click the **⚙ Config** button in the UI.
- It'll prompt for your SFDX username or alias (it auto-detects aliases already logged in).
- Boom – your status bar and Webview badge now show the active org!

### Step 2: Browse and Export (Two Ways!)
**The Webview Way (Recommended for Mass Exports):**
- Click the **Open Full UI** button at the top of the Explorer sidebar.
- Select a category (e.g., OmniScript) from the collapsible left panel.
- Filter, search, and check off the datapacks you want.
- Click **Review & Export**, verify your list in the modal, and choose your dependency preference.

**The Tree View Way (Recommended for Quick Singles):**
- Expand a category in the sidebar tree.
- Hover over a datapack and click the inline **Cloud Download** icon (or right-click -> Export DataPack).
- Choose your project path and dependency option.

*If an operation hangs, just hit the red **Stop** button in the Webview to kill the CLI process.*

## Configuration Options

Tweak these in VS Code's Settings (JSON or UI):

- `vlocityDatapackManager.sfdxUsername`: Your SFDX org username or alias.


*I kept the configs minimal – no fluff.*

## Troubleshooting

- **No datapacks showing?** Double-check your SFDX auth and refresh the tree/cache.

- **CLI errors?** Ensure Vlocity is installed and your Node version is up to snuff.

- **Export fails?** Look at the output channel for CLI logs. Sometimes it's a dependency issue or org permission thing.

- If you're stuck, open an issue on the repo – I'm here to help!

## Why I Built This

As a dev who's wrestled with Vlocity, I wanted something that just *works* without using a manifest file to extract a datapack every single time. No overcomplicated features, just the core stuff to speed up your day. It's open-source, so if you spot a bug or have an idea (like adding more datapack types), fork it and PR away!

## Support This Project

If OmniPack Toolkit saves you time and makes your dev life easier, consider buying me a coffee! ☕ Your support helps me maintain this extension, add new features, and keep improving the Salesforce developer experience.

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/im83.75)

Every coffee fuels late-night coding sessions and keeps me running longer. Thanks for your support! 🙏

## Contributing

Love it? Hate it? Want to improve it?

- Clone the repo.

- `npm install` to set up.

- Hack away in `/src`.

- Test with `F5` in VS Code (launches a debug instance).

- Submit a pull request – I'll review ASAP.


## License

MIT – use it freely, but if you build something cool on top, let me know!

---
Thanks for checking out OmniPack Toolkit. Happy coding! 🚀 If this saves you time, drop a star on the repo or share it with your team. Questions? Hit me up in the issues.