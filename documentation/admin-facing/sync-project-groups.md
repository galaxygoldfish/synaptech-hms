# Sync project groups

Each member's **project group** and **group size** appear on **View registered members** (as `Group · size` under each member) and on their **Member details** page. Members without a group show **None · 1**. Members never see this information.

## Where it comes from

Every project group's Google Sheet sits in the shared project-groups folder in the club Drive. The app looks each member's UW email up in those sheets:

- **Group** is the name of the sheet the member's email appears in.
- **Group size** is how many emails that sheet lists, counting people who haven't signed up to the app yet.

To move someone between groups, edit the group sheets, not the app.

## When it updates

- **Automatically**, every night.
- **On demand**: open **View registered members** and press **Sync groups**. A message confirms how many sheets were read and how many members are in a group.

Under the search bar you'll see when groups were last synced. If the sync found something worth checking, open **N warnings from the last sync**. Examples:

- a member listed in two groups (they're shown in the larger one)
- a sheet with no email column
- a sheet the app couldn't read (usually because it isn't shared with the sync account)

If a sync fails, nothing changes: everyone keeps the group they had.

## Searching by group

Type a group's name in **Search members** to list everyone in it.
