# Project workflow

The owner has requested automatic commits and pushes after completed coding tasks.

- Work from this repository root. Check git status before making changes.
- Preserve existing user changes. Stage only the files changed for the current task by explicit path; do not use git add . or git add -A.
- Run checks appropriate to the change. For application code, use npm run lint and npm run build when dependencies are available. Report checks that cannot run.
- At the end of a successfully completed task, review the diff, create a descriptive commit, and push to the existing upstream. For main, use git push origin main.
- Do not force push, rewrite shared history, or publish secrets, .env files, credentials, or deployment backups.
- If authentication, repository access, or terminal permissions fail, report the exact blocker and preserve the local work. Do not claim a push succeeded without verifying it.
- This instruction applies to completed coding tasks; questions and analysis alone do not require a commit.
