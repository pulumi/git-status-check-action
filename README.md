# Git Status Check GitHub Action

GitHub Action for checking the status of the working tree. If any files are untracked, modified or removed then the step will fail and annotate those files with warnings.

## Examples

### Fail On Any Changes

Fails if any files are modified, deleted or added (adhering to the .gitignore)

```yaml
steps:
- uses: pulumi/git-status-check
```
