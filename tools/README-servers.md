# Two servers: one you can trust, one that is being worked on

## Why

> "The game does not load due to `Uncaught SyntaxError: The requested module
> '../../../avatar-3d/js/chibi2-motion.js' does not provide an export named 'CHIBI2_COMBAT_ALL'`.
> Is that because work is in progress? Can we make it so the hosted server is a stable version and
> have a different server for development?"

It was. An agent had written the `import` in `actors.js` and had not yet written the matching
`export` in `chibi2-motion.js` — a state that lasts seconds and takes the whole page down while it
does. There is no amount of care that removes that window; the fix is to not be pointed at it.

## What there is now

| port | what | where | who moves it |
|---|---|---|---|
| **8400** | **STABLE** | `~/claude/playground-stable` (a git worktree on the `stable` branch) | only `tools/publish-stable.sh` |
| **8401** | **DEV** | `~/claude/playground` (the live working tree) | every save, every agent |

**8400 is the bookmark you already have**, so nothing you have written down changes. It is now the
one that cannot break mid-edit.

## Using it

```bash
tools/serve-both.sh          # start or restart both
tools/serve-both.sh stop     # stop both
tools/publish-stable.sh      # promote HEAD to stable
tools/publish-stable.sh <ref>   # promote a specific commit or branch
tools/publish-stable.sh --force # skip the checks (don't)
```

## The gate

`publish-stable.sh` refuses to promote a commit that does not pass **both**:

1. **Every `.js` file in the tree parses** (`node --check`, on a `git archive` of that exact commit,
   not on the working tree). This is the check that catches the failure above, and it is the one a
   unit-test run does **not** — `node --test` never loads the browser modules, so a half-written
   import sails straight through a green suite.
2. **`npm run test:unit` passes.**

It has been tested by feeding it a deliberately broken commit: it named the file, refused, and left
stable where it was.

A stable server that serves a broken build is worse than no stable server, because now you do not
know which of the two to believe.

## Notes

* The worktree is a serving copy. Nothing but `publish-stable.sh` writes to it, and that script
  hard-resets it first, so a stray file can never block a publish.
* `library/synced/` is git-ignored and survives the reset, so a library sync to 8400 still works.
* The Playwright suite runs against **8401**, deliberately. Pointing it at stable would mean the
  tests passed against a build nobody is editing while the code being written went unchecked.
