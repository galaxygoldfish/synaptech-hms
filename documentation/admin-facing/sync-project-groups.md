# Sync project groups

Each member's **project group** and **group size** appear on **View registered members** (as `Group · size` under each member) and on their **Member details** page. Members without a group show **None · 1**. Members never see this information.

## Where it comes from

Every project has its own folder inside the shared project-groups folder in the club Drive, and somewhere in it is a Google Sheet listing the team's emails. The app looks each member's UW email up in those sheets:

- **Group** is the name of the project's folder.
- **Group size** is how many emails that project's members sheet lists, counting people who haven't signed up to the app yet.

If a project folder has several sheets with emails in them, the app prefers one with "member", "roster" or "team" in its title, and says which one it used in the warnings. Excel files are skipped, so save them as Google Sheets first.

To move someone between groups, edit the group sheets, not the app.

## When it updates

- **Automatically**, every night.
- **On demand**: open **View registered members** and press **Sync groups**. A message confirms how many sheets were read and how many members are in a group.

Under the search bar you'll see when groups were last synced. If the sync found something worth checking, open **N warnings from the last sync**. Examples:

- a member listed in two groups (they're shown in the larger one)
- a project folder with no sheet that has an email column
- a project folder with several sheets of emails (it names the one it used)
- a sheet the app couldn't read (usually because it isn't shared with the sync account)

If a sync fails, nothing changes: everyone keeps the group they had.

## Searching by group

Type a group's name in **Search members** to list everyone in it.
