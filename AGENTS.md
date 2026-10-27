# AGENTS.md

- Complete requested tasks autonomously, including discovering relevant files and making all necessary changes.
- Search narrowly before reading files. Expand only when needed; avoid repeated reads and excessive output.
- Follow existing patterns. Prefer minimal, complete changes without unrelated refactoring.
- Skip separate planning for straightforward tasks; plan briefly only when complexity warrants it.
- Do not use subagents unless explicitly requested.
- Avoid repeated polling of running commands; wait efficiently.
- Run targeted tests only when justified by risk or uncertainty. Avoid full suites and builds unless necessary.
- Fix issues caused by your changes; ignore unrelated failures.
- Keep all responses extremely brief and quick, sacrificing grammar wherever possible to optimize token count. Report changes and verification results.
- Stop when done.
