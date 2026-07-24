# Vendored skills

The 8 skills in this directory are copied, unmodified, from
[jeffallan/claude-skills](https://github.com/jeffallan/claude-skills)
(MIT licensed), pinned to commit
[`e8be415`](https://github.com/jeffallan/claude-skills/commit/e8be415bc94d8d6ebddc2fb50e5d03c6e27d4319),
selected as the subset actually relevant to this project's stack —
TypeScript, React 19, Hono/Postgres, Playwright — plus prompt design for
the Phase 4 Gemini integration and code review, which this project's own
workflow calls for before every PR.

Pinned deliberately, not tracking the source repo's `main` — a skill's
`SKILL.md` is natural-language instructions an agent reads and follows,
so silently picking up upstream changes on every re-vendor would mean
trusting whatever that repo contains at some future, unreviewed point in
time. Bumping the pin should be a deliberate act: re-fetch at a new
commit, read the diff, and re-vendor — not an automatic refresh.

Vendored (not symlinked/submoduled) so they travel with the repo and
are available in any Claude Code session working on this project,
including ephemeral remote/cloud sessions that don't share a
filesystem with a contributor's local machine.

- `code-reviewer`
- `react-expert`
- `typescript-pro`
- `postgres-pro`
- `api-designer`
- `playwright-expert`
- `test-master`
- `prompt-engineer`

Not included: the other ~60 skills in the source repo (other language
ecosystems — Vue, Rails, Kotlin, Terraform, Kubernetes, etc. — not part
of this project's stack), plus `security-reviewer`/`secure-code-guardian`,
which overlap with a `security-review` skill already available in this
environment independent of this repo.

## License

MIT License

Copyright (c) 2025 Jeffallan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
