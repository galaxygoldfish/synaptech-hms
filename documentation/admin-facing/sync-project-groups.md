# Sync project groups

Every **project group** a member is in, with each group's **size**, appears on **View registered members** (as `Group · size` under each member, for example `Mind Games · 5, Stress Test Gaming · 4`) and on their **Member details** page. Members without a group show **None · 1**. Members never see this information.

## Where it comes from

Every project has its own folder inside the shared project-groups folder in the club Drive, and somewhere in it is a Google Sheet listing the team's emails. The app looks each member's UW email up in those sheets:

- **Group** is the name of the project's folder. Someone on several projects' sheets is shown in all of them, largest first.
- **Group size** is how many emails that project's members sheet lists, counting people who haven't signed up to the app yet.

In each project folder the app reads the sheet titled **Project Members - …** and ignores the rest. Folders whose names start with a number ("0. Project Example", "1. Project Information Documents", "2. Standup Templates") aren't projects and are skipped. Excel files are skipped too, so save them as Google Sheets first.

To move someone between groups, edit the group sheets, not the app.

## When it updates

- **Automatically**, every night.
- **On demand**: open **View registered members** and press **Sync groups**. A message confirms how many sheets were read and how many members are in a group.

Under the search bar you'll see when groups were last synced. If the sync found something worth checking, open **N warnings from the last sync**. Examples:

- a project folder with no sheet that has an email column
- a project folder with no **Project Members** sheet but several other sheets of emails (it names the one it used)
- a sheet the app couldn't read (usually because it isn't shared with the sync account)

If a sync fails, nothing changes: everyone keeps the groups they had.

## Searching by group

Type a group's name in **Search members** to list everyone in it.
