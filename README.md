# OmniPack Toolkit: Extension for Vlocity Datapack Management


[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support%20Development-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/im83.75)

Hey there! If you're knee-deep in Salesforce development with Vlocity (OmniStudio), you know how fiddly managing datapacks can be. Exporting, deploying, and keeping everything organized? It's a hassle without the right tools. That's why I built **OmniPack Toolkit** – a straightforward VS Code extension that streamlines exporting right from your editor. No more jumping between terminals and UIs; just smooth, integrated workflows.



I created this because I got tired of the manual grind during my own projects. It's designed to feel intuitive, with a tree view for browsing datapacks, quick exports (with or without dependencies), and easy deploys. Let's dive in!



## What Makes It Awesome?

- **Native CLI**: Uses native vlocity-cli to export and fetch the datapacks.

- **Datapack Explorer Tree View**: Browse categories like OmniScripts, DataRaptors, Products, and more in a clean sidebar tree. Expand to see available datapacks from your org, and export them with a right-click.

- **Export with Flexibility**: Choose to export a single datapack or grab all its dependencies. It uses the Vlocity CLI under the hood for reliable results.

- **Smart Configuration**: Set up your project path, SFDX username (or alias), and CLI path once, and you're good. It even pulls org aliases from your SFDX setup for easy selection.

- **Status Bar Integration**: See your selected SFDX org at a glance in the status bar – click to reconfigure on the fly.

- **Refresh and Reload**: Keep your datapack list fresh with a simple refresh command.

- **CLI Checks Built-In**: On activation, it verifies if Vlocity CLI is installed and prompts you if not. No surprises!



This extension focuses on the essentials without bloating your VS Code. It's perfect for developers who want to stay in their flow.



## Getting Started



### Installation

1. Open VS Code.

2. Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X on Mac).

3. Search for "OmniPack Toolkit".

4. Click Install – done!



Or, if you're feeling adventurous, sideload it from a .vsix file (grab it from the releases page if available).



### Requirements

- **Node.js**: Version 18 or higher (the Vlocity CLI needs it).

- **Vlocity CLI**: Install globally with `npm install -g vlocity`. If it's not there, the extension will nudge you with install options.

- **Salesforce CLI (SFDX)**: For org authentication and aliases.

- **A Vlocity-enabled Salesforce Org**: Obviously!



Pro tip: Make sure your project folder is open in VS Code – that's where the magic happens.



## How to Use It



Once installed, you'll see the **Vlocity DataPack Explorer** in your sidebar. If it's empty, hit the refresh button or run the "Vlocity: Refresh Datapacks" command.



### Step 1: Configure Your Settings

- Run the command "Vlocity: Configure Settings" (Ctrl+Shift+P or Cmd+Shift+P, then type it).

- It'll prompt for your SFDX username or alias (it auto-detects aliases already logged in).

- Boom – your status bar now shows the selected org!



### Step 2: Browse and Export Datapacks

- In the tree view, expand a category (e.g., "OmniScript" or "Product2").

- Right-click a datapack item and select "Export DataPack".

- Choose "No Dependencies" for a quick export or "All Dependencies" for the full chain.

- Watch the progress in notifications – success messages and logs appear in an output channel.


If something goes wrong (hey, Salesforce can be picky), check the output channel or error notifications for details.



## Configuration Options

Tweak these in VS Code's Settings (JSON or UI):

- `vlocityDatapackManager.sfdxUsername`: Your SFDX org username or alias.



I kept the configs minimal – no fluff.



## Troubleshooting

- **No datapacks showing?** Double-check your SFDX auth and refresh the tree.

- **CLI errors?** Ensure Vlocity is installed and your Node version is up to snuff.

- **Export fails?** Look at the output channel for CLI logs. Sometimes it's a dependency issue or org permission thing.

- If you're stuck, open an issue on the repo – I'm here to help!



## Why I Built This

As a dev who's wrestled with Vlocity, I wanted something that just *works*. No overcomplicated features, just the core stuff to speed up your day. It's open-source, so if you spot a bug or have an idea (like adding more datapack types), fork it and PR away!

## Support This Project

If OmniPack Toolkit saves you time and makes your dev life easier, consider buying me a coffee! ☕ Your support helps me maintain this extension, add new features, and keep improving the Salesforce developer experience.

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/im83.75)

Every coffee fuels late-night coding sessions and keeps me run longer. Thanks for your support! 🙏

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