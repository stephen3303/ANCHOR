# Bundled seed data

`PLADS.txt` is the command directory supplied for this project, originally moved
from `~/Downloads/PLADS.txt`. Its header says **Updated 04 Nov 2026**. The file is
bundled with the repository so a new checkout needs no external Downloads file.
It contains 29,970 unique command names after removing its header and blank lines.

After starting PostgreSQL and applying schema migrations, import it with:

```sh
npm run db:seed:commands
```

The importer defaults to this file and retains existing command IDs on reruns.
An explicit alternative path is still supported:

```sh
npm run db:seed:commands -- /path/to/PLADS.txt
```

Run the import during first-time setup or when refreshing the source—not on
ordinary database startup. Replace this file deliberately when updating the
directory, review the diff, then rerun the import. The importer adds missing
names; it does not remove old entries or update existing names.

This folder holds **source data only**. Live PostgreSQL data remains in the
`postgres_data` Docker volume. No live database files were moved or reset.
See [`database/README.md`](../README.md) for setup versus routine startup.
