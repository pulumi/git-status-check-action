# Git Status Check GitHub Action

GitHub Action for checking the status of the working tree. If any files are untracked, modified or removed then the step will fail and annotate those files with warnings.

## Usage

```yaml
- uses: pulumi/git-status-check@v1
  with:
    # One of more globs to list files which are permitted 
    # to have uncommitted changes.
    # Default: [None]
    allowed-changes: |
      CHANGELOG.md
      dist/*.js
      **/temp
    # Continues with warnings instead of errors on finding 
    # uncommitted changes when set to `true`
    # Default: false
    continue-with-unexpected-changes: false
    # Path to the git repository root to check for changes
    # Default: ${{ context.workspace }}
    dir: ./path-to-repo
    # Allows all new uncommitted files when set to `true`.
    ignore-new-files: false
```

### Outputs

| Name | Description | Example |
| - | - | - |
| `unexpected-changes-count` | The number of unexpected changes. | `13` |

## Reporting

## Examples

### Fail On Any Changes

Fails if any files are modified, deleted or added (adhering to the .gitignore)

```yaml
steps:
- uses: actions/checkout@v4
- uses: pulumi/git-status-check-action@v1
```

### Fail Only On Deleted Or Modified Files

Ignore added files:

```yaml
steps:
- uses: actions/checkout@v4
- uses: pulumi/git-status-check-action@v1
  with:
    ignore-new-files: true
```

### Allow Specific Changes

This action expects a change to be made to a specific file, but will fail if any other changes have been made. The allowed changes property can be multi-line and can include glob patterns.

```yaml
steps:
- uses: actions/checkout@v4
- run: echo "Some expected update" >> CHANGELOG.md
- uses: pulumi/git-status-check-action@v1
  with:
    allowed-changes: |
      CHANGELOG.md
```

### Check a Different Directory

Check the status of a different git directory to the root job workspace.

```yaml
steps:
- uses: actions/checkout@v4
  with:
    path: custom-dir
- uses: pulumi/git-status-check-action@v1
  with:
    dir: custom-dir
```

### Warn and Continue Build

Print warnings for unexpected errors but don't fail the build. The result of the action is then checked via the `unexpected-changes-count` output (which requires the step to have an identifier so it can be referenced).

```yaml
steps:
- uses: actions/checkout@v4
- id: git-status
  uses: pulumi/git-status-check-action@v1
  with:
    continue-with-unexpected-changes: true
- run: |
    echo "Unexpected change count: ${{ steps.git-status.outputs.unexpected-changes-count }}"
```
