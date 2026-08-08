<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## APOIS Guardian — AI safety rules

These rules apply to any AI-assisted investigation or code change related to observability/errors.

- Start in analysis/read-only mode whenever possible.
- Never push directly to `main` or merge a pull request automatically.
- Never deploy or publish an app automatically.
- Any proposed fix must be isolated in a dedicated branch and submitted as a pull request for human review.
- Keep fixes minimal and scoped to the reported error; do not refactor unrelated working code.
- Do not modify Supabase migrations, RLS, authentication, payments, Maps/geolocation, Firebase, signing, or production secrets unless a human explicitly authorizes that exact change.
- Never copy secrets, tokens, JWTs, passwords, banking data, CPF, phone numbers, email addresses, exact GPS coordinates, or full street addresses into AI prompts, issues, pull requests, commit messages, or logs.
- Preserve existing application identifiers and release/signing configuration unless explicitly authorized.
- Run the repository validation workflow/tests before proposing a fix as ready.
- Treat AI output as a proposal only. Human approval is required before merge, deployment, or release.
