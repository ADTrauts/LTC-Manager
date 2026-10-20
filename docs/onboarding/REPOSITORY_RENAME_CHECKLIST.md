# Separate repository rename checklist

Prepared by ONB-00; **not executed or authorized by this phase**. The current identity remains ADTrauts/LTC-Manager. The predecessor remains ADTrauts/Vssyl. These recommendations do not choose a final new repository name.

- [ ] Obtain a separately scoped rename decision, exact target names, owner, maintenance window, and recovery plan. Do not archive/delete the predecessor or overwrite its unrelated work.
- [ ] Inventory GitHub redirects, default/protected branches, rulesets, Actions secrets/environments, repository-ID consumers, GitHub Apps/webhooks, branch/PR references, packages and badges.
- [ ] Inventory developer fetch/push remotes, worktrees, clone/setup instructions, scripts, documentation links, and saved desktop project names/paths. A repository rename does not require changing package, database, installation, cookie or Stripe lookup keys.
- [ ] Inventory deployment project Git connections, build hooks, allowed origins, integrations, preview rules and production ownership. Plan changes without performing a deployment as part of the rename.
- [ ] If freeing `Vssyl`, rename the predecessor first to the separately approved legacy name; then rename the current repository. Verify permissions and redirects after each step.
- [ ] Update all owned remote/CI/documentation/deployment references together; verify fetch and expected CI events. Keep active pull requests and artifact links discoverable.
- [ ] Update saved project labels to distinguish **Vssyl — Current Operations** and **Vssyl — Legacy Platform**, verifying each directory and remote first.
- [ ] Record old/new names, repository IDs, integration verification and rollback instructions; communicate only through separately authorized channels.

No repository rename, remote edit, package rename, project-settings mutation, deployment, or predecessor checkout edit occurred in ONB-00.
